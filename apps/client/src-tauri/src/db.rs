//! 本地 SQLite（rusqlite，bundled）：给前端的 SqlAdapter 用的最小命令层。
//!
//! 只开一个连接（Mutex 保护），所以前端串行发的 BEGIN / … / COMMIT 落在同一连接上，
//! 事务语义可靠（tauri-plugin-sql 用连接池，跨 invoke 的事务不可靠，故不用它）。
//! 数据库文件：<app_data_dir>/mindough.db（生产库）；演示模式用同目录的 mindough-demo.db（Rei 2026-11-18，docs/DEMO-MODE.md）。
//! 前端每条命令带上 `file`，不带就是生产库（老前端照旧）。每个文件各开一条连接，
//! 所以一个窗口在演示库里的事务，不会和另一个窗口（还没重新载入）在生产库里的写入搅在一起。
//! schema 与迁移都在前端 core 里（与 Web 端同一份）。

use rusqlite::{types::ValueRef, Connection, ToSql};
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

pub struct Db(pub Mutex<HashMap<String, Connection>>);

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
    conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF;")
        .map_err(|e| e.to_string())?;
    Ok(conn)
}

fn with_conn<T>(app: &AppHandle, db: &State<Db>, file: Option<String>, f: impl FnOnce(&Connection) -> Result<T, String>) -> Result<T, String> {
    let name = file_name(file);
    let mut guard = db.0.lock().map_err(|_| "数据库锁已损坏".to_string())?;
    if !guard.contains_key(name) {
        let conn = open(app, name)?;
        guard.insert(name.to_string(), conn);
    }
    f(guard.get(name).expect("连接已打开"))
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
pub fn db_exec(app: AppHandle, db: State<Db>, sql: String, file: Option<String>) -> Result<(), String> {
    with_conn(&app, &db, file, |c| c.execute_batch(&sql).map_err(|e| e.to_string()))
}

/// 执行一条带参数的写语句。
#[tauri::command]
pub fn db_run(app: AppHandle, db: State<Db>, sql: String, params: Vec<Value>, file: Option<String>) -> Result<(), String> {
    with_conn(&app, &db, file, |c| {
        let p = to_params(params);
        let refs: Vec<&dyn ToSql> = p.iter().map(|x| x as &dyn ToSql).collect();
        let mut stmt = c.prepare_cached(&sql).map_err(|e| e.to_string())?;
        stmt.execute(refs.as_slice()).map(|_| ()).map_err(|e| e.to_string())
    })
}

/// 查询，返回 [{列名: 值}]。
#[tauri::command]
pub fn db_all(app: AppHandle, db: State<Db>, sql: String, params: Vec<Value>, file: Option<String>) -> Result<Vec<Map<String, Value>>, String> {
    with_conn(&app, &db, file, |c| {
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
