//! 本地 SQLite（rusqlite，bundled）：给前端的 SqlAdapter 用的最小命令层。
//!
//! 每个窗口、每个库文件各开一条连接（tauri-plugin-sql 用连接池，跨 invoke 的事务不可靠，故不用它）。
//! 同一个窗口里前端串行发的 BEGIN / … / COMMIT 落在同一条连接上，事务语义可靠。
//! 数据库文件：<app_data_dir>/mindough.db（生产库）；演示模式用同目录的 mindough-demo.db（Rei 2026-11-18，docs/DEMO-MODE.md）。
//! 前端每条命令带上 `file`，不带就是生产库（老前端照旧）。
//!
//! 为什么按窗口分连接（Rei 2026-11-19 Windows 上开演示模式报「cannot start a transaction within a transaction」）：
//! 换模式时主窗口和设置窗口一起重载，两边同时跑迁移。原来每个文件只有一条连接、所有窗口共用，
//! 一个窗口的 BEGIN IMMEDIATE 还没 COMMIT，另一个窗口的 BEGIN 就落在同一条连接上，套成了嵌套事务。
//! 现在两个窗口各用各的连接，写锁由 SQLite 自己排队（busy_timeout）；
//! 每条连接各有一把锁，等写锁时只卡自己这个窗口，不会把正拿着写锁的那个窗口也卡住。
//! 页面重载时上一页没收尾的事务，前端打开驱动时调 db_open 回滚掉。
//! schema 与迁移都在前端 core 里（与 Web 端同一份）。

use rusqlite::{types::ValueRef, Connection, ToSql};
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Manager, State, Window};

type Shared = Arc<Mutex<Connection>>;

/// 键是「窗口标签 + 文件名」。
pub struct Db(pub Mutex<HashMap<String, Shared>>);

impl Db {
    pub fn new() -> Self {
        Db(Mutex::new(HashMap::new()))
    }
}

/// 只认这两个文件名，别的一律当生产库（前端传什么都不会跑到别的路径去）。
const PROD_FILE: &str = "mindough.db";
const DEMO_FILE: &str = "mindough-demo.db";

fn file_name(file: Option<String>) -> &'static str {
    match file.as_deref() {
        Some(DEMO_FILE) => DEMO_FILE,
        _ => PROD_FILE,
    }
}

fn open(app: &AppHandle, name: &str) -> Result<Connection, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let conn = Connection::open(dir.join(name)).map_err(|e| e.to_string())?;
    // 别的窗口拿着写锁时等它，最多 15 秒（迁移、批量写都远用不了这么久）
    conn.busy_timeout(Duration::from_secs(15)).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF;")
        .map_err(|e| e.to_string())?;
    Ok(conn)
}

fn conn_for(app: &AppHandle, db: &State<Db>, window: &Window, file: Option<String>) -> Result<Shared, String> {
    let name = file_name(file);
    let key = format!("{}\u{1f}{}", window.label(), name);
    let mut map = db.0.lock().map_err(|_| "数据库锁已损坏".to_string())?;
    if let Some(c) = map.get(&key) {
        return Ok(c.clone());
    }
    let c = Arc::new(Mutex::new(open(app, name)?));
    map.insert(key, c.clone());
    Ok(c)
}

fn with_conn<T>(app: &AppHandle, db: &State<Db>, window: &Window, file: Option<String>, f: impl FnOnce(&Connection) -> Result<T, String>) -> Result<T, String> {
    let shared = conn_for(app, db, window, file)?;
    let guard = shared.lock().map_err(|_| "数据库连接锁已损坏".to_string())?;
    f(&guard)
}

/// 窗口关掉时调：丢掉这个窗口的连接。
pub fn forget_window(window: &Window) {
    let prefix = format!("{}\u{1f}", window.label());
    if let Some(db) = window.try_state::<Db>() {
        if let Ok(mut map) = db.0.lock() {
            map.retain(|k, _| !k.starts_with(&prefix));
        }
    }
}

/// 页面（重新）载入后第一次用这个库：上一页没收尾的事务回滚掉，免得新页面的 BEGIN 撞上它。
#[tauri::command]
pub fn db_open(app: AppHandle, db: State<Db>, window: Window, file: Option<String>) -> Result<(), String> {
    with_conn(&app, &db, &window, file, |c| {
        if !c.is_autocommit() {
            c.execute_batch("ROLLBACK").map_err(|e| e.to_string())?;
        }
        Ok(())
    })
}

enum Param {
    Null,
    Int(i64),
    Real(f64),
    Text(String),
}

impl ToSql for Param {
    fn to_sql(&self) -> rusqlite::Result<rusqlite::types::ToSqlOutput<'_>> {
        use rusqlite::types::{ToSqlOutput, Value as V};
        Ok(match self {
            Param::Null => ToSqlOutput::Owned(V::Null),
            Param::Int(i) => ToSqlOutput::Owned(V::Integer(*i)),
            Param::Real(f) => ToSqlOutput::Owned(V::Real(*f)),
            Param::Text(s) => ToSqlOutput::Borrowed(ValueRef::Text(s.as_bytes())),
        })
    }
}

fn to_params(params: Vec<Value>) -> Vec<Param> {
    params
        .into_iter()
        .map(|v| match v {
            Value::Null => Param::Null,
            Value::Bool(b) => Param::Int(b as i64),
            Value::Number(n) => match n.as_i64() {
                Some(i) => Param::Int(i),
                None => Param::Real(n.as_f64().unwrap_or(0.0)),
            },
            Value::String(s) => Param::Text(s),
            other => Param::Text(other.to_string()),
        })
        .collect()
}

/// 执行多条语句（迁移、BEGIN / COMMIT / ROLLBACK）。
#[tauri::command]
pub fn db_exec(app: AppHandle, db: State<Db>, window: Window, sql: String, file: Option<String>) -> Result<(), String> {
    with_conn(&app, &db, &window, file, |c| c.execute_batch(&sql).map_err(|e| e.to_string()))
}

/// 执行一条带参数的写语句。
#[tauri::command]
pub fn db_run(app: AppHandle, db: State<Db>, window: Window, sql: String, params: Vec<Value>, file: Option<String>) -> Result<(), String> {
    with_conn(&app, &db, &window, file, |c| {
        let p = to_params(params);
        let refs: Vec<&dyn ToSql> = p.iter().map(|x| x as &dyn ToSql).collect();
        let mut stmt = c.prepare_cached(&sql).map_err(|e| e.to_string())?;
        stmt.execute(refs.as_slice()).map(|_| ()).map_err(|e| e.to_string())
    })
}

/// 查询，返回 [{列名: 值}]。
#[tauri::command]
pub fn db_all(app: AppHandle, db: State<Db>, window: Window, sql: String, params: Vec<Value>, file: Option<String>) -> Result<Vec<Map<String, Value>>, String> {
    with_conn(&app, &db, &window, file, |c| {
        let p = to_params(params);
        let refs: Vec<&dyn ToSql> = p.iter().map(|x| x as &dyn ToSql).collect();
        let mut stmt = c.prepare_cached(&sql).map_err(|e| e.to_string())?;
        let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let rows = stmt
            .query_map(refs.as_slice(), |row| {
                let mut m = Map::new();
                for (i, name) in names.iter().enumerate() {
                    let v = match row.get_ref(i)? {
                        ValueRef::Null => Value::Null,
                        ValueRef::Integer(n) => Value::from(n),
                        ValueRef::Real(f) => Value::from(f),
                        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
                        ValueRef::Blob(_) => Value::Null,
                    };
                    m.insert(name.clone(), v);
                }
                Ok(m)
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    })
}
