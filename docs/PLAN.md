# Mindough 计划（v1，2026-10-15）

## 一句话
做一个多端任务管理 app：任务不靠层层分类，靠“做完后接什么”（FS 依赖）串起来；琐事记在流水式的列表里。

## 技术方案
- 平台（MVP 都要能用）：macOS、Windows、iOS、Android、Web。
- 外壳：Tauri 2。一套 React 前端，同时打 macOS / Windows（顺带 Linux）、iOS、Android 的安装包；Web 端是同一份前端的浏览器版，部署在 `app.mindough.rei8t.dev`（2026-10-26 起；`mindough.rei8t.dev` 是介绍页，见「网页版搬到 app 域名」）。
- 前端：TypeScript + React + Vite；UI 用 headless 组件，每端配一套原生风格的皮肤（见“设计风格”）；浅色、深色跟着系统走。
- 存储：数据先存本机，离线能用。原生端用 SQLite，Web 端用 SQLite WASM（存在 OPFS 里）。两端用同一套 schema；前端只写一层数据访问接口，底下按平台换驱动。
- 同步（M2 ✅）：云端数据存在 Turso Cloud（数据库 `mindough`，org rei8，东京 aws-ap-northeast-1）；也可以换成 Cloudflare D1 库 `mindough`，用 Worker 环境变量 `STORAGE_BACKEND` 切（Rei 2026-10-17，见“云端存储：Turso / D1”）；客户端只跟 Worker（同域 `app.mindough.rei8t.dev/api/sync`；老客户端还连 `mindough.rei8t.dev/api/sync`，两个域名是同一个 Worker）打交道，Worker 用 Hrana HTTP 读写 Turso；图片放 R2（`mindough-assets`）。登录用 Google OAuth；原生端先开系统浏览器登录，再用 deep link 跳回 app。见“多端同步怎么做”。
- Markdown 编辑：Tiptap 3（所见即所得，支持任务清单、代码块；2026-10-16 起先用 Milkdown 7，2026-10-25 换成 Tiptap），原文存成 .md 文本。
- 依赖图：React Flow（xyflow）画图 + elkjs 自动分层布局。

### 为什么用 Tauri 2（含移动端）
- Tauri 2 正式支持 iOS / Android，五端共用一套 React 前端和 Rust 后端；移动端的界面跑在系统 WebView 里（iOS 是 WKWebView，Android 是 System WebView）。
- 为什么适合：列表、依赖图、热力图都是 Web 界面擅长的；Rust 后端能直接用 Turso。
- 短板和对策：
  - 移动端插件比桌面少。原生能力（通知、分享、拍照选图）用官方插件，没有的就写 Swift / Kotlin 小插件。
  - 桌面小组件、iOS 主屏小组件、灵动岛计时要原生扩展，放到以后。
  - 后台同步受系统限制，改成回到前台时同步，以后再加推送唤醒。
- 退路：`packages/core`（数据模型、DAG、打卡、同步）保持纯 TS。如果移动端体验不够好，可以换成 Expo / React Native（Turso 有 `@tursodatabase/sync-react-native`），只重写外壳。
- 已看过 MyGo（mygo.egoist.dev）：用 Go 写桌面 app，体积小，但只支持 macOS / Windows / Linux，没有 iOS / Android，不用。

### 设计风格：每个系统用对应的原生风格（Rei 2026-10-15 提）
能做。办法是“一套结构，每端一层皮肤”，不做五套界面。
- 共用的：数据、状态、交互逻辑、页面结构都只有一份；组件用不带样式的 headless 组件（React Aria Components）。
- 每端一套皮肤（启动时按平台选，设置里能手动切）：
  - Apple（macOS + iOS 共用）：SF 字体、HIG 圆角与间距；macOS 侧边栏 + 工具栏 + 窗口毛玻璃（Tauri window-vibrancy），iOS 大标题、底部标签栏、左滑操作、底部弹层。Liquid Glass 只能用 backdrop-filter 做个近似。
  - Windows：Windows 11 / Microsoft Store 那种 WinUI 3 风格（Windows 版 Fluent 2）：Segoe UI Variable、Mica / Acrylic 窗口材质、NavigationView 侧栏、圆角卡片、系统强调色。不用 Fluent UI React v9（那是 Office / Teams 网页的外观）；照着微软的 Windows UI Kit（Figma）和 WinUI 3 的设计令牌自己写皮肤。
  - Android：Material 3（Roboto、动态取色、底部导航栏、FAB、底部弹层、返回手势）。
  - Web：默认跟着访问者的系统走，也能固定一种。
- 移动端可以用 Konsta UI 提速（同一个组件能出 iOS 和 Material 两种外观）。
- 能用系统的就用系统：菜单栏、右键菜单、托盘、通知、选文件都走 Tauri 原生 API，不用网页模拟。
- 代价：界面工作量大约是 1.5 倍。每次改界面，都要在三种皮肤（Web 跟着访问者的系统，用其中一种）× 桌面 / 手机下截图检查。导航结构（侧边栏还是底部标签栏）只按桌面、手机两种布局写，不按五个平台写。
- 所以不用 Kumo：它是 Cloudflare 自己的统一风格，和“各端原生”冲突。

## 前导图（PDM）怎么实现
- 依赖是一张有向无环图（DAG）：表 `dependency(pred_id, succ_id, type, lag)`。
- MVP 只做 FS（完成→开始）。一件任务能有多个前置、多个后续；type / lag 字段先留着，以后加 SS/FF/SF 和延迟。
- 加边时做环检测（DFS），会绕成环就不让加，并提示。
- 任务状态是算出来的：前置都结束了（完成或关闭），就是“可开始”；不然就是“被阻塞”，并显示还差哪几件。
- 任务没有“取消”（Rei 2026-10-15：“任务没有取消之说，只有完成和关闭两种，关闭也完成状态”）。结束态两种：
  - 完成：做成了，算成就（热力图、连续天数、组进度、我的一天“x/y 已完成”）。标题变灰，不划线（Rei 2026-11-12「已完成和已关闭的任务不要删除线」，以前划线）。
  - 关闭：不做了、不需要了。它也算结束：会解锁后续并弹出“解锁了 N 个后续”，不进待办 / 可做 / 搜索的前排，在我的一天里沉到底。但它不算成就：不计入组进度和“已完成”的数，重复任务从关闭那天起不用再打卡，以前的格子留着。界面上不划线，整体变淡，带“关闭”标记，勾选框显示 ×。
  - 两种都能“重新打开”（回到待办，清空 done_at）。M0 存过的“取消”，打开时自动改成“关闭”（改写一次，进 outbox）。
- 完成一件任务时，弹出它的后续任务，提示“已解锁 N 个”；完成时也能一键新建后续（“然后呢？”）。
- 相关任务（Rei 2026-10-15：“任务只是有关系，但没有FS关系”）：表 `task_link(a_task_id, b_task_id, note, created_at)`。没有方向，也不阻塞：不解锁，不进环检测，不影响可开始 / 被阻塞。
  - 去重：两个 id 按 a < b 排好，行 id 由这一对算出（`related.ts` 的 `taskLinkId`，UUID 形状），所以两台设备各自连同一对，得到的是同一行；去掉再连上，就是把同一行的墓碑翻回来。
  - 不能连自己。两件已经有前后关系的，不让再连相关（前后关系已经说明它们有关系）；先连了相关、后来又加了前后关系的，只按前后关系显示（相关那行不删，去掉前后关系后又会出现）。
  - 删任务时，它的相关行一起打墓碑。note 先留着，界面上暂时不能编辑。
- 组有起止时间时，可以顺着依赖链推算最早什么时候开始，超过组的结束时间就标红（后期做，关键路径也一样）。

## 多端同步怎么做（M2 ✅ 2026-10-15）
Rei 的要求：“确实是 SQLite，但有数据写入时能自动同步给其他设备”。现在是这样：每台设备上都有一份完整的本地 SQLite（Web 是 OPFS 里的 Turso wasm，退回 localStorage 时也一样能同步；原生端是 rusqlite），写入先存本地；登录后在后台自动推拉，云端是 Turso Cloud 里的一个库。

- 每条记录 UUIDv7 id、`updated_at`（HLC：`13 位毫秒-4 位计数-设备 id`，按字典序比就能排出先后）、`deleted` 墓碑，不真删。
- 推：本机写入先进 outbox；写完防抖 1.5 秒再推（同一行改了几次，只推最新的值），推成功了才 ack。
- 拉：云端每收下一行，就给它一个新的 seq（每个用户各自递增）。客户端记住拉到的最大 seq（游标），下次只拉比它大的，每页 500 行。拉下来的行用 `Store.applyRemote` 合并，存进本地，但不进 outbox（不会再推回去）。
- 冲突：**行级 LWW**，比 `updated_at`；HLC 末尾是设备 id，毫秒和计数都一样时，按设备 id 定先后，各端算出来的结果一致。云端也用这条规则（`ON CONFLICT … WHERE excluded.updated_at > updated_at`），所以晚推上来的旧改动，盖不掉新的。墓碑也只是一次写入，按同样的规则比：删除比编辑晚就删，编辑比删除晚就留（按行比，不是“删除永远赢”）。任务正文 body_md 整段比，MVP 不做逐字合并。
- 打卡 check_in 只追加（每次一行，新 id）。两台设备离线各打一次卡，合并后进度是两次加起来。
- 前后关系：`Store.edges()` 按 updated_at 顺序一条条加入依赖行，同一对只算一条；加进去会成环的那条（后到的）放进 `Store.conflictEdges()`，不生效（不阻塞，也不参与排布）。详情的「关系」顶上提示「先后关系绕成了圈」和「去掉这条」。两台设备连了同一对，两行算一条，去掉时一起去掉。
- 在一台设备上第一次登录（bootstrap）：
  1. 先把云端的数据全拉下来。
  2. 如果云端已经有数据，而这台设备上只有没动过的演示数据，就给演示数据打墓碑，不推上去。怎么判断没动过：`demo_stamp` 之后没写过东西；M2 之前生成的演示数据，看是不是“全在 10 秒内写入”。
  3. 按 LWW 合并云端，把本机比云端新的行都推上去，本机数据不会丢。
  4. 之后只同步增量。
- 什么时候同步：刚登录时；本机写入后（防抖）；窗口获得焦点或回到前台时；联网时；在前台时每 60 秒一次。都在后台跑，界面从不等它；离线照常用，联网后自动补上。
- 退出登录：只停同步，本机数据原样留着。登录同步时不能「重置演示数据」，因为会影响其他设备；退出后再重置，会清掉同步游标，下次登录重新合并，云端的数据会回来。
- 状态（设置 → 账户）：已同步 · 刚刚 / 正在同步… / 离线，联网后自动同步 / 同步出错（带 HTTP 状态码中文说明）+ 重试；凭据被拒（401 未登录 / 403 无权限）时按钮变「重新登录」。另有「立即同步」。
- 服务端按 user_id（登录邮箱，小写）把各人的数据分开；Web 端和原生端用同一个账号。

### 同步引擎选型（Rei 2026-10-15 定 A：Turso Sync；实现时的取舍）
Rei 选了 A（Turso）。真正做的时候，用的是 **Turso Cloud 当云端存储，加上自己的 outbox / 游标协议（走 Worker）**，没直接用 Turso Sync 的客户端 SDK（`@tursodatabase/sync-wasm` / Rust `turso` crate 的 sync）。2026-10-15 的实测和原因：
- SDK 本身能用：`@tursodatabase/sync@0.8.3` 在 node 里对 Turso Cloud push / pull 成功。但它是**“最后推送者赢”**：实测设备 B 用更旧的 `updated_at` 改同一行后推送，A 拉下来是 B 的旧值——和我们要的“按 updated_at 行级 LWW”相反（可以用 `transform` 钩子改写成带条件的 upsert，但下面几条更难绕）。
- 它同步的是**整个数据库文件**（物理页 + 本地改动回放）：只属于本机的 `meta`（device_id、游标）和 `outbox` 会让云端版本盖掉；建表、`ALTER TABLE` 也会跟着同步，离线设备回放同一条 `ADD COLUMN` 会失败，把拉取卡死，以后加迁移很危险。
- Safari / iOS / macOS 的 WKWebView 没有 `COEP: credentialless`，跑不了 wasm 引擎（Web 端在 Safari 上本来就退回 localStorage），Apple 端只能换 Rust `turso` crate 重写原生存储层并实测移动端交叉编译。我们的协议是纯 TS，localStorage、rusqlite、OPFS 三种存储都能同步，Rust 侧不用动。
- 鉴权：Turso Sync 要把数据库 token 交给客户端；Turso 的 token 只能经 Platform API（org 级权限）或长期 token 签发，没法在 Worker 里不带 Platform API token 就签短期 token。现在数据库 token 只放在 Worker 的密钥里，客户端拿到的是 Worker 签发的 1 小时同步凭据，只能读写自己的行。
- 留的路：core 的 `SyncTransport` 接口和 `SyncEngine` 跟存储无关。以后 Turso Sync 成熟了（按逻辑行处理冲突，DDL 不跟着同步），可以换过去；云端数据本来就在 Turso。
- 备选：B 自建 Worker + D1——2026-10-17 已做成可切换的第二个后端（见下“云端存储：Turso / D1”），默认仍是 Turso；cr-sqlite；PowerSync（需要 Postgres）。

### 云端（Turso `mindough`）
- `sync_row(user_id, tbl, id, updated_at, deleted, data, seq)`，主键 (user_id, tbl, id)，索引 (user_id, seq)；`data` 是整行 JSON，云端不管业务列，所以客户端加列、加表都不用改云端。
- `auth_code(code, payload, challenge, expires_at, used)`：原生端一次性登录码（5 分钟）。
- `server_schema`：云端迁移版本；Worker 第一次用到时自动执行迁移（`apps/server/src/sync.ts` 的 `SERVER_MIGRATIONS`，只追加）。
- Worker 密钥：`TURSO_DB_URL`、`TURSO_DB_TOKEN`（全权限数据库 token，只在 Worker 里，不进仓库、不给客户端）。
- 接口：`POST /api/sync/token`（会话 → `{ url, token, expires_at }`，401 未登录 / 403 无权限 / 503 服务不可用）、`POST /api/sync/push`（`{ rows }` → `{ applied }`，单次最多 500 行、单行 ≤ 2 MB）、`POST /api/sync/pull`（`{ cursor, limit }` → `{ rows, cursor, more }`）。

### 云端存储：Turso / D1（Rei 2026-10-17）
Rei：「settings中的这个google登录写清楚数据流向，先经过worker认证是你自己，再存到turso中，也可以选择存在D1中」，随后改成「这个切换数据库用环境变量切换」。也就是不在界面上选，服务端也不记“选了哪个”，由 Worker 的环境变量决定。默认还是 Turso（Rei 2026-10-16 定过云端先继续用 Turso），线上部署保持 `turso`。
- 存储层：`apps/server/src/sql.ts` 定义 `SqlDb { execute, transaction }`；`turso.ts` 的 `tursoDb`（Hrana HTTP）、`d1.ts` 的 `d1Db`（Worker 绑定 `DB`，事务用 D1 batch，整批原子）和 `d1RestDb`（Cloudflare REST API，迁移脚本用）；`storage.ts` 的 `openDb(env)` 按 `STORAGE_BACKEND` 选。同步协议、`SERVER_MIGRATIONS`、upsert / RETURNING SQL 两边完全同一份；auth_code（原生端登录码）也跟着后端走。
- `STORAGE_BACKEND`：没设或 `turso` → Turso；`d1` → D1；别的值 → 503 服务不可用（不悄悄换回默认，免得两边数据对不上）。写在 `wrangler.deploy.jsonc` 的 `vars` 里（git 里看得到；`keep_vars` 只保留配置里没写的控制台变量）。
- D1 库：`mindough`（id `eb0e708a-8764-42fe-a41c-13c9906f16fe`，APAC，账户 9151f72e…）2026-10-17 建好、云端 schema v1 已应用、`sync_row` 是空的；绑定名 `DB`。
- 只读显示：`GET /api/health` 和 `POST /api/sync/token` 的响应带 `storage: 'turso' | 'd1'`（写错了 health 报 `null`）；设置 → 账户卡最后一行「数据怎么走」显示当前库名和流向（文案见 COPY.md）。
- 切换步骤（手动，Turso → D1；反向把 turso / d1 对调）：
  1. 复制并核对：`cd apps/server && TURSO_DB_TOKEN_FILE=<数据库 token 文件> CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_API_TOKEN=… pnpm storage:copy -- --from turso --to d1`（先加 `--dry-run` 看源库有多少行；Hark 沙箱里 Node 要走代理，前面加 `NODE_USE_ENV_PROXY=1`）。脚本 `scripts/copy-storage.ts`（核心 `src/copy.ts`）：在目标库应用迁移 → 目标库已有同步数据就 409 冲突停下（确认要覆盖目标库加 `--replace`，只清目标库）→ 按主键翻页全量复制 `sync_row`（原样保留 seq，各设备的拉取游标切换后照样能用）→ 核对总行数、每个用户的行数与最大 seq、每张表的行数、逐行摘要（user/tbl/id/updated_at/deleted/seq/data 的 SHA-256）。任何一项对不上就以退出码 1 结束，提示“不要切换”。源库只读，从不删改。
  2. 把 `wrangler.deploy.jsonc` 的 `STORAGE_BACKEND` 改成 `d1`，提交并 `pnpm deploy`。
  3. 打开 `/api/health` 看 `storage` 是不是 `d1`，设置页库名跟着变。
  - 复制和切换之间不要有设备往旧库写：那几行不在新库里，而且新库会从旧的最大 seq 往上重新编号，已经拉到更大游标的设备会漏掉这些编号的新行。所以在没人用的时候做，复制完马上切；担心的话切换前再跑一次 `--replace` 复制。
- 测试：`apps/server/test/storage.test.ts`：STORAGE_BACKEND 解析与写错 503、D1 存储层（Miniflare 的本地 D1：编号参数、batch 原子回滚、迁移可重复）、同步 API 整套跑在 D1 上（push / pull / LWW / 游标 / 原生登录码，不发任何网络请求）、Turso ⇄ D1 双向复制（seq / 墓碑 / 中文原样、源库不变、409 与 --replace、--dry-run 不写、丢行和改值都能核对出来）。

### 原生端登录（Tauri）
- 「用 Google 登录」→ app 生成 verifier，用系统浏览器打开 `/auth/login?native=1&challenge=base64url(SHA-256(verifier))` → Google → Worker 发一次性登录码，结果页（“已登录，回到 Mindough 继续”）跳回 `mindough://auth?code=…` → app `POST /auth/exchange { code, verifier }` 换成会话（30 天），存本机，之后请求带 `Authorization: Bearer`。别的 app 就算截到 deep link，没有 verifier 也换不走；码只能用一次。
- Tauri 插件：opener（系统浏览器）、deep-link（`mindough://`，桌面与移动端都注册）、桌面端 single-instance（带 deep-link 特性：Windows / Linux 再开一个进程时把链接交给已开着的窗口）。Worker 给 `tauri://localhost`、`http(s)://tauri.localhost` 开 CORS。
- 状态：代码写完了，`cargo check`（Linux）能过，Worker 端有单测；**还没在真机上试过**（要打包安装后点一次登录）。`rust-ini` 锁在 0.21.1（0.21.3 给 `ParseOption` 加了字段，deep-link 2.6.2 编译不过）。

### 图片（R2）
- `POST /api/assets`（会话或同步凭据，image/*，≤ 10 MB）存进 R2 桶 `mindough-assets`，key = 用户邮箱哈希前 16 位 / 内容 SHA-256（同一张图只存一份）；`GET /api/assets/<key>` 公开读、长缓存（key 猜不到）。
- 客户端上传图片时：登录且在线 → 传 R2，asset 行只存地址（`url`、`r2_key`、`sha256`）；离线或没登录 → 还是存 data: 地址（照样同步，只是行大一些）。以前存的 data: 图片暂时不自动搬到 R2（以后做）。
- 附件（2026-10-17）另走 `POST /api/files`（任何格式，≤ 50 MB）/ `GET /api/files/<key>`（要登录、只能读自己的），同一个桶，key = 用户哈希 / `f` / SHA-256，见下面「附件」。

### 风险与缺口
- 每用户 seq 用 `MAX(seq) + 1` 在事务里算，依赖单写者串行（Turso 与 D1 都是）；以后要是开 `BEGIN CONCURRENT`，就得改成计数表。
- 行级 LWW：两台设备离线改同一件任务的不同字段，只留晚的那次（整行）。字段级合并以后再说。
- 旧版本客户端不认识的新列：拉下来能存（JSON 里有），但旧版本改这一行再推，会丢掉新列的值。
- 同步凭据 1 小时、会话 30 天；会话用 HMAC 签名，服务端不存状态；泄露了只能换 `SESSION_SECRET` 让它失效。
- Turso 免费档（starter）；2026 年 Turso 宣布加入 Supabase，留意产品走向。

## 任务类型（显示变体 + 创建模板）
任务可选一个“类型”。类型决定两件事：在列表、组、依赖图节点里怎么显示（显示变体），以及新建时给出什么模板（要填的字段 + 预填的 markdown 正文）。正文仍是 markdown、仍无标题。
- 默认类型“普通”：就是一段没有标题的 markdown 文本，无字段、无模板，显示正文首行，新建即写。
- 内置类型（先做这些，均可修改、复制、归档；内置的不能删，Rei 2026-10-17；空的自定义资料库 2026-11-10 起能删，见「删空资料库」）：

| 类型 | 显示 | 字段 | 正文模板 |
|---|---|---|---|
| 影视 | 竖版海报 + 片名 | 片名、海报、年份、电影/剧集、季集进度、平台 | 想看理由 / 观后感 |
| 游戏 | 方形图标 + 游戏名 | 游戏名、图标、平台、进度（%） | 目标 / 心得 |
| 书籍 | 书封 + 书名 | 书名、封面（只能手动上传 / 粘贴）、作者、出版社、出版年份、ISBN、页数、页数进度 | 摘录 / 笔记 |
| 项目 | 项目图标 + 项目名 | 项目名、图标、仓库或链接 | 目标 / 下一步清单 |
| 课程 | 图标 + 课程名 | 课程名、平台、链接、课时进度 | 笔记 |
| 旅行 | 横幅照片 + 目的地 | 目的地、照片、出发/返回日期 | 行程 / 待办清单 |
| 购物 | 商品图 + 名称 | 名称、图片、价格、链接 | 备注 |
| 餐厅 | 照片 + 店名 | 店名、照片、地址、链接 | 想吃什么 / 评价 |
| 饮食 | 菜品照片 + 菜名 | 菜名、照片、餐次、食材清单 | 做法 / 感受 |
| 人物 | 头像 + 姓名 | 人物（从人物列表选）、事由 | 要聊什么 / 备注 |

- 资料库（2026-10-15 加，见下“资料库”）：每个类型的字段分 资料字段（属于这部片 / 这本书）和 任务字段（属于这一次）；资料存在资料库里，任务引用它。
- 人物列表：独立的一张人物表（姓名、头像、关系、生日、备注 md）。“人物”类型的任务显示对方头像 + 姓名；任何任务也可以关联多个人物，在卡片上显示小头像。人物详情页列出与 TA 相关的所有任务。
- 自定义类型：选一种版式（海报 / 图标 + 名称 / 横幅 / 纯文字），定义字段（文本、数字、进度、日期、链接、图片、单选、人物），写一段正文模板，配名称、图标、颜色。内置类型走同一套机制，不写死特例。
- 新建任务时挑资料（2026-10-28 前是先选一个类型）；项目可设默认资料库，项目里新建时资料面板先打开它。
- 资料和类型（2026-10-28 起，docs/MULTI-TYPE.md）：任务不再「改类型 / 换资料库」，直接挂资料，能跨库挂好几条；类型能挂好几个，和资料互不相干，换类型不动资料。
- 图片：本地上传或粘贴链接；原生端存本地文件，同步时上传到 Cloudflare R2，D1 只存引用。
- 按名称自动找图和资料（影视 TMDB、游戏 Steam/IGDB、书籍 Open Library）放在 M4，展示时附来源。

## 资料库（Rei 2026-10-15：“可以添加影视库、书库、项目库、游戏库、课程库等等，这样不用每次都添加这些资料而是可以选，如果没有再新建”）
- 每个非“普通”的资料库（代码里叫类型）有一个库，自定义的自动有库。一件任务能挂好几个库里的资料（2026-10-28 起，见下面「多类型与多资料」）。库名（界面）：影视库、书库、游戏库、项目库、课程库、目的地、好物清单、餐厅库、菜谱、人物；写在 `library.ts` 的 `LIBRARY_COPY`。
- 表 `library_item`：id（UUIDv7）、type_id、name（= 主字段：片名、书名…）、image（图片字段：asset id / 外链 / data URL）、fields（JSON，其余资料字段）、note_md、created_at、updated_at（HLC）、deleted 墓碑。task 加 `library_item_id`（可空；2026-10-28 起是第一条资料，全部资料在 `task_item` 表）。一条资料可以给多件任务用（重看一遍、再去一次）。
- 字段定义 `FieldDef.scope`：`item`（默认，资料字段）/ `task`（任务字段）；主字段和图片字段总是资料字段。任务的 `type_data` 只存任务字段；显示时 `Store.taskData()` = 资料展开 + 任务字段（同名以任务为准）。
- 内置类型拆分（资料 → 任务）：影视 片名·海报·年份·电影/剧集·平台 → 看到哪；书 书名·封面·作者·页数 → 读到第几页；游戏 游戏名·图标·平台 → 进度 %；项目 项目名·图标·链接 → （无）；课程 课程名·图标·平台·链接 → 学到第几课；旅行 目的地·照片 → 出发 / 返回日期；购物 名称·图片·价格·链接 → 买几件；餐厅 店名·照片·地址·链接 → （无）；饮食 菜名·照片·食材清单 → 餐次；人物 人物（person 表）→ 事由。
- 人物库 = person 表（不迁移，风险大）：`Store.libraryEntries(typeId)` 把资料和人物统一成 `LibraryEntry`（kind item / person），选择框、资料库页、⌘K 用同一套；人物详情仍在 `#/people/:id`。
- 内置类型改定义：`BUILTIN_TYPES_REVISION` 版本戳（`0000000000000-0001-builtin`）。打开时，存着的内置类型若仍是更早的内置戳（用户没改过）就换成新定义；用户改过的（真实 HLC）不覆盖，只在内存补上各字段的 scope，并补上新定义新增、它还没有的字段（按 key，插在新定义里前一个字段之后；不改写、不进 outbox）——这样 r2 的 IMDb / 豆瓣 / 更多链接对改过类型的人也有。比当前内置戳更新的内置戳（别的设备已升级）不降级。
- 迁移（`Store.migrateToLibrary()`，每次打开都跑，无事可做时是空操作）：资料直接写在 type_data 里、没挂资料的旧任务 → 按 类型 + 规范化名字（NFKC、小写、去空白和标点）去重，先找库里已有的，没有就新建；同名的后来者只补空缺；任务改为引用资料、type_data 只留任务字段。迁移出来的资料用确定性 id（类型 + 规范化名字的哈希，UUID 形状），两台设备各自迁移得到同一条，同步时自然合并。没填主字段的、人物类型的、普通任务不动。SQLite：迁移 v2（建 library_item、task 加列与索引）；localStorage：旧 JSON 没有新表 / 新字段时在内存补空。
- 新建 / 改类型：`createTask` 时若 type_data 里写着名字（旧调用方式、⌘K 等），自动找同名或建资料挂上；挂 / 去资料走 `toggleTaskRef` / `setTaskItems`（2026-10-28 起；原来的 `changeTaskType`、`setTaskItem` 删了）。删除资料：用到它的任务不删，把资料抄回各自 type_data 再解开引用。
- 搜索：`searchLibrary` 空查询按最近用到（任务 created_at 或资料创建时间）排，有查询按 完全一致 > 开头 > 包含 > 按顺序出现（如「王泪」→「王国之泪」），简介也能搜到；⌘K 结果里有资料，可「用它新建任务」。
- 界面：新建面板选类型后，主输入变成选择框（↑↓ 回车，缩略图，最后一行「新建“xxx”」→ 就地填资料：图片可上传 / 粘贴图片或链接，名字预填）；已经写了一行字再选类型，那行字直接当搜索词。详情顶部是资料卡（图 + 名字 + 简介，「换一个」「编辑资料」「在影视库里看 · N 件任务」），任务字段在内容下方。资料库页在导航里（桌面侧边栏，手机在「更多」里，人物页并入这里）：按库切换的标签条（Apple 胶囊、WinUI SelectorBar 下划短条、Material filter chip），网格按版式：影视 / 书竖版海报 2:3、游戏 / 项目 / 课程 / 好物方形圆角、目的地 / 餐厅 / 菜谱横幅 16:9、人物圆形头像。没有图时按名字生成渐变 + 缩写的占位（不用任何有版权的海报）。
- 字段种类（2026-10-15 补，内置版本 r2）：除了文字 / 数字 / 单选 / 链接 / 图片 / 清单，还有 `multiselect` 多选（存 string[]）、`money` 金额 + 币种（`{ amount, currency }`，ISO 4217，Intl zh-CN 按币种小数位显示，不换算；默认 = 资料库里最近改过的那条的币种，一开始人民币）、`site_id` 站点编号（只存编号，按 `site` 拼链接：IMDb tt…、豆瓣数字；粘贴整条网址自动只留编号）、`links` 更多链接（`{ url, label? }[]`，label 只在用户改过时存，否则按域名表认出 EXT / 烂番茄 / TMDB / Steam…，不认识的用域名）、`episode` 看到第几季第几集（`{ season?, episode? }`，认 S02E03 / 2x03 / 第二季第三集 / EP03 / S02，认不出按原文存）。都在 core（`links.ts`、`money.ts`、`episode.ts`），各类型可复用。
- r2 的内置调整（Rei 2026-10-15）：影视去掉「平台」，加 IMDb / 豆瓣 / 更多链接，「看到哪」改 episode；游戏「平台」改多选（PC（Steam）/ PC（Epic）/ PC（其他）/ PS5 / PS4 / Xbox Series X|S / Xbox One / Switch / Switch 2 / iOS / Android / macOS / Linux / Steam Deck / 网页 / 其他），加更多链接；购物「价格」改金额 + 币种。迁移（打开时，只动旧形状的值，可重复、多端结果一致）：影视资料里旧的平台值留在数据里不显示（不丢，以后加回同名字段还能看到）；游戏平台文字按选项名 + 别名对上（Switch → Nintendo Switch、PS5 → PlayStation 5、Steam → PC（Steam）…），对不上的加选「其他」并把原文记进备注「平台：原文」；价格数字算人民币，文字认符号 / 代码 / 中文（$ → 美元、£、S$、HK$、元…），认不出的记进备注「价格：原文」。用户改过的内置类型（真实 HLC）不整体替换（只补新字段，见上），旧值也就不迁移。
- 新建面板：影视的搜索框里写「绝命毒师 S02E03」，拿「绝命毒师」去搜 / 新建，「看到哪」自动填第 2 季第 3 集，下面一颗小胶囊「已识别 第 2 季第 3 集」（× 不用 / 撤销）；内容第一行有季集标记且「看到哪」空着时同样（新建时提示、详情里写完内容后用可撤销的提示）。
- 资料 / 人物的备注支持 Markdown（和任务内容同一个渲染器：GFM 表格、清单、代码、引用；DOMPurify 消毒；链接新标签页打开）；编辑资料里备注写完显示排好版的样子，点一下接着改。
- 以后：按名字自动补资料和图（影视 TMDB、书 Open Library、游戏 Steam / IGDB），展示时附来源；资料合并（两条其实是同一部片）；资料库排序方式（最近 / 名字）。

## 完成方式（打卡）
完成方式与类型独立：任何任务都可选一种，类型可以给默认值。
（界面叫法：勾选完成 / 计时 / 计数 / 倒数日，见 docs/COPY.md；内部值 once / timer / count / countdown 不变。）
- 点一下（界面叫「勾选完成」）：点勾即完成（默认）。
- 计时：先点“开始”，过一段时间再点“结束”；可设目标时长（如 16 小时），未到时长卡片显示进度环与已用时间，到点发提醒，结束时满足目标才算完成。中途可暂停 / 继续。
- 计量（界面叫「计数」）：设目标数量和单位（8 杯水、30 页、5 公里），每次点 +1 或输入数量，累计达标即完成。
- 倒数日：设目标日期，卡片大字显示“还有 N 天”，过期后可切成“已过 N 天”（正数日）；到那天自动标完成，或手动完成。
- 重复：每天 / 每周几 / 每月几号 / 每 N 天，每个周期一份独立进度；记录连续天数与历史打卡日历。
- 打卡类任务完成时同样解锁 FS 后续任务。
- 打卡分类（Rei 2026-10-15 定，27 个均已批准）：重复任务可选一个打卡分类。内置顺序固定为：记录、整理、游戏、玩乐、健康、运动、护肤、清洁、学习、读书、饮食、作息、冥想、服药、理财、工作、写作、语言、乐器、创作、社交、宠物、植物、采购、个人护理、维护、观影。
  - 举例：饮食（喝水、做饭）、作息（早睡早起）、服药（补剂）、理财（记账、还款）、工作（周报、复盘）、创作（画画、摄影）、社交（联系家人朋友）、植物（浇水）、采购（补日用品）、个人护理（剪发、剪指甲）、维护（备份、换滤芯、保养）、观影（追剧）。
  - 每个带 lucide 图标与颜色，固定 id（UUIDv7 格式、时间戳 0，第四段 8001，各设备一致）；可改名、隐藏、排序、新增（打卡页「编辑」或分类选择器「管理分类…」），内置的不删只隐藏。
  - 选择器是可搜索的网格（分类多，不用下拉）；“新建打卡”与任务详情里可选。打卡页可按分类筛选（横向标签，只列有任务的分类）和“按分类”分组（空分类不显示）。
  - 种子列表在 `packages/core/src/seed/builtin-checkin-categories.ts`：追加一行即可扩展（id 由编号决定、永不复用；顺序由数组位置决定），老用户打开时自动补上新分类。
  - 与“分类”（挂在组上，名称 + 颜色）是两张表：`checkin_category` 只给重复任务用。
- 同步：每次开始、结束、+1 都记一条 check_in 事件，多端合并时按事件累加，不会因两台设备同时点而丢次数。

## 数据模型
- task：id、body_md（无标题，列表里显示首行作预览）、status（待办 / 进行中 / 完成 / 关闭；完成和关闭都是“已结束”，done_at 记结束时间）、group_id（可空）、scheduled_date（可空，用于列表视图）、done_at、sort、created_at
- dependency：pred_id、succ_id、type=FS、lag=0
- task_link（相关任务，无方向）：a_task_id < b_task_id、note、created_at；id 由这一对确定（SQLite 迁移 v3）
- group：id、name、icon（emoji 或 lucide）、start_at、end_at、category_id
- category：id、name、color
- task_type：id、name、icon、color、layout（poster / icon_name / banner / text）、fields（JSON 字段定义）、body_template（markdown）、builtin、hidden
- task 增加 type_id（可空=普通）、type_data（JSON，按字段定义填写，图片存 asset_id；有资料库后只存任务字段）
- library_item：id、type_id、name、image、fields（JSON）、note_md、created_at；task 增加 library_item_id（可空）；FieldDef 增加 scope（item / task）
- group 增加 default_type_id（可空）
- task 增加 completion_mode（once / timer / count / countdown）、target_value、unit、target_date、recurrence（RRULE，可空）
- my_day：task_id、date（本地日期）、sort、added_at（同步时按 task_id+date 合并）
- check_in：id、task_id、period_key（重复任务的周期）、kind（start / pause / resume / stop / add）、amount、at
- task_type 增加 default_completion_mode
- checkin_category：id、name、icon（lucide）、color、builtin、hidden、sort；task 增加 checkin_category_id（可空，重复任务用）
- person：id、name、avatar_asset_id、relation、birthday、note_md
- task_person：task_id、person_id
- asset：id、sha256、mime、width、height、r2_key（同步后）
- journal_post（日记的一条，SQLite 迁移 v13，Rei 2026-10-28 改成 Feed 流）：id（新写的随机 UUIDv7；旧日记转来的由那篇的 id 算：`migratedPostId`）、day、body_md、mood（可空）、created_at。只追加：发了不改正文、心情、日子，只能删和撤销删除
- journal_entry（2026-10-28 起不再写，留给旧客户端；日记，SQLite 迁移 v6，Rei 2026-10-17）：id（由日期算：`journalEntryId`）、date、body_md、mood（心情英文 id，可空）、base_at（这一版是在哪一版别的设备写的内容上改的，同步保护用）、created_at
- 依赖可以跨组。

## 视图（MVP）
0. 我的一天：今天打算做的任务清单，打开 app 的首页。旁边是「待安排」：还没定哪天做的事（M3 加）。
   - 任何地方都能加入：搜索结果、列表、组、组里的依赖图节点、人物详情、打卡页，右键 / 长按 / 悬停按钮“加入我的一天”，快捷键可一键加。
   - 全局搜索（⌘K / Ctrl+K，2026-11-05 起改 ⌘F / Ctrl+F）：搜正文、类型字段（片名、店名…）、人物、组；结果项直接带“加入我的一天”按钮。
   - 每天零点清空（按本机时区），没做完的不自动顺延，放进“昨天没做完”区一键带回今天。
   - 建议区：今天到期的、今天要打卡的、刚解锁可以开始的任务，点一下就加进来。
   - 可拖动排序；完成的沉到底部。
1. 时间轴（Agenda 式，2026-11-02 前叫「列表」）：按日期往下流的时间线，今天居中，过去在上、将来在下；琐事随手记，不用建组。
2. 组：组卡片（名称、图标、起止、分类、进度），点开看组内任务列表 + 组内依赖图（组页的「关系图」视图）。
3. 人物：人物列表（头像 + 姓名），点开看相关任务
4. 依赖图：按组看 DAG（组页的「关系图」视图），拖线连依赖，颜色区分 完成 / 可开始 / 被阻塞。全局关系图页 2026-10-23 删掉（Rei：「侧边栏的Graph选项卡并不是我想要的」），换成详情里的「任务链」（原叫「整条线」，见下）。
5. 可做清单：所有“可开始”的任务，按组和日期排。
6. 打卡：今天要打卡的任务、正在计时的任务、倒数日，一屏看完。样式照 GitHub contribution graph（活动热力图）：
   - 顶部一张总热力图：过去一年，每天一格，颜色深浅 = 当天完成的打卡数占应打卡数的比例；悬停/长按看当天明细。
   - 每个重复打卡任务一行：连续天数 + 今日操作按钮（勾 / 开始·结束 / +1）。迷你热力图（活动图）2026-10-25 起默认收起，点卡片左上角圆点才在下面整行展开，见「打卡卡片的活动图收进圆点」。
   - 计量与计时按达成比例分 4 档深浅（0、<50%、<100%、达标）；颜色跟随任务类型颜色，明暗主题各一套。
   - 窄屏（手机）默认显示最近 16 周，可横向滑动看全年。
   - 格子严格正方形（宽高相等，不随容器拉伸），直角或极小圆角。
   - 每月 1 号那一格做标记：格子够大（桌面）时在格内显示月份数字（如“3”），格子小（手机）时显示一个小圆点；设置里可固定选“数字 / 圆点 / 不标”。
- 全局：快速新建（快捷键）、⌘F 搜索（原 ⌘K）（可直接加入我的一天）、按分类筛选。
- 任务详情不是弹窗（2026-10-23 起）：桌面三列「侧边栏 | 当前视图的列表 | 任务详情」，手机整页推入，见下「三列布局」。

## 里程碑

### M0 ✅（2026-10-15）：核心逻辑 + Web 客户端 + 外壳骨架
- pnpm workspace：`packages/core`、`apps/client`、`apps/server`（占位）；TypeScript strict。
- `packages/core`（纯 TS、无 DOM，Vitest 90 个用例；客户端另有 4 个平台检测用例）：
  - 全部表的类型（task、dependency、group、category、task_type、person、task_person、my_day、check_in、asset），每行 UUIDv7 id + HLC updated_at + deleted 墓碑。
  - DAG：加边前环检测（拒绝时给出成环路径）、自环 / 重复边拒绝、合并后找冲突边、拓扑排序；派生状态 可开始 / 被阻塞（列出缺哪些前置）；完成后算出解锁的后续。
  - 打卡：进度只由 check_in 事件折叠（计时含暂停 / 继续、计量累加、点一下、倒数日剩余 / 已过）；重复规则（每天、每周几、每月几号、每 N 天）与周期键、连续天数 / 最长。
  - 热力图：一年 53 列 × 7 行（周一开始），4 档（0、<50%、<100%、达标），每月 1 号标记；每日总比例与单任务比例索引。
  - 我的一天：按本地日期的清单、完成沉底、昨天没做完、建议（今天到期 / 倒数日到了 / 今天要打卡 / 刚解锁）。
  - 内置 11 种类型（普通 + 10 种，固定 id）与演示数据；⌘F 搜索（原 ⌘K）（正文、类型字段、人物、组）。
  - 存储：异步 `StorageAdapter` 接口（以后 SQLite / Turso 适配器实现它）+ 内存适配器 + localStorage 适配器；写入同时进 outbox（同步引擎以后从这里 push）。`Store` 持有内存快照，UI 同步读、永不等待存储。
- `apps/client`：Vite + React + React Aria Components；皮肤层 = CSS 变量令牌（Apple / WinUI 3 / Material 3 × 明暗）+ 平台形状；自动按 UA 检测平台（Tauri 端用 os 插件），设置里可手动切；桌面侧边栏 / 手机底部标签栏按宽度切换。
  - 页面：我的一天（首页，拖动排序、昨天没做完、建议）、时间轴（Agenda，今天居中）、组（卡片 + 组详情：列表 / 按类型版式的卡片 / 组内依赖图）、人物（头像列表 + 详情）、依赖图（xyflow + elkjs 分层布局，拖线连依赖，成环弹提示，颜色区分状态）、可做、打卡（总热力图 + 每任务迷你热力图 + 连续天数 + 今日操作 + 倒数日）、设置。
  - 全局：⌘F / Ctrl+F 搜索（原 ⌘K）并直接“加入我的一天”；N 快速新建（先选类型，预填字段与正文模板）；完成时提示解锁了哪些后续，可一键“然后呢？”新建后续。
  - Markdown：M0 用 textarea + 预览（marked + DOMPurify）。
- `apps/client/src-tauri`：手写 Tauri 2 配置（identifier `dev.rei8t.mindough`，productName Mindough，os 插件），图标已生成；本机无 Rust，未编译。
- `apps/server`：Worker `mindough` 占位（`/api/health`），wrangler.jsonc 已按 custom domain 配好，未部署。

M0 实现时定下的细节（Rei 2026-10-15 已确认）：
- 皮肤映射：macOS / iOS → Apple，Windows → WinUI，Android 与 Linux / 未知 → Material。
- 重复规则以 RRULE 子集字符串入库；每次“应打卡日”开一个周期，持续到下一次应打卡日前一天，周期键 = 该日。创建日之前的周期只在已达标时计入连续天数。
- 计时：有目标时长时，须点“结束”且时长达标才算完成；运行中进度环可到 100%。
- 非重复的打卡任务达标后自动标“完成”并解锁后续；重复任务只记周期进度，不改状态。
- 内置类型用固定 id（UUIDv7 格式、时间戳 0），各设备一致；`updated_at` 最小，用户修改总会胜出。
- 热力图一周从周一开始；无需打卡的日子显示为浅格。
- 时间轴（Agenda）只放有日期的非重复任务；重复任务在打卡页。
- ~~从侧边栏 / 快捷键新建（不在组内、未指定日期）的任务自动加入我的一天。~~ Rei 2026-10-16 改：只有从我的一天新建的才进今天，其余默认进「待安排」（见 M3-6）。

### M1（进行中，2026-10-15）：真存储 + 原生包 + 登录
- ✅ SQLite 存储：`packages/core/src/storage/sql.ts` 的 `SqlAdapter` 实现 `StorageAdapter`，底下换驱动。
  - schema（`storage/schema.ts`）与数据模型一一对应（每字段一列，JSON 列存文本、布尔 0/1），`COLUMNS` 的类型约束保证 types.ts 加字段时必须加列；`schema_version` 表 + 只追加的迁移列表；`outbox`（自增 seq）与 `meta` 表。
  - 写入：一批变更一个事务，`INSERT … ON CONFLICT DO UPDATE … WHERE excluded.updated_at > updated_at`（行级 LWW，相等保留已有），每行进 outbox；失败整批回滚。
  - Web（2026-10-16 起，Rei：所有浏览器统一用 sqlite-wasm）：官方 `@sqlite.org/sqlite-wasm` 3.53 + opfs-sahpool VFS，跑在专用 worker（`store/sqlite.worker.ts`），库在 OPFS `.mindough-sahpool/`。单线程，不要 SharedArrayBuffer / 跨源隔离，Chrome 102+、Firefox 111+、Safari 16.4+；wasm 0.87 MB（gzip 0.4 MB）。同一时刻一个标签页（`store/tab-lock.ts`，Web Locks）：后开的只显示「已在另一个标签页打开」+「在这里用」（steal，原来那页先 flush 再停库、换成提示）。第一次启动把以前 Turso wasm 的 OPFS `mindough.db` 整份搬过来（`migrateFromTurso`，旧文件留作备份）；读旧文件还要 Turso 引擎和跨源隔离，所以 COOP / COEP 响应头暂时保留，等大家都迁完再去掉。无 OPFS（部分无痕模式）退回 localStorage。
  - 首次用上 SQLite 时把 localStorage 的数据原样迁过去（行、device_id、demo_seeded），只迁一次，旧数据留作备份。
  - Tauri 原生：`src-tauri/src/db.rs` 命令层（rusqlite bundled，单连接，`db_exec / db_run / db_all`），schema 与迁移仍在前端 core，与 Web 同一份。没用 tauri-plugin-sql：它是连接池，跨 invoke 的 BEGIN / COMMIT 不可靠。本机 `cargo check` 通过（Linux）。
  - 测试：同一套契约跑 内存 / localStorage / node:sqlite / Turso 引擎（`@tursodatabase/database`，与 wasm 同引擎）。
- ✅ GitHub Actions：`ci.yml`（类型检查、单测、构建）；`build.yml`（手动或推 `v*` 标签）用 tauri-action 打未签名的 macOS universal、Windows（msi / nsis）、Linux（AppImage / deb），另有 Android APK（arm64，CI 里 `tauri android init`）；产物传 artifacts，推标签时建 Release 草稿。iOS 待签名方案。
  - Android 固定签名 + 自建 F-Droid 源（2026-11-09，Rei 授权）：从下个标签起 APK 改成 release 包，用固定钥匙签（alias `mindough`，RSA 4096，30 年）；推标签时同时发到 `https://fdroid.rei8t.dev/repo`（R2 桶 `mindough-fdroid` + 上传 Worker `mindough-fdroid-upload`），添加源用 `https://fdroid.rei8t.dev/repo?fingerprint=F4B21E7612495FE53748EE9203E5966A0D931336ED7DD8646D71FD72B2AA6F83`。debug 包升到 release 包要先卸载一次。细节见 `docs/ANDROID-RELEASE.md`。
  - 原生图标（2026-11-04，Rei：「Android的图标还是tauri的」）：`gen/` 不进仓库，`tauri android/ios init --ci` 只带 Tauri 默认图标，不读 `src-tauri/icons/`。所以 init 之后跑 `scripts/native-icons.sh android|ios`，把 `icons/android`、`icons/ios` 拷进工程，逐个比 sha256，不一致就失败；Android 顺手删掉模板没人用的矢量前景和背景，构建后再核一遍。alpha.14 及以前的 APK 都是 Tauri 图标，下个 alpha 起换成念头团。
- ✅ Google 登录（Worker 写好未部署）：`/auth/login`、`/auth/callback`、`/auth/logout`、`/api/me`；HMAC 签名会话 cookie（SESSION_SECRET，30 天）；`ALLOWED_EMAILS` 白名单，为空 = 谁都不能登录。失败回跳带 `?login_error=代码`，前端启动时立即用 history.replaceState 去掉并显示可关闭提示，登录成功后不再显示。`POST /api/sync/token` 当时先返回 501 未实现，M2 已签发同步凭据。客户端设置页有“账户”区；不登录也能完整离线使用。
- ✅ 原生端登录（系统浏览器 + deep link 回调）：M2 里做完，见“原生端登录（Tauri）”；Worker 已部署，Google OAuth 客户端 Rei 配好（2026-10-15）。
- ✅ Markdown 编辑换成 Milkdown（所见即所得），见 M3-2；2026-10-25 又换成 Tiptap，见「编辑器换成 Tiptap」。

### M1b ✅（2026-10-15）：新建与详情重做 + 文案（Rei：“功能都有，但让人厌恶……完成方式在新建时就要让用户选，而且用词很粗糙”）
- 新建和详情拆开。新建面板（TaskComposer）：一个大的无边框内容框（「要做什么？」，自动聚焦，无标签无编辑/预览页签，Markdown 写法只在 ? 悬停提示里）；下面一排属性胶囊（类型 / 日期 / 组 / 和谁有关，点开是弹层，设了显示值）；「怎么算完成」四张卡片（名称 + 一句话例子，默认勾选完成），选中后只出现它自己的一句话设置（每次 [10] [分钟] / 目标 [8] [杯] / 目标日期 [..]，到时显示 还有 N 天）；「多久一次」只做一次 / 定期打卡 → 每天 / 每周[一…日] / 每月 [15] 号 / 每 [3] 天，定期时出打卡分类网格。选了非普通类型才出现该类型的字段，类型可带默认完成方式（用户手动挑过就不改）。没有状态、没有删除；主按钮「添加」（⌘/Ctrl+Enter），取消或 Esc。从侧边栏新建且无组无日期的仍自动进我的一天；建好后提示里可「查看」。“然后呢？”/「新建下一步」打开同一个面板，带“做完「X」之后”，建好自动连上。
- 详情（TaskDetail）：内容在前（排好版的 markdown，点一下就地编辑，Esc 收起）；状态用操作按钮——主操作随完成方式变（完成 / 开始计时·暂停·结束 / +1 杯 / 打卡），「关闭」（重复任务叫「不再打卡」）2026-10-17 起挪进顶栏 ··· 菜单（见下面「「关闭」挪进 ··· 菜单」那条），底部只放主操作，结束后底部只剩「重新打开」，顶部徽章显示 已完成 / 已关闭 / 还在等 N 件事 / 进行中；计时、计数、倒数日、定期打卡有一块进度（环 + 数值 + 连续次数）。右侧（手机在内容下方）属性列表：类型、完成方式、重复、打卡分类、日期、组、和谁有关，点值弹出编辑。「前后关系」分「先做完这些」「做完后解锁」，各有「添加」（可搜索）和「新建下一步」。删除放进 ··· 菜单并确认；加入 / 移出我的一天是顶部的太阳图标（菜单里也有）。
- 平台形状：Apple 桌面是无分隔带的 sheet、手机是带拖拽条的底部弹层（新建面板顶栏左取消、右添加）；WinUI 是 ContentDialog（20px 标题、底部按钮带）；Material 桌面是 28dp 圆角对话框，手机是全屏对话框（左上关闭、右上添加）。
- 文案：docs/COPY.md（术语表 + 语气原则），AGENTS 规定界面文案按它写；core 的 COMPLETION_MODE_LABEL / HINT 与 describe.ts（时长、倒数日、口语日期、完成方式摘要、快捷日期）统一说法。
- 依赖：@internationalized/date（React Aria 月历）。

### M1c ✅（2026-10-15）：资料库
- core：`library.ts`（叫法、字段拆分、规范化与模糊搜索、迁移计划、确定性 id、占位图配色）、`library_item` 表（SQLite 迁移 v2）、Store 的资料增删改 / 换资料 / 改类型保留字段 / 打开时迁移、⌘K 搜资料；内置类型拆 资料 / 任务 字段并按版本戳升级；演示数据每个库几条（星际穿越重看两次）。测试覆盖迁移（localStorage、node:sqlite、Turso 三种存储 v1 → v2）、去重、模糊搜索、删除 / 改类型。
- client：新建面板的资料选择框与就地新建、详情资料卡、资料库页与资料详情、人物并入资料库、⌘K「用它新建任务」、渐变占位图；三种皮肤的切换条与卡片形状。

### 相关任务 ✅（2026-10-15）
- core：`related.ts`（规范顺序、确定 id、前后关系优先的过滤）、`task_link` 表与 SQLite 迁移 v3、Store `linkTasks / unlinkTasks / relatedTasks / taskLinks`（按版本缓存）、删任务级联、演示数据三对；测试覆盖去重、不阻塞、与前后关系重叠、localStorage / node:sqlite / Turso v2 → v3。
- 界面：详情的分区改叫「关系」，下分 先做完这些 / 做完后解锁 / 相关任务（「添加」可搜索、「新建相关任务」、行可点开、悬停 × 去掉、显示对方状态）；新建面板多一颗「相关任务」胶囊（多选）；列表行在元信息里显示小链环 + 个数；关系图把相关画成没有箭头的点线（前后关系里还没完成的是虚线带箭头，所以相关用圆点线区分），参与排布让两件挨着，图例「相关（不分先后）」，「有关系的」范围包含相关任务；选中点线按 Delete 去掉。

### M2 ✅（2026-10-15）：多端同步
- ✅ 引擎：Rei 定 A（Turso）；做成了 Turso Cloud + 自己的 outbox / 游标协议经 Worker（原因见“同步引擎选型”）。core `sync/`：`SyncEngine`（防抖推送、游标拉取、第一次登录的合并、演示数据不带上去、状态）、`SyncTransport` 接口、`MemoryRemote` 假云端；Store `applyRemote` / `onLocalWrite` / `raw` / `conflictEdges`；适配器 `applyRemoteChanges`（不进 outbox）。
- ✅ 合并规则：行级 LWW（HLC + 设备 id 定先后）、墓碑同样比较、check_in 只追加、合并后成环的后到边标冲突。core 测试用两台模拟设备 + 假云端覆盖：互相看到、第一次合并两边数据都留、LWW 与推送先后无关、同毫秒按设备 id、删除 vs 编辑、打卡相加、成环冲突一致、同一对去重、新设备只有演示数据、改过的演示数据照常合并、离线后补推、401、防抖不回推、退出后不推、SQLite 落盘不进 outbox、重置后重新合并。
- ✅ Worker：`/api/sync/token`、`/api/sync/push`、`/api/sync/pull`、云端 schema 自动迁移、`/api/me` 移出白名单 403、Bearer 会话、Tauri CORS；单测用 node:sqlite 实现的假 Turso（真跑 SQL）；`apps/server/e2e/real-turso.test.ts` 对真实 Turso 跑两台设备（默认跳过，2026-10-15 跑通后清掉了测试行）。
- ✅ 客户端：`lib/sync.ts`（凭据缓存与 401 重取、HTTP 传输层、跟着账户开停、焦点 / 联网 / 60 秒触发）、`lib/account.ts` 改成全局账户状态（Web cookie / 原生 Bearer）、设置 → 账户的同步状态行与「立即同步」、详情里的成环提示、登录同步时不能重置。
- ✅ 原生端登录（deep link + 一次性码 + verifier）：代码与 `cargo check` 通过，未在真机验证。
- ✅ 图片上传 R2（登录在线时），asset 只存地址；旧的 data: 图片暂不迁移。
- 线上：Worker 已部署（`/api/health` stage M2）；Turso 库 `mindough`（东京）已建、云端 schema v1 已应用；Worker 密钥 `TURSO_DB_URL`、`TURSO_DB_TOKEN` 已设；R2 桶 `mindough-assets` 已建并绑定 `FILES`。
- 要 Rei 验证：两个浏览器（或电脑 + 手机）都登录同一个 Google 账户，一边新建 / 改 / 打卡，另一边回到前台或点「立即同步」看到。

### M3 天天好用（Rei 2026-10-16 批准路线图：“做完之后就按顺序，开工M3，直到做完为止”；动工顺序 4 → 6 → 2 → 1 → 3 → 5）
1. ✅ 提醒通知（2026-10-16）：
   - core `reminders.ts`（纯函数 + 测试）：`upcomingReminders(tasks, checkIns, { now, horizonMs, graceMs, timeZone, fired, snoozed })` 算出接下来要响的——只做一次（有日期，那天 `remind_time`）、倒数日（目标日那天）、定期打卡（每个要打卡的日子；那个周期已经达标就不响）、计时到点（正在走且有目标时长，不用设时间；暂停再继续按新的一段重算）。完成 / 关闭 / 不再打卡 / 删除的不响；建任务之前的打卡日不响。时间是本机（或指定 IANA 时区）的墙上时间，夏令时跳过的时刻顺延（纽约 02:30 → 03:30）、重复的取第一次。id 稳定（任务 + 种类 + 那天 / 那段计时），用来去重、记「已响过」、稍后再提醒（10 分钟）；app 刚打开时错过 15 分钟以内的补响。
   - 模型不用改：v4 已有 `task.remind_time`（同步）；总开关、已响过、稍后再提醒存本机（每台设备自己响，通知权限本来就按设备）。
   - 客户端 `lib/reminders.ts` + `components/ReminderHost.tsx`：每分钟、数据一变、回到前台时重算，最近的一个 setTimeout 到点。前台：app 里弹一条提示（铃铛 + 标题 · 说明，「查看」「10 分钟后」）；后台：系统通知（Web 经 `public/sw.js` 的 service worker 发——Android Chrome 只认这种，点通知回到 app 打开那件任务；没有 service worker 就用 `new Notification`）。
   - Tauri：`tauri-plugin-notification`（Cargo + `notification:default` 权限 + `@tauri-apps/plugin-notification`）。桌面同 Web（app 开着时排程）；手机把接下来 48 小时的提醒交给系统排好（`Schedule.at`，allowWhileIdle），app 关着也会响，重算时取消变了的、补上新的；点通知打开那件任务（`onAction`）。
   - 界面：新建面板多一颗「提醒」胶囊（只在有日期 / 倒数日 / 定期打卡时出现）；详情属性列表「提醒」一行（同样条件，或已经设了）；弹层 = 常用时间 9:00 / 12:00 / 18:00 / 21:00 + 系统的时间输入「其他时间」+ 一句什么时候响 +「不提醒」；总开关关着时弹层里提示「提醒通知关着。去设置里打开」。设置 → 提醒：「提醒通知」开关（Apple / WinUI / Material 各自的开关样子，`ui/primitives` Switch）+ 权限状态说明 +「允许通知」；第一次打开开关时顺便问权限。
   - 没做：通知上的「稍后」按钮（系统通知的 action 各平台不一样；app 里的提示有）；Web 端 app 关着时不会响（要推送服务器，不做）；桌面端 app 关着不会响（以后可以加托盘常驻）。真机待验：macOS / Windows 通知权限、Android 13+ 的 POST_NOTIFICATIONS 与精确闹钟、iOS。
2. ✅ 正经的 Markdown 编辑器（2026-10-16）：所见即所得，取代「输入框 + 排好版的预览」，入库仍是 markdown 文本。
   - （2026-10-25 已换成 Tiptap，读写仍用 remark，见下面「编辑器换成 Tiptap」。下面是当时的选型。）选 **Milkdown 7**（不选 TipTap）：它本身就是 markdown 原生的——remark 解析 ↔ ProseMirror 文档 ↔ remark 序列化，存进去、读出来就是 markdown，往返保真（`milkdown.test.ts` 覆盖标题 / 清单 / 表格 / 删除线 / 链接 / 代码 / 引用 / 空清单项）；TipTap 的 markdown 要靠社区扩展转换，往返会丢东西。GFM 预设直接带表格、清单（`- [ ]`）、删除线、自动链接。headless、不带样式，排版沿用 `.md`，三种皮肤只改令牌（清单勾 Apple 圆形 / WinUI · Material 圆角方形）。
   - 用在：任务详情的内容（点进去就能改，Esc 收起）、资料 / 人物备注、**新建面板的内容框**（不带工具栏的轻量版 `toolbar="none"`：只靠写法变样子，`# `、`- [ ] `、`**粗体**` 打出来就排好；字号同以前 18px；Esc 关面板、⌘/Ctrl+Enter 添加照旧）。编辑器约 140 KB（gzip）按需加载，启动后空闲时预加载，新建面板一打开就能写。
   - 详情和备注编辑时下方出现格式工具栏（标题 / 粗体 / 斜体 / 删除线 · 清单 / 列表 / 编号列表 / 引用 / 代码 · 链接 / 表格），按钮不抢焦点，悬停提示带快捷键，⌘K 加链接；点清单的勾直接切换。（2026-10-25 工具栏去掉了，见「编辑器去掉工具栏」。）
   - ✅ 链接能改了（Rei 2026-10-17：「放上去就展示吧，点一下是访问链接」）：编辑器里点链接 = 打开（Web 新标签页 noopener，App 经 `lib/external.ts` 的 `openExternal` 交给系统浏览器；mousedown 不放光标、不进编辑；全局外链拦截跳过编辑器里的链接，免得开两次）。鼠标移到链接上出小浮层（`.md-link-pop`）：原地址（省略号，可点；2026-11-03 起不显示网址，换成「访问」按钮，网址进悬停提示）+「编辑」（浮层里改，预填原地址，回车保存）+「去掉链接」，鼠标能移进浮层，移开 250 毫秒收起。触屏没有悬停：点按仍是打开，长按选中链接里的字（光标 / 选区落在链接里，编辑器有焦点时）出同一个浮层——选这个而不是「第一次点放光标、第二次打开」，因为 Rei 要的是「点一下是访问」。⌘K / 工具栏链接按钮在已有链接里：输入框预填原地址，按钮变「保存」，旁边多「去掉链接」。更新逻辑：按 link mark 的连续范围 removeMark + addMark（`setLinkTr`，保留 title），不再用 toggleLinkCommand（它对已有链接会去掉）；选中普通文字加链接也改成 addMark。
   - ✅ 链接的文字和网址一起改（Rei 2026-10-17：「编辑器中链接要支持编辑名称和链接」）：浮层「编辑」、工具栏链接按钮、⌘K 开同一个链接框，两栏「文字」「链接」。**形式按 Rei 定的**：桌面 = 那个悬停浮层原地展开（锚在链接旁；新加时锚在光标 / 选区处），不是居中弹窗；触屏（最后一次是触摸 / 笔，或 `(hover: none) and (pointer: coarse)`）= 底部弹出面板 `.md-link-sheet`（遮罩点一下取消；`visualViewport` 算键盘高度把面板抬上去，没键盘时留 `safe-area-inset-bottom`；输入框 44px 高、16px 字防 iOS 放大）。预填：在链接里 = 原文字 + 原地址，焦点在「文字」；选了字 = 文字预填（选的字本身像网址就顺手填进「链接」），焦点在「链接」；空光标 = 都空。保存（`applyLinkTr`）：文字没改只换地址（保留链接里的粗斜体），改了就整段换成新文字（带第一个字的格式）；文字空着用网址当名字；跨段落的选区文字不能改、只加链接；保存后光标在链接后面，接着打的字不进链接（storedMarks 去掉 link）。网址规范（`normalizeHref`）：去两头空白、中间空格编成 %20、没协议补 https://、`//` 开头补 https:、mailto: / tel: / codex:// 等别的 App 的链接 / 站内 `#/…` 照原样，javascript: / data: / vbscript: / file: 等不收，http(s) 主机名要带点（或 localhost / IP），不像就在框里红字「这不像网址，检查一下」（空着「填一个网址」）、框不关。回车保存（输入法选字的回车不算：isComposing / keyCode 229），Esc 取消（不冒泡关详情弹窗），Tab / Shift+Tab 只在两栏和按钮间转；点框外面 = 取消。开框前先 `domObserver.flush()` 读进刚改的选区（按 Shift + 方向键后马上按 ⌘K 会读到旧选区）。工具栏里原来的单栏链接输入框去掉了。WinUI 浮层 / 面板用实色 `--popup-bg`（`--surface` 半透明，下面的工具栏会透上来）。测试 `components/editor/link-edit.test.ts`（规范网址、改文字和网址、保留粗体、留空用网址、网址不对不改、新加、含括号 / 空格网址 + 含方括号 / 星号的中文文字往返稳定、跨段落）；截图 work/shots-linkedit/（脚本 work/shots-tool/le-link2.mjs）。
   - ✅ 手打即时渲染逐项查过（Rei 2026-10-17，真实 Chromium 里一个字一个字打）：标题 # ~ ######、**粗**、*斜* / _斜_、~~删~~、`行内代码`、``` 代码块（回车或空格）、> 引用、- / * / + 列表、1. 编号、- [ ] / - [x] 清单、--- / *** 分隔线、|3x2| 空格 本来就行；补了四个：`[文字](网址)` 打完右括号变链接（网址缺协议补 https://，`[](网址)` 用网址当文字，也认全角括号，`![…](…)` 图片语法不碰，代码里不转）、`<网址>`、裸网址后打空格（末尾标点不算，www. 补 https://）、一行 `|a|b|` 回车变表格（这行当表头，下面一行空的，光标进第一格；`|---|` 分隔行、列表 / 引用里不转）。检查脚本 `work/shots-tool/le-syntax.mjs`。
   - ✅ 修：列表里 Tab 让焦点跑出编辑器（Rei 2026-10-17「ul ol 还是用 tab 缩进会 unfocus 整个编辑器」）：缩进其实做了（Milkdown 列表 keymap 的 Tab → sinkListItem），但详情是弹层，React Aria FocusScope（contain）在 document 上自己接 Tab 挪焦点，不看 defaultPrevented；happy-dom 单测里没有弹层所以测不出来。改为编辑器根节点上拦下 Tab 的冒泡（preventDefault + stopPropagation），测试里断言 document 收不到 Tab。
   - 去掉了备注标签旁的「支持 Markdown」小字（写的时候就是排好的样子，用不着说）；新建面板的 ? 提示改成「直接这样写，会自动排好版：」。
   - 修：详情第一行的标题样式漏到了整段（`.detail-md > :first-child` 套到了编辑器外壳上），小标题比正文大一点（h1 19 / h2 17）。
   - ✅ 网络图片不渲染（Rei 2026-10-17：「编辑器的网络插图」「编辑器不渲染网络图片」；先误解成去掉资料图片框的「粘贴图片链接」，Rei 澄清后改回，那个照留）：判断在 `lib/remote-image.ts`（http(s) 和 `//` 开头算网络图片；`data:` / `blob:` / 相对路径 / `https://app.mindough.rei8t.dev/api/assets/…`、旧的 `https://mindough.rei8t.dev/api/assets/…` 和同源的 `/api/assets/` 是自己的图，照常显示）。编辑器里覆盖 image 节点视图（`components/editor/remote-image.ts`，`$view`）渲染成 `span.md-remote-image`（alt，没有就网址；title 是网址），不建 `<img>`；只读预览（`lib/markdown.ts` 的 marked image 渲染器）同样处理（编辑器加载前的占位也是它）。markdown 原文不动，往返一致；粘贴 markdown / HTML 也不加载（ProseMirror 和 Milkdown 剪贴板都在惰性文档 / template 里解析）。不迁移旧数据；导出时正文里的网络图片仍照旧去取回打包（`remoteImageUrls`），没改。
   - ✅ GitHub 扩展语法（Rei 2026-10-17 截图：引用块里原样显示「[!NOTE]」和「$O(n)$」）。编辑器 `components/editor/gh-syntax.ts`，只读 `lib/markdown.ts`，共用 `lib/gh-alerts.ts`（标记、标题、图标）、`lib/math.ts`（KaTeX 加载、GitHub 公式规则）。markdown 原文不变：
     - 提示块 `> [!NOTE]` / `[!TIP]` / `[!IMPORTANT]` / `[!WARNING]` / `[!CAUTION]`（大小写不敏感、标记独占第一行，同 GitHub）：编辑器里是 `gh_alert` 节点（attrs kind + marker 原样大小写；标题图标不可编辑），remark 读入时把引用块改成 ghAlert，写出还原成引用块、标记用 html 节点原样输出（不被转义成 `\[`），和下一块之间不空行（toMarkdown join）。旧编辑器把 `[!NOTE]` 存成了 `\[!NOTE]`，两边都照样认，编辑器写回时改成 `[!NOTE]`。手打：`> ` 变引用后打 `[!note]`，打完 `]` 就是提示块。标题中英：注意 Note / 提示 Tip / 重要 Important / 警告 Warning / 小心 Caution；颜色是每个皮肤 × 明暗的 `--alert-*` 令牌，Apple / Material 整块浅色圆角、WinUI 细边框（skins.css），通用是左色带。
     - 数学公式 KaTeX 0.19（JS、CSS、字体都打包在应用里，不走 CDN；只读显示里用到才按需加载，没加载完先显示源码）：行内 `$…$` / `$$…$$`、块级 `$$` 独占行、```math。是不是公式按 GitHub 规则：开头 $ 后紧跟非空白、结尾 $ 前非空白、结尾 $ 后不是数字——「$5 和 $10」「$5和$10」「$ x $」都不算。编辑器读入用 micromark-extension-math，再按这条规则把不像公式的还原成文字；只读用自写的 marked 扩展，配对方式和 micromark 一样（不成立的那一对整段当文字，后面那个 $ 不再拿去开头），两边结果一致。写出：文字里的 $ 不转义（以前的「$5」不会变成「\$5」），只有读回来会被当成公式的那一对才加反斜杠；行内公式照原来的 $ 个数。编辑器里 `math_inline` / `math_block` 节点存源码，平时显示 KaTeX，光标进去（点它；←/→、退格挨着它）显示源码可改、块级下面实时预览；手打 `$x$` 收尾即变，紧接着打数字（`$5$1`）变回文字；一行 `$$` 回车（或 `$$ `）开公式块，块里最后一行打 `$$` 回车结束；光标离开时空的行内公式删掉。
     - 其他 GitHub 语法核对：脚注 `[^1]` 编辑器（Milkdown gfm 自带，补了样式）和只读（加 marked-footnote，跳转在卡片里滚动、不改地址栏的 # 路由）都显示；表格对齐编辑器本来就对，只读以前被 `.md th, td { text-align: left }` 盖掉了，修了；任务清单、删除线、自动链接本来就行（编辑器写回时 `www.x.com` 会变成 `[www.x.com](http://www.x.com)`、表格补空格对齐，是 Milkdown 原有行为，没动）；`<details><summary>` 只读里能折叠（DOMPurify 放行）——编辑器里后来也做了，见下面「折叠块」。
     - ~~顺带发现：Milkdown 给根节点加 class `editor` 撞上 app.css 的 `.editor`~~ → 已修，见下一条。
   - ✅ 编辑器块间距收紧（Rei 2026-10-17）：原因是 Milkdown 给 ProseMirror 根节点加 class `editor`，撞上 app.css 里的 `.editor`（flex 竖排 + 16px gap，2026-10 早期新建面板用过的类，`8648218` 起已经没有组件用它），块与块之间多 16px，而且 flex 里外边距不合并。删掉了那条死样式（全库查过没有别的 `.editor` 用法），编辑器又是普通块排版，间距只靠 `.md` 的外边距（段落 / 列表 4px、引用 / 折叠块 6px、提示块 / 公式块 / 表格 / 代码 8px、详情里小标题上 16px 下 4px），和只读显示一致。上一轮给提示块 / 公式块去外边距的特例删了。editor.css 里留了注释：别给裸 `.editor` 写样式。编辑器加载前的占位预览也加上 `md-editor-content`，加载完不跳。
   - ✅ 折叠块 `<details>`（Rei 2026-10-17）：`components/editor/details.ts`。
     - 读入：remark 插件（排在 gh-syntax 后面）在每一层里找以 `<details` 开头的 html 节点（Milkdown 的 remarkHtmlTransformer 已经把块级 html 包进了段落，两种都认），按 `<details>` / `</details>` 数层数找配对结尾：一个 html 节点写完的（一行，或中间没空行），把里面的正文用同一个 remark 再读一遍（再跑公式规则和提示块）；多行写法（开头 html、中间普通块、结尾 `</details>` 的 html）把中间的块收进来。都收成 mdast `details`（attrs 原文、summary 文字、是否一行写完）。没有结尾的照旧当 HTML，不吞后面的字。
     - 节点：`details`（content `details_summary block+`，attrs：`attrs` 原样属性如 ` open`、`inline`、`hasSummary`、`expanded`）+ `details_summary`（纯文字一行，不带格式）。节点视图：不可编辑的三角按钮（`.md-details-toggle`，`aria-expanded`，读屏「展开折叠块 / 收起折叠块」）+ contentDOM；收起时 CSS 藏掉标题以外的块。
     - 展开状态：决定**不写回 markdown**，放在节点 attr `expanded` 里（不进撤销历史、序列化不读它）。理由：点开看一眼不该算改了正文——正文是整段后写赢同步，白白算一次改动可能冲掉另一台设备上的真改动，也会让 markdown 来回多出 / 少掉 `open`。原文的 `open` 属性原样保留，只决定打开时默认展开（只读显示也是原生行为）；新建的折叠块默认展开好接着写。
     - 写出：标准写法 `<details>\n<summary>标题</summary>\n\n正文\n\n</details>`（正文前后空行，GitHub / marked 才会把正文当 markdown）；原文是一行写完、正文还是一段文字的照一行写回（`<details><summary>标题</summary>内容</details>`）。中间没空行的多行写法第一次保存会变成标准写法，之后不再变。标题空且原文没有 summary 时不写 `<summary>`。
     - 输入（2026-10-25 起没有工具栏，改成行首 `>> `，见「编辑器去掉工具栏」）：工具栏「折叠块」（ListCollapse 图标，放在「代码」后面）：空光标在一段文字里 → 这段变标题；选了几块 → 收进新折叠块的正文、光标在空标题（占位「折叠块标题」）；光标在折叠块标题里 → 拆开。手打一行 `<details>`（可带 ` open`、`<summary>标题</summary>`）回车也变。没做斜杠菜单（编辑器还没有斜杠菜单，为这一个块加一套不划算）。
     - 键：标题里回车 → 进正文第一行（不是空段落就插一个；收起的先展开）；正文空段落回车 → 出到折叠块后面（ProseMirror 自带 liftEmptyBlock）；标题开头退格 → 拆开；收起时标题里 ↓ 跳到下一块（没有就补一段），下一块开头 ↑ 回标题；光标不管怎么进了收起的正文都会展开（appendTransaction）。
     - 样式：只读 `.md summary`（去掉原生三角，`::before` 画 chevron mask，`[open]` 转 90°）和编辑器 `.md-details-toggle::before` 共用一套；正文缩进 20px；只用令牌颜色，三皮肤 × 明暗通用。测试 `details.test.ts`（读入结构、往返、两遍稳定、工具栏、手打、回车 / 退格、展开收起不算改动）；截图 `work/shots-details/`（脚本 `work/shots-tool/details.mjs`、`details-type.mjs`）。
3. 🟡 小组件（2026-10-16，详见 docs/WIDGETS.md）：
   - ❌ 桌面小窗：做过，2026-11-04 Rei 要求删除小窗，已经删了（见「删除桌面小窗」）。
   - 🟡 Android：app 写快照 ✅（`lib/widget-snapshot.ts` → Rust `widget_snapshot` → app 数据目录 `widget-snapshot.json`，有测试）；AppWidget 的 Kotlin + 布局写在 `src-tauri/mobile/android-widget/`，**没接进构建**（gen/android 由 CI 生成、本机没 SDK 验证不了；接入步骤在 WIDGETS.md）。
   - 🟡 iOS：WidgetKit 脚手架（`src-tauri/mobile/ios-widget/MindoughWidget.swift`）+ 步骤（要 App Group，快照得写到共享容器）；待 Rei 在 Mac 上接。
4. ✅ 桌面 app 外链用系统浏览器打开（Tauri opener）：`lib/external.ts` 在 document 上捕获 click / auxclick，指向别的源的 http(s) 和 mailto / tel 链接都交给 `openUrl`（Markdown 渲染的链接、资料卡小标签、编辑器里的链接都不用各自处理）；Web 端照常新标签页；权限沿用 `opener:default`（只放行 http / https / mailto / tel）。真机待验。
   - ✅ 别的 App 的链接（Rei 2026-11-03「codex://threads/… 这种 deeplink 点了没反应」）：以前只认 http(s) / mailto / tel，codex:// obsidian:// vscode:// things:/// 这些点了什么都不做。现在协议统一在 `lib/link-scheme.ts` 判断：任何协议都放行，只挡 javascript: vbscript: data: file: blob: filesystem: about: view-source: chrome: chrome-extension: resource: jar: tauri: asset: ipc:。编辑器读入时裸写的 `scheme://…` 变成链接（`app-links.ts`，写回 `<scheme://…>`，和裸 https 网址一样），手打 `<…>`、裸写加空格也变；链接框收这些地址；只读显示（marked）也认裸写的，DOMPurify 的地址规则跟着放宽。打开：App 里交给 opener（capabilities 加了 `opener:allow-open-url`，允许 `*:*`、拒绝上面那些协议）；Web 端 http(s) 照旧新标签页，别的协议建个不带 target 的 `<a>` 点一下，浏览器弹「打开 xxx？」，不留空白标签页。测试 `lib/link-scheme.test.ts`、`lib/external.test.ts`、`components/editor/app-links.test.ts`、`link-pop.test.tsx`。Mac 客户端要新 alpha 才生效（前端打包在 App 里，权限也是编译进去的）。
5. 🟡 各平台安装包：版本 0.1.0（2026-11-03 起按标签填，alpha 序号进 CFBundleVersion / msi 第四段 / versionCode，见「版本号分得出第几个 alpha」）、macOS ad-hoc 签名、notification npm 与 crate 对齐；已推标签 v0.1.0-alpha.1 触发 build.yml（macOS / Windows / Linux / Android；alpha.17 及以前是 debug 包，之后是固定签名的 release 包并发到 F-Droid 源），结果由 Rei 在 Actions 查看；iOS 用免费 Apple ID + Xcode 直装（docs/IOS.md）。打包规则（Rei 2026-10-17）：alpha 标签也建 Release（预发布草稿），APK 一并挂上。正式版标签（v0.1.0 起，2026-11-13）挂完 APK 后自动发布、标成最新；Android versionCode 是 x.y.z 编码加 999（0.1.0 → 100999），比所有 alpha 大。
6. ✅ 界面收尾：
   - ✅ 27 个打卡分类改「常用 6 个 + 更多」：常用 = 重复任务用得最多的（件数一样按最近），不够用 健康 / 运动 / 学习 / 读书 / 饮食 / 作息 补齐（core `pickFrequentCategories`、`Store.frequentCheckInCategories`）；当前选中的总在第一屏；「更多 · 21」展开搜索框和其余分类；分类改成随宽度换行的小胶囊。
   - ✅ 手机端细节：弹层底部轻提示（「改动会同步到用到它的 N 件任务」）放不下时自己占一行，不再把「保存」挤到下一行；更多链接每条一张小卡（上面名字 + 上移 / 下移 / 去掉，下面整行网址）；IMDb / 豆瓣预览链接太长时省略号。
   - ✅ 暗色模式检查（三种皮肤，我的一天 / 打卡 / 详情 / 编辑资料 / 资料库），Material 补截图（work/screens/m3-*）。
   - ✅ 关系图里相关任务并排放：相关的几件合成一个「并排组」交给 elk 排（`lib/graph-layout.ts`），同一层里挨着，侧边点线相连；两组之间有前后关系路径时不合（会绕圈），照旧只画线。几块互不相连的图手机上往下叠。
   - ✅ SGD / TRY 等币种显示本地符号：Intl 只给代码时换成表里的符号（S$189、₺1,299.50、₱500、RM49、₽99）。
   - ✅ 侧边栏分区（Rei 2026-10-16：「侧边栏分一下section，太乱了」）：「今天」我的一天 · 打卡 · 可做 /「计划」列表 · 组 · ~~关系图~~（2026-10-23 删掉）/「资料」资料库 · 人物；设置固定在底部（新建按钮 Rei 2026-10-17 改成右下角浮动按钮）。小节标题按平台：macOS 11pt 粗体灰字、悬停出折叠箭头；WinUI NavigationViewItemHeader 14px 粗体；Material 抽屉 Title small + 分隔线、桌面紧凑一档。点小节标题可折叠（记在本机，当前页所在的小节不折）。手机标签栏按同样顺序：我的一天、打卡、列表、关系图、更多；「更多」页同样分组（iOS 分组列表 / WinUI / Material 各自的小节标题）。
   - ✅ 打卡分类的管理从设置挪出来（Rei 2026-10-16）：打卡页筛选条末尾「编辑」、新建面板分类选择器底部「管理分类…」打开同一个弹层（`components/CategoryManager.tsx`）：改名、隐藏 / 显示、上移 / 下移（`Store.moveCheckInCategory`，只改 sort）、添加；id 不变；设置里不再有这一节。
   - ✅ 详情「关系」变紧凑（Rei 2026-10-16：「关联占用那么大空间……如果这类关系中没有内容，则不显示……也不要显示添加、新建下一步…无用的按钮」）：顶栏（太阳旁）一个「添加关系」按钮，菜单三项 先做完这些… / 做完后解锁… / 相关任务…；选了打开同一个挑任务的弹层（搜索已有任务，最后一行「新建“xxx”」直接新建并连好，回车也行——合并了以前的「添加」和「新建下一步」）；分组只在有内容时出现，三组都空时整个「关系」不显示；行照旧：点开、× 去掉、行尾状态。··· 菜单里的「新建下一步」去掉（完成提示里的「然后呢？」保留）。新建面板的「相关任务」本来就是一颗胶囊，不改。
   - ✅ 「关闭」挪进 ··· 菜单（Rei 2026-10-17：「任务窗口底部的close按钮，移动到ellipsis下拉菜单中去」）：Rei 说的 close 是详情底部左边那个把任务状态改成「关闭」的安静按钮（不是右上角关窗口的 ×，× 不动）。菜单顺序和分组在 `lib/task-menu.ts` 的 `detailMenu`（纯逻辑，测试 `task-menu.test.ts`）：加入 / 移出我的一天 ｜ 直接标为完成（计时 / 计数 / 倒数日，只做一次的）· 关闭（重复任务「不再打卡」）｜ 删除…（红字）；任务结束了（完成或关闭），状态那组换成「重新打开」（重复任务「恢复打卡」）。`OverflowMenu` 的 `MenuAction` 加了 `separator`（这一项前画 React Aria `Separator`，样式 `.menu-sep`，三皮肤共用 `--border`）。底部：没结束的只剩右边主操作（完成 / 开始计时·暂停·结束 / +1 / 打卡），没有主操作时整条底栏不渲染；结束了的底部照旧「这件事已关闭…」+「重新打开」（主操作就是它，菜单里也有一份）。原来没有快捷键，没加。截图 work/shots-closemenu/（脚本 work/shots-tool/closemenu.mjs）。
   - ✅ 待安排（Rei 2026-10-16：「加一个待安排」）：没结束（待办 / 进行中）、只做一次、没有日期（倒数日的目标日也算日期）、不在今天我的一天里的任务；组里的也算（行上带组名）。行上：加入我的一天（太阳）、安排日期（日期面板，选了就进列表）、拖动排序（`Store.reorderBacklog`：这几件在原来那些 sort 值里换位置）；手动顺序在前、再按创建时间。导航「今天」小节里在我的一天下面（带件数）；手机标签栏 我的一天 · 待安排 · 打卡 · 列表 · 更多（关系图、可做进「更多」）。core `backlog.ts`（`isBacklogTask`、`backlogTasks`、`shouldJoinMyDay`）+ 测试。
     - **改了 M0 决定 8**（Rei 2026-10-16）：新建的任务不再因为「没日期、没组」就自动进我的一天；只有从我的一天页新建的（侧边栏 / N 键在我的一天页上、或我的一天的输入条）才放进今天，别处新建的默认进待安排。我的一天里没做完的：照旧有「昨天没做完 → 带回今天」，不带回的自然落回待安排。
   - ✅ 中英文（Rei 2026-10-16：「添加中英文支持」）：gettext 式——中文原文就是 key（`tr('还在等 {n} 件事', { n })`），英文值可以是函数（复数、语序）；`trx` 整句带元素（「还有 **12** 天」→ “**12** days to go”），`trc` 带语境（导航「打卡」= Check-ins、按钮 = Check In）。core `i18n.ts`（`tr` / `trc` / `dataLabel` / `setLocale` / `intlLocale`）+ `i18n-en.ts`（core 说法、演示数据）+ `i18n-data-en.ts`（内置类型 / 字段 / 选项 / 单位 / 模板 / 27 个打卡分类 / 网站名，显示时翻译，存的仍是中文，用户改过的照原样）；界面 `apps/client/src/i18n/en.ts`。日期星期月份走 Intl（`formatDate`、`weekdayLabel`、`monthShort`），币种名 `currencyName`（Intl.DisplayNames），金额 Intl 跟语言。设置 → 外观 → 语言（跟随系统 / 中文 / English）存进同步的 pref `locale`，本机另存一份启动即用；换语言整棵界面重新挂载（`lib/locale.tsx`，React Aria 的 I18nProvider 跟着换）；`?lang=en` 截图用。守门测试 `i18n/i18n.test.ts`（TypeScript AST 扫描）：组件与 core 没有漏翻的中文（数据 / 解析文件、console、`// i18n-ignore` 行除外）、每个 key 有英文、每个内置名字有英文。英文写法见 COPY.md「English」。截图 work/screens/m3-*-en.png。
     - 演示数据按生成时的语言写（英文界面第一次打开就是英文演示数据）；已有的中文演示数据不会变成英文（是用户数据）。

   - ✅ 外壳调整（Rei 2026-10-17，分支 macos-titlebar）：
     - macOS 无标题栏（「macOS的边栏框要贯通，titlebar不展示」）：`src-tauri/tauri.macos.conf.json` 只在 macOS 合并，主窗口 `titleBarStyle: Overlay` + `hiddenTitle` + `trafficLightPosition { x: 16, y: 17 }`；前端在 Tauri + macOS 时给 html 加 `platform-macos-overlay`（`skin/platform.ts` 的 `usesMacOverlayTitlebar`），侧边栏和内容区顶部各一条 38px（`--titlebar-h`）的 `data-tauri-drag-region` 拖动条（双击放大走 Tauri 自带的 drag 脚本，权限加 `core:window:allow-start-dragging`），内容区改由 `.main-scroll` 滚动（平时 `display: contents`，等于没有）。y 按「(条高 − 按钮高) / 2 + 按钮在容器里的 origin.y」估：Sequoia 上 origin.y≈5、按钮高≈14 → 17；Tahoe 上 origin.y≈7，红绿灯会高约 2pt，要真机再调。Windows / Linux / 网页不变；全屏时红绿灯隐藏，拖动条仍留空。
     - 侧边栏不放软件名和图标（「侧边栏不要添加软件title」），三种皮肤都去掉。
     - 新建任务改成右下角浮动按钮（「新建任务移动到右下角浮动」）：桌面和手机三种皮肤都是 `.fab`——Material 3 FAB（56dp、16dp 圆角、primary container）、Apple 强调色正圆 52px、WinUI 强调色 8px 圆角 48px；手机在标签栏上方并让开安全区；侧边栏底部和手机顶栏的新建按钮去掉，N 键不变；关系图的缩放按钮挪到左下，免得被挡。
     - 去掉全局右键菜单（「去掉全局右键菜单」）：`lib/contextmenu.ts` 在 window 上拦 `contextmenu`，输入框 / 多行文本 / contenteditable（Milkdown）/ `[data-native-menu]` 例外；Tauri 和网页都生效。
     - 页面不能左右移动（「不允许页面左右移动」）：html、body `overflow-x: hidden` + `overscroll-behavior-x: none`，#root / .app 不超宽；表格、代码块、公式、标签条、打卡分类条在自己的容器里横向滚。没在根上加 `touch-action: pan-y`（祖先上的 touch-action 会连带禁掉这些容器里的横向滑动）。

### M4 更聪明
- ✅ 自定义类型编辑器（2026-10-16，分支 m4-types）：设置 →「类型」一节和资料库页标签条末尾「编辑」打开同一个弹层（`components/TypeManager.tsx`，样式 `styles/types.css`）。
  - 第一屏类型列表：拖动排序（也能用键盘拖）、归档、「新建类型」、点进去编辑；最底下一行不显眼的「已归档 N 个」，点开可「取消归档」；不列「普通」（没有字段和版式）和「人物」（已从可选类型删掉，人物库不动）。
  - 一个类型：名字（失焦保存；内置名字没改动不写回）、图标（lucide 网格 56 个 + 自己填一个 emoji；`lib/icons.ts` 的 `typeIcon` 认 emoji）、颜色（14 个色板 + 自己调）、资料库版式（竖版海报 2:3 / 方形 / 横幅 16:9 / 圆形——`TypeLayout` 加了 `round`，卡片、行缩略图、资料库都按它出圆图）、默认怎么算完成、新建时的正文、归档（不能删）。
  - 字段：增（名字 + 种类：文字 / 数字 / 进度 / 日期 / 单选 / 多选 / 链接 / 更多链接 / 站点编号 / 图片 / 清单 / 金额 / 看到第几集）、行内改名、拖动排序（设置弹层里也有上移 / 下移）、隐藏、删除；设置弹层里改种类、资料字段 / 任务字段、单选多选的选项（选项改名连同资料和任务里存着的旧选项一起改：`Store.renameFieldOption`）、单位、站点、提示文字。主字段和图片字段固定是资料字段，不能隐藏、删除、改种类。
  - 关键决定：字段 key 随机生成（`f` + 8 位）、永不随改名变；删字段只在定义里留墓碑 `removed: true`（值留在 JSON 里不显示），加回同名同种类的字段就翻回同一个 key、旧值又出现——墓碑也让 `withNewBuiltinFields` 不会把用户删掉的内置字段补回来；影视 r2 去掉的「平台」记在 `LEGACY_BUILTIN_FIELDS`，加回「平台」（文字）用回旧 key `platform`。隐藏字段 `hidden: true`：`itemFieldsOf` / `taskFieldsOf` / `shownFields` / `linkChips` 都不含它，改类型时要留的值用 `allTaskFieldsOf`（含隐藏、删掉的）。字段已经有值时不让改种类和归属（`Store.fieldHasData`），免得旧值对不上。
  - 类型顺序存在同步偏好 `type_order`（id 列表，`orderTypes`；没写进去的按 sort 接后面），不改类型行——否则排一下顺序内置类型就变成「改过」，以后内置升级不再覆盖它。界面上取类型都用 `store.pickableTypes()`（新建 / 改类型 / 组默认类型）/ `store.orderedTypes()`（资料库标签条）/ `store.editableTypes()`（编辑器）/ `store.archivedTypes()`（编辑器底部已归档），前三个都不含归档的。改名字、图标、字段、归档这些会写类型行：内置类型的 updated_at 变成真实 HLC，按 `ensureBuiltinTypes` 的老规矩不再整体替换（只补新字段）。
  - ✅ 类型只能改和归档、不能删（Rei 2026-10-17：「类型创建后只能修改和归档，不支持删除，归档的类型不再可见，但旧的引用它的任务不破坏。」）。取代原来的「隐藏」+「没人用的自定义类型能删」。
    - 存储沿用 `task_type.hidden` 列（不加列、不加迁移），语义改成归档；旧数据里 `hidden = true`（以前的「隐藏」）读出来就是归档。导出的 `_meta/types.json` 写 `archived`，导入兼容旧文件的 `hidden`。`isArchivedType`（library.ts）、`Store.archiveType` / `unarchiveType` / `archivedTypes` / `effectiveDefaultTypeId`；`deleteType` / `canDeleteType` 删掉了（2026-11-10 按新规则加回来，只删空的自定义资料库，见下），`updateType` 不再改归档。内置、自定义一样；「普通」「人物」不能归档。
    - 归档的不出现在：新建 / 改类型 / 组默认类型的选择器、资料库标签条、类型编辑器主列表、深链 `new?type=`（退回普通）；资料详情页不再给「用它新建任务」。⌘K 照常搜得到归档类型的资料（见下方纠正）。
    - ✅ Rei 2026-10-17 纠正：「组的类型被归档后不退回，搜索里出它的资料。归档只是让它不能被后续任务使用呀」。所以归档只管选择器（不让后续任务选到它），已经用上它的地方不变：组的默认类型照样生效、⌘K 照常搜到它的资料。
    - 归档类型的库按 id 打开（`#/library/<id>`，如从它的资料页点「‹ 某某库」回来）照常显示这个库，不再落到第一个库；标签条里仍没有它，工具栏条数后面轻标「已归档」。选这个而不是「回来源页」：返回链接本来就是 href，不用记来源，深链 / 刷新也对。
    - 旧任务不受影响：任务和资料照常显示这个类型的图标、名字、字段、资料行、完成方式，能改字段值；详情「类型」一行照常显示当前值，只是选择器里没有它；从任务详情点资料行仍能进资料页。
    - 组的默认类型是归档的：照样生效（Rei 2026-10-17 纠正，取代上一版「不生效、退回普通」）——在组里新建任务仍用它，组页副标题照常显示；`effectiveDefaultTypeId` 只在类型行不在了（旧墓碑没被找回）时退回普通。新建任务面板的类型选择器里不列它，但类型小标签照常显示它是当前值。组目前只有新建时选默认类型（`GroupDialog`，选择器不列归档的），没有改已有组默认类型的界面，所以「已选的归档类型显示为当前值」暂时只体现在组页副标题和新建面板。
    - 以前版本删掉的类型（墓碑）：被任务 / 资料引用的，打开时 `reviveReferencedTypes` 照旧找回来，找回来就是归档状态（两台各做一遍内容相同，LWW 后一致）；没人引用的墓碑留着不动。还没升级的旧客户端同步过来的删除也走这条。
  - core：`typedef.ts`（纯函数 `addField` / `updateField` / `removeField` / `reorderFields` / `moveField` / `orderTypes` / `isEditableType`、`FIELD_KIND_LABEL`、`LIBRARY_LAYOUTS`），Store 的 `createType` / `updateType` / `setTypeFields` / `addTypeField` / `renameFieldOption` / `reorderTypes` / `moveType` / `typeUsage` / `archiveType` / `unarchiveType` / `archivedTypes`；测试 `packages/core/test/typedef.test.ts`（类型增改、字段排序隐藏、删字段数据保留与加回、内置改过不被覆盖、排序不改内置行、不能删、归档后不在 pickable / ordered / editable、引用归档类型的任务照常解析、⌘K 搜得到归档类型的资料、组默认类型归档后照样生效、旧 hidden 兼容与导出导入、选项改名、两端同步 LWW、复活的墓碑是归档状态）。没加表也没加列（字段定义本来就是 JSON），SQLite / Tauri 不用迁移。
  - 截图 `work/screens/m4-types-*.png`（三皮肤桌面 + 手机，含暗色、英文）；归档 `work/screens/m4-archive-*.png`。
  - 待 Rei 确认：
    - ~~有引用的自定义类型只能隐藏，不做「把任务改成普通再删」——要不要加？~~ 已定（Rei 2026-10-17）：类型不能删，只能改和归档，见上。
    - 编辑器列表底部「已归档 N 个」→ 取消归档（为了能恢复，代理加的）；归档不弹确认，提示里能撤销。
    - ~~⌘K 搜索不出归档类型的资料~~ 已改（Rei 2026-10-17）：照常能搜到。资料详情页对归档类型仍不给「用它新建任务」（归档就是不让后续任务用它）。
    - 字段有值后锁定种类和归属（要换就新加一个字段），而不是自动迁移旧值。
    - 新字段种类里不放「人物」（任务本身就能关联人物）。
    - 编辑器里不出现「普通」：它的名字 / 图标 / 默认完成方式暂时不能改。
    - 归档 / 改名等会让内置类型变成「改过」，以后内置定义大改时只补新字段、不整体替换。
- 按名字自动补全资料（影视 TMDB / 豆瓣、游戏 Steam、书 Open Library；有 IMDb / 豆瓣编号时按编号取），展示时附来源。
- ✅ 资料合并（两条其实是同一部片）（2026-10-16，分支 m4-merge）
  - core `merge.ts`（纯逻辑：`planItemMerge` / `planPersonMerge` 算合并后的值与冲突、`mergeNotes`、`duplicateGroups`、`resolveMerged`、`mergeCycleSurvivors`）+ `Store.mergeLibraryItems(targetId, sourceIds, choices?)` / `mergePeople` / `undoMerge` / `settleMerges` / `duplicateGroups` / `dismissDuplicateGroup`；测试 `packages/core/test/merge.test.ts`。
  - 规则：同类型才能合并（不同类、只选一条、来源不在了抛 `MergeError`，不写入）。默认目标的非空值优先、空的按来源顺序补；`choices`（字段 key → 用哪条的 id）定冲突字段；主字段（名字）、图片也可选；「更多链接」不算冲突，按网址去重合并；类型里已经没有的旧字段同样目标优先补空、不丢。备注拼接：已包含的那段不重复。
  - 数据：`library_item.merged_into`、`person.merged_into`（SQLite 迁移 v5；localStorage / 旧行读入时补 null，写入也总带上）。来源打墓碑 + `merged_into = 目标`，用到来源的任务一次写入里改指目标。读的时候都顺着 `merged_into` 找（`store.itemOf`、`resolveItemId`、`resolvePersonId`、`tasksOfItem`、`libraryEntries` 的用到次数、`peopleOf`、详情的资料行），所以别的设备离线新建、还指着旧 id 的任务同步后立刻显示成目标；`settleMerges()` 在打开时和每次 `applyRemote` 后把这些任务（和人物关联）改写到目标 id（没事做不写）。链式合并（A→B→C）解析到最后一条。
  - 多设备：同时合并同一对 → 两边写的内容一样，LWW 收敛成一条；反方向同时合并（A 并进 B、B 并进 A）可能两条都成墓碑互相指着 → `settleMerges` 把每个环里 id 最小的那条翻回来（各端算出来一样），任务都解析到它。迁移出来的确定 id（`migratedItemId`）如果已经被并掉，旧任务迁移时直接挂到合并后的那条，不复活墓碑。
  - 撤销：返回 `MergeUndo`（合并前的目标 / 来源 / 改指过的任务或人物关联）；`undoMerge` 让目标回到合并前、来源翻回来、改指过且现在还指着目标的任务指回去（是一次新写入，照常同步）。
  - 人物：`task_person` 改指留下的人，同一件任务已经关联了留下的人就把重复那条打墓碑；旧人物类型任务 `type_data` 里写着的人也改过来。
  - 可能重复：同类型里规范化名字相同（`normalizeName`），或任一站点编号（IMDb / 豆瓣，`siteIdOf`）相同，传递成组；每组按用到的任务多 → 建得早排，第一条建议留下。「不是同一个」把组签名（排序后的 id 用 | 连）记进同步的 pref `library.not_duplicates`；组里多了新的一条签名就变了，会重新提示。人物库按名字。
  - 界面：`components/library/MergeSheet.tsx`（`MergeSheet` 并排对比：上面一排卡片选「留下」，下面只列有冲突的字段，每格是那条的值，点一格用它；`MergeIntoSheet`「合并到…」先挑同库另一条；`DuplicatesSheet` 一组一组：不是同一个 / 跳过 / 合并）。资料详情、人物详情的 ··· 里「合并到…」；资料库页工具栏「选择」进入多选（⌘ / Ctrl 点、手机长按也能进），「已选 N 条」+「合并」「完成」；「可能重复 N 组」小链接。合并后提示「已合并到「X」」+「撤销」。`LibraryPicker` 加 `allowCreate`。样式 `styles/library.css` 末尾「资料合并」、皮肤差异 `skin/skins.css`。截图 `work/screens/m4-merge-*.png`。
  - 待 Rei 确认：
    - 「更多链接」合并时两边合起来（不让选）；其余冲突字段让选。
    - 反方向同时合并成环时留 id 小的那条（合并时目标上合出来的字段可能丢一部分，任务不丢）；两边各自留下时（各自的目标都赢了）两条都在、任务对调，下次「可能重复」会再提示。
    - 改写离线任务（`settleMerges`）是整行 LWW：极少数情况下，另一台设备同时在改那件任务的正文，可能被这次改写盖掉（读取本来就会解析，不改写也显示正确）。要更稳可以只在打开时改写。
    - 「不是同一个」记在同步的 pref 里（跟着账户走）。
    - 合并入口只放在资料 / 人物详情的 ···，没放进「编辑资料」弹层（那里没有 ···）。
    - 「可能重复」只认同名和站点编号，不做模糊名字（「沙丘 2」≠「Dune: Part Two」，除非编号相同）。
- ✅ 导入导出 Markdown 文件夹（2026-10-16，分支 m4-io；格式全文见 [docs/EXPORT.md](EXPORT.md)）
  - 格式：一件任务一个 .md（YAML front matter：id、状态、日期、组、类型 / 资料、任务字段、完成方式与重复、提醒、人物、`after` 先做完这些、`related` 相关任务都用 id 引用，行尾 `# 名字` 注释给人看；打卡次数摘要在 front matter，完整事件在 `_meta/checkins.json`），正文就是 body_md；组 = 一层文件夹 + `_group.md`；资料 `library/<库名>/<名字>.md`、人物 `people/<名字>.md`；类型、打卡分类、组分类、偏好、图片清单在 `_meta/*.json`；图片进 `assets/`，正文引用改成相对路径。文件名由正文首行生成（安全化、同文件夹不分大小写去重），id 才是身份。
  - 代码：core `archive/`（`text.ts` front matter / 文件名 / 路径 / base64、`export.ts`、`import.ts`、`zip.ts`），单独入口 `@mindough/core/archive`（yaml 2.9 + fflate 0.8，客户端按需加载，独立 chunk ≈ 46 KB gzip）。界面：设置 → 数据「导出」「导入」两行（`pages/Settings.tsx` 的 `ArchiveRows`）、导入面板 `components/ArchiveImport.tsx`（`styles/archive.css`）、浏览器那头 `lib/archive.ts`（取回网上图片、打 zip 下载、读 zip / 文件夹、登录时先把图片传 R2）。
  - 导出：zip 下载 `Mindough YYYY-MM-DD.zip`（解开是同名文件夹）。asset 里的 data: 图直接写文件；网上的图片（R2、海报外链）先试着取回（8 秒超时、并发 4，跨域取不到的照原链接写，提示里说几张没取到）。
  - 导入：选 zip 或文件夹 → 预览「新建 / 更新 / 跳过 / 出错」+「其中 N 件任务 · N 个组…」+ 出错列表（没导入的 / 没接上的）→ 确认后 `applyImport` 一批写入（一次进 outbox）→ 提示里「撤销」整批撤销（`undoImport`：新建的打墓碑、覆盖的写回原样）。自己的格式按 id：没有 → 建，内容一样 → 跳过，内容不同 → 默认跳过、可选「已有的用文件覆盖」（连前后关系 / 相关 / 人物一起按文件来；我的一天、打卡只补不删）。普通 markdown：每个 .md 一件任务，最上一层文件夹 → 组（同名已有组直接用），文件名补成标题，`- [ ]` 清单不拆，认 status / done / due 几个常见属性，`![[x.png]]` 换成图片。前后关系逐条过环检测，会成环的不连、记进「没接上」。
  - 测试 `packages/core/test/archive.test.ts`：front matter 往返与畸形输入、文件名安全化与去重、相对路径、base64；导出结构；**导出 → zip → 解 zip → 导入空库，全部表等价**；再导一次全跳过、改过的默认跳过 / 选覆盖才改；整批撤销回到导入前且进 outbox；普通 markdown 文件夹（组、标题、清单、Obsidian 图片、再导一次跳过）；畸形文件（坏 YAML、没收尾、列表当属性、坏 JSON、找不到的引用、乱写的完成方式）只进出错列表、不崩。截图 work/screens/m4-io-*.png（三皮肤 × 桌面 / 手机，Apple 桌面英文）。
  - **待 Rei 确认**（我先这样定的）：
    1. Tauri 端也是 zip 下载，没有「选目录直接写文件夹」：dialog / fs 插件还没装，沙箱里没有 Rust 工具链没法 cargo check，就没动 Cargo.toml / capabilities。要的话装 `tauri-plugin-dialog` + `tauri-plugin-fs`，导出时 `save()` 选目录逐个写文件、导入时 `open({ directory: true })` 读。另外桌面 WebView 里 `<a download>` 能不能存到「下载」文件夹要在真机上看一眼（不行的话就得上 dialog 插件）。
    2. 选进来的那一层文件夹本身不算组（zip 根文件夹、选文件夹时那个文件夹）；普通 markdown 里更深的子文件夹并进最上一层的组。
    3. 普通 markdown 的任务 id 由「根文件夹名 + 路径」算出：同一个文件夹再导一次是跳过 / 可覆盖，不会重复；但把文件改名或挪位置再导，会当成新的一件。
    4. Obsidian 的 `tags` 和其他不认识的属性不导入（Mindough 没有标签）；正文里的 `#标签` 原样留着。
    5. 导入的图片：登录时先传到 R2，没登录用 data: 地址（和离线插图一样，行会大一些）。
    6. 导入时类型、打卡分类也按 id 认：内置类型内容一样就跳过，不同（对方改过内置类型）默认跳过，选覆盖才会换成文件里的（之后这个内置类型就算「用户改过」，不再随内置版本升级）。
    7. 文件名、库文件夹名按导出时的界面语言（英文界面导出是 `library/Movies & TV/`）；不影响再导入。
   - ✅ 图片统一宽高（Rei 2026-10-16：「上传前要统一宽高」）：apps/client/src/lib/image.ts。按版式：海报 600×900、方形 / 圆形（含头像）600×600、横幅 1280×720，居中裁切，WebP 0.85（编不了 WebP 退 PNG / JPEG）；小图也放大到统一尺寸；普通图片字段只限长边 1600。在线封面经 `POST /api/lookup/image {url, raw:true}` 代拉原图 → 本机裁 → `/api/assets`，代拉失败退回 Worker 直接存原图。Markdown 文件夹导入的图保持原样（是自己导出的）；粘贴的图片链接仍只存链接；已存的旧图不回头重裁。
   - ✅ 按名字 / 编号在线找资料（分支 m4-lookup）：
     - **Worker**（`apps/server/src/lookup/`，都要登录：会话或同步凭据，同 /api/assets）：`GET /api/lookup/search?kind=movie|book|game&q=&lang=zh|en[&media=movie|tv][&alt=]`、`GET /api/lookup/item?source=tmdb|douban|doubanbook|openlibrary|steam|imdb&id=`、`POST /api/lookup/image {url}`（把选中的封面拉进 R2 `mindough-assets`，key 同 /api/assets，资料里存 asset 引用，不热链；只拉 image.tmdb.org、covers.openlibrary.org、*.steamstatic.com、img*.doubanio.com，豆瓣带 Referer）。Cache API：每个来源的搜索 1 天、详情 7 天，只缓存成功的；对外请求 8 秒超时（504 网关超时）、连不上 502 错误网关、限流 429 请求太多；错误都带中文说明。一个来源出错不影响别的，所有来源都失败才返回第一个的状态码。
     - **来源适配器**各一个文件，统一输出 `{source, sourceId, name, year?, image?, thumb?, subtitle?, fields, url}`，fields 的 key 是内置类型的字段 key：
       - `tmdb.ts`：search/multi（不知道电影还是剧集时）或 search/movie、search/tv（知道时，排序也准）；movie / tv 详情 + `append_to_response=external_ids` 拿 IMDb；`find/{imdb}`。密钥 Worker secret `TMDB_API_KEY`：v4 读访问令牌（eyJ… 开头）走 Bearer，其余当 v3 key 走 `api_key`；没配置或密钥不对 → 503 服务不可用（`unconfigured`），界面写「TMDB 还没配置」。中文界面 zh-CN、英文 en-US。
       - `douban.ts`（尽力而为）：建议接口 `movie.douban.com/j/subject_suggest`；详情先用手机版 JSON `m.douban.com/rexxar/api/v2/movie/<id>`（剧集 301 到 /tv/），不行再解析 subject 页面（会跳到验证页）。拿不到算 `blocked`，静静降级。2026-10-16 沙箱实测建议接口和手机版 JSON 都通。豆瓣的结果只在中文界面列出。
       - `openlibrary.ts`：search.json（少于 3 个字改按 `title:` 搜，否则 422）；详情 `q=key:/works/<id>`；作者只取 author_name 第一位（后面常是译者、插画师）。按名字得到的是作品（OL…W），只有作品级字段：作者、首版年份、页数。按 ISBN（`/api/lookup/item?source=isbn&id=`）：`/isbn/<isbn>.json`（302 到那一版 `/books/OL…M.json`），取书名、出版社 publishers[0]、出版年份（publish_date 里的年）、页数 number_of_pages、ISBN；作者先看这一版的 authors，没有（常见）就取作品的第一位，再查 `/authors/<id>.json` 的名字；ISBN 校验位不对 400。不给封面（见下）。
       - `steam.ts`：storesearch + appdetails（中文 l=schinese&cc=CN，英文 l=english&cc=US）；平台 windows → PC（Steam）、mac → macOS、linux → Linux / Steam Deck；官网进「更多链接」；图标用 header 图（卡片里方形裁）。
     - **按 Rei 20 部真实数据试跑改的**（work/m4/tmdb_try.json：按 IMDb find 18/18 对，按中文名 search/multi 11/20 对）：搜之前去掉季 / 集标记（第三季、Season 2、S03、S02E03，复用 episode.ts，见 core `lookupSearchText`），带季标记的按剧集搜，季数由新建面板照旧填进「看到哪」；有 IMDb / 豆瓣编号先按编号取；影视资料「电影/剧集」已填时只搜那一种（`media`）；TMDB 按中文名没搜到时，用 `alt` 给的名字、再用豆瓣同名条目的原名（带豆瓣年份收窄）补搜（「海绵宝宝大电影·寻找方裤」→ The SpongeBob Movie: Search for SquarePants → TMDB「海绵宝宝：深海大冒险」）；按名字永远给候选让人选，不自动采用第一条。
     - **core** `lookup.ts`：哪些类型能在线找（按内置 id：影视 / 书籍 / 游戏）、结果形状（与 Worker 的 `lookup/types.ts` 一致，两处一起改）、`lookupSearchText` / `lookupQueryOf`（按什么找）、`findLookupTwin`（库里已有的同一条：同来源编号、同 IMDb / 豆瓣编号、或同名且年份不冲突）、`planAutofill` / `applyAutofill`（逐项计划）、`itemOfLookup`。资料来源存在 `library_item.fields._source`（「tmdb:movie/693134」），**不加列、不动 schema**；下划线开头的键不是类型字段，不显示、不进搜索。
     - **界面**：新建面板 / 详情「换一个」的选择框里，本地结果和「新建“xxx”」下面是「从 TMDB、豆瓣找」/「从 Open Library 找」/「从 Steam 找」（`components/library/Lookup.tsx` 的 `OnlineOptions`，防抖 350 毫秒、新输入取消旧请求、离线或没登录整块不出现，键盘上下和本地结果连着；粘贴 IMDb / 豆瓣链接按编号取；库里已有的同一条不重复列）。选中马上建资料（界面不等网络），后台补详情（IMDb 编号等）和封面，只补空缺（`lib/lookup.ts` 的 `createItemFromLookup`）；新建面板里选了又取消 / 换掉的、没有任务用到的资料，关掉面板时删掉。编辑资料底部「自动补全」：先按已填的 IMDb、再豆瓣编号取，都没有按名字给候选列表挑一条；然后逐项列出要填的值（勾选框 + 字段名 + 新值 +「现在：旧值」），空缺默认勾上，已有的默认不勾（勾上 = 覆盖），更多链接是合并；「填进去 N 项」才拉图、填进草稿，最后还是「保存」才落库。资料卡（详情大卡）和资料页名字下面「资料来自 TMDB」小字 + 链接。设置最下面「关于」：Mindough 图标与名字在前，TMDB 认可的 logo（blue_short，10px 高，比我们的标识不显眼，链到 https://www.themoviedb.org）+ 原文声明“This product uses the TMDB API but is not endorsed or certified by TMDB.”，中文界面再附译文。样式在 `styles/lookup.css`。
     - 测试：core `test/lookup.test.ts`；server `test/lookup.test.ts`（全部用 mock fetch：TMDB 两种密钥、没配置 503、超时 504、限流 429、豆瓣跳验证页降级、media 过滤、按原名补搜、拉图进 R2、缓存 TTL）；`e2e/real-lookup.test.ts`（`E2E_LOOKUP=1` 真实请求 Open Library、Steam、豆瓣、拉图进 R2，有 `TMDB_API_KEY` 时也试 TMDB）；client `lib/lookup.test.ts`。截图 work/screens/m4-lookup-*.png（脚本 work/shots-tool/m4lookup.mjs，mock 接口）。
     - **待 Rei 确认**（我先这样定的）：
       1. 来源存在 `fields._source`，不加 `library_item.source` 列（免得和别的分支的迁移撞号）；以后想要单独一列再迁移。
       2. 没加 Google Books：沙箱里没法验证无 key 接口（网关拦下来回 403 禁止访问），Cloudflare 出口 IP 也常被它限流；书只用 Open Library，中文书覆盖一般。
       3. 豆瓣结果只在中文界面列出；英文界面只拿它给原名补搜 TMDB。
       4. 选择框里在线结果放在「新建“xxx”」下面（位置稳定，结果晚到不会把「新建」挤走）；库里同名（年份不冲突）的条目视为同一条，在线列表里不再列，选中时用库里那条、只补空缺。
       5. 按 IMDb / 豆瓣编号取到的直接进逐项确认（编号是精确的），按名字一定先给候选。
       6. 「自动补全」和在线结果只在登录且在线时出现；没登录不提示（克制）。
       7. 游戏图标用 Steam header 图（横图，方形裁中间），Steam 没有方形图标接口。
     - ✅ **书的封面不对接任何平台，纯手填（Rei 2026-10-17 定）**：只去掉书的封面，Open Library 仍补书名、作者、年份、页数等。Worker 的 openlibrary 适配器不取 cover_i、不输出 image / thumb；`/api/lookup/image` 白名单去掉 covers.openlibrary.org（现在只拉 image.tmdb.org、*.steamstatic.com、img*.doubanio.com）。core 的来源表加 `covers`（Open Library 为 false）和 `lookupCover(r)`：自动补全不列图片那行、选中在线结果建资料不拉图、候选列表里的书都用占位图——就算旧 Worker / 缓存还带着封面地址也不用。书的封面只走现有的手动图片字段（上传 / 粘贴，照旧按海报 600×900 统一裁切）。已经拉进 R2 的旧封面不动。
     - ✅ **书按 ISBN 精确取那一版（Rei 2026-10-17 同意）**：书籍类型加三个资料字段 出版社（publisher，文字）、出版年份（year，数字）、ISBN（isbn，站点编号 `site: 'isbn'`，链到 openlibrary.org/isbn/…），插在作者和页数之间；内置版本升到 r3（`BUILTIN_TYPES_REVISION` 0003），没改过的内置书籍直接换新定义，改过的照 `withNewBuiltinFields` 只补这三个新字段、已有的不动。core `links.ts` 的 `isbnOf`：ISBN-10 / 13，容许连字符、空格、「ISBN」前缀，也认 openlibrary.org/isbn/ 链接，校验位不对的不认（免得把一串数字当 ISBN）。选择框里输入 / 粘贴 ISBN（只在书里认）就按 ISBN 取一条候选；编辑资料「自动补全」先认已填的 ISBN（名字栏里粘的 ISBN 也认），取到的直接进逐项确认（同 IMDb 编号）；按书名找到的是作品，逐项确认上面说明「只补作者、首版年份、页数；要出版社和 ISBN，先填 ISBN 再自动补全」。按 ISBN 取到的来源记成这一版（`openlibrary:OL25840916M`，链接到 /books/）；同一 ISBN 算库里的同一本。仍然不带封面。2026-10-17 沙箱实测 978-7-5366-9293-0 → 三体 · 刘慈欣 · Chongqing Press · 2008 · 302 页。
     - ✅ **豆瓣读书（Rei 2026-11-09）**：书的来源加 `doubanbook`（编号和豆瓣电影不通用，所以单独一个来源；资料来源记成 `doubanbook:<id>`，界面叫「豆瓣读书」，9 种语言）。
       - `doubanbook.ts`：搜索用建议接口 `book.douban.com/j/subject_suggest`（书名、作者、年份、小封面）；详情先解析 `book.douban.com/subject/<id>/` 的 #info（作者、译者、出版社、副标题、原作名、出版年、页数、ISBN）和封面，页面被拦就用手机版 JSON `m.douban.com/rexxar/api/v2/book/<id>`（没有 ISBN）；按 ISBN 用 `book.douban.com/isbn/<isbn>/`（301 到 subject 页）。不用登录。跳去验证页、403、418 算 blocked，搜索里静静降级。
       - 书籍类型没有译者、原作名字段，这两项只放进候选下面那一行（「原作名 · 作者，译者 译 · 出版社」），不加新字段。
       - 顺序：中文界面 `['doubanbook', 'openlibrary']` 都列，豆瓣读书在前；英文界面名字里有汉字才问豆瓣读书（问了就列，书不需要像影视那样拿它补搜）。Open Library 的结果和豆瓣读书同 ISBN、或同名同作者的不再列（年份不比：一个是这一版，一个是首版）。按名字搜两边都很少带 ISBN，实际主要靠同名同作者。
       - 按 ISBN（`source=isbn`）：中文界面先豆瓣读书、取不到再 Open Library，英文界面反过来；两边都不行报前一个的错。缓存键带上语言。
       - 封面：**改了 10-17 的规定**——Rei 2026-11-09 同意豆瓣读书带封面，同影视海报一样经 `/api/lookup/image` 带 Referer 拉进 R2（img*.doubanio.com 本来就在白名单里，不带 Referer 返回 418 被拒）。core 来源表 `doubanbook.covers = true`；Open Library 仍然 `covers: false`。
       - 选择框里粘贴 `book.douban.com/subject/<id>/` 或 `m.douban.com/book/subject/<id>/` 按编号取（core `lookupSearchText`）。
       - 2026-11-09 沙箱实测：三体、活着、置身事内、The Great Gatsby 都有结果，详情都带 ISBN；建议接口、subject 页、ISBN 跳转、手机版 JSON 都 200。

### 日记 J1 ✅（2026-10-17，方案 docs/JOURNAL.md）
- **core** `journal.ts`：`journalEntryId`（日期 → 固定 id，第四段 8002）、`journalToday`（「一天从几点开始」，pref `journal.day_start`，默认 5）、`canWriteJournal`（将来不能写）、12 个心情 `MOOD_IDS` / `moodLabel`、字数 `journalWordCount`（中文按字、英文按词）、同步保护 `isJournalConflict` / `mergeJournalConflict`（输家里赢家没有的段落收进 `<details data-journal="conflict">` 折叠块，已经有的不重复，两边各合一次也收敛）、月历 `monthGrid`。Store：`journalToday()`、`journalOf(date)`、`setJournal(date, {body_md, mood})`（将来抛 `FutureJournalError`；空的不建；base_at = 上一版是别的设备写的就记它）、`deleteJournal`；`applyRemote` 收到一篇没看到本机那版的日记 → 合好写成一次新的本机写入推上去。搜索 `SearchHit.kind = 'journal'`；提醒 `journalReminders`（每天 pref `journal.remind_time`，默认 21:00，写没写都响；`journal.remind` 默认开）；导出 `journal/YYYY/MM/YYYY-MM-DD.md`、导入按日期认。测试 `test/journal.test.ts`（两台设备离线同写一天两种先后都不丢字）。
- **界面**：`pages/Journal.tsx`（桌面月历 + 这个月的列表 + 那天的日记；手机「月历」切换；停手 1.2 秒、离开编辑器、换一天、关页面时存；正在写时同步来了另一版也收进折叠块）、`components/journal/`（`MoodIcon` 12 个手写 SVG + `styles/journal.css` 的点选动画，颜色令牌 `--mood-*` 三皮肤 × 明暗在 `skin/tokens.css`；`MoodPicker`；`JournalCalendar`；我的一天底部 `JournalCard`）。侧边栏「今天」小节最后「日记」，手机在「更多」；设置 → 日记；⌘K「写今天的日记」+ 搜日记；深链接 `mindough://journal/{today|日期}`、`view/journal`（Android 注册 journal host）、Web `#/journal/…`；提醒点了打开日记（sw.js `open-journal`、Tauri extra.journal）。截图 work/shots-journal/（脚本 work/shots-tool/journal.mjs）。
- **按推荐、Rei 未答**：同步保护（折叠块）、导出按年 / 月两层、隐私开关留 J3。
- **J2 / J3 待排**：那年今日、插入时间、`@` 引用、Obsidian 每日笔记导入、`journal/today?append=`；隐私三个开关、写日记热力图、Day One 导入。

### 附件 ✅（2026-10-17）
Rei 2026-10-17：「添加附件功能，用户可以拖拽或选择文件作为附件，附件是图片则小图显示点击可放大(有关闭、下载按钮)，其他文件格式上传后显示图标，点击下载」。
- **挂在哪**：任务详情、日记（每天那篇）。资料项暂不做（待问）。正文下面一块「附件」。
- **数据**：新表 `attachment`（SQLite 迁移 **v7**）：`owner_type`（task / journal）、`owner_id`（任务 id，或日记 `journalEntryId(date)`）、`file_name`、`mime`、`size`、`r2_key`、`thumb_key`、`width` / `height`（原图）、`created_at`，加 `id` / `updated_at` / `deleted`。按现有同步协议加表（云端只存整行 JSON，不动云端 schema），行级 LWW。给日记加附件时先 `Store.ensureJournal(date)` 建一行空日记（导出靠这一行认日期；只有附件的日子在月历和列表里也算写了，列表里写「N 个附件」）。删任务 / 删那天日记一起把附件打墓碑。Store：`attachmentsOf` / `addAttachment` / `setAttachmentFile` / `renameAttachment`（没写扩展名补回原来的）/ `removeAttachment` / `restoreAttachment`。纯逻辑 core `attachments.ts`（文件类型 10 种、大小显示、文件名安全化与去重、`MAX_ATTACHMENT_BYTES`）。测试 core `test/attachments.test.ts`、client `lib/attachments.test.ts`、`components/attachments/FileIcon.test.tsx`、server `test/files.test.ts`。
- **存储**：原文件原样传 R2 `mindough-assets`（不压缩不改尺寸），图片在本机另生成一张缩略图（长边 480，WebP，编不了退 JPEG）也传上去，网格用它。Worker `apps/server/src/files.ts`：`POST /api/files`（会话或同步凭据；≤ 50 MB，超过 413 内容太大；同内容只存一份）、`GET /api/files/<用户哈希>/f/<sha256>[?name=&dl=1]`（要登录，key 前缀不是自己的都回 404 未找到；安全的图片格式 inline，其余的或 dl=1 都按 attachment 下载，带原文件名；nosniff + CSP sandbox，HTML / SVG 附件里的脚本不跑；`cache-control: private`）。
- **上传**（client `lib/attachments.ts` + `lib/attachments-queue.ts`）：选进来 / 拖进来 → 先建行（r2_key 空）+ 文件和缩略图存进本机 IndexedDB 队列 `mindough-files` → 登录且在线时传（XMLHttpRequest，有进度；同时 2 个；先传缩略图再传原图）→ 填上 key、删本机那份。界面显示「正在上传 45%」+ 进度条，能取消（停掉上传、删行，不留撤销）；失败显示「上传失败」+ 重试（悬停看原因，带状态码中文说明）；离线「等联网后上传」、没登录「登录后上传」，联网 / 登录后自动接着传；关掉 app 再开，队列里的接着传。别的设备加的、还没传上来的显示「还在另一台设备上」。上传器只在主窗口跑（同同步）。
- **显示**（`components/attachments/`）：图片（浏览器能直接显示的，HEIC 等有缩略图才算）方形小图网格；点开灯箱 `Lightbox`：全屏深色底、先放大缩略图顶着、原图到了换上；顶栏文件名、「2 / 5」、下载、关闭；多张时左右箭头、← → 键、手机左右滑；Esc、点图片外面关闭；四周 `env(safe-area-inset-*)`。其他文件：按类型的图标 + 文件名 + 「PDF · 380 KB」，点一下下载。每个附件 ··· 菜单：下载、重命名…（选中主干，不写扩展名就保留原来的）、删除（提示里「撤销」）。
- **文件类型图标** `FileIcon`：自绘一组 SVG（折角的纸 + 中间一个线条图形 + 扩展名），10 种：图片、PDF、文档、表格、演示、压缩包、音频、视频、代码 / 文本、通用；颜色令牌 `--file-*`（三皮肤 × 明暗，`skin/tokens.css`）。
- **拖放**：拖文件到任务详情 / 日记那一块上，显示虚线高亮层「松手添加附件 · 每个文件不超过 50 MB」，可多个；捕获阶段接住，编辑器不会把文件插进正文、浏览器也不会打开文件。只认文件（拖文字照旧）。将来的日子不收。手机上「添加附件」打开系统选择器（iOS / Android 里含相册）。
- **下载**：Web 端直接让浏览器下 `/api/files/<key>?dl=1&name=原文件名`（同源带 cookie）；还在本机队列里的用 blob: 地址，名字一样。Tauri：取回内容交给新命令 `save_download`（`src-tauri/src/files.rs`，原始字节经 IPC，不用新插件）存进系统「下载」文件夹（没有就「文稿」），重名加「 (2)」，提示「已存到「下载」：x」+「在文件夹中显示」（opener 的 revealItemInDir）。原生端显示图片：带 Bearer 取回成 blob: 地址（内存缓存）。
- **导出 / 导入**：见 [EXPORT.md](EXPORT.md)「附件」：文件进 `attachments/`，记录 `_meta/attachments.json`，正文后面附一段链接（导入时去掉）；导入后带文件的排进上传队列。
- 截图 `work/shots-attachments/`（脚本 `work/shots-tool/attach.mjs`，假 API）。
- **待 Rei 确认**（我先这样定的）：
  1. 单个附件上限 50 MB（Worker 和客户端同一个数 `MAX_ATTACHMENT_BYTES` / `MAX_FILE_BYTES`）。Worker 一次读进内存算 SHA-256；要更大得改成分片（R2 multipart）。
  2. 资料项（影视 / 书…）要不要也能挂附件。
  3. 附件不占正文：不在 markdown 里插链接（导出时才附一段清单）；要不要支持把附件拖进正文某处当插图。
  4. ~~删掉的附件只打墓碑，R2 里的文件不删~~（2026-10-25 改了）：删掉以后没别的行用着这份文件，Worker 就删 R2 里的文件；另外每天清理一次没人用的。见下面「附件：清理没人用的云端文件」。
  5. 只有附件、没写字的日记那天算「写了」（月历上有点）。
  6. （2026-10-25 改为桌面弹系统保存框，见下面「只预览图片 + 本机缓存」，仍待确认）Tauri 下载直接存进「下载」文件夹，不弹保存对话框（不装 dialog 插件）；iOS / Android 上「下载」目录的行为要真机看（iOS 没有下载文件夹时退到「文稿」，Android 可能要存储权限），沙箱里没有 Rust 工具链，`files.rs` 没有 cargo check 过，交给 CI build.yml。
  7. 两台设备同时改同一个附件（一边改名、一边刚传完填 key）是整行 LWW，极少数情况下改名会被盖掉。
  8. 已经传到 R2 的文件，本机默认不留缓存：离线时打不开、下不了（显示缩略图要联网）。2026-10-25 起可以手动「缓存」，见下面「只预览图片 + 本机缓存」。
  9. 还没升级的旧客户端会跳过 attachment 表的行（同 journal_entry 当时的情况），升级后要等那些行再被改一次才会拉到。

#### 附件：只预览图片 + 本机缓存 ✅（2026-10-25）
Rei 2026-10-25：「任务详情页中，attachments 如果是图片，添加后是缩略图，点击可放大查看。其他类似的附件都不可预览。附件可以下载、删除、缓存、删除缓存。缓存的附件 24 小时后清除本地缓存。」
- **预览**：图片照旧小图网格 + 灯箱（灯箱只翻图片）；其他文件（PDF、视频、音频、文档…）都不预览，图标 + 文件名 + 大小，点一下下载（原来就没有内嵌预览，这次只是写明）。core `attachmentPressAction`（lightbox / download）。
- **操作**：··· 菜单 下载 / 缓存（或「删除缓存」）/ 重命名… / 删除（删除前加分隔线，仍是提示里撤销）。桌面悬停出现 ···、右键也打开同一个菜单；触屏点 ··· 或长按 500 ms（iOS 不发 contextmenu，自己计时；长按后那次点击吞掉，不会顺手打开灯箱 / 下载）。哪些能点由 core `attachmentActionState` 算（缓存着 / 在本机上传队列 / 联网）。
- **缓存**：「缓存」把原文件存到这台设备。Web 用 **Cache Storage**（缓存名 `mindough-attachments-v1`，假地址 `/__attachment-cache/<id>`；选它不选 OPFS：iOS Safari 等的 OPFS 写入接口支持不齐，Cache Storage 各家都稳；sw.js 不碰这个缓存，外壳清理只删 `mindough-shell-*`，所以 SHELL 版本没动）；Tauri 用 app 缓存目录 `attachments/<id>`（`files.rs` 的 `att_cache_put / get / delete / list / copy`，先写 .part 再改名）。缓存记录（附件 id、r2_key、大小、缓存时间）存 localStorage `mindough:att_cache`，只在本机、不同步；附件换了文件（r2_key 变了）就不算缓存着。缓存着的附件有个小硬盘标记（悬停看还剩几小时）。「删除缓存」只删本机副本。缩略图不算缓存的附件，照旧。client `lib/attachment-cache.ts`（`AttachmentCache`、`useCacheRecord`、`installAttachmentCache`），纯逻辑 core `attachment-cache.ts`。
- **24 小时清理**：从缓存那一刻起算（打开、下载都不续期；对已缓存的再点一次缓存不会出现，因为菜单那时是「删除缓存」）。启动时、回到前台（visibilitychange / focus）、运行中每小时各查一次；读的时候发现到期也当没缓存并删掉。附件被删了（墓碑）、没有记录的孤儿文件也一并清。
- **本地优先**：缓存着的附件，灯箱原图、下载、导出都先用本机副本；离线又没缓存的：下载按钮灰掉（悬停说明），点文件行提示「离线中，没缓存的附件下载不了，联网后再试」；灯箱里下载灰掉。
- **Tauri 下载**：桌面改为弹系统保存框（新加 `tauri-plugin-dialog`，权限 `dialog:allow-save`，默认原文件名），缓存着的从缓存目录拷过去（`att_cache_copy`），否则取回后写过去（`save_to_path`）；取消保存框不提示。手机（iOS / Android）仍存进「下载」文件夹（`save_download`）。
- **日记附件**用同一个组件，同样生效（Rei 只提了任务详情）。
- 测试：core `test/attachment-cache.test.ts`（到期、假时钟清理、图片 / 非图片、操作状态），client `lib/attachment-cache.test.ts`（缓存记录、假时钟 24 小时清理、install 定时 / 前台、离线下载、菜单与英文 Title Case）。截图 `work/shots-attach/`。
- **待 Rei 确认**（我先这样定的）：
  1. Tauri 桌面下载弹系统保存框（之前是直接存进「下载」不弹框，PLAN 附件待问 6）；手机不弹。
  2. 非图片附件点一下仍是下载（不预览）；要不要改成点一下什么都不做、只能从菜单下载。
  3. 缓存着的附件不能「续期」：24 小时到了就清，要再缓存得等清掉后再点（或先删除缓存再缓存）。
  4. 删掉附件时不立刻删缓存（为了撤销），下一次清理（≤ 1 小时 / 回到前台）时删。
  5. 「已缓存」标记用 Lucide `hard-drive`，「缓存」菜单图标 `hard-drive-download`。
  6. 正在上传的附件（文件本来就在本机）不显示「缓存」。

#### 附件：清理没人用的云端文件 ✅（2026-10-25）
Rei 2026-10-25 问「附件删除时会同步删除云端的文件么」，当时答不会（上面待确认第 4 条）。Rei：「不能立即判断是否还有引用么，没引用直接删？」我说可以，代价是删除同步上去以后再撤销，文件拿不回来，只能从本机缓存补传，不然显示「文件已删除」。Rei：「同时加一个定期清理：没人引用且删满 30 天的文件从云端删掉」。

结论：附件删了、没别的地方用着这份文件，Worker 马上删 R2 里的原文件和缩略图；每天再扫一遍兜底。只管附件（`<用户哈希>/f/<sha256>`），资料图和正文图片（`/api/assets`，key 里没有 `/f/`）不动。

- **什么算引用**：这个用户 `sync_row` 里任何一行（不分表），整行 JSON 里出现了这个 key，就算引用。附件行的 `r2_key` / `thumb_key` 是主要的；任务正文、日记正文、备注里写着 `/api/files/<key>` 也算。正文图片（Tiptap 拖进正文、粘贴）走的是 `/api/assets`，不在这套里。只看自己的行，只删自己哈希前缀下的文件。
- **即时删**（`apps/server/src/purge.ts` 的 `purgeAfterPush`）：`/api/sync/push` 整批写进库以后，从这次真写进去的墓碑行里取出 key（同一批里新加的附件用着同一份内容，判断时已经在库里，不会删）。放进 `ctx.waitUntil`，不拖慢同步响应：先等 12 秒，没有没删的行引用、文件上传满 15 分钟，删之前再查一次引用，再删。出错只记日志，交给每天的清理。
- **每天清理**（`purgeOrphans`，wrangler `triggers.crons` = `0 19 * * *`，北京时间每天 03:00）：逐个用户分页列出 R2 `<哈希>/f/` 下的文件，再分页扫这个用户含 `/f/` 的行：
  - 有没删的行引用：留着；
  - 只有删掉的行引用：这些行全部删满 30 天（按墓碑 `updated_at` 里的时间，取最晚那行）才删；
  - 从没被任何行引用：上传满 30 天才删（防止刚传上去、行还没同步过来的文件被误删；附件换了文件后旧文件也走这条）。
  - 删前再查一次引用。一次最多删 500 个、每个用户最多列 20 页（每页 1000 个），没扫完下次接着。日志写扫了几个、删了几个、多少字节、有没有扫完（`partial`）。
- **上传**：`POST /api/files` 同内容还是同一个 key，但已经有了也重写一遍，刷新上传时间（不然「上传满 15 分钟」会把刚刚传的同一份内容当旧文件）。补传回来的文件 key 不变，行不用改。
- **HEAD /api/files/<key>**：新加，只回头不回内容，客户端用它查文件还在不在：200 还在，404 未找到 = 已经清掉了（别人的 key 也是 404）。
- **客户端**（`apps/client/src/lib/attachment-gone.ts`）：显示附件时查一次云端文件还在不在（HEAD，同一个文件 10 分钟内只问一次；离线、没登录、正在上传的不查）；缩略图加载失败、点「撤销」恢复附件、下载时发现没了，都马上重新查。
  - 云端没了、本机有（上传队列里的、本机缓存的）：重新传上去，同内容 key 不变。缩略图也没了就用原文件重新生成再传，key 变了才改行。补传时显示「正在补传…」。
  - 云端没了、本机也没有：附件显示「文件已删除」。图片的小图位置放文件图标，灯箱里不显示它；下载、缓存灰掉；点它提示「云端的文件已经删了，这台设备上也没有副本」。重命名、删除照常。
  - 原文件在、只是缩略图没了、本机又没有：不算删除，网格退回用原文件显示。
  - 九种语言都补了这三句。
- 测试：server `test/purge.test.ts`（即时删、别的行还用着不删、同一批新加的不删、正文里的链接算引用、跨用户隔离、刚上传不满 15 分钟不删、等待期间撤销不删、LWW 输了不触发、R2 出错不影响同步响应、cron 30 天边界、按最晚墓碑算、孤儿按上传时间算、资料图不动、没同步行的前缀不碰、文件和行都分页、单次上限、HEAD）；client `lib/attachment-gone.test.ts`（还在、已删除、从缓存 / 上传队列补传、缩略图重新生成、查不出来不下结论、补传失败、不查的情况、撤销后补传）。
- **替 Rei 定的细节**（待确认）：
  1. 即时删先等 12 秒：删除提示里的「撤销」有 6 秒，同步防抖 1.5 秒，等这一会儿，点了撤销的文件就不会被删。过了这 12 秒再撤销（比如从别的设备恢复），就只能靠本机副本补传。
  2. 文件上传不满 15 分钟不即时删：另一台设备可能刚传了同一份内容、行还没推上来。这种文件留给每天的清理（删满 30 天才删）。所以刚加上就删掉的附件，云端文件会多留 30 天。
  3. 「删满 30 天」按墓碑的 `updated_at`（HLC 里的毫秒，是删除那台设备的时钟），不是服务器收到的时间。
  4. 只清附件，资料图和正文图片（`/api/assets`）不清：资料图公开读、会被多条资料和导入的旧数据共用，正文里还可能是 data: 地址，引用关系复杂，先不动。
  5. 没有同步行的用户哈希前缀（比如从没同步过的账户）不碰。
  6. 清理只看 `sync_row`；本机还在上传队列、没同步上去的行看不到。所以从没被引用的文件要等上传满 30 天才删。
  7. 「文件已删除」只在这次打开 app 时记着，不存本机；下次打开再查一次。

#### 任务详情：附件收进「+」菜单、拖到整列 ✅（2026-10-25）
Rei 2026-10-25 原话：「拖拽文件到详情页面可以直接添加附件。附件也收到这个下拉列表，但附件可以添加多个，添加后下拉列表中还要显示。附件section不要label，显示在属性块下方，不显示add attachment按钮」（附图是属性胶囊后面「+」打开的「添加属性」菜单）。

- **「+」菜单**：最后加一项「附件」（Lucide `paperclip`，英文单数 Attachment，`trc('属性', '附件')`）。点了直接打开系统文件选择，可以多选（在这次点击里调 `input.click()`，不放进 setTimeout，不然 Safari 不认是用户点的）。别的属性设了就从菜单里消失，「附件」不会：加过附件它还在。所以能加附件时「+」一直显示，属性全设了也在。纯逻辑 `lib/prop-chips.ts` 的 `addMenuItems`，单测在 `prop-chips.test.ts`。
- **附件区**：任务详情里不要标题「附件」、个数、「也可以把文件拖到这里」和「添加附件」按钮（`Attachments bare`）。没附件时整块不渲染，不占位；也没有分隔线。
- **顺序**：标题和正文 →（有类型时的「X 信息」折叠块）→ 属性胶囊行 → 附件 → 资料卡片（资料行、进度条、看到哪…）→ 关系。附件紧贴胶囊，从「+」加的附件就出现在「+」下面；资料卡片原来就在胶囊下面，现在往下挪到附件后面。附件原来在正文下面、属性上面，挪走了。
- **拖放**：拖文件到详情整列（右列 `.pane-detail` / 手机整页，包括顶栏和底栏）都能加，可以一次拖多个。拖进来时整列盖一层虚线高亮，中间「松手添加附件 · 每个文件不超过 50 MB」。50 MB 上限、类型、报错沿用原来的 `addAttachments`。
- **只认从页面外面拖进来的文件**：拖文字、链接不触发（types 里没有 Files）。从页面里开始的拖动也不触发（window 上记 dragstart / dragend）：Chrome 拖页面里的 `<img>` 时 types 里也带 Files，不排除的话编辑器里拖图片挪位置会变成加附件。
- **编辑器的取舍**：当时编辑器不支持把图片文件拖进正文当插图，所以拖到哪里（包括正文）都是加附件。2026-10-25 换成 Tiptap 后分出来了：只有图片、拖到正文上，就上传插进正文；其余照旧是附件（见下面「编辑器换成 Tiptap」）。
- **2026-11-01 改回：拖到哪里都是附件**（Rei「drag 图片到任务详情中后，没有直接开始上传」）。10-29 正文不收图片以后，拖到正文上的图片还按老规矩分给编辑器，编辑器又拦下只提示「正文里不能放图片」，结果既没进正文也没加附件。现在拖进来的文件不管落在哪（包括正文）、是不是图片，都在外框的捕获阶段接住，马上进队列上传（`attachFileDrop`）。日记输入框也能拖，只收图片，进「待发」小图。
- **桌面版要关掉 Tauri 的拖放接管**：Tauri 2 默认 `dragDropEnabled: true`，macOS 上 wry 自己接住从访达拖进来的东西、不交给网页，Windows 上 WebView2 也一样，网页的 drop 事件根本不来，拖附件在桌面版一直不起作用。主窗口（`tauri.conf.json` 和 macOS / Windows 两份）、设置窗口都设成 `false`。改的是配置，要重新打包才生效。
- **日记**：日记共用 `Attachments` 组件，但它没有胶囊行，没地方放「+」，所以保持原样：小标题、「添加附件」按钮、「也可以把文件拖到这里」、拖到日记那一块都照旧。「不认页面里开始的拖动」这一条日记也跟着生效。所以「添加附件」「也可以把文件拖到这里」两个字符串日记还在用，没删；上一轮挪到单独一行的提示（中文以外）也还是日记在用。
- **新建面板**不改。
- 截图 `work/shots-attach2/`（脚本 `work/shots-tool/attach2.mjs`，假 API）：三皮肤 × 宽屏 1440 / 手机 390，没附件、「+」菜单、有附件、拖入高亮、带资料卡的类型；苹果宽屏、Material 手机加暗色；苹果宽屏英文。
- **替 Rei 定的**（可以再改）：
  1. 附件排在胶囊下面、资料卡片上面（不是整个属性块最后）。
  2. 拖到正文外面、或者拖的不全是图片，都是加附件。只有图片拖到正文上才插进正文（2026-10-25 换 Tiptap 后加的，见下面「编辑器换成 Tiptap」）。
  3. 日记不改，仍有自己的标题和「添加附件」按钮。
  4. 菜单里的「附件」不显示已有个数。

### 农历 ✅（2026-10-17，Rei：「选择日期支持选择中国农历，订阅农历可在设置中看到地址和同步频率」；澄清后确认：从外部订阅一份农历 / 节气日历（ICS），设置里显示源地址和多久同步一次）
- **换算本地查表，不联网**：core `lunar/`——`data.ts`（农历 1900–2100 月大小 / 闰月 201 个数 + 公历 1900–2100 节气表，约 6 KB）由 `packages/core/scripts/gen-lunar-data.mjs` 从 lunar-javascript 1.7.7（MIT，6tail，寿星天文历算法）生成；它不是依赖，只在生成时用，生成时 1900-01-31 … 2100-12-31 逐日核对过农历和节气（全对）。没用 `Intl` 的 chinese 历：Node / 浏览器的 ICU 在 2027、2030、2012、2018 等年份的初一和官方差一天（如 ICU 说 2027 春节是 2-07，官方 2-06）。`lunar.ts`：`solarToLunar` / `lunarToSolar`（不存在的日子 null）、`lunarYearMonths`、`leapMonthOf`、`solarTermOf`、`lunarFestivalOf`（春节、元宵、龙抬头、端午、七夕、中元、中秋、重阳、腊八、小年、除夕；闰月不算）、`lunarYearlyDate`（每年农历 X 月 X 日落在哪天）、`lunarCellLabel`（格子小字优先级：订阅的节日名 > 传统节日 > 节气 > 初一显示月名「九月」「闰六月」> 日子「初八」）。名字在 `names.ts`（中英文界面格子里都照中文显示，同 Apple 日历；选择器、重复规则的英文说法 Month 9 / Day 8 / Leap Month 6）。
- **日期选择**：`DatePanel`（新建 / 详情的日期、倒数日目标日、待安排里排日期）格子下显示农历小字 + 订阅的放假「休」/ 调休上班「班」角标；上面「公历 | 农历」切换（这台设备记住上次用的），农历模式按 农历年（「2026 丙午」）- 月（含闰月）- 日 选，下面写出公历，点「选这天」换算成公历存（2026-11-01 起改成方案 A：月历右上角「农历」开关，见「日期面板方案 A」）。日记月历同样显示农历。日期都存公历 `YYYY-MM-DD`，不加列、不加迁移。
- **每年农历重复**：重复规则加 `lunarYearly`，存 RFC 7529 写法 `FREQ=YEARLY;RSCALE=CHINESE;BYMONTH=8;BYMONTHDAY=15`（闰月 `BYMONTH=6L`）。闰月规则：那年有同一个闰月就在闰月，没有就按非闰的同一个月；三十碰上小月取廿九。打卡、连续天数、提醒都按它走（`isDueOn` / `periodStart`）。
- **订阅**：默认源 Apple「中国大陆节假日」`https://calendars.icloud.com/holidays/cn_zh.ics`（macOS / iOS 日历里订阅的同一份；节气、传统节日、法定假日的放假（休）和调休上班（班），简体中文；2026-10-17 实测 246 个事件、2023-12-30 … 2029-12-21，假日安排随国务院公布更新）。备选（没用）：Google 中国节假日 ICS（`calendar.google.com/calendar/ical/zh-cn.china%23holiday%40group.v.calendar.google.com/public/basic.ics`，没有节气）、lanceliao/china-holiday-calender（只有法定假日）、infinet/lunar-calendar（停在 2015、繁体）。Worker `GET /api/calendar/ics?url=…[&fresh=1]`（`apps/server/src/calendar.ts`）代拉避开 CORS：不用登录（没登录也能看节日），只收公网 http(s)、回来的必须是 `BEGIN:VCALENDAR` 开头、≤ 2 MB、10 秒超时，Cache API 6 小时（「立即同步」带 fresh=1 跳过读缓存）；错误附中文状态码（400 请求有误、415 不支持的格式、413 内容太大、502 网关错误 + `upstream_status`、504 网关超时）。客户端 `lib/lunar.ts`：core `parseIcs`（全天 / 多天、DTEND 不含当天、`RRULE:FREQ=YEARLY;COUNT=…`、EXDATE、Apple 的 `X-APPLE-SPECIAL-DAY`、标题里的（休）（班））解析后存这台设备 localStorage（离线可用）；到点自动同步（启动、回到前台、每小时看一眼，按频率；失败隔一小时再试）。订阅的事件只读：显示在日期格子、我的一天副标题、列表每天的标题旁，不成任务；和本地农历冲突时用订阅的名字。
- **设置 → 农历**：「显示农历」（同步偏好 `lunar.show`，没设过跟界面语言：中文开、英文关；**2026-10-25 起改为本机开关「中国农历」，见下一节**）；「农历订阅」源地址（可复制、可改、webcal:// 自动换成 https://、改了的显示「恢复默认」；同步偏好 `lunar.sub_url`，空 = 默认源）；「同步频率」每天 / 每周 / 每月 / 手动（`lunar.sub_freq`，默认每天）；「上次同步 · 3 分钟前」+ 状态（「同步成功，315 个日子」/「同步失败：订阅源返回 404 未找到」…）+「立即同步」。地址和频率跟账户同步；数据、上次同步时间、状态只在这台设备。
- **测试**：core `test/lunar.test.ts`（对照已知日期：2026 春节 2026-02-17、2025 闰六月初一 2025-07-25、2033 闰十一月、1900-01-31 等；1900–2100 逐日往返；每年 24 节气）、`test/lunar-sub.test.ts`（ICS 解析、格子挑选、订阅设置、什么时候同步、状态文案）、`test/recurrence.test.ts`（每年农历：中秋、闰六月十五）；server `test/calendar.test.ts`；client `lib/lunar.test.ts`。截图 work/shots-lunar/（脚本 work/shots-tool/lunar.mjs、lunar-repeat.mjs）。
- **待 Rei 确认**（我先这样定的）：
  1. 「公历 | 农历」切换只在开了「显示农历」时出现（英文界面默认关，要用先在设置里打开）。
  2. 默认源选 Apple「中国大陆节假日」：它覆盖到约 5 年后，没有逐日农历（逐日农历本地算）；想要别的源在设置里换地址。
  3. 订阅不用登录，Worker 代拉对谁都开（只收日历文件，不能当通用代理）。
  4. 闰月重复的说法：选「闰六月十五」，没有闰六月的年份按六月十五；选普通「六月十五」，有闰六月的年份也只在（第一个）六月。
  5. 英文界面格子里的农历、节气、节日照中文显示。

### 农历只在中文界面、且打开「中国农历」时显示 ✅（2026-10-25）
Rei 原话：「日期部分，只有在设置中打开中国农历switch才显示。农历只有在简体中文、繁体中文中显示这个设置选项和界面中显示。这个顶部的四个快捷按钮，用图标，hover tooltip显示文本。」
- **开关**：设置 → 农历 →「中国农历」（Chinese Lunar Calendar），本机设置 `settings.chineseLunar`（localStorage `mindough:settings`，和任务链开关一样不同步），默认关。取代原来的同步偏好「显示农历」`lunar.show`（不再读；旧值留在库里没删）。订阅地址 / 频率仍是同步偏好，只在开关开着时显示。
- **判断**：core `isChineseLocale(locale)`（`zh`、`zh-Hans`、`zh-Hant`、`zh-TW`、`zh_HK`… 凡 zh 开头都算；现在只有 zh / en，以后加繁体不用改调用方）+ `lunarUiVisible(enabled, locale)`；客户端一律 `lib/lunar.ts` 的 `useLunarUi()`（`useLunar().show` 也由它来）。不是中文界面时设置里整节不渲染，开关开过也不显示农历。
- **隐藏时**：日期面板没有「农历」开关和农历月历、日历 / 日记月历格子没有农历小字和休 / 班、我的一天副标题和列表日期标题没有农历一行、订阅不自动同步、重复频率里没有「每年农历」。已有每年农历重复的任务：规则和打卡 / 提醒照常按农历算，频率格子写「每年」+「下次：2027年9月15日」，说法 `describeRecurrence(r, { lunar: false, today })` =「每年 · 下次 2027年9月15日」（core `nextLunarYearly`）。
- **快捷按钮**：`quickDates` 加 `kind`（today / tomorrow / weekend / monday），DatePanel 用 Lucide Sun / Sunrise / Sofa / CalendarArrowUp 的图标按钮，一行四个等宽；新 primitive `TipButton`（React Aria TooltipTrigger + aria-label；触屏按住 500 ms 显示提示、松手不触发、1.5 秒后收起），外观沿用 `.tooltip`（WinUI 皮肤有自己的样子）。
- **顺手修**：农历选择三个下拉挤一行在 292 宽会截成「Mo…」「Da…」：改成「年」一整行、「月 / 日」各半，值超长时省略号。
- **待 Rei 确认**：① 原来的同步偏好「显示农历」作废、改本机开关后，之前在中文界面默认看到农历的设备升级后会先看不到（要去设置里打开一次）；② 今天图标用 Sun（和「我的一天」同一个图标）；③ 本周末 / 下周末的提示文字沿用现有说法（Rei 原话写的「下个周末」，周一到周五是「本周末」）。

### 任务时区 ✅（2026-10-25）
Rei 原话：「日期可以选择时区，时区默认是当前时区，时区默认只显示常用的一些时区，点击显示更多显示完整时区列表」。具体做法是派活时替 Rei 定的（见下面待确认）。
- **数据**：`task.time_zone`（IANA 名，可空），SQLite 迁移 v8 `ALTER TABLE "task" ADD COLUMN "time_zone" TEXT`，`COLUMNS.task.time_zone = 'text?'`；同步照常（云端存整行 JSON，不动云端 schema；行级 LWW）。空 = 跟着设备当前时区（浮动），老任务、滴答清单导入的都是空；在日期面板里选过就存具体名字（哪怕等于设备时区）。旧版本客户端收到带 time_zone 的行会原样存着、不认（不丢）。导出 Markdown 写 `time_zone:`，导入只收认得的（`normalizeTimeZone`）。
- **core `timezone.ts`**：`deviceTimeZone` / `COMMON_TIME_ZONES` / `commonTimeZones(device, recent)` / `allTimeZones()`（`Intl.supportedValuesOf('timeZone')` + UTC）/ `offsetMinutesOn(tz, date)`（那天当地正午的偏移，处理夏令时）/ `formatUtcOffset`（UTC+8、UTC−4、UTC+5:30）/ `timeZoneLabel`（「上海 (UTC+8)」；中文城市名在 `timezone-names.ts`，英文用 IANA 最后一段）/ `matchTimeZone`（城市、IANA、偏移都能搜）/ `taskToday` / `todayIn` / `isTaskOverdue` / `timeZoneBadge` / `pushRecentTimeZone`。单测 `test/timezone.test.ts`。
- **影响**：提醒（`upcomingReminders`）按任务时区的那天、那个钟点换算成绝对时刻，在设备上按换算后的时刻响；我的一天建议「今天到期 / 倒数日到了」按任务时区的今天；列表、详情胶囊的过期红字按任务时区的今天；「今天 / 明天…」快捷按钮和日历上的今天按面板里选的时区算。列表 / 详情日期旁：任务时区和设备那天的偏移不同才标小字「UTC−4」（上海和新加坡偏移一样，不标）；按天分组的列表（列表页）照旧按任务的公历日期归到那一天，行里只标偏移。
- **界面**：`DatePanel` 底部「时区」一行（Lucide globe +「上海 (UTC+8)（跟着设备）」），点开在面板里原地展开：常用（这台设备、最近用过的 5 个（本机 `mindough:tz-recent`）、UTC、上海、新加坡、东京、首尔、洛杉矶、纽约、伦敦、巴黎、柏林、悉尼，去重）+「显示更多」→ 完整列表 + 搜索框；选了不关面板。新建、详情胶囊的日期、待安排里排日期都有；倒数日目标日面板没接。组件 `components/task/TimeZonePicker.tsx`、`components/TaskDateText.tsx`。
- **待 Rei 确认**（派活时替 Rei 定的）：① 时区挂在任务上、存具体名字，空 = 浮动；② 常用列表的这一批城市；③ 只在偏移不同时才标、标「UTC−4」而不是 EDT 缩写；④「今天 / 明天」按所选时区算（东八区早上选纽约「明天」会落在设备的今天）；⑤ 倒数日目标日面板没有时区一行，定期打卡的周期、连续天数仍按设备日期（只有提醒按任务时区的那天那个钟点）；⑥ 英文面板太窄，不写「跟着设备」。

### 从滴答清单导入 ✅（2026-10-21，详见 [docs/IMPORT-DIDA.md](IMPORT-DIDA.md)）
Rei：「添加从dida365导入任务的功能，在菜单栏的File/Import/Dida365，点击后弹出一个导入窗口」；追加「不能直接连接dida365么」——直接连账户为默认，备份 CSV 留作备选。
- **core** `dida/`（单独入口 `@mindough/core/dida`，导入窗口打开时才加载）：`csv.ts`（RFC 4180，带行号）、`parse.ts`（备份 CSV → `DidaRow`：跳过说明行、表头按名字 / 别名认）、`api.ts`（Open API JSON → `DidaRow`；`fetchDidaAccount(call, opts)` 拉清单 / 文件夹 / 未完成 / 已完成（200 条一页，满了时间窗口对半切）/ 已放弃（`task/filter status [-1]`，试的））、`map.ts`（时区换算、提醒、RRULE → Mindough 能存的子集、正文拼法）、`plan.ts`（`planDida` 预览、`previewDida`、`applyDida` 一批写入、`undoDida` 整批撤销）。
- **决定**：任务 id = `stableId('dida-task\0' + taskId)` → 幂等（CSV 和 API 同一个 id）；清单 → 组（同名复用，收集箱默认不放进组），文件夹 → 新建组的分类（不做多层）；放弃 → 关闭；子任务 → 前后关系（子任务 → 父任务，FS，最贴合「做完子任务才算做完父任务」）；未完成任务的简单重复（每天 / 每 N 天 / 每周几 / 每月几号）→ 定期打卡，其余规则写进正文末尾；优先级 / 标签 → 正文末尾 #标签（没有字段）；NOTE → 普通任务；提醒只取同一天的第一个。
- **Worker** `apps/server/src/dida.ts`：`/api/dida/*` 代理到 `https://api.dida365.com`（浏览器跨域不行；Tauri 也走它）。要登录 Mindough；令牌在 `x-dida-token` 头里每次带来，不存；只放行 6 条只读路径；状态码附中文（401 未授权 = 令牌不对或失效）。CORS 允许 `x-dida-token`。
- **客户端**：`components/DidaImport.tsx`（两种方式 → 预览 / 选项 → 结果 / 撤销）、`lib/dida.ts`（令牌只存 localStorage `mindough:dida-token`，不进同步表；经代理调用）、`lib/app-menu.ts`（菜单文字走 tr()、监听 `mindough:menu`）、`lib/ui.tsx` 的 `didaImportOpen`；入口：设置 → 数据、⌘K「从滴答清单导入…」。
- **Tauri** `src-tauri/src/menu.rs`：macOS 全局菜单（App / 文件（导入 ▸ 滴答清单、关闭窗口）/ 编辑 / 窗口，用 Tauri 预置项，复制粘贴快捷键照常）；Windows / Linux 只给主窗口加「文件」菜单（导入 ▸ 滴答清单、退出），不加编辑菜单；启动先用英文建，前端 `set_app_menu` 换成界面语言的文字；点了 `emit_to("main", "mindough:menu", "import-dida365")` 并把主窗口叫到前面。Linux `cargo check` 通过；macOS 分支（`#[cfg(target_os = "macos")]`）在 Linux 上没编到，**没在 Mac 上编译 / 运行过**。
- 没做：OAuth（要 Rei 在滴答开发者中心注册应用，以后可选）；滴答清单的评论、专注记录、习惯、倒数日不导。
- 测试：core `test/dida.test.ts`（CSV + API 两份 fixture）、server `test/dida.test.ts`。截图 `work/shots-dida/`。
- **待 Rei 确认**：见 IMPORT-DIDA.md 末尾 8 条（子任务用前后关系、收集箱不进组、笔记当任务、优先级 / 标签写进正文、只有未完成的重复转打卡、已完成默认全部、中文 CSV 表头别名是猜的、已放弃靠 filter 试拉）。

### 任务链 ✅（2026-10-23，原叫「整条线」）+ 删掉侧边栏关系图页
- Rei 2026-10-23：「侧边栏的Graph选项卡并不是我想要的，可以删掉」「可以一键展示整个FS的一条线上的所有任务。当前一个任务只能展示它的前后任务，但前任务的前任务是没展示出来的」。
- 删掉：`pages/Graph.tsx`、路由 `#/graph`（旧地址打开我的一天）、侧边栏 / 「更多」里的「关系图」、深链接 `view/graph`（打开我的一天，不提示写错）、关系图页专用的文案。组页的「关系图」视图（`DependencyGraph` / `LazyGraph`）保留。⌘K 本来就没有跳关系图的命令。
- core `dag.ts` `taskChain(id, deps, tasks?)`：沿前后关系（不含相关任务）传递地取所有上游 + 下游；只走未删除的边和未删除的任务；按层排（层号 = 从最上游数过来最长的那条路，汇合点排在最晚的那条之后），返回 `ids`（拓扑顺序）、`ancestors`、`descendants`、`layers`、`currentLayer`、线内的 `edges`；只取当前任务的祖先和后代（上游分叉出去的兄弟不算）；有环（不该发生）也不会卡住。测试：直线、只有一层、分叉、汇合、菱形、孤立、已删除的边 / 任务、重复边、环。
- 第一版（c75664f）是「整条线」按钮 → Sheet 弹窗、每层写「第 N 步」、同层多件桌面并排；同日 Rei：「整条线不要弹窗。每个步骤显示相对时间，而不是第几步。改名成‘任务链’」，改成下面的样子。
- 界面 `components/task/TaskChain.tsx`：详情「关系」标题右边「任务链」开关（RAC ToggleButton，Lucide route，有前置或后续时才显示，开着强调色浅底）。开着时 `TaskChainInline` 在「关系」原地替换「先做完这些 / 做完后解锁」两段（这时没有逐条「去掉关系」的 ×，要去掉先关掉任务链），「相关任务」、成环提醒照常；关掉恢复。开关存本机设置 `settings.taskChain`（localStorage `mindough:settings`，不同步），换一件任务沿用。内容：顶上「已完成 N / 共 M」+ 进度条（只算完成，关闭不算）；每层左边小圆点（当前所在层强调色实心）+ 竖线 + 箭头，右边这一步的时间（见下，多件时带「N 件」）和任务卡；同一层有几件时都纵向叠着、左边缩进一道线（详情栏窄，桌面也不并排）；卡上状态点 + 标题（最多两行）+ 状态，当前这件强调色底 +「这件」；接的不正好是上一层全部时写「接在「X」后面」。点别的卡打开那件的详情（任务链还开着）。去掉了第一版的说明句「从上往下做…」（内联后箭头已经说明顺序）。
- 每一步的时间（core `dag.ts`：`taskPlannedDate`、`chainStepWhen`、`chainWhenLabel`，单测中英文）：一步里的任务都结束了（完成 / 关闭）→ 最晚那件的 `done_at`（本机日期）相对今天：今天完成 / 昨天完成 / N 天前完成 / 超过 30 天写「9月1日完成」（不是今年带年份）；没记 `done_at` 写「已完成」。否则只看没结束的几件，取最早的计划日期：一件的计划日期 = 倒数日用 `target_date`（就是截止日）> `scheduled_date`（「日期」，任务表没有单独的截止字段，这个日期就当要做 / 截止的那天）> 最晚一次进「我的一天」的日期；相对今天写 今天 / 明天 / N 天后 / 已过 N 天（色调 overdue，红色 `--danger`），超过 30 天写日期；都没有写「未定时间」。英文 Done Today / Done 3 Days Ago / Today / Tomorrow / In 5 Days / 2 Days Overdue / No Date。
- 为什么用纵向列表不用关系图：手机 390 宽也能读全标题和状态，不用缩放拖动；层就是「先做哪步」，和「先做完这些 / 做完后解锁」的说法一致。
- 截图 `work/shots-chain/`（第一版）、`work/shots-chain2/`（任务链内联 + 相对时间：三皮肤 × 桌面 / 手机）。

### 三列布局 ✅（2026-10-23）：任务详情不再弹窗
- Rei 2026-10-23：「任务链不要再弹窗了，任务详情如果不弹窗最好了，最好做成三列布局」。
- 宽屏（≥ 1100 px）：侧边栏 | 当前视图的列表 | 任务详情（`components/task/DetailPane.tsx`）。有任务列表的页面（我的一天、待安排、时间轴、组、组详情、可做、打卡）右列常驻，没选中时是空状态「选一件任务查看详情」（Lucide mouse-pointer-click）；日记、资料库、人物、设置等没有任务列表的页面只在打开任务时才出现右列。点列表里一件 → 右列显示，那一行高亮（`is-selected`，`aria-current`）；不在列表里的任务（⌘K、资料库关联任务、通知、深链接）也在右列显示，列表不高亮。右列左边分隔条可拖（双击 / Home 恢复默认，键盘 ← → 调，Shift 大步），宽度 320–720、还要给列表留 360，存本机 `mindough:detail_w`（不同步）；默认 400。Esc（不在输入框、弹层里时）或右上角关闭 = 取消选中；↑ ↓ 在当前页面的任务里换一件（按 `.main [data-task-id]` 的显示顺序，没选中时 ↓ 第一件、↑ 最后一件，自动滚到可见）。
- 中等宽度（761–1099 px）：侧边栏收成图标栏（64 px，macOS 无标题栏时 80 px 给红绿灯；悬停看名字，小节标题变成细线，收起的小节照样列出），列表 + 详情两列；没选中时右列不占地方（列表铺满）。选「图标栏」而不是「侧边栏可收起」：不用多一个开关，导航一直在手边。
- 手机（≤ 760 px，沿用原来的手机断点 `MOBILE_MAX_WIDTH`，不是 720）：详情整页推入（盖住标签栏，从右滑入），左上返回（Apple「‹ 返回」、WinUI / Material 箭头）；从屏幕左边缘右滑跟手返回；进详情时 `history.pushState`，所以浏览器 / 安卓返回键回列表；返回按钮在有这条记录时用 `history.back()`，不攒重复记录。
- 选中的任务写在当前页面 hash 的 `?task=<id>` 上（`#/agenda?task=…`，`lib/router.ts` 的 `taskInHash` / `hashWithTask`；`parseHash` 忽略 ? 后面的参数），刷新后还在；换页面就不带（取消选中）。桌面上选中 / 换一件用 `replaceState`（不攒浏览记录）。`ui.editingId` 就是它（`lib/ui.tsx` 跟着 hashchange / popstate 走），所有入口照旧调 `ui.openEditor(id)`，不用各自改。深链接 `#/task/{id}`（Web）还是先换成 `#/myday` 再在右列打开；`mindough://task/{id}` 在当前页面的右列打开。
- 详情外框 `DetailFrame`（`TaskDetail.tsx`）：`mode="pane"`（右列）/ `"page"`（手机整页）。原来还有给桌面置顶小窗用的 `"modal"`，2026-11-04 随小窗一起删了。右列和整页都是一栏：属性跟在正文、附件后面（`.detail.is-stacked`，原来 `.is-mobile` 的样式改名过来）。顶栏：完成状态 / 进度胶囊 | 我的一天、添加关系、··· | 关闭（整页是返回）；macOS 无标题栏时顶栏空白处可拖窗口。完成 / 关闭这件后：右列留着显示「已完成」+「重新打开」（方便撤回）；手机整页照旧收起。删除后右列回空状态。
- 新建面板（FAB）不变，还是自己的面板；新建后提示里的「查看」在右列打开。FAB 挪进中间一列（`.main-col`）右下角，不压住右列底栏的主操作。组页关系图单击节点就在右列显示（以前桌面要双击）。
- 皮肤：Apple 像「提醒事项」检查器（白底、左边 0.5 px 细线、底栏不分色，选中行强调色浅底）；WinUI 像 Mail 阅读窗格（右边一块圆角 8 卡片、和列表留缝，选中行浅底 + 左边强调色竖条）；Material 3 list-detail 规范布局（详情是圆角 16 的 surface container，中间 4×48 的拖动把手，选中行 secondary container 色）。
- 没改数据模型；纯逻辑（宽度上下限、↑ ↓ 选下一件、hash 读写）在 `lib/detail-pane.ts` + `lib/router.ts`，单测 `lib/detail-pane.test.ts`。
- 截图 `work/shots-3col/`：三皮肤 × 宽屏（列表 / 选中 / 任务链 / 拖宽 / ⌘K 打开不在列表里的）、中等宽度（选中 / 未选中）、手机（列表 / 推入详情 / 任务链）。
- 🟡 待 Rei 确认：断点（1100 / 760）；中等宽度用图标栏；完成后右列不收起；删除后回空状态（没自动选下一件）；没有任务列表的页面不显示空右列。

### 详情属性胶囊行 ✅（2026-10-25，Rei 选方案 A）
- Rei 2026-10-25：属性区原来一张卡片 7 行（类型 普通 / 完成方式 打勾 / 重复 一次 / 日期 / 提醒 无 / 组 / 人物 无），大半是默认值，太占地方；看了草图（`work/props-sketch/props-sketch.png`：现状 / 方案 A 胶囊行 / 方案 B 两列网格）选 **方案 A · 胶囊行**。
- 单值属性收成一行胶囊（`components/task/PropChips.tsx`），`flex-wrap` 自动换行；**只显示设过的**，默认值算没设：类型 = 普通（`type_id` null 或 `PLAIN_TYPE_ID`）、完成方式 = 勾选完成（`once`）、日期 = 没有（重复任务不适用）、重复 = 只做一次、打卡分类 = 未分类（只有重复任务适用）、提醒 = 不提醒（要有日期 / 倒数日目标日 / 重复才适用，`canRemind`）、组 = 不放进组、和谁有关 = 没有人。纯逻辑在 `lib/prop-chips.ts`（`applicableProps` / `isPropSet` / `setProps` / `unsetProps` / `clearPatch`），单测 `lib/prop-chips.test.ts`。
- 顺序固定：类型、完成方式、日期、重复、打卡分类、提醒、组、和谁有关（先「是什么、怎么算完成」，再「什么时候」，最后「放哪、和谁」）。
- 胶囊 = Lucide 图标 + 值的短文字（`friendlyDate` / `describeRecurrence` / `describeCompletion` / `formatRemindTime`、组用自己的 emoji、人物头像叠 + 名字、类型 / 分类图标带各自颜色）；逾期日期用 `--danger`。点胶囊打开原来的选择器（TypeGrid、CompletionChoice + CompletionSentence、DatePanel、RepeatEditor、CategoryPicker、RemindPanel、GroupList、PeopleList，逻辑不变），弹层锚在胶囊上。
- 清除：能悬停的设备上悬停出现右上角小 ×（`@media (hover: hover)`，不进 Tab 顺序），点了恢复默认、胶囊消失，提示「已清除「日期」」+「撤销」（类型走 `changeTaskType`，撤销把 type_id / 资料 / type_data / 正文一起还原；人物逐个解除关联）；触屏没有 ×，在选择器里选「无」那项（不设日期 / 只做一次 / 普通 / 不放进组 / 不提醒 / 未分类），「和谁有关」弹层底部加了「清除」。键盘：胶囊可 Tab 聚焦，Enter / 空格打开，Backspace / Delete 清除（焦点挪到下一个胶囊或「+」）；读屏名「属性名：值」。
- 行尾「+」：菜单列出适用但没设的属性（图标 + 名字），选一项直接打开那项的选择器（先锚在「+」上，设好后胶囊出现）；全都设了「+」隐藏；一个都没设时是「+ 添加属性」。
- 资料行（选影视 / 书 / 游戏…）和任务字段（进度条、看到哪…）不进胶囊，类型带资料时仍在胶囊下面一张属性卡片里，位置和样子不变。
- 三皮肤（`skin/skins.css`「属性胶囊行」，结构在 `styles/prop-chips.css`）：Apple 浅灰填充的圆角胶囊（高 26）；WinUI 细描边、圆角 4 的按钮（控件底色）；Material 3 assist / input chip（高 32、圆角 8、描边、图标强调色，打开时 secondary container 色）。「+」是虚线 / 细线的小方块。手机胶囊高 32。
- 新建面板不受影响：它本来就有自己的一排属性胶囊（`TaskComposer`，没设时显示属性名、设了显示值，完成方式和重复是下面两段），不是同一个组件，这次没改。
- 截图 `work/shots-chips/`：三皮肤 × 宽屏右列 / 最窄 320 右列 / 手机 × 中英文，各有 无属性 / 少量 / 很多属性（+ 带资料的类型）。
- 🟡 待 Rei 确认：顺序（打卡分类跟在重复后面）；清除都给「撤销」提示；没日期时「+」菜单里不列「提醒」（先设日期才出现）；人物胶囊最多叠 3 个头像、名字超长省略；完成方式胶囊的值用「计数 · 目标 5 公里」这类设定文字（进度 3/10 仍在顶栏进度胶囊里）。

### App 名字 ✅（2026-10-25）：英文 Mindough，中文「念头团」
Rei 2026-10-24 定：英文「Mindough」，中文「思想团」；2026-10-25 中文名改成「念头团」（英文不变），全仓「思想团」→「念头团」（i18n key 一起改，英文译文不变），manifest description 跟着改，sw.js SHELL v3 → v4。
- **界面**：core `appName()` = `tr('念头团')`（英文 Mindough）；tr 的中文原文里写「念头团」（「登录念头团」「关于念头团」），英文词典写 Mindough。设置「关于」、启动占位、手机顶栏兜底、桌面菜单栏（关于 / 隐藏 / 退出）、通知相关说明、Worker 的原生登录结果页（只有中文）都随语言或改成念头团。没有文字字标（关于里是图标 + 文字名，文字随语言）。
- **网页标题**：`lib/i18n.ts` `applyAppTitle` 在启动和换语言时改 `document.title` 与 `apple-mobile-web-app-title`；index.html 里静态写 Mindough（JS 跑之前 / 爬虫）。
- **PWA manifest**：只有一种语言，`name` / `short_name` 保持 Mindough（装到桌面后的名字是 Mindough；iOS「添加到主屏幕」读的是 apple-mobile-web-app-title，随语言）；description 写「Mindough（念头团）：…」。改了 manifest，sw.js SHELL v2 → v3（10-25 改名再 v3 → v4）。
- **原生**：`src-tauri/locales/`——Apple `zh-Hans.lproj` / `en.lproj` 的 `InfoPlist.strings`（CFBundleDisplayName、CFBundleName），macOS 经 `bundle.macOS.files` 打进 Contents/Resources，`src-tauri/Info.plist` 合进 CFBundleLocalizations + LSHasLocalizedDisplayName；iOS 在 ios.yml 打 ipa 前 `scripts/native-locales.sh ios` 放进 .app；Android `values-zh` / `values-zh-rCN` 的 app_name（+ main_activity_title），build.yml 在 `tauri android init` 后 `scripts/native-locales.sh android` 拷进 gen/。
- **不改**：Tauri productName（Mindough，安装包名、.app 文件夹名、数据目录、更新都靠它）、bundle id `dev.rei8t.mindough`、Windows 安装包名、导出文件夹名「Mindough 日期」、User-Agent、`/api/health` 的 `name: 'mindough'`（标识，不是显示名）、仓库名、深链接 `mindough://`。Windows 安装后开始菜单里也还是 Mindough（productName 单语言）。

### 列表行去掉建议徽章和加入按钮 ✅（2026-10-25）
Rei 2026-10-25 先说「任务列表，如果很窄不显示右边的两个按钮」，又说「再宽一点显示图标按钮，很宽则显示图标 + 文本」，最后定了「任何情况下都不显示这两个按钮」，所以不按宽度分档。
- 我的一天「建议」行尾的原因徽章（今天到期 / 今天要打卡 / 刚解锁 / 倒数日到了）和「+ 加入」按钮，多宽都不显示；到期看元信息行里的日期（过期是红色）。core 的 `SUGGESTION_REASON_LABEL` 和排序原因还留着，只是界面不再用。
- 加入我的一天的入口：`TaskRow` 加了右键 / 长按（触屏 500 ms，移动超过 10 px 就取消，长按后松手不会打开任务）/ 键盘菜单键都能打开菜单，菜单项由 `lib/task-menu.ts` 的 `rowMenu` 给出：查看详情 ｜ 加入 / 移出我的一天。所有用 TaskRow 的列表（我的一天、待安排、列表、组、可做、资料 / 人物详情…）都有。任务详情「…」菜单里的「加入我的一天」照旧。

### 打卡卡片的活动图收进圆点 ✅（2026-10-25）
Rei 原话：「check-ins中的任务活动图，不要显示在列表中，而是左上角一个圆点，toggle全宽显示活动图」。原来活动图夹在标题和右边的计数 / +1 中间，把一行挤得很满。
- **圆点**：每张打卡卡片最左边、和标题第一行对齐，一个小圆点按钮（`TipButton`，悬停 / 聚焦有提示，触屏按住也有）。收起时是空心淡圈，展开时是实心，颜色跟活动图一样（打卡类型有颜色就用它，没有就用默认的热力图绿）。读屏名「显示活动图 / 隐藏活动图」，带 `aria-expanded` 和 `aria-controls`。圆点和打开详情的按钮是两个按钮，点圆点不会打开详情，键盘 Tab 能到、Enter / 空格切换。
- **展开**：卡片里多一整行，左右撑满。格子数按宽度算（`lib/habit-heatmap.ts` 的 `fitHeatmap`：格子最小 10 px，手机 9 px，间隔 2 px；放下整数周后把剩下的宽度平分给格子，正好填满；最多 53 周，格子最大 16 px，多出来的宽度留在左边），最近一天在最右。宽度变了（拖右列、转屏）就重算。这时不滚动、不显示月份和星期（和原来行内那张一样是小图）。`Heatmap` 加了 `fit`，别的地方不受影响：页面顶上「过去一年」那张大图照旧。
- **记住**：展开了哪几张存在本机设置 `settings.habitHeatmapOpen`（任务 id 列表，localStorage `mindough:settings`），和任务链开关一样不同步，默认都收起。
- **顺手修**：桌面上中间一列很窄时（右列打开、中等宽度 960），计时那种宽的打卡按钮会压住标题。现在 `.habit-list` 是容器，宽度不到 520 px 时打卡按钮挪到标题下面一行。手机布局不变。
- **替 Rei 定的**（可以再改）：① 圆点放在标题左边，不是卡片外角上；② 展开后是小图（没有月份、星期、图例）；③ 最多显示一年；④ 展开状态每台设备各记各的。

### 界面上「组」改叫「项目」✅（2026-10-25）
Rei 2026-10-25 原话：「groups更改成projects」；问中文要不要一起改，答「要都要改」。
- **改了什么**：凡是用户看得到的「组 / Group」都改成「项目 / Project」：侧边栏和页面标题（Projects）、详情属性胶囊、新建面板的胶囊、项目选择器（「不放进项目」）、空状态（「还没有项目」「项目里的任务都做完了」）、⌘K 占位和结果小字、从滴答清单导入（「清单放进哪个项目」「新建项目「X」」「不放进项目（进待安排）」）、导入导出说明（「文件夹是项目」）、导出时没名字的文件夹「未命名项目」。属性名和导航名分开：`trc('属性', '项目')` = Project，`trc('导航', '项目')` = Projects（不带语境的 `tr('项目')` 是资料库里「项目库」的短名）。
- **不改**：表 `group`、字段 `group_id`、代码里的 Group / groups 标识、路由 `#/groups/<id>`、深链接 `mindough://view/groups` 和 `mindough://group/<id>`、导出 front matter 的 `group:` 和 `_group.md`。新加两个别名：`#/projects`、`mindough://view/projects`，指向同一页；链接仍生成 `#/groups`，旧链接照样能用。导入不认文件夹名，所以「未命名组」→「未命名项目」不影响旧 zip 导入。
- **撞名**：资料库里本来就有个内置类型「项目」（项目库 / Projects，`B.project`）。现在侧边栏的「项目」和资料库的「项目」同名，界面上靠位置区分。要不要给其中一个改名，等 Rei 定。
- 只有表达「一批 / 一套」的「一组」「可能重复 N 组」「这组以后不再提示」这类不是这个概念，没改。

### 列表行选中、悬停、聚焦的底色盖满整行 ✅（2026-10-25）
Rei 原话：「这个左边的一部分focus时背景颜色还是白色的」。我的一天、待安排这种能拖动的列表，选中的浅蓝底只从勾选圈开始，最左边的拖动把手那段还是白的，卡片左上角也没染上。
- 原因：底色画在里面的任务行上，拖动把手在任务行外面。现在悬停、选中的底色画在整行上，键盘聚焦改成画在行里面的一圈（外圈会被卡片圆角裁掉）。WinUI 选中的竖条也挪到整行最左边。
- 第一行、最后一行的底色跟着卡片圆角走。打卡卡片原来选中第一张 / 最后一张时，方角底色会冒出圆角卡片，一起修了。
- 三套皮肤、亮暗色、宽屏 / 中等 / 手机都截图对过（`work/shots-rowfocus/`）。

### 多语言：西、葡、俄、日、德、法、印尼 ✅（2026-10-25）
Rei 2026-10-25 原话：「支持西、葡、俄、日、德、法、印尼」。

- **词典**：每种语言一个文件 `apps/client/src/i18n/locales/{es,pt-BR,ru,ja,de,fr,id}.ts`，每个 1428 条（core + 界面的说法，加内置数据的名字），用到时才下载。缺的字先退回英文，英文也没有才显示中文原文。复数用 ICU 写法。`locales.test.ts` 查 key 齐不齐、占位符、俄语复数、法语标点。
- **设置 → 语言**：原来的三段开关改成下拉，跟随系统加九种。跟随系统时按系统语言顺序找第一个支持的，都不支持用英文。
- **日期和数字**：都走 Intl，按语言出星期、月份、日期、金额、币种名。农历只在中文界面。
- **服务端**：原生登录的结果页按浏览器的 Accept-Language 显示九种语言，认不出用英文（`auth.ts` 的 `nativeLang`，单测 `test/auth.test.ts`）。
- **原生**：Android `values-es / pt-rBR / ru / ja / de / fr / in`、Apple `es / pt-BR / ru / ja / de / fr / id.lproj` 的显示名都是 Mindough，`Info.plist` 的 CFBundleLocalizations 加上这七种（系统才会按这些语言打开 app，WebView 的语言也跟着它），`tauri.conf.json` 的 macOS 文件和 `scripts/native-locales.sh` 一起改。没在真机上装过。
- **宽度**：七种语言在苹果皮肤宽屏截了我的一天、详情、设置、日期弹层；德、俄、法在三套皮肤的宽屏、中等、手机 390 上又看了一遍（`work/shots-i18n/`）。改了这几处：
  - 详情里附件的拖放提示挪到「附件」下面单独一行（中文以外都是，原来只剩「Oder Dateien …」）。
  - 段落标题不折行（俄语「Осталось со вчера」在手机上被挤成两行）；放不下时右边按钮换到下一行。
  - 西文、俄文界面在中间一列很窄时（右列打开、中等宽度），「带回今天」只留太阳图标，悬停有提示。中文、日文照旧显示文字。
  - 法语、西语、葡语的「待安排」改用短叫法（Réception、Entrada），手机底栏不再折成两行；法语输入框占位缩短。
  - 西文的引号、省略号、单位前空格这些原来只给英文的规则，推广到其他西文和俄文。
- **顺手修**：账户状态的说明（「同步服务尚未上线」）原来在词典加载前就算好了，德语界面里会冒出中文；现在等词典好了再查。

替 Rei 定的细节（不对可以改）：
- 葡萄牙语用巴西葡萄牙语（pt-BR），葡萄牙的系统语言也显示它。
- 英文的一周改成从周日开始，跟 Intl（en-US）走；原来英文也是周一。其他语言同样跟 Intl。
- 导航用各系统本地的叫法（参照 iOS / Android 同类功能），不照中文逐字译。
- 「打卡」在其他语言里译成「习惯」（Hábitos、Привычки、習慣、Gewohnheiten…）。
- 在线查资料：中文界面按中文查，其他语言都按英文查（来源只有中英两种结果）。
- 资料库内置类型「项目」和侧边栏「项目」同名，每种语言里都撞，**待 Rei 定**要不要改其中一个。

还要母语者看：七种译文都是照英文意思译的，没有母语者审过。俄语、日语、印尼语最没把握；日期弹层里俄语的单字母星期（п в с ч п с в）是 Intl 的标准写法，但有重复字母，要不要改成两个字母待定。

### 编辑器换成 Tiptap ✅（2026-10-25）
Rei 2026-10-25 原话：「用https://tiptap.dev/docs/editor/getting-started/install/react替代mildown，提供WYSIWYG」。

任务内容、资料 / 人物备注、新建面板、日记用的所见即所得编辑器，内核从 Milkdown 7 换成 Tiptap 3（`@tiptap/react` 的 `useEditor`）。存的还是 markdown，老数据打开、改、存都和以前一样。

- **只用开源扩展**：段落、标题、引用、分隔线、粗斜删、行内代码、代码块、列表、表格、图片、撤销、拖放光标这些官方扩展一个个单独引，不用 StarterKit（它会把用不上的下划线、官方链接和 linkifyjs 一起打进包里）。没用付费的 Pro 扩展。链接、公式、提示块、折叠块、脚注、HTML 片段是自己写的（`components/editor/extensions.ts`、`gh-syntax.ts`、`details.ts`）。
- **markdown 读写用 remark，不用官方的**：`@tiptap/markdown` 基于 marked，写出来的格式和以前存的不一样，表格对齐、脚注、HTML 块也弱；prosemirror-markdown（markdown-it）同样会改写老数据。所以沿用 Milkdown 一直在用的 remark：读是 remark-parse + remark-gfm（加公式、提示块、折叠块）→ Tiptap 文档，写是反过来再走 remark-stringify，规则照搬 Milkdown 7 的 commonmark / gfm 预设（`components/editor/markdown.ts`）。
- **和以前一字不差**：换之前用 Milkdown 7 跑了 190 段样例（各种写法、以前测试里的样例、内置模板、演示数据），记下原文、读写一遍、再读写一遍的结果（`markdown.fixtures.json`）。Tiptap 版逐条比，全部一样（`markdown.test.ts`）。
- **只看不改就不写回**：打开时先记下这篇写出去是什么样；挪光标、全选、点开折叠块、点进公式都不算改。所以原文里 `* 列表`、`__粗__` 这种写法，只看不会被改写。真改了字才存。
- **图片进正文**（新加的）：粘贴图片，或者把图片文件拖到正文上，就上传到 R2，在光标处插 `![](地址)`；传失败就什么都不插，提示「图片没传上去，稍后再试」。拖进来的不全是图片、或者落在正文外面，照旧是附件。（2026-10-29 起正文不收新图片；2026-11-01 起拖进来的图片落在正文上也是附件，`dropGoesToEditor` 删了，见上面「任务详情：附件收进「+」菜单、拖到整列」。）
- **粘贴**：粘贴纯文字当 markdown 读（网络图片照旧只显示成文字，不加载）；一段字粘到段落中间，接在原来那段里；复制出去是 markdown。
- **只读**：编辑器加了只读模式，能看、能点链接，不能改。
- **快捷键、手打写法**和以前一样：删除线 ⌘⌥X、列表 ⌘⌥8 / ⌘⌥7、代码块 ⌘⌥C、引用 ⌘⇧B、标题 ⌘⌥1–6；⌘Enter、⌘K 不被编辑器吃掉。手打 27 种写法（标题、粗斜删、代码、引用、列表、清单、分隔线、链接、裸网址、表格、`|3x2|`、公式、提示块、折叠块）和 Tab 缩进不失焦，在真实 Chromium 里一个字一个字打过（`work/shots-tool/le-syntax2.mjs`）；新建面板的占位、自动聚焦、Esc、⌘Enter 添加、撤销重做也查过（`tiptap-composer.mjs`）。截图在 `work/shots-tiptap/`。
- **包大小**：编辑器那块（`MdEditor-*.js`，按需加载）从 Milkdown 时的 506 KB（gzip 154 KB）变成 620 KB（gzip 187 KB），多了 33 KB（gzip）。主包不变。

替 Rei 定的细节（不对可以改）：
1. 在链接末尾接着打字，新打的字不算链接（链接不往后延伸）。
2. 新插的表格每列不设对齐（分隔行写成 `| - |`，不是 `| :- |`）。
3. 手打 `![图](网址)` 不变成图片，留着原文（和以前一样）。
4. 离线或没登录时不往正文里插图，只提示「登录并联网后才能把图片放进正文」；附件那边离线排队的做法不变。
5. 只有图片文件、而且拖到能改的正文上，才插进正文；别的文件、图片和别的文件混着拖、拖到正文外面，都当附件。


### 编辑器去掉工具栏、悬停不变色 ✅（2026-10-25）
Rei 2026-10-25 原话：「换成tiptap后，不用显示toolbar。hover编辑器不用change bg。」接着又说：「checklist的markdown trigger `- [ ] `好复杂」（同意加 Notion 式快捷），问「collapsible要怎么触发」（同意加短触发）。

- **工具栏全去掉**：任务详情正文、资料 / 人物备注、新建面板、日记，宽屏和手机都不显示。`MdEditor` 的 `toolbar` 属性、按钮、`handle.run()` / `handle.active()`、工具栏专用的「折叠块」切换命令（`toggleDetails`）一起删了，原来按钮上的 11 个字符串（标题、粗体、斜体、删除线、清单、编号列表、引用、代码、折叠块、表格、格式）九种语言一起删。
- **留着的**：快捷键、手打写法、⌘K 链接框、链接悬停浮层、粘贴 / 拖进图片。⌘K 以前在新建面板里不开（那里没工具栏），现在三处都开。
- **只有工具栏能做的，现在这样打**：清单 `[] ` / `[ ] ` / `[x] `（或 `- [ ] `）；表格 `|3x2| ` 或一行 `| a | b |` 回车；折叠块 `>> ` 或 `<details>` 回车。标题、粗斜删、列表、编号、引用、代码块、链接本来就有快捷键和写法。提示块、公式、附件本来就不在工具栏里，不受影响。
- **悬停、聚焦都不变底色**：去掉 `.detail-body:hover` 的底色和过渡，三皮肤、亮暗一样；聚焦本来就不变底色，只有光标。资料 / 人物备注是输入框样子，聚焦时强调色边框保留（类名从 `is-active` 改成 `is-focused`）。
- **清单短写法**：行首打 `[] `、`[ ] ` 变成没勾的清单项，`[x] ` 变成勾上的，`- [ ] ` 照旧。我们没用官方 TaskItem（一种 listItem 靠 `checked` 区分，同一个列表里能混写清单和普通项），官方那条规则用不上，所以在 `MdListItem.extend` 的 `addInputRules` 里加：普通段落先包进无序列表，再把这一项标成清单；已经在列表项里的交给原来那条规则（顺便也认 `[]`）。代码块里、行中间的 `[ ]` 不变。存的还是 `- [ ]`。
- **折叠块短写法**：行首打 `>> `，这一行后面的字当标题；空行就是空标题，光标在标题里，显示占位「折叠块标题」。规则写在 `Details` 节点的 `addInputRules` 里，优先级 101，比引用（100）先试。
- **和引用的冲突**：先打 `> ` 变成空引用、再打 `> `，也变成折叠块，不再嵌套引用。引用里已经写了东西，在某行开头再打 `> ` 还是嵌套引用（不然没法写嵌套引用了）。
- 检查：`tiptap.test.ts`、`details.test.ts` 加了用例；真实 Chromium 一个字一个字打（`work/shots-tool/le-syntax2.mjs`，加了 `[] ` `[ ] ` `[x] ` `>> ` `> > ` 和普通引用，共 38 项）；截图 `work/shots-notoolbar/`（脚本 `work/shots-tool/notoolbar.mjs`，三皮肤宽屏 + 手机 390，悬停 / 编辑，亮 + 三张暗；量了悬停、聚焦前后底色都是透明）。

替 Rei 定的细节（不对可以改）：
1. 手机上不加气泡菜单之类的替代界面（Rei 没要求），全靠手打写法。
2. `>> ` 变成折叠块后，光标停在标题末尾，回车进正文。
3. 新建面板里 ⌘K 也开链接框（以前那里没有）。

### 我的一天去掉行尾 ×，拖完不高亮 ✅（2026-10-25）
Rei 2026-10-25 原话：「删除my day中的条目右侧的x按钮。拖拽调整顺序后不要highlight」。

- **去掉 ×**：我的一天列表每行右边的 ×（移出我的一天）删了，宽屏、手机、三皮肤都没有。移出我的一天还能这样做：行的右键 / 触屏长按 500 ms / 菜单键（Shift+F10）打开行菜单选「移出我的一天」；详情顶栏的太阳；详情「…」菜单第一项；⌘K 搜索结果行上的太阳。没有专门的快捷键，以前也没有。「移出我的一天」这个字符串别处还在用，不删。待安排行尾是「安排日期」，不是 ×，照旧。
- **高亮是怎么来的**：React Aria 放下后（`useDroppableCollection` 的 `updateFocusAfterDrop`）把焦点挪到被拖的行，还把交互方式强行设成「键盘」，行上就出现 `data-focus-visible`，画出键盘聚焦那圈强调色；拖行身（不拿把手）时，焦点留在行里的按钮上。截图里那种整行浅蓝底，是行被选中（`ui.editingId`）的样子，拖动本身不改选中；之前就选中的行拖完照样选中。
- **改法**（`lib/drag-guard.ts`）：记下拖动是鼠标 / 触屏还是键盘发起的。鼠标 / 触屏拖完，把交互方式改回 pointer，焦点离开列表（放下后 0、80、160 ms 各清一次，React Aria 最晚 50 ms 才挪焦点）；键盘拖动不动，键盘焦点照常留着。拖动中和放下后 350 ms 内的点按不算点开：不选中、不打开详情、不改 `?task=`。用在我的一天、待安排、类型列表、字段列表（类型列表的「点开」也挡住）。
- 检查：`drag-guard.test.tsx`（鼠标拖完清焦点、晚到的焦点也清、键盘拖保留焦点、列表外焦点不动、拖动中和刚放下的点按不算）；真实 Chromium 鼠标拖把手、拖行身、先选中再拖、键盘拖（`work/shots-tool/dbg-mydayx.mjs`）；截图 `work/shots-myday-x/`（脚本 `work/shots-tool/mydayx.mjs`）。

### 我的一天快速添加：去掉「从全部任务添加」，加完马上打开 ✅（2026-10-26）
Rei 2026-10-26 原话：「删除从全部任务添加的按钮，从这里添加任务后立即打开任务」。

- **去掉按钮**：我的一天顶部添加框右边的「从全部任务添加 ⌘K」删了，宽屏、中等宽度、手机、三皮肤都没有，输入框占满一行（右边留白和左边一样）。全局 ⌘K / Ctrl+K 照旧能搜、能把任务加进今天；空状态里「按 ⌘K / Ctrl+K 从全部任务里挑几件」那句还在。「从全部任务添加」这个字符串九种语言都删了。别的页面没有同样的按钮：待安排没有快速添加框，列表（Agenda）每天的添加框本来就只有输入框。
- **加完马上打开**：在框里打字按回车，任务建好、放进今天，马上选中它，和点列表里一行一样：三列时在右列，中等宽度是两栏，手机（≤ 760）整页推入；地址写上 `?task=id`。输入框清空，新的那行滚到看得见的地方。
- **焦点**：照详情打开的老规矩，打开详情不抢焦点，光标也不进正文。宽屏和中等宽度：光标留在添加框里，接着打字回车就是下一件，详情换成最新那件（连着加，以最后一件为准）。手机：详情整页盖住列表，添加框交出焦点，软键盘落下；要写正文就点正文。返回后回到列表，新任务在里面。
- 代码：`lib/quick-add.ts`（建任务、放进今天、打开；手机收键盘；等下一帧滚到新行，连着加时只滚最后一件）。
- 检查：`quick-add.test.ts`（建好后打开、空白不建、连着加停在最后一件、手机交出焦点、宽屏留住焦点、新行晚一帧出现也能滚到、连着加只滚最后一件）。截图 `work/shots-myday-add/`（脚本 `work/shots-tool/mydayadd.mjs`）：三皮肤宽屏亮色、Apple 暗色、中等宽度 980、手机 390（Apple、Material），每组加之前和加之后，手机多一张返回列表。

### 我的一天、待安排、可做：中间列去掉页头，顶上换成添加框 ✅（2026-10-26）
Rei 2026-10-26 原话：「我的一天、待安排、可做的中间列的header去掉，换成输入框」。

- **页头去掉**：这三页中间列不再有图标 + 大标题 + 副标题，最上面就是添加框（和我的一天一样：没有「从全部任务添加」，回车加完马上打开，焦点规矩见上一节）。组件 `components/QuickAddBar.tsx`，三页共用。
- **加到哪**：我的一天进今天；待安排进待安排；可做页也进待安排，和右下角新建按钮在可做页的默认一样。新任务没有前置，马上出现在可做页的「琐事」里，选中并滚到看得见。
- **占位**：我的一天「今天要做什么？按回车添加」（不变）；待安排「想到什么先记下，按回车添加到待安排」；可做「现在想做什么？按回车添加到待安排」。读屏名「添加任务到今天」/「添加任务到待安排」。新字符串九种语言都补了。
- **原来页头里的东西挪到哪**：
  - 副标题（我的一天的日期 · 完成数 · 农历，待安排的「N 件还没定哪天做 / 都安排好了」，可做的「N 件任务的前置都已完成…」）挪到添加框下面、列表上方的一行小字。
  - 待安排页头的「新建任务」按钮去掉了：右下角新建按钮和 N 一样打开完整的新建面板，功能没丢；空状态里的「记一件事」还在。
  - 页面标题留一个读屏用的隐藏 `h1`，读屏照样知道在哪一页。
- **macOS 无标题栏**：中间列顶上那条 38px 的拖动条（`titlebar-space`，带 `data-tauri-drag-region`）在 `App.tsx` 里，不在页面里，没动：红绿灯避让、拖窗口、双击放大照旧，添加框在拖动条下面。截图用加 `platform-macos-overlay` 类模拟过，没在真 Mac 上试。
- **手机（≤ 760）**：页面里也不放大标题，标题挪到顶栏（顶栏原来就有这个字，只是透明），左边写「我的一天 / 待安排 / 可做」，右边搜索不变。别的页面照旧。（2026-11-11 改：搜索只在我的一天，见下一条。）
- **手机顶栏的搜索只在我的一天**（Rei 2026-11-11 02:09「只有我的一天保留这个搜索，其他页面都不显示」）：`lib/mobile-topbar.ts` 管每页放什么。我的一天是标题 + 搜索；等待安排、可做、打卡只有标题；别的页（有自己页头的）不要顶栏这一行，只留状态栏那一截（`.topbar-inset`，网页版高 0），页面内容直接从状态栏下面开始，不留空行。宽屏的搜索在侧栏顶上，没动；⌘K / Ctrl K 哪一页都能开搜索。
- 检查：`quick-add.test.ts` 加了待安排 / 可做的用例（交给 create 建、不碰我的一天、空白不建）。截图 `work/shots-myday-add/hl-*.png`（脚本 `work/shots-tool/headerless.mjs`）：待安排、可做三皮肤宽屏亮色，待安排暗色，我的一天 macOS 无标题栏模拟，中等宽度 980 的待安排和可做，手机 390 三页（Apple、Material、WinUI），各有加之前和加之后。

### 日记改版：方案 B「心情为中心」✅（2026-10-25；2026-10-28 换成 Feed 流，见下面「日记改版：Feed 流」）
Rei 2026-10-25 看完三个原型（docs/JOURNAL-REDESIGN.md），回复：「按B实现」。按推荐做：B 的情绪月历和心情轮为主，正文借 C 的大字和留白。数据表没改，不用迁移。

- **桌面**：日记页铺满中间和右边两列。左边一列是「日记」标题、「今天」、搜索（打开 ⌘K），下面是情绪月历、「这个月的心情」分布条、这个月写过的日子。右边是那天的日记：页头按心情色铺一层很淡的渐变，大号日期「25」+「周日 · 2026年10月 · 今天」+ 前一天 / 后一天，右上角一张大脸（白底圆，下面写心情名和「点脸换心情」），正文 20px、行距 1.75，没有白框。中等宽度（侧边栏收成图标栏）和右边开着任务详情时，月历那列收窄到 280–340px。
- **情绪月历**：每格铺满那天心情色的淡色，中间画那张脸，左上角日期；写了没选心情是中性灰 + 小笔；没写的浅灰；今天还没写是强调色虚线 + 加号；将来的日子是虚线格，点不了。今天强调色描边，选中的那天深色描边。农历开着时，农历小字跟在日期后面。
- **心情轮**（`MoodWheel.tsx`）：12 张脸排成半圆，左边「开心一点」，中间「平平」，右边「不太好」；中间放大显示选中的那张，名字用心情色。点一下选中，再点一下取消。键盘：整个轮子一个 Tab 停靠点，← → ↑ ↓ 换脸（中间先预览）、Home / End 到两头、回车 / 空格选中、Esc 收起并回到大脸按钮。打开时脸从中间散开，选中时播那张脸自己的动画；系统「减少动效」时都不动。
- **还没写的一天**：页头换成大字「今天感觉怎么样？」（过去的日子「那天感觉怎么样？」）+ 心情轮，下面就是编辑器；桌面写一行「心情可以不选，也可以先写再选」，手机底部按钮「先不选，直接写」（点了光标进正文）。选了心情或开始打字，就换成正常页头；这次打开不再换回来，免得删光字时页面跳。
- **手机 390**：`#/journal` 是情绪月历首页（月历 + 分布条 + 列表），底部固定一个按钮：今天写过是「今天 · 满足 · 接着写」，没写是「写今天的日记」。点一天进那篇；写作页顶部是回月历按钮和「‹ 今天 ›」。我的一天的小卡、⌘K「写今天的日记」、21:00 提醒、深链接 `journal/today` 都直接打开今天那篇（路由带上今天的日期），不停在月历首页。
- **三皮肤**：只改令牌和 `styles/journal.css`、`skin/skins.css`。格子圆角 Apple 12、WinUI 4、Material 16；Material 写作区用 surface-2，心情轮面板 28 圆角，底部按钮是强调色（extended FAB 形状）；WinUI 按钮 6 圆角。亮暗都调过淡色比例（暗色格子 30%、页头 16%）。
- **其他**：旧的 2 × 6 心情按钮（`MoodPicker.tsx`）删了；`MoodIcon` 的 12 个图标和动画没动。core 加 `monthMoodStats`（写了几天、每种心情几天、没选心情几天、不认识的心情几天）。新字符串 19 个，九种语言都补了。
- 检查：core `journal.test.ts` 加了分布统计；client `MoodWheel.test.tsx`（半圆位置、方向键、单选和 Tab 停靠点、窄版不写名字）。截图 `work/shots-journal-b/`（脚本 `work/shots-tool/jb-*.mjs`），和原型 B 并排对比的是 `compare-*.png`。

按原型默认做了，待 Rei 确认：
1. **「这个月的心情」分布条和「写了 N 天」**：原型标的「可选」，按原型做了。长短按天数；写了没选心情的算一段灰色「没选心情」。这个月一篇都没有就不显示。
2. **写作页跟着心情变色**：只在页头铺一层很淡的渐变（亮色 22%、暗色 16%），正文区不变色；没选心情时是强调色很淡的一层。
3. **日记页藏掉新建任务的浮动按钮**：桌面和手机都藏，按 N 和 ⌘K 照样能新建任务。（JOURNAL.md 第 3 节原来定的是保留。）
4. **心情轮选完就收起**：选中或取消后轮子收起，大脸播一次动画；Esc 也收起。原型手机图里轮子一直摊开，这里改成点大脸才打开，免得占掉正文上面一大块。
5. **手机日记首页是月历**：JOURNAL.md 第 4 节原来写「进来是今天那篇」，按原型 B 改成月历首页；从我的一天、⌘K、提醒、深链接进来仍是今天那篇。
6. **列表不再显示字数**：原型 B 的列表只有日期、脸、第一行；字数还在写作页底部。

### 倒数日单独一页，侧边栏加「持续」小节 ✅（2026-10-26）
Rei 2026-10-26 原话：「把倒数日从“打卡”中拆出来单独一个侧边栏入口，把打卡、倒数日、日记放在另一个section：持续」。

- **侧边栏**：今天（我的一天、待安排、可做）· 计划（列表、项目）· 持续（打卡、倒数日、日记）· 资料（资料库、人物）；设置还在底部。中等宽度的图标栏、手机「更多」页跟着同样的分组走。手机标签栏还是 我的一天 · 待安排 · 列表 · 打卡 · 更多（按侧边栏顺序排，所以列表挪到了打卡前面），倒数日和日记在「更多」的「持续」里。
- **「持续」怎么译**：英文 Ongoing；西 Día a día、葡 Dia a dia、俄 Изо дня в день、日 継続、德 Fortlaufend、法 Au quotidien、印尼 Berkelanjutan。这几种照英文意思译，待母语者看。
- **倒数日页**（`pages/Countdowns.tsx`）：图标 Hourglass（打卡是 CalendarCheck2，日记是 NotebookPen）。卡片和原来打卡页里那一节一样，点开是任务详情，提醒、农历重复都在详情里。排序：今天和还没到的在前，越近越前；已经过了的排后面，刚过的在前（以前按任务顺序）。空状态「还没有倒数日」+「考试、纪念日、出发那天，记下来看看还有几天。」。页头按钮「新建倒数日」；这一页的右下角加号和 N 也默认建倒数日（新建面板打开时指定了完成方式，换类型时不跟着类型的默认完成方式变）。
- **打卡页**不再显示倒数日。
- **地址**：`#/countdown`（别名 `#/countdowns`）、深链接 `mindough://view/countdown`（别名 `view/countdowns`）。以前倒数日没有单独的锚点；为了保险，`#/checkin#countdown`、`#/checkin/countdown` 也打开倒数日页。
- 没有计数徽标（打卡、日记也没有）。⌘K 没有「跳到某页」的列表，桌面菜单栏也没有「前往」菜单，所以这两处不用改。数据结构没改。
### 设置分成五项，桌面端单独一个窗口 ✅（2026-10-26）
Rei 2026-10-26 原话：「设置在桌面端做成一个单独的窗口，设置窗口侧边栏：账户、外观」，补充「数据、提醒、任务」，又说「农历、类型、日记这三个可以放在一个」。

- **五项和里面放什么**（原来的七节拆进去）：
  - 账户：登录 / 退出、同步状态和「立即同步」、数据怎么走。
  - 外观：皮肤、语言、明暗、布局、热力图每月 1 号标记。
  - 数据：本机存储（含还没同步的改动数）、导出、导入、从滴答清单导入、重置演示数据，最下面是关于。
  - 提醒：提醒通知总开关（这台设备）、什么时候提醒。只放任务提醒原来就有的内容。
  - 任务：类型（编辑类型）、日记（一天从几点开始、每天提醒写日记，21:00 那个提醒也在这里，不拆到「提醒」）、农历（只在中文界面出现）。
- **桌面 app**：设置是单独的窗口（Tauri label `settings`，`?window=settings`），760 × 560，最小 640 × 440，可以拖大。左边侧栏是 Lucide 图标 + 名字，右边是内容，顶上写当前这项的名字。macOS 和主窗口一样隐藏标题栏，红绿灯浮在侧栏上方，侧栏和右边顶栏都留出 44px，不压内容，空白处能拖窗口。
  - 打开方式：主窗口侧边栏底部「设置」、⌘,（Windows / Linux 是 Ctrl+,）、应用菜单「设置…」（macOS 在 App 菜单「关于」下面，Windows / Linux 在「文件」里）、深链 `mindough://view/settings`（也可以 `view/settings/appearance` 直接到某一项）、手机布局下「更多」里的设置。已经开着就叫到前面，不开第二个；带了某一项就换过去。
  - 两个窗口实时同步：数据（语言、日记、类型、农历订阅）照旧走窗口间的 `mindough:changes`；本机设置（皮肤、明暗、布局、农历开关）、提醒通知开关、登录 / 退出走新的 `mindough:relay` 事件，另一个窗口收到就重新读；同一浏览器的别的标签页也听 `storage` 事件。
  - 设置窗口不跑同步、不传附件。同步状态由主窗口发过来，设置窗口里点「立即同步」交给主窗口去做；「从滴答清单导入…」在主窗口里打开导入窗口；在设置窗口重置演示数据，主窗口先重新载入，1.5 秒后设置窗口再载入，免得生成两份演示数据。
  - 记住上次看的那项（只记在本机）。
- **Web 和手机**：仍是页面，分类一样。宽屏左边一列五项、右边内容；窄屏（≤ 760，也就是手机布局）先列出五项，每项下面一行小字说里面有什么，点进去整页推入，左上角「‹ 设置」返回。hash 能深链到某一项：`#/settings/account|appearance|data|reminders|tasks`；旧的 `#/settings` 照旧能用（宽屏显示上次那项）。登录回跳到 `#/settings/account`。
- **键盘**：侧栏的五项是链接，Tab 能到；在侧栏里按 ↑ ↓（Home / End）换项，焦点跟着走。
- 新字符串 10 个，九种语言都补了。Rust 改了 `menu.rs`（「设置…」菜单项和 CmdOrCtrl+, 快捷键）；capabilities 给 `settings` 窗口同样的权限，另加 `core:window:allow-set-title`（换语言时改窗口标题）。
- 检查：`deeplink.test.ts` 加了 `#/settings/<项>` 和 `view/settings/<项>`；截图 `work/shots-settings-win/`（脚本 `work/shots-tool/settingswin.mjs`）。桌面窗口在沙箱里跑不了，截图是用 Web 的 `?window=settings` 按 760 × 560 模拟的；真机 Tauri 还没验。

### 整页不再能滚 ✅（2026-10-26）
Rei 2026-10-26 报 bug：「整个页面居然可以滚动」。截图是 macOS 桌面版、暗色：整个界面往上跑了一截，侧边栏顶上的项目压在红绿灯下面，窗口下面三成是空白，列表最后一行被切掉。

- **根因**：两件事叠在一起。
  1. 外层只写了 `overflow-x: hidden`（10-17「页面不能左右移动」时加的）。横向设成 hidden，浏览器会把纵向也算成 auto，于是 `#root`、`.app` 成了能滚的盒子。
  2. 会滚的列（`.main`、`.main-scroll`、侧边栏）没有 `position`。列表里 `position: absolute` 的东西，比如 React Aria 开关、复选框里藏着的 input，参照物就成了外面的 `.main-col`，不受这一列裁剪，排在长列表底下把 `.app` 撑高。设置页撑出 172–475 px，列表（日程）页撑出 1000 多 px。
- **结果**：这几种操作都会把整个 `.app` 往上推：在侧边栏上滚滚轮（macOS 无标题栏时侧边栏本身不滚，滚动交给外层）、时间轴页打开时 `scrollIntoView({ block: 'center' })` 定位「今天」（一打开就上移 19 px）、键盘和聚焦把行滚进视野。手机网页也一样：列表、可做、设置三页整页能滚，顶栏会被滚走。
- **改法**：
  1. `html` 设 `overflow: hidden`；`body`、`#root`、`.app` 设 `overflow: clip`（连脚本都滚不动；老 WebKit 不认就退回 hidden）。桌面布局再加 `overscroll-behavior: none`，整页不回弹；手机网页不加，保留浏览器的下拉刷新。
  2. 侧边栏、导航、`.main`、`.main-scroll`、详情框、`.pane-body` 都加 `position: relative`，里面的绝对定位元素被各自那一列裁住。
  4. 时间轴页定位「今天」、详情里方向键切换任务、Markdown 脚注跳转，改用 `lib/root-scroll` 的 `scrollIntoContainer`：只滚最近的那一列。
  5. 兜底：`installRootScrollGuard` 监听外层的滚动，桌面布局、鼠标操作时一被滚动就归零。手机、触屏、软键盘弹出（可见区域变矮）、手指放大时不拦，系统要滚整页让输入框露出来。
- **验证**：Playwright 在 Chromium 和 WebKit 里跑（`work/shots-tool/noscroll*.mjs`）：我的一天、待安排、时间轴、项目、资料库、人物、日记、打卡、设置逐页点开，各在中列和侧边栏上滚滚轮，再按方向键、End、Home、PageDown、空格，点最后一行开详情，编辑器里连打 40 个回车，开关 ⌘K 和新建面板，窗口变矮再变高，最后脚本强行滚外层。修前列表、设置两页 `.app` 被推上去；修后每一步 `window.scrollY` 和外层 `scrollTop` 都是 0。修前修后同一状态截图逐像素比：只有列表页不一样（修前整页上移了 19 px）；其他页在 Chromium 里逐像素相同，WebKit 里资料库、打卡有一百来个像素的差别，Chromium 里没有，判断是图片和动画的抖动。
- **桌面版要重新打包才有效**：Tauri 打包的是本地资源，网页版部署后马上生效，装在 Mac 上的 App 要等下一次打包。

### 项目页：列表 / 看板 / 时间轴 / 任务链，右上角视图和排序，顶上换成添加框 ✅（2026-10-26）
Rei 2026-10-26 原话：

- 「每个项目的视图支持列表、看板、时间轴，排序支持创建时间、修改时间、开始时间、到期时间，正序、倒序。视图和排序放在右上角图标按钮，点击dropdown。新建任务也统一换成输入框。标题和图标左上角，小一点，和右侧图标对齐」
- 「关系图完全去掉」
- 「添加另外一个视图：任务链」
- 「把项目中的任务关系按照任务链排列」

做了什么（项目页 = 单个项目的任务页，代码里是 group）：

- **页头**：左上角项目图标 + 名字，名字 18px（手机 17px），后面跟一行小字（起止时间 · 分类 · 默认类型，放不下就省略，手机不显示）；右上角两个图标按钮，和标题在同一行、同高（32px）、垂直居中。页头里原来只有「新建任务」一个按钮，没有「编辑项目」「更多」，所以没加第三个「…」。macOS 无标题栏的拖动条在 `App.tsx` 里，没动。
- **视图**（右上第一个按钮，图标跟着当前视图变）：列表（layout-list）、看板（kanban）、时间轴（gantt-chart）、任务链（workflow）。React Aria 菜单，单选打勾。原来的「卡片」视图不在 Rei 说的里面，一起去掉了。
- **排序**（右上第二个按钮，arrow-up-down；改得和默认不一样时图标变强调色）：两组，「排序依据」创建时间 / 修改时间 / 开始时间 / 到期时间，「顺序」正序 / 倒序。没有这个日期的任务正序倒序都排最后；值一样时按任务的 `sort` 字段、再按创建时间，结果稳定。
  - 默认是**创建时间倒序**，新加的在最上（2026-11-08 起，见下面「项目页默认按创建时间倒序」）。原来的「默认顺序」（`sort` 字段）删了。
  - **开始时间** = `scheduled_date`（界面上的「日期」）。**到期时间**：倒数日取 `target_date`（目标日），其他任务也取 `scheduled_date`（只有一个日期，它就是要做 / 截止的那天）。**创建时间** = `created_at`；**修改时间** = `updated_at`（HLC，按字符串比）。任务表没有单独的开始、到期两列，没改数据结构。
- **每个项目记住自己的视图和排序**：存在本机设置 `settings.projectViews`（项目 id → 视图、排序、正倒序、时间轴缩放），不同步、不改项目表。读到认不出的值，或以前存的「关系图」「卡片」，都回落成列表。
- **看板**：按状态分四列 待办 / 进行中 / 完成 / 关闭，列内按当前排序。卡片就是列表那一行（勾选、太阳、右键菜单都在）。拖到别的列就改成那一列的状态，结束态照常弹「已完成…接下来可以做…」和撤销。键盘：聚焦卡片左边的拖动把手按回车，方向键换列，回车放下（React Aria 拖放）。放不下四列时整个看板横向滚动（手机每列约 78% 屏宽）。
- **时间轴**：每件有日期的任务一行，横条从开始画到到期；只有一个日期就画一天。日 / 周 / 月三档缩放（本机记住，默认周），红色今天线，打开时滚到今天附近；任务名一栏贴在左边，横向滚动时不动。本项目里两件都在时间轴上的前后关系画箭头（前一件的尾 → 后一件的头）。没有日期的放下面「未定时间 N」。
- **任务链**：项目里由前后关系连起来的任务排成一条条任务链，排法和详情「任务链」完全一样（core `projectChains` 和 `taskChain` 共用一套分层 `layerNodes`）：先做完的在上，每一步写相对时间，分叉 / 汇合时一步里叠几件、写「接在「X」后面」。链上别的项目的前置 / 后续也列出来，标「在「项目名」里」（不在项目里的标「不在项目里」），点开就是那件任务，链不断开。只走本项目任务的上游、下游，不顺着别的项目的兄弟任务往外扩。排序菜单只决定链的先后（看链首：链里按依赖排第一的本项目任务在当前排序里的位置），链内顺序只看依赖。没有前后关系的任务放最后「单独的任务 N」，有链时默认收起。详情的步骤组件抽成 `ChainSteps`，两边共用。
- **新建任务**：项目页顶上换成添加框（复用 `components/QuickAddBar.tsx`，和我的一天、待安排、可做同一个），占位「这个项目里要做什么？按回车添加」，读屏名「添加任务到这个项目」。回车建到本项目（带项目的默认类型），马上打开详情；看板里新任务是待办，自然在待办列。项目页不再显示右下角新建按钮（N 和 ⌘K 照旧）。
- **关系图完全去掉**：删了 `DependencyGraph.tsx`、`LazyGraph.tsx`、`lib/graph-layout.ts` 和它的单测、`TaskCard.tsx`（只给卡片视图用）、`.graph*` / `.react-flow*` / `.legend*` / `.task-card*` 样式，依赖 `@xyflow/react`、`elkjs`（只有关系图用）；字符串「关系图」「正在加载关系图…」「正在排布…」「相关（不分先后）」「卡片」九种语言都删了。项目页没有地址参数选视图，旧链接 `view/graph`、`#/graph` 照旧打开我的一天。详情里的「任务链」「关系」区不是关系图，留着。
- 新字符串 31 个，九种语言都补了（法语标点前用不换行空格）。
- 检查：core `project-chains.test.ts`（链和详情任务链分层一致、跨项目不断链、不拉进兄弟任务、链的先后跟排序、删掉的不算）；client `project-view.test.ts`（设置回落、开始 / 到期字段、各字段正倒序和没日期排最后、看板分列、时间轴区间和位置）。截图 `work/shots-project-views/`（脚本 `work/shots-tool/project-views.mjs`）：四种视图 × 三皮肤宽屏亮色、Apple 宽屏暗色、Apple 中等宽度 960、手机 390（Apple 亮色、Material 暗色），两个菜单打开（宽屏、手机），看板添加后。

### 滴答清单导入：时间范围对所有任务生效 ✅（2026-10-26，详见 [docs/IMPORT-DIDA.md](IMPORT-DIDA.md)「时间范围」）
Rei 2026-10-26：「之前导入dad365的问题解决了么，选择30天实际是全部的问题」；16:08 又说「现在是可以选30天、半年、全部的，但选择了30天，还是会导入全部」。
- **原因**：范围只传给已完成的接口；未完成、已放弃的全部拉进来；备份文件导入没有这个选择器。
- **改了什么**：选择器挪到两种方式共用的位置，叫「导入哪段时间的任务」，选项改成 全部 / 最近半年 / 最近 30 天（去掉「最近一年」「不导入已完成的」；不想要某种状态，预览里还有三个开关）；下面写「按任务最后修改或完成的时间算。」。core `dida/range.ts` 统一筛：未完成看修改时间（没有看创建时间），已完成看完成时间，已放弃看修改时间；「全部」不筛；没有时间的照样导入并提示。连账户时最后在本地再筛一遍；已完成接口要是没按时间筛，不再对半切，靠本地筛兜底。预览里写「另有 N 件不在所选时间范围里，没读进来」。
- `fetchDidaAccount` 的选项 `completedDays` 改名 `days`，加 `completed?: false`；返回多了 `dropped`。
- 测试：core `test/dida.test.ts` 加未完成 / 已放弃按范围筛、接口不筛时本地兜底、请求体时间写法、备份文件 30 天 / 半年 / 全部。
- 没验证：真实账户上已完成接口是否按时间筛、API 任务里有没有 modifiedTime（Open API 文档的任务字段里没写）。

### 计数的步长和快捷按钮 ✅（2026-10-26）
Rei 2026-10-26：「这个计数，如果是喝2000mL水的话，每次只能加1，太不合理了吧，有什么合理的方式么？」看了方案回「完美」「按这个实现」。

- **每次加多少**：设置里第二行「每次加 [250] mL」。选或改单位时自动填：mL 250、页 10、分钟 5、次 1，别的常见单位按合理值（L 0.5、公里 1、步 1000、千卡 100…，表在 core `count.ts`），自定义单位 1。手改过步长就记一个 `step_set`，之后换单位不再覆盖。
- **快捷按钮**：任务上最多三个，比如「+250」「+500」；设置第三行能改、删、加。没改过时默认是步长和步长 × 2，单位是「次」只给 +1。列表行在电脑上全放，手机上只放第一个；详情底栏和进度弹层全放。
- **手输**：点当前数字变成输入框。选的是「直接改成总数」：喝水这类场景，人看着杯子知道「现在一共喝了多少」，比算「这次喝了多少」顺手。想加一个量也行，输「+330」就是加 330，「-100」是减。改成总数记成一条差值事件（可以是负数），进度照旧只由 check_in 累加，多端合并不受影响。
- **撤销**：每次加量都有提示「加了 250 mL」+「撤销」；详情底栏和进度弹层里有「撤销上一次」，撤这个周期最后一次加量。撤销就是给那条 check_in 打墓碑（`store.undoCheckIn`），会同步到别的设备。只做一次的任务因为这次加量才完成的，撤销后不再达标就改回待办；完成提示里的「撤销」也走这个。
- **数据**：任务加一列 `count_config`（JSON，SQLite 迁移 v9，默认 `{}`）：`{ step, step_set, quick }`。没有现成的计数配置 JSON，所以新开一列；云端存整行 JSON，不用动云端 schema，照行级 LWW 同步。老任务（还没有这列，或拉下来的旧行）在内存里补成 `{}`：步长 1、只有一个 +1，和以前一模一样；改过单位或步长才写进配置。导出导入多一个 `count` 字段（docs/EXPORT.md）。演示数据里「读书 30 页」「跑步 5 公里」带上了步长。
- **小数**：步长、快捷量、手输都能是小数，最多两位；累加后四舍五入到两位，免得出 0.30000000000000004。目标还是至少 1。
- 测试：core `test/count.test.ts`（默认步长、换单位不覆盖手改、快捷按钮默认 / 改 / 上限、手输解析、加量完成后撤销改回待办、撤销上一次、老数据补空对象）。截图在 `work/shots-count-step/`。

### 设置拆成七项：关于、日记单独一项；侧栏不左右滚；数据流向改对 ✅（2026-10-26）
Rei 2026-10-26 原话：

- 「这个页面的底部的关于念头团的说明，可以放在一个单独的选项卡：关于」（截图是设置 → 数据页底部那块）
- 17:12「设置的侧边栏禁止左右滚动」
- 17:13「这个数据流不对吧，其他设备不也要通过worker么？」（截图是设置 → 账户的流向图：这台设备 → Worker → Turso（东京）→ 其他设备，窄了以后箭头单独掉到第二行）
- 17:17「设置中日记单独一个tab」

改了什么：

- **七项**：账户、外观、数据、提醒、任务、日记、关于。桌面设置窗口、Web 宽屏侧栏、窄屏列表三处都一样。
  - 关于（Lucide `Info`）：app 图标、名字（中文界面念头团，其他语言 Mindough）、「版本 0.1.0 (60eeba0)」、「数据先存在这台设备上，离线也能用」、TMDB 署名（logo + 英文原文，中文界面再加一行中文）。数据页底部不再有这块。署名照原样搬过来：仓库里原本只有 TMDB 的署名，豆瓣、Open Library、Steam 没有现成署名，这次没加。
  - 版本号：`vite.config.ts` 用 define 注入 `__APP_VERSION__`（读 `src-tauri/tauri.conf.json` 的 version，和安装包一致）和 `__GIT_SHA__`（`GITHUB_SHA` 前 7 位，没有就跑 `git rev-parse --short HEAD`，再没有就不写）。`lib/version.ts` 拼成「0.1.0 (60eeba0)」。2026-11-03 改了：完整版本由 `scripts/app-version.mjs` 算，显示成「v0.1.0-alpha.13」或「`v0.1.0-dev+<短哈希>`」，见「版本号分得出第几个 alpha」。
  - 日记（Lucide `NotebookPen`，和侧边栏日记页同一个图标）：一天从几点开始、每天提醒写日记（21:00）。任务页只留类型和农历。
  - 深链：`#/settings/journal`、`#/settings/about`，`mindough://view/settings/journal|about`。旧的 `#/settings/tasks`、`#/settings/data` 照旧能打开（原来没有指向日记或关于的锚点，不用另做跳转）。
  - macOS 应用菜单「关于念头团」还是系统默认的关于面板，Rust 没动。
- **侧栏不左右滚**：设置窗口的 `.settings-side` 纵向照旧能滚（项多、窗口矮时），横向 `overflow-x: hidden` + `overscroll-behavior-x: none` + `touch-action: pan-y`；侧栏列表 `.settings-nav`（窗口和 Web 宽屏共用）`overflow-x: clip`，纵向保持 visible，不会多出一个能纵向滚的外层（29ea3bd 的教训）。名字太长截断加省略号。
- **数据流向**：同步的推送、拉取都走 Worker 的 `/api/sync/*`，其他设备也一样。改成 Worker 在中间：这台设备 ⇄ Worker ⇄ 云端库，其他设备 ⇄ Worker，箭头都是双向（Lucide `ArrowLeftRight`）。格子上的字：这台设备「先存在这里」、Worker「核对是你本人，转发改动」、云端库（Turso（东京）/ Cloudflare D1，按服务器的 STORAGE_BACKEND）「保存一份」、其他设备「也经 Worker 同步」。上面那段说明也改成「你的其他设备也经 Worker 同步」。
  - 排法按这块自己的宽度切（容器查询，不看窗口宽度）：≥ 560px 排成 T 字，上一排三格，其他设备在 Worker 正下方；窄了两列竖排，这台设备、其他设备在上，Worker、云端库各占一整行，箭头转 90°。格子和箭头都在网格里固定的位置，不会再有掉到下一行的箭头。设置窗口 760 × 560 里走竖排。
- 新字符串 9 个、改 5 个，九种语言都补了。
- 检查：typecheck、全部单测（`deeplink.test.ts` 加了 journal / about，`cloud.test.ts` 改成新说法）。Playwright `work/shots-tool/settings-about.mjs`：三种皮肤宽屏、390 手机、模拟设置窗口 760 × 560；七项和顺序、关于内容（含版本号）、数据页没有关于、任务页没有日记、日记页内容、流向图宽时 T 字窄时竖排、窗口里流向图不超出内容区；侧栏用滚轮横扫、脚本设 `scrollLeft`、德语和俄语加超长名字，`scrollLeft` 都是 0，长名字有省略号。截图在 `work/shots-settings-about/`。桌面 Tauri 窗口和 macOS 触控板没在真机上试。

### 设置 → 任务：日期显示（自动 / 相对时间 / 年月日 / 年月日+时区）✅（2026-10-26）
Rei 2026-10-26 原话：「设置-任务：支持自定义日期显示格式，相对时间、年月日、年月日+时区、自动等」。

- **四种方式**（设置 → 任务 →「日期显示」，单选，每项右边用今天（带现在的时刻）和三天后做实时预览）：
  - 自动（默认）：和以前一模一样。列表行前后两天内说今天 / 明天 / 昨天 / 后天 / 前天，再远写「10月29日 周四」；详情同上，不是今年的带年份；倒数日卡片「11月19日 周四」；任务链 30 天内「N 天后」，再远写日期。
  - 相对时间：一律相对，「3 天后」「6 天前」「2 个月后」「1 年后」；30 天内按天，一年内按月，再远按年。中文自己拼（数字和单位之间有空格），其他语言用 `Intl.RelativeTimeFormat`，单独成标签时首字母大写（In 3 days）。
  - 年月日：按界面语言的本地格式（`Intl` dateStyle medium：2026年10月26日 / Oct 26, 2026 / 26.10.2026 / 2026/10/26），当年也写年份；带时刻的跟着写时刻（中文 24 小时，其他语言按习惯）。
  - 年月日+时区：年月日（和时刻）后面带「GMT+8」这样的偏移，按任务时区（没设就按设备时区）在那天的偏移算，夏令时也对；这时日期旁边原来的「UTC−4」小标注不再重复显示。提醒时间在这种方式下也带时区（「21:00 GMT+8」），其他方式只写时刻。
- **统一走 core**：`packages/core/src/date-display.ts` 的 `formatTaskDate(date, { mode, today, time, timeZone, compact, locale })`、`formatTaskTime`（提醒时刻）、`formatTaskInstant`（创建 / 修改这类时间点）。`chainWhenLabel`、`describeCompletion` 多了一个可选的 mode 参数，不传就是自动。
- **用到的地方**：任务列表行（含项目看板卡片，用的是同一个行）、详情日期胶囊和提醒胶囊、新建任务面板的日期 / 提醒胶囊、详情里倒数日进度下面那行、倒数日完成方式摘要和目标日期按钮、任务字段里的日期（出发日期这类）、倒数日卡片的日期文字、任务链步骤标签、项目时间轴横条上的日期。
- **不跟着变**：我的一天 / 列表的日期分组标题、日期选择器、农历小字、日记和日记月历、时间轴刻度、打卡热力图、人物生日、项目（组）的起止日期、「每年 · 下次…」这类重复规则说明。倒数日「还有 N 天」大数字不变。界面上现在没有地方显示任务的创建 / 修改时间，`formatTaskInstant` 先备好、有单测，等以后有显示的地方再接。
- **存哪**：本机设置 `dateDisplay`（`mindough:settings`），不进同步数据；桌面多窗口经 `mindough:relay` 跟着变，同一浏览器别的标签页听 `storage`。调试可以在地址栏加 `?dates=relative|ymd|ymd-tz`。
- 新字符串 6 个、改 2 个，九种语言都补了。
- 检查：core `test/date-display.test.ts`（四种方式 × 中英 × 当年 / 跨年 × 有无时刻，另有德语、日语、印度时区、纽约夏令时、提醒时刻、时间点、倒数日摘要、任务链）；全部单测、typecheck。Playwright `work/shots-tool/date-display.mjs`：设置里四项和预览、点选后存进本机设置、回到倒数日页文字变成年月日、「还有 N 天」不变；四种方式下倒数日页、可做页、详情各截一张；英文、设置窗口 760 × 560 暗色、390 手机（窄时预览换到名字下面一行）。截图在 `work/shots-settings-about/date-display-*.png`。

### 界面上「类型」改叫「资料库」✅（2026-10-26）
Rei 2026-10-26 原话：「新建任务是“类型”对应“资料库”，可以统一名称么？」；方案（任务上直接叫「资料库」：选「影视」就是放进影视库，默认「不放进资料库」，和「不放进项目」一个样子；设置里的「类型」也改叫资料库）回「开工，都改成资料库」。

- **改了什么**：凡是用户看得到的「类型」都改成「资料库」。任务属性胶囊和选择器（标题「资料库」，选项是各库的名字，空选项「不放进资料库」，原来叫「普通」；没放进库时胶囊照旧不显示）、新建面板（弹层说明「放进资料库后，卡片换成它的样子，还会带上一组要填的信息。」）、设置 → 任务的「资料库」一节（行名「全部资料库」，按钮「编辑资料库」，说明「N 个，另有 M 个已归档…」，列表小字「资料库、日期显示、农历」）、资料库编辑器（标题「资料库」、「新建资料库」、新建默认名「新资料库」、名字框「资料库名字」、「归档这个资料库」、「已归档的资料库」）、资料库页的「编辑」按钮（读屏名「编辑资料库」）、项目的「默认资料库」、导入预览「N 个资料库」、导入出错「找不到它的资料库，没导入 / 没放进资料库」、出错提示「资料库不存在」。
- **新加一句**（2026-10-28 起作废）：当时详情里资料库选择器底下轻提「换资料库会清空原来的资料」。多类型与多资料上线后任务上没有资料库选择器了，这句和「不放进资料库」一起去掉。
- **英文**：Collection（导航里的「资料」本来就是 Collections，资料库页 Library 不变）。属性名用 `trc('属性', '资料库')` = Collection，编辑器标题 `trc('资料库编辑器', '资料库')` = Collections；不带语境的 `tr('资料库')` 还是页面名 Library。其他七种语言跟着换成各自「收藏 / 集合」的说法（Colección、Coleção、Коллекция、コレクション、Sammlung、Collection、Koleksi），和各自导航里的「资料」一致。
- **不改**：表 `task_type`、字段 `type_id` / `type_data`、`default_type_id`、偏好 `type_order`、代码里的 Type / TypeManager / typedef、导出文件（`_meta/types.json`、front matter `type:`、`default_type:`）、深链接 `new?type=`。内置「普通」的数据名还是「普通」（DATA 词典里留着），界面上只在选择器里换成「不放进资料库」。新加别名：`mindough://new?library=movie`（和 `type=` 一样）、`mindough://view/settings/library`（或 `types`）打开设置的「任务」那项。
- **撞名先不动**：资料库里有个内置的「项目」库，和侧边栏的「项目」同名；这次改名不处理，等 Rei 定。
- 检查：i18n 单测（九种语言 key 一样全）、deeplink 单测（`library=` / `type=` 都认、`view/settings/library`）、全部单测、typecheck；截图在 `work/shots-rename-library/`。

### 日期段 ✅（2026-10-26）
Rei 2026-10-26 17:26 原话：「现在的日期只是单个日期，要支持日期段」。之前问过项目页时间轴要不要单独的到期日，日期段就是答案。

- **数据**：任务加一列 `end_date`（结束日，可空，SQLite 迁移 v10）。开始日还是 `scheduled_date`。结束日只会晚于开始日：等于开始日、早于开始日、没有开始日时都存空（core `date-range.ts` 的 `normalizeRange`，`store.createTask` / `updateTask` 写之前都过一遍）。空 = 单日，老任务都是单日，打开时内存里补 null。云端存整行 JSON，不用动云端 schema，照行级 LWW 同步。导出导入多一个 `end_date`（docs/EXPORT.md）。Rust 端没有自己的 schema，不用改。
- **选日期**：日期面板（详情胶囊、新建面板）多一个「单日 / 日期段」切换。日期段下面是两格「开始 10月26日」「结束 10月30日」，点哪格就只改哪一头；默认点起点再点终点，中间一条浅色带。等结束时点在开始之前，就把开始挪过去，继续等结束；点开始当天等于回到单日。选好结束日弹层就关。快捷图标（今天 / 明天 / 本周末 / 下周一）在日期段里把开始挪到那天、天数不变。「去掉结束日」回到单日，「不设日期」两头一起清。农历小字照常，农历选择在日期段里也是改当前那一头。待安排页、倒数日的目标日还是单日。（2026-11-01 起点法改成方案 A，见「日期面板方案 A」。）
- **深链**：`new` 多一个 `end=`，写法同 `date`（today / tomorrow / 2026-10-30）；没有 date、或不晚于 date 就当没写。
- **显示**：单日照旧。日期段写「10月26日 – 30日」「10月30日 – 11月2日」「2026年12月30日 – 2027年1月2日」：同月省掉月份，跨年两头都写年份；不跨年但不在今年时开头带年份。其他语言用 `Intl.DateTimeFormat#formatRange`，省略规则按各语言（英文「Oct 26 – 30」「Dec 30, 2026 – Jan 2, 2027」）。日期段不写「今天 / 明天」，也不写星期。
- **视图**：
  - 时间轴（Agenda）：放在开始那天，行里小字写整段日期；段跨过今天时今天也放一份，小字「第 3/5 天」。开始日在「更早的 N 条」之外、还没结束的，今天照样有，不算进 N。
  - 我的一天：今天落在段里、还没到结束日的进「建议」，理由「这几天要做」；到了结束日或过了才是「今天到期」。只建议，不自动加入。
  - 过期看结束日：段里不算过期。任务链每一步的「已过 / 明天」也按结束日算。
  - 项目页：时间轴从开始画到结束；排序「开始时间」用 `scheduled_date`，「到期时间」用结束日，没有就用 `scheduled_date`；倒数日仍用目标日。
  - 可做：没改，照旧只看前后关系（现在的逻辑里没有按开始日筛，见「待确认」）。
  - 提醒：照旧是开始那天的提醒时间，段里其他日子不提醒。
- **取舍**：
  - 结束日存在任务上，不另开表，也不复用倒数日的 `target_date`（倒数日是另一种完成方式，两个可以同时有）。
  - 重复任务不带日期段：新建面板里有重复时不存结束日。
  - 滴答清单导入还是只取开始日，截止日照旧写进正文：全天任务的截止是不是「不含当天」没核对过，先不变成日期段。
- **四种日期显示都支持日期段**（接在上面「日期显示」的 `formatTaskDate` 上，core `formatTaskDateRange`）：自动「10月26日 – 30日」；相对时间「今天 – 4 天后」；年月日一律带年份「2026年10月26日 – 30日」（其他语言 Intl formatRange + dateStyle medium，如「Oct 26 – 30, 2026」）；年月日+时区再带开始那天的「GMT+8」。详情胶囊、新建面板胶囊、列表行、Agenda 的整段小字都走它。
- 测试：core `test/date-range.test.ts`（迁移 v9 → v10、读写、老行补空、结束日规则、导出导入、中英文格式、选择器点法、快捷项、格子角色、Agenda 分组、过期、我的一天建议、任务链、提醒不变）；client `project-view.test.ts`（到期取结束日、两种排序、时间轴宽度）、`deeplink.test.ts`（end 参数）。截图在 `work/shots-date-range/`。

### 打卡分类、项目分类合成一套「类型」；侧栏「资料」改叫「管理」，加「类型」入口 ✅（2026-10-26）
Rei 2026-10-26 原话：「还有“打卡分类”，“倒数日分类”，项目分类，这些是否可统一呢？」。方案是合成一套（名称、颜色、图标），任务和项目共用，打卡、倒数日、项目页各自只列用到的，现有的 27 个打卡分类和项目分类自动合并，同名并成一个。Rei 回：「名称统一成“类型”合成一套，这套分了可以在设置-任务中修改，和资料库一样，可以添加、不显示、修改、不能删除。」
18:02 又补了一句：「主窗口侧边栏的“资料”section，更改成“管理”，任务入口删掉，添加一个“类型”入口」。

做了什么：
- 数据：统一用 `category` 表（名称、颜色、图标、builtin、hidden、sort、merged_into），任务加 `category_id`，任何任务都能挂；项目还是 `group.category_id`。逻辑在 `packages/core/src/categories.ts`。
- 迁移 v11（v10 是日期段的 end_date）：加列；打卡分类按原 id 拷进 `category`；任务的 `checkin_category_id` 抄到 `category_id`。这一步不改时间戳、不进 outbox，每台设备各迁一遍结果一样。
- 同名合并在 Store 打开时做：名字去首尾空格、不分大小写一样的并成一个。内置的留下，其次 sort 小的、id 小的；缺的图标 / 颜色从被并的补；几个都不显示才不显示。被并的打墓碑、记 `merged_into`，任务和项目上指着它的改指留下的。演示数据里项目分类「工作」就并进了内置的「工作」。
- 同步兼容旧客户端：拉到旧的 `checkin_category` 行按同 id 映射进 `category`；拉到缺新列的 `category` 行，图标、不显示、顺序用本机的；拉到没有 `category_id` 的任务用它的 `checkin_category_id`。本机写任务时把 `category_id` 抄进 `checkin_category_id`，旧客户端也认得。已经并掉的，旧客户端再改也不复活。云端只存整行 JSON，服务端不用改；rusqlite 端跑的是同一份迁移 SQL，也不用改。
- 规则：能加、改名 / 颜色 / 图标、不显示，不能删（`store.remove('category')` 直接报错）；改名撞名不改，新建同名就用已有的那个（不显示的会重新显示）。
- 界面：任务属性胶囊「类型」对所有任务开放（排在资料库后面），选择器还是「常用 6 个 + 更多」+ 搜索，底部「管理类型…」去设置 → 任务；新建面板底下一个收起的「类型」选择；项目新建和项目页名字下面用同一个选择器；打卡页、倒数日页、项目页按类型筛选 / 分组，只列用到的；设置 → 任务加「类型」一节（「编辑类型」打开编辑弹层）。
- 侧栏：「资料」改叫「管理」，下面是 资料库、人物、类型（18:54 起人物入口删掉，见下一节）；中等宽度图标栏和手机「更多」页跟着变。小节里本来就没有「任务」入口（只有资料库、人物），所以没删东西，汇报给 Rei 了。小节 id 还是 `library`，本机记的收起状态不丢。
- 类型页 `#/types`（深链 `view/types`，别名 `categories`）：左边是和设置里同一个编辑组件 `CategoryEditor`，点一行右边的箭头看挂了它的项目和任务（`#/types/<id>`）；手机先列表，点进去整页看。

替 Rei 定的、待确认：
- 英文叫 Category（资料库已经叫 Collection）。
- 新建面板里「类型」放最底下、默认收起，不打扰快速新建。
- 合并时颜色：留下那个是默认灰才用被并的颜色。
- 打卡页的「编辑」和选择器底部的「管理类型…」都跳到设置 → 任务（桌面 app 里开设置窗口），不再弹本页的弹层。（2026-10-28 改成跳到类型页，见下面「类型页改版：方案 C」。）

### 侧栏去掉「人物」；资料库能「在侧边栏显示」✅（2026-10-26）
Rei 2026-10-26 18:54 原话：「侧边栏的：管理-人物入口删掉」（18:02 那句「任务入口删掉」指的就是人物，打错了字）。
18:55 又加一句：「资料库中，任何一个资料库都可以“在侧边栏显示”，“取消在侧边栏显示”」。

做了什么：
- 「管理」一节只剩 资料库、类型；中等宽度图标栏、手机「更多」页一样。人物页本身没动：`#/people`、`#/people/<id>`、深链 `view/people`、`person/<id>`、⌘K 搜人物、任务详情点人物都照旧。
- 人物的入口改成资料库页标签条里的「人物」。人物合并、「可能重复 N 组」本来就在资料库页（人物库就是资料库里的一个库），不靠侧栏那一项，所以没有丢入口。
- 在人物页、人物详情时，侧栏亮「资料库」；人物库放进侧边栏后，亮它自己。
- 每个资料库（内置、自定义、人物库都行）能「在侧边栏显示 / 取消在侧边栏显示」。开关放在三处：资料库页标签条末尾 ··· 菜单（对当前这个库）、标签右键 / 长按、设置 → 任务 → 编辑资料库列表每行的侧栏按钮（亮着 = 在侧边栏）。侧栏里那一项自己也能右键「取消在侧边栏显示」。
- 显示的库挂在「资料库」下面，图标往里缩一点，名字用库名（影视库、书库…），点了直接进那个库；顺序跟资料库顺序走。默认都不显示。归档的库不出现，取消归档后回来。人物库不在编辑资料库列表里（它本来就不在），只能在资料库页开关。
- 存储：同步偏好 `library.sidebar`（类型 id 列表，core `LIBRARY_SIDEBAR_PREF`、`store.sidebarLibraries()` / `setLibraryInSidebar()`），不加列、不加迁移，也不改类型行。没按「资料库定义上的字段 + 迁移 v12」做，理由：
  1. 改类型行会让内置资料库算作「用户改过」，以后内置升级就不覆盖它了。资料库排序（`type_order`）也是因为这个才单独存成偏好。
  2. 旧客户端只认识已知的列。它改一下库名、推上来的整行就没有新列，LWW 后侧栏设置就丢了。偏好行旧客户端原样留着，不会碰。
  3. 还是跟着账户同步，各设备一致。代价是两台设备同时改，后改的整张列表赢；这个开关不常点，可以接受。
- 测试：core `test/library-sidebar.test.ts`（默认不显示、顺序跟资料库、取消、归档、普通类型不出现、两台设备同步）；client `lib/nav.test.ts`（「管理」一节没有人物、`#/people` 路由还在、库的入口地址、哪一项亮）。截图在 `work/shots-remove-people-nav/`。

替 Rei 定的、待确认：
- 侧栏里显示库名（影视库），不是标签条上的短名（影视）。
- 侧栏那一项不跟库的颜色走，图标和别的入口一样是灰的。
- 手机上在库里时，顶栏标题是库名。

### 网页版搬到 app 域名，旧域名留给介绍页 ✅（2026-10-26）
Rei 2026-10-26 19:12：「那就把app搬到 app.mindough.rei8t.dev，mindough.rei8t.dev留给介绍页」。

- 同一个 Worker `mindough` 挂两个 custom domain。`app.mindough.rei8t.dev` 出网页版和全部 API；`mindough.rei8t.dev` 根路径出介绍页（`apps/server/src/landing/`）。地址常量：Worker 在 `src/hosts.ts`，客户端在 `src/lib/origins.ts`，原生端（Tauri 桌面、Android、iOS）默认连 app 域名；Tauri CSP 两个地址都放行。
- 旧域名的 `/api/*`、`/auth/*` 不跳转、照常服务。原因：老的 alpha.5 桌面 / 安卓包写死了旧地址，POST 遇到 308 要重发、预检也可能被拦；Google 登录的回调地址要和控制台登记的一致，旧地址的登记还在；正文里存的图片地址是 `https://mindough.rei8t.dev/api/assets/…`，这个地址得一直能打开。新上传的图片用请求的域名，所以以后是 app 域名。
- 旧链接：介绍页的脚本看到 `#/…`、`?task=` 这类 app 地址，或者是从主屏幕打开的旧 PWA，就 `location.replace` 到 app 域名同一路径。
- 本机数据：网页端数据在浏览器 OPFS 里，按域名隔离，新域名一开始是空的。登录过、同步完的，到新域名登录就同步回来。没登录过的会留在旧域名。所以介绍页先看这个浏览器在旧域名有没有本机数据（OPFS 里 app 的库，或更早的 localStorage 数据）；有就先显示「网页版搬到了新地址」的提示，不自动跳。提示里两个按钮：「在旧地址导出备份」打开 `https://mindough.rei8t.dev/local/#/settings/data`（旧域名其他路径照旧出 app，顶上有一条不能关的提示），「已同步，去新地址」记下已确认、以后不再拦。
- 旧 PWA：scope 在旧域名，没法原地搬到新域名，要重新装。旧域名的 `/sw.js` 换成「清缓存、注销自己」的版本，免得缓存里的旧外壳顶替介绍页；从主屏幕打开旧版时，第一次显示提示（含「请重新添加到主屏幕」），之后直接跳 app 域名。
- 新域名不用改 manifest / sw.js / Cookie：manifest 的 id、start_url、scope 都是相对的 `/`；会话 Cookie 不带 Domain，只认当前域名；COOP / COEP 照旧由 Worker 加；Google 回调地址按请求的域名生成。
- 介绍页：九种语言（见下面「介绍页 i18n」），右上角能切；图标和名字、一句话介绍、五条功能、「打开网页版」、GitHub Releases 下载提示。以后换更完整的介绍页，只换 `landing/page.ts`（或按「app 的网站单独建 `<仓库名>-web` 仓库」的约定另起 Mindough-web，再让旧域名的 `/api`、`/auth` 走 service binding 回这个 Worker），搬家脚本那段要留着。

待 Rei 做：Google Cloud 控制台给 OAuth 客户端加重定向 URI `https://app.mindough.rei8t.dev/auth/callback`（旧的别删）；装过旧 PWA 的设备重新安装。

### 介绍页 i18n ✅（2026-10-26）
Rei 2026-10-26 19:41：「这个网站也要i18n」。

- 介绍页（`mindough.rei8t.dev`）和 app 一样用九种语言：zh（简体）、en、es、pt-BR、ru、ja、de、fr、id。文字在 `apps/server/src/landing/text.ts`，标题、一句话介绍、五条功能、按钮、下载提示、搬家提示和旧 PWA 重装提示都有九种。
- 说法跟 app 语言包一致：资料库 = Collection（de Sammlung、ja コレクション……），打卡 = 习惯（Habits），「设置 → 数据 → 导入」用各语言 app 里的菜单名。
- 选语言的顺序：`?lang=` → 手动选过的（localStorage `mindough:landing-lang`）→ `navigator.languages` → 英文。服务端先按 `?lang=` 和 Accept-Language（按 q 值）出对应语言，页面脚本再定一次。zh-TW 等都归简体中文，pt-PT 归 pt-BR。
- 右上角是下拉框，九种语言用各自本名显示；`<html lang>` 跟着换。
- 旧地址 `/local/` 顶上的横幅是 app 里的字符串，九种语言早就有了。

### 桌面窗口透出壁纸：macOS 侧边栏毛玻璃、Windows 11 Mica ✅（2026-10-26）
Rei 2026-10-26 20:58：「mindough app的背景，侧边栏背景不像是原生app的bg sensitive的」。以前窗口和侧边栏都是不透明的纯色，看不出桌面壁纸的颜色。

- macOS：主窗口、设置窗口都开透明，铺 NSVisualEffectView 的 Sidebar 材质，窗口失焦时跟系统一样变灰（`followsWindowActiveState`）。Apple 皮肤下侧边栏透明、透出材质；内容区和详情照旧不透明（`--bg` / 白底），像「提醒事项」「邮件」。侧边栏的搜索框改成半透明灰。窗口透明要用 Tauri 的 `macOSPrivateApi`，代价是不能上 Mac App Store（现在也不上）。
- Windows 11（build ≥ 22000）：整窗 Mica，WinUI 皮肤去掉以前假 Mica 的渐变底，卡片本来就是半透明白，直接叠在 Mica 上。Windows 10 没有 Mica：主窗口在 Rust 里按系统版本建（`tauri.windows.conf.json` 写 `create: false`），Win10 建成不透明窗口，界面照旧纯色。
- Linux、手机、网页版、PWA：不变（浏览器透不出壁纸）。Material 皮肤也不变，背景不透明，正好盖住材质。窗口拉窄成手机布局时也不透明。
- 深浅色：界面手动选了深色或浅色，窗口也跟着换（材质和 Mica 按窗口的深浅色画）；跟着系统时不动。
- 怎么接：原生端 `src-tauri/src/vibrancy.rs` 的 `window_material` 说这台机器用哪种材质（vibrancy / mica / none），顺便设窗口深浅色；前端 `lib/vibrancy.ts` 拿到 vibrancy / mica 才给 html 加 `is-vibrant` 和 `data-material`，样式都在 `styles/vibrancy.css`。前端开设置窗口时用 `materialWindowOptions()` 带上同样的 transparent / windowEffects。

待 Rei 定：
- 内容区要不要也半透明一点（现在 macOS 内容区不透明，和系统 app 一样）。
- Windows 10 要不要退回 Acrylic（Win10 有，但拖动窗口时会卡），现在是纯色。

### 多类型与多资料 ✅（2026-10-28）
Rei 2026-10-28 原话：「类型是类型，资料库是资料库，是平级的」「一个任务可以连多个资料库的资料，例如：可以同时几个人和一部电影」；类型选择器做成能搜索的多选下拉。方案和待确认的几条见 `docs/MULTI-TYPE.md`。

- 数据：迁移 v12，新表 `task_category`、`task_item`（行 id 由这一对算出，墓碑 + LWW）；人物还用 `task_person`。任务上的单值 `category_id` / `library_item_id` / `type_id` 继续写成第一个，另写 `refs_mirror` 认出旧客户端改的（只加不删）。代码 `packages/core/src/task-refs.ts`，测试 `packages/core/test/task-refs.test.ts`。
- 界面：类型多选下拉（`components/CategoryPicker.tsx`）；挑资料的面板和资料列表（`components/library/RefPicker.tsx`）；详情「资料」区按库分组、每库接任务字段（人物库不接）；新建面板同样；列表元信息 `观影 · 奥本海默 +3`；打卡 / 倒数日 / 类型页认多个类型。删了 `changeTaskType`、`setTaskItem`、`TypeGrid`、`PeopleList`，原来的「资料库」「和谁有关」胶囊并进「资料」。
- 上线前修的：挑资料面板的库按钮原来横向滚动、滚动条藏着，排在最后的「人物」点不到（点了还停在影视，再点第一条反而去掉了电影），改成折行；人物组下面多出「事由」任务字段，人物库不再显示任务字段；资料区第一行贴着卡片上沿，加了上下内边距。
- 检查：core / client typecheck、相关单测；截图 `work/shots-multi-type/`（脚本 `work/shots-tool/multi-type.mjs`，三皮肤 × 1366 / 390）。

### 类型页改版：方案 C（搜索优先、按大类分组、左右两栏、常用代替手动排序）✅（2026-10-28）
Rei 2026-10-28 原话：「类型的这个交互方式可以更现代一点么，更改计划让我审核」，看了 A、B 觉得都不好，补了 C 之后说「按方案C执行」。方案全文和三个问题在 `docs/CATEGORY-EDITOR.md`。

Rei 定的：
- 用「常用 + 最近用过」代替手动排序（07:08 明确确认）。上移、下移、拖动都去掉了。
- 设置里完全去掉类型（07:08「去掉设置中的入口」），不留「管理类型…」入口，类型只在侧栏「管理 → 类型」页管。`CategoryManager` 弹层删掉了；深链 `view/settings/types` 改去类型页（`view/settings/library` 还是设置 → 任务）。

按文档默认做的（Rei 没改）：
- 5 个大类：身体、生活、学习和工作、爱好、人；自己加的默认「其他」，详情里能换组。内置的默认组写在 `seed/builtin-checkin-categories.ts`（`BUILTIN_CATEGORY_GROUPS`）。

做了什么：
- 数据不改表结构。「常用」存同步偏好 `category.frequent`（id 列表，按设成常用的先后）；改过的大类存 `category.groups`（`"<id>=<组>"` 列表，偏好值不支持对象；改回默认组就去掉那一项）；「不显示」还是 `category.hidden`。理由同 `type_order`、`library.sidebar`：改类型行会让内置类型算作用户改过，旧客户端改名时也会冲掉不认识的列。逻辑在 `packages/core/src/category-prefs.ts`，Store 是 `pickerCategories()`、`frequentCategories(n)`、`categoryState` / `setCategoryState`（返回之前的档，撤销用）、`categoryGroup` / `setCategoryGroup`、`categoryLastUsed()`。
- 最近用过不另存：取挂了这个类型的任务的创建时间和它们打卡记录的时间，哪个晚算哪个（顺着合并算到留下的类型）。项目没有时间戳，不算进最近用过。
- 选择器顺序：常用的在前 → 用过的按最近 → 没用过的先放健康、运动、学习、读书、饮食、作息，再按大类和原来的 sort。第一屏放全部常用的，不足 6 个用后面的补齐。
- 搜索（类型页、选择器）：存着的名字、当前语言的名字、英文名都比；搜索词全是字母时再比中文名的拼音首字母和全拼（`tiny-pinyin`，用 pnpm 加在 core；它靠浏览器的中文排序数据，只给一个读音，乐、行、长这些常见多音字的另一个首字母补在 `pinyin-polyphone.ts`）。开头对上的排前面。
- 类型页（`pages/Categories.tsx` + `components/CategoryEditor.tsx` 的 `CategoryList`）：见 PRODUCT 第 30 条。图标网格加了搜索框（`IconPicker searchable`；中文关键词在 `lib/icon-keywords.ts`，只用来对搜索词）。颜色沿用资料库编辑器那 14 个色块 + 自己调，没缩成文档写的 12 个。
- 三套皮肤：Apple 是分组圆角列表、缩进分隔线；WinUI 选中行左边一道强调色竖条；Material 带分隔线、圆形图标块、选中是胶囊。
- 测试：core `test/category-prefs.test.ts`（默认组名单、偏好读写、三档、顺序、最近用过、拼音和多音字）；client `deeplink.test.ts`。截图在 `work/shots-categories/`（三套皮肤 × 1366 / 390，加 Apple 英文）。

和文档不一样的地方：
- 颜色是 14 个色块 + 自己调（复用资料库编辑器的 ColorPicker），不是 12 个。
- ⌘1/2/3 在网页版的 Chrome 里会被浏览器拿去切标签页，只在桌面 app（Tauri）和不占这个键的浏览器里有用；Ctrl+F 同理在部分浏览器里先打开浏览器自己的查找。
- 手机左滑出的两个按钮跟着当前状态变字：已经常用的显示「取消常用」，已经不显示的显示「显示」。

### 项目也能「在侧边栏显示」✅（2026-10-28）
Rei 2026-10-28 07:29 原话：「项目和资料库一样，项目也可以显示在侧边栏」。

做了什么：
- 每个项目能「在侧边栏显示 / 取消在侧边栏显示」。开关在两处：项目页右上角视图、排序后面的 ··· 菜单（读屏「项目操作」），项目列表里卡片的右键 / 长按。侧栏里那一项自己也能右键「取消在侧边栏显示」。
- 显示的项目挂在「计划 → 项目」下面，样子跟资料库下面的库一样（图标往里缩一点，图标栏不缩）；用项目自己的图标（emoji，或 `lucide:` 开头的图标名）和名字，点了打开那个项目（`#/groups/<id>`）。打开的是放进侧边栏的项目时亮它自己，项目列表和别的项目亮「项目」。中等宽度图标栏、手机「更多」页一样。顺序跟项目页一样（`store.list('group')`）。默认都不显示。删掉的项目不出现。
- 存储：同步偏好 `group.sidebar`（项目 id 列表，core `GROUP_SIDEBAR_PREF`、`store.sidebarGroups()` / `isGroupInSidebar()` / `setGroupInSidebar()`），理由同资料库：不加列、不改项目行，旧客户端改项目名不会冲掉它。
- 测试：core `test/group-sidebar.test.ts`（默认不显示、顺序跟项目页、取消、重复设不写、删掉的和坏 id 不出现、跟资料库各管各的、两台设备同步）；client `lib/nav.test.ts`（「计划」一节的顺序、入口地址、哪一项亮、图标名）。截图在 `work/shots-project-sidebar/`。

跟资料库不一样的地方：
- 项目没有归档，也没有「编辑资料库列表」那样的设置项，所以开关只有项目页 ··· 菜单和卡片右键 / 长按两处，设置里不加。
- 结束日期过了的项目照常显示（项目页也照常列着它）。

替 Rei 定的、待确认：
- 设置里不加「项目」的侧栏开关。
- 已经结束（结束日期过了、任务都做完）的项目不自动从侧栏拿掉。

### 日记改版：Feed 流 ✅（2026-10-28，方案 docs/JOURNAL.md 顶部「2026-10-28 改版：Feed 流」）
Rei 2026-10-28 原话：「日记还是不好用，我更喜欢Feed流，一天可以添加很多条。每一条都可以标记心情。」「a feed提交之后就不能修改了，心情也不能修改。」「两栏，左侧顶部显示activity图，点击可以切换」「activity图的颜色根据心情的颜色mix」「标签不做」「左侧除了activity图，还可以显示一个心情列表」。

- **数据**：新表 `journal_post`（迁移 v13），只追加。Store `addJournalPost` / `deleteJournalPost` / `restoreJournalPost`，改正文、心情、日子的写入一律拦下（`JournalPostLockedError`）。旧的 `journal_entry` 打开时每篇转成一条（id 由那篇算，各设备一样，不进 outbox），折叠块里收着的另一版各成一条；旧客户端后来改了、删了那天，转来的跟着变。旧表留着不删。
- **core** `journal-feed.ts`：排序、按天分组、按天 / 心情筛选、`journalHeatRange`（至少 26 周，往前补到最早一条）、`moodCounts`、`mixOklab` / `dayMoodColor`（当天各条心情色在 OKLab 里平均，没心情算中性色）、`heatStrength`（1 条 62% 到 4 条以上 100%）、导出 `formatJournalDay` / 导入 `parseJournalDay`（每条一段，标记注释记 id、时刻、心情）。搜索按条命中。
- **界面**：`pages/Journal.tsx` 两栏，左边 `JournalHeatmap` + `MoodList`，右边 `JournalComposer`（心情弹层、插入图片、列表、发送 / ⌘↵；2026-10-29 起换成 Tiptap 编辑器、图片改成附件，见下面「任务和日记的编辑器一致」）+ `JournalFeed`（按天分组，右键 / 长按 / ··· 只有「删除」，确认后删，提示里撤销）。点一天 = 路由 `#/journal/<日期>`；按心情筛能叠加，筛着时活动图只画这个心情。选中的不是今天就没有输入框。窄屏上下排，心情是一排横着的胶囊。我的一天小卡改成今天几条 + 最新一条 +「写一条」。⌘K「写今天的日记」改名「写日记」。旧的情绪月历、心情轮（`JournalCalendar`、`MoodWheel`）和 36 个用不到的词条删了（9 种语言）。
- 检查：core `journal-feed.test.ts`（21 条：只追加、迁移、颜色混合、导出导入来回）、`journal`、`attachments`、`sync`；client `i18n`、`locales`、`deeplink`、`nav`、`prop-chips`；core + client `tsc --noEmit`。截图 `work/shots-journal-feed/`（脚本 `work/shots-tool/jf-*.mjs`）：Apple 宽屏全部 / 选中某天 / 按心情筛 / 某天叠加心情 / 心情弹层 / 写好待发，WinUI 宽屏亮色全部、暗色某天，Material 暗色按心情筛，Apple 390。

替 Rei 定的、待确认（JOURNAL.md 顶部「待确认」有详细说法）：
1. 删除走菜单 + 确认 + 能撤销，同步墓碑。
2. 过去的日子不显示输入框，不能补写。
3. 心情列表按活动图整段算（实际是全部历史），没用过的不显示，点了筛选、能和某天叠加，筛着时活动图只画这个心情。
4. 发送按钮用皮肤强调色，不是附图里的橙色。
5. 心情在输入框工具栏的按钮弹层里选。
6. alpha.9 及以前的旧客户端看不到新条目；旧客户端改了旧日记，转来的那条跟着变。
7. 我的一天小卡：今天几条 + 最新一条 +「写一条」。
8. 7 种语言的新文案待母语的人看。

### 任务和日记的编辑器一致 ✅（2026-11-01 上线，Rei 2026-10-29 提的）
Rei 2026-10-29 原话：「任务和日记 editor 要行为一致」「日记的工具栏保留图标，限制只能是图片」。网页端剪贴板按我的建议做（Rei 同意）：只在已授权时读，只认图片，文件走附件选择或拖进来。详细规则见 JOURNAL.md「2026-10-29：和任务用同一个编辑器」。

- **任务详情顶栏**（`TaskDetail` 的 headerStart，状态胶囊后面）：
  - `DateQuickButton`（`components/task/TaskDatePicker.tsx`）：和「日期」胶囊共用 `dateChipState` + `TaskDatePicker`（点一天就存并收起，日期段见「日期面板方案 A」）。设了日期是强调色（`.is-set`），过期变红（`.is-danger`，做完、关掉的不算）。
  - `ClipboardButton`（`components/attachments/ClipboardButton.tsx`）：剪贴板里有能加的东西才出现，点了交给 `useAddFiles`（附件上传队列）。
- **剪贴板**（`lib/clipboard-files.ts`）：挂上、窗口拿到焦点、页面切回来时看，不轮询；加过的内容记签名（localStorage，20 条），同一份不再出。
  - 网页：`clipboard-read` 已是 granted 才读，从不弹框，只认图片；Firefox、Safari 不认这个权限名，按钮不出。
  - Tauri 桌面：`src-tauri/src/clipboard.rs` 的 `clipboard_peek`（arboard 的 `file_list` + 图片签名）和 `clipboard_read_file`；图片用 `@tauri-apps/plugin-clipboard-manager` 2.5.0 的 `readImage`，在前端编成 PNG。权限 `clipboard-manager:allow-read-image`。
  - 手机 app：不做。
- **日记输入框**（`JournalComposer`）：换成 `LazyMdEditor`（`onModEnter` 发送、`handleRef` 拿句柄清空和点列表）。图片按钮只收图片，先放待发小图，发送时 `sendJournalPost`（`lib/journal-send.ts`）建条目再挂附件；工具栏的剪贴板按钮只认图片。只放图片也能发。
- **发出去的条目**：`JournalFeed` 用 `Attachments readOnly`（菜单只有下载、缓存，上传中不能取消），owner 是 `store.postAttachmentOwnerId(post)`。
- 检查：client `clipboard-files`、`journal-send`、`editor`、`attachment-cache`（只读菜单）、`attachments`、`attachment-gone`、`tiptap`、`markdown`、`i18n`、`locales`；core `journal-feed`、`journal`、`attachments`、`archive`、`attachment-cache`；core + client `tsc --noEmit`。截图 `work/shots-editor-consistency/`（脚本 `work/shots-tool/editor-consistency.mjs`，三种皮肤 × 1366 / 390）。
- 没在真机上试：桌面 app 读剪贴板（macOS / Windows 的文件列表、图片）、手机上按钮不出。
- **内存（2026-11-01，Rei「现在内存占用太高了」）**：
  - 剪贴板图片：readImage 拿到的是 Rust 资源表里的一张图，用完要 `close()`，不然像素一直留在主进程（Retina 截图一张二三十 MB，点一次多一份）；编 PNG 的画布用完清零。几个剪贴板按钮、focus 和 visibilitychange 一起来时只看一次剪贴板（`coalesce`，1.5 秒）：桌面上每看一次，Rust 都要把整张图解出来算签名。
  - 原生端附件的 blob: 地址以前留到关 app，现在最多留 32 MB（`BLOB_BUDGET`），从最久没用的开始收回。
  - 量出来的情况：Chromium 里 800 件任务 + 半年日记，JS 一共 17–22 MB，走几圈页面、开 20 个详情也就涨到 22 MB 上下，没有成片的泄漏；编辑器用完都销毁了。Mac 上 `ps` 看到的 RSS（约 600 MB）把可回收的缓存和共享库都算进去了，`footprint` 看真正占的：主进程 55 MB、WebContent 161 MB（WebKit malloc 79 MB、图层 29 MB、JIT 12 MB）、GPU 33 MB、Networking 14 MB，一共约 260 MB；大头是 WebKit 自己。
  - 还能做但没做：Rust 的 clipboard_peek 每次都解整张图，可以先看 macOS 的 changeCount（Windows 的 GetClipboardSequenceNumber）没变就直接用上次的结果；要加 objc2-app-kit 依赖，得在 CI 上编过再说。

### 日期面板方案 A：一张月历，点一下就生效 ✅（2026-11-01）
Rei 2026-11-01 原话：「当前的 date picker 中：单日、时间段第一层，公历、农历第二层好乱。有什么更好的交互方式么，让我审核」。看了 [DATE-PICKER.md](DATE-PICKER.md) 后定「方案A」。

- **去掉了**：「单日 | 日期段」「公历 | 农历」两个切换、「开始 / 结束」两格、农历的年 / 月 / 日三个下拉和「选这天 / 已选这天」、「去掉结束日」一行。
- **现在的样子**：从上到下是快捷按钮、已选胶囊、月历、时区和「不设日期」。点一天就存，弹层收起。要日期段就点「+ 结束日」，再点结束那天；桌面上还能拖选、按住 Shift 点（键盘 Shift+Enter）。段设好后点开始之前的日子改开始，点开始之后的（段里面也算）改结束，点开始本身不变。结束日胶囊上的 × 去掉结束日，面板不关。快捷按钮在段里照旧把开始挪到那天，天数不变。
- **农历**：月历标题右边一个「农历」开关，只在 `useLunarUi()` 为真时出现。开着时按农历月翻页，闰月单独一页；格子大字农历、小字公历。开关记在本机 `mindough:lunar-pick`。存法不变：按农历选的也存公历，每年农历重复还在「重复」里。
- **代码**：core `date-grid.ts`（公历 / 农历月都排 42 格 `monthCells`、翻页 `stepView` / `stepViewYear` / `canStep`、键盘翻页落点 `shiftFocus`、`viewOf`、点格子规则 `clickDay`、拖选 `dragRange`），删了 `pickRangeDay`。客户端月历是 `components/task/DateGrid.tsx`，自己画的 `role="grid"`：react-aria 的 `Calendar` 和 `@internationalized/date` 都不支持中国农历。胶囊和存法在 `DatePanel.tsx`。`TaskDatePicker`（日期胶囊和顶栏日期按钮共用）接口没变。手机上所有日期弹层都从底部出来（`is-sheet`）。
- **键盘和读屏**：打开时焦点在已选那天，没选就在今天。方向键换天，Home / End 到这周头尾，PageUp / PageDown 换月（农历页换农历月），加 Shift 换年；Enter 或空格选，Shift+Enter 设结束日。选好后 live region 念一句。
- **待确认的 8 条 Rei 没单独回，按文档的建议做**：
  1. 点一下就存并关；要日期段再打开点「+ 结束日」。
  2. 桌面拖选和 Shift 点都支持，手机只用「+ 结束日」。
  3. 段设好后：开始之前改开始，开始之后（含段里）改结束。
  4. 「农历」开关记在本机。
  5. 四个快捷按钮都留。
  6. 节气节日照旧用强调色，「休 / 班」留着。
  7. 一周从哪天开始跟着界面语言，不加设置。
  8. 方案 C 的输入框先不做。
- **和方案文档不一样的地方**：
  - 月历固定 6 行，翻页时面板高度不跳；前后月的日子淡色显示，也能点。
  - 等结束日时，鼠标悬停那天先预览成一段。
  - 等结束日时点在开始之前：这天当开始，原来的开始当结束（文档没写这种情况）。
  - 手机底部弹层没加拖动把手；左右滑动翻月没做（文档里是可选）。
- **测试**：core `test/date-grid.test.ts`（公历 / 农历月格子、闰月、周日开头、翻页、点格子和拖选的规则）；client `components/task/DatePanel.test.tsx`（点一下生效、「+ 结束日」、×、Shift 点、键盘、农历开关）。截图在 work/shots-datepicker/（脚本 work/shots-tool/datepicker.mjs）。

### 我的一天的建议可以关 ✅（2026-11-01）
Rei 2026-11-01 原话：「我的一天中的建议，可以toggle on/off」。

- **开关在哪**：设置 → 任务 →「我的一天」→「显示建议」，默认开。建议那段标题右边加了「…」，里面一项「隐藏建议」，关的是同一个开关。点完弹提示「建议已隐藏。想再看，去设置 → 任务，打开「显示建议」。」，提示里有「撤销」。
- **关了以后**：建议那段整个不显示；「刚解锁」和建议都不算，省一次遍历。「昨天没做完」「今天的日记」照旧。
- **存哪**：本机设置 `myDaySuggestions`（`mindough:settings`），不同步，和「日期显示」「任务链」一样。老设置里没有这个键，算开。读用 `lib/myday-suggest.ts` 的 `suggestionsOn()`，算建议包在 `daySuggestions(on, compute)` 里，关着不调 compute。
- **文字**：新字符串 5 个，设置「任务」下面那行小字改了 2 个（中间加「我的一天」），九种语言都补了，西、葡、俄、日、德、法、印尼待母语者看。
- **测试**：`apps/client/src/lib/myday-suggest.test.ts`（默认开、关着不算）；i18n 测试。截图在 work/shots-myday-suggest/。

### 项目能改名、换图标、解散、删除；项目列表去掉加号；类型筛选胶囊改用底色 ✅（2026-11-01）
Rei 2026-11-01 原话：「项目的图标、名称要可以编辑」；同日追加「项目列表中的右下的float新建任务去掉，右上角的新建任务按钮优化。项目可以删除、解散。放在项目的ellipsis中，编辑也放这里。」「还有这一页的分类滚动条中的分类，不要用文字颜色，用背景颜色，注意对比度」。

以前是什么样：项目只在新建时填名字和 emoji，之后改不了；没有删项目的入口；项目的 ··· 菜单里只有「在侧边栏显示」。

做了什么：
- **改名、换图标**：项目页左上角点名字就地改（回车或点别处存，Esc 不改，改成空的不算）；点图标弹出图标选择（和类型、资料库同一个：搜 lucide 图标，或填一个 emoji）。··· 菜单里还有「编辑…」，弹一个面板，名字和图标一起改。新建项目也换成这个图标选择，默认文件夹图标。
- **··· 菜单**：项目页右上角、项目列表卡片右上角（鼠标移上去才出现，触屏一直在）、侧栏里那一项右边的 ···（2026-11-11 起；图标样式、图标栏照旧右键 / 长按），三处一样：编辑… ｜ 在侧边栏显示 ｜ 解散项目… · 删除项目…（红色）。
- **解散**：项目没了，任务都留着、移出项目：没日期的回待安排，有日期的还在那天。先确认，写明留下几件。
- **删除**：项目和里面的任务一起删，任务的前后关系、相关任务、我的一天、附件跟 `deleteTask` 一样打墓碑。先确认，写明删几件，提醒「只想留下任务，就选「解散项目」」。
- 解散、删除后提示里都有「撤销」（8 秒）；开着的就是这个项目时回项目列表，右列开着的任务被删了就关掉。
- **项目列表**：右下角的新建任务加号去掉了（项目列表、项目页都没有，N 和 ⌘K 照样能新建）；右上角「新建项目」改小，和标题一行，Apple 28px、WinUI 32px、Material 36px 高；手机和窄于 560px 时只留加号，悬停有提示，读屏名还是「新建项目」。2026-11-10 起（Rei「项目列表页 右上角的新建项目用icon btn」）什么宽度都只放加号，用打卡、倒数日页的 `.btn-icon-only`，`.page-cta` 样式删了。
- **类型筛选胶囊**（项目、打卡、倒数日三页共用一个 ChipPicker，所以三页一起变）：类型色只上底色，没选中是浅浅一层（浅色主题 20%、暗色 34%，先和不透明基色混好），选中是整块类型色；字和图标按 WCAG 对比度挑黑或白，保证至少 4.5:1。「全部」「没有类型」选中时字色当底、底色当字（Apple 强调蓝配白字只有 4.0:1，不够）。逻辑在 `apps/client/src/lib/chip-colors.ts`。

数据和同步：
- 不加列、不加迁移。`group.icon` 本来就能存 emoji 或 `lucide:名字`（types.ts 的注释），以前只有侧栏会读 `lucide:`；这次所有显示项目图标的地方都改走 `GroupIcon`（任务行、属性胶囊、新建面板、选择器、⌘K、可做、类型页），不然会把「lucide:home」当字显示。老客户端读到 `lucide:` 开头的图标只会当一段字显示，不会坏。
- 改名、换图标、解散、删除都是普通的行写入（行级 LWW），删除和解散是给项目行打墓碑（`deleted`），撤销是把墓碑改回来，都进 outbox，云端不用改。
- core：`group.ts`（`groupIconFromPicker` / `groupIconName` / `normalizeGroupName`、撤销记录的形状），`store.updateGroup` / `groupTasks` / `dissolveGroup` / `deleteGroup` / `undoGroupRemoval`；`deleteTask` 拆出 `taskTombstoneRows`，删项目时一起用。

测试：core `test/group-edit.test.ts`（图标存法、改名、空名不改、没变不写、改名同步、解散后任务回待安排、撤销、撤销时不动已移到别的项目的任务、侧栏跟着、删除连带的行、每行只打一次墓碑、撤销删除、两台设备同步删除和解散）；client `lib/chip-colors.test.ts`（对比度公式、27 个内置类型色 + 14 个色板 + 色轮 72 色在明暗两种主题下都 ≥ 4.5:1）。截图在 `work/shots-project-edit/`。

替 Rei 定的、待确认：
- 解散后任务不进「我的一天」，只是不属于任何项目。
- 撤销提示留 8 秒。
- 筛选胶囊的改动落在三页（共用组件）。

### 新建项目和编辑项目用同一个面板；项目任务直接进我的一天；添加框不跟着列表滚 ✅（2026-11-02）
Rei 2026-11-02 原话：「新建项目的弹窗需要优化，删掉默认资料库，开始结束删掉。和编辑窗口统一」；追加「直接出现在我的一天，而不是出现在的建议里，执行。项目编辑窗口中可以设置switch on/off不出现在我的一天中」；再追加「所有的任务输入框都不随列表滚动」。

**项目面板**
- 新建、编辑都用 `components/project/ProjectSheet.tsx`：图标预览 + 名字 + 图标选择 +「出现在我的一天」开关。新建的标题「新建项目」、按钮「创建」，建好打开那个项目；编辑的标题「编辑项目」、按钮「保存」。
- 新建面板去掉了开始、结束、类型、默认资料库四项。数据字段（`start_at` / `end_at` / `category_id` / `default_type_id`）都留着，老数据照常读：卡片和项目页照样显示起止时间，默认资料库照样生效。新建的项目这四项都是空的。
- 类型还能在项目页标题下面改，所以没丢。起止时间和默认资料库界面上再也设不了，要加回来再说。
- 文案：删了「默认资料库」「不放进资料库」两条（九种语言），项目列表副标题从「一批相关的任务，有起止时间和类型」改成「把相关的任务放在一起」。

**项目任务直接进我的一天**
- 条件和建议一样：今天到期或过期、日期段含今天、倒数日到了、今天要打卡、刚解锁（24 小时内）。任务在项目里、项目开着「出现在我的一天」，就自动加进今天；这些任务不再进建议。不在项目里的照旧只建议。
- 开关存在项目上：`group.my_day_auto`（v14 迁移加列，默认 1），跟着同步。老客户端写来的项目行没有这个字段，读的时候当成开；老客户端改了项目会把它带丢，也就回到开。关了以后这个项目的任务回到建议里。
- 做法（core `myday.ts` + `store.syncAutoMyDay`）：客户端 `lib/myday-auto.ts` 的 `useAutoMyDay` 挂在 App 上，数据一变、换了一天就调一次；没东西要加时不写，不会来回触发。不看「显示建议」开关。
- 不重复：从 2026-11-02 起，我的一天新加的行 id 都由任务 + 日期算（`myDayEntryId`），手动加、自动加都是它。两台设备各自加了同一件，是同一行。以前的随机 id 行照样读，`entriesFor` 按任务 + 日期去重。
- 移出不复活：这一天有过行的任务（在里面的、移出过的）不再自动加。「移出我的一天」除了给活的行打墓碑，还会给算出来的那行写一条墓碑。自动加的行时间戳是固定的最早值（`AUTO_MY_DAY_HLC`），内容也固定（sort 0、加入时间那天 00:00），各设备写出来一模一样；墓碑带真实时间戳，总比它新。所以别的设备离线时又自动加了，同步后也会被墓碑盖掉。
- 自动加的排在手动加的前面（sort 0）；拖动排序后照常存。导出时关着的项目写 `my_day: false`，导入读回来。
- 测试：core `test/myday-auto.test.ts`（各条件、不在项目里的不加、只加一次、移出后当天不再加、第二天再加、老随机 id 行移出也算、开关关了回建议、老数据当成开、刚解锁、两台设备不重复、离线自动加被墓碑盖掉）。

**添加框固定在列表顶上**
- `QuickAddBar` 外面包一层 `.add-bar-sticky`（sticky、top 0），框下面那行日期、件数（`meta`）放进同一层。我的一天、待安排、可做、项目页四处都是它。打卡、倒数日页没有这种添加框。
- 底色用页面底色（WinUI 的渐变也照样铺），列表滚过去不会透出来。顶上放一个 1px 的哨兵，看不见了（滚动了）就加 `is-stuck`，底下出一条细分隔线。
- 日记页（Rei 2026-11-02「日记中的输入框也不滚动」）：右栏的筛选条和输入框（工具栏、待发的小图都在里面）包进 `.jf-compose-sticky`，固定在右栏顶上；窄屏上下排时粘在整页滚动区顶上。输入框固定时最高 min(32vh, 260px)（手机 min(24vh, 180px)），再长就在框里滚。分隔线同样靠哨兵（`useStuck`，和 `QuickAddBar` 共用）。
- 截图在 `work/shots-project-dialog/`、`work/shots-sticky-input/`。

替 Rei 定的、待确认：
- 新建项目的主按钮写「创建」（原来就是这个字），没改成「新建」。
- 类型也从新建面板拿掉了（编辑面板本来就没有），建好后在项目页标题下面设。要不要加回面板里？
- 项目卡片和项目页还写「不限时间」：新项目都没有起止时间，这几个字每张卡都有。要不要没设时间就不写？
- 2026-11-04 Rei：「项目列表中item紧凑一点，进度不显示。项目详情页，顶部不显示日期段」。卡片去掉进度条和「N/M 完成」，内边距和间距收紧（还不能开始的件数照常写）；项目页副标题不写起止，只留类型和默认资料库。
- 2026-11-04 Rei：「主窗口没有宽度、高度的最小值，设置一个合适的最小值」。原来是 360×560（手机大小，窄过 760 会切成手机布局、出底部标签栏），改成 800×600：比手机布局的分界 760 宽一点，桌面窗口始终是侧栏 + 列表。三个 tauri*.conf.json 一起改，下个 alpha 生效。
- 过期的项目任务每天都会再自动加一次，直到做完或移出（移出只管当天）。
- 自动加的排在最前面。
- 设置里「显示建议」的说明没改，还写着「列出今天到期、今天要打卡、刚解锁的任务」，没提项目里的任务不在里面。
- 桌面 app 里 Windows 的 Mica 材质下，添加框那一条用的是不透明的页面底色，没在真机上看过。

### 侧栏「列表」改名「时间轴」 ✅（2026-11-02）
Rei 2026-11-02 原话：「侧边栏-计划-列表更名成"时间轴" timeline」。

- 改名的地方：侧栏「计划」一节、中等宽度的图标栏、手机标签栏和「更多」、页面标题（都读 `trc('导航', '时间轴')`），待安排页安排日期后的提示「已安排到时间轴：「X」」。
- 英文还是 Timeline，别的语言也没变：Cronología（es）、Linha do tempo（pt）、Хроника（ru）、タイムライン（ja）、Zeitleiste（de）、Chronologie（fr）、Linimasa（id），待母语者看。
- 没改的：路由 `#/agenda`、深链接 `mindough://view/timeline`、存储键、代码里的 `agenda` 名字，老链接照样能开。泛指「列表」的字（任务列表、项目视图「列表」、日记输入框的「列表」按钮）不动。
- 待确认：项目页视图里也有个「时间轴」（甘特图），现在两处同名。要不要给其中一个换个叫法？

### 打卡能归档 ✅（2026-11-02）
Rei 2026-11-02 原话：「打卡任务可以归档」。

- **和「不再打卡」不一样**：不再打卡把状态改成关闭，算结束、会解锁后续任务，打卡页上直接消失（只能搜到）。归档不动状态，只是先收起来，以后可能再打，所以单独做，不复用关闭。
- **存法**：任务上新加 `archived_at`（时间，可空），迁移 v15。老客户端不认这一列：它推上来的行没有这一列时当没归档（`applyRemote` 补 null）。导出写 `archived:`，导入读回来。
- **规则**（core）：`dueToday` 归档了就是 false，所以「今天要打卡」、我的一天建议、项目任务自动进我的一天都不算它；`upcomingReminders` 跳过；昨天没做完不带它；`buildRatioIndex` 从归档那天起不算应打卡日（和结束那天取早的），以前的比例照旧。`store.archiveTask` 顺手把今天我的一天里的它移出；`unarchiveTask` 清空。
- **界面**：详情 ··· 菜单「不再打卡」后面加「归档」，归档了的只剩「取消归档」和删除，状态徽章「已归档」；打卡页行加了右键 / 长按菜单（`habitMenu`）；最下面折叠的「已归档 N 项」，行尾是「取消归档」，活动图圆点照样能点开看。
- **测试**：`packages/core/test/habit-archive.test.ts`（建议、自动加入、提醒、比例、同步、老客户端、导出导入），`lib/task-menu.test.ts`。
- **没做**：归档期间那几天，取消归档后会算成没打卡（连续天数会断）。要不要把归档期间当成不用打卡？要的话得记下每段归档的起止，现在只记了最近一次。

### 倒数日卡片能选颜色 ✅（2026-11-02）
Rei 2026-11-02 原话：「倒数日的card可以设置不同的颜色背景」。

- **存法**：任务上新加 `card_color`（颜色名，可空 = 默认），和归档同一个迁移 v15。存名字不存色值，亮暗主题各用一套色值（core `card-color.ts` 的 `CARD_COLOR_VALUES`）。不认识的名字当默认。导出写 `card_color:`。
- **颜色**：默认 + 红、橙、黄、绿、青、蓝、靛、紫、粉、棕、灰，一共 12 个。字色用 `lib/chip-colors.ts` 的 `readableInk` 挑黑或白；副字（日期、「还有 / 天」）在字色里混一点底色，对比度不够 4.5:1 就用实色。`lib/card-colors.test.ts` 把 11 色 × 亮暗都验了一遍。
- **入口**：卡片右上角 ···（悬停出现，触屏一直在）、右键、长按都是「查看详情 ｜ 颜色…」；详情属性胶囊「卡片颜色」（`prop-chips` 的 `color`，只有倒数日有）。选择是一排圆点（`components/CardColorPicker.tsx`），点了就生效。
- **皮肤**：Apple 彩色卡片去掉描边；WinUI 留 1px 描边；M3 filled card 没描边。
- 我的一天没有倒数日卡片，只有倒数日页用。

### 图标选择重做 ✅（2026-11-02）
Rei 2026-11-02 原话：「确保设计符合对应的皮肤，项目弹窗中的这个图标部分也太难看了吧」「优化一下」。

- **毛病**：网格是 `repeat(8, 1fr)`，宽面板里每格被拉到 120px、图标只有 18px；新建项目默认的 `folder` 不在列表里，看不出选中；没分组；emoji 是一个长输入框加「用这个」按钮。
- **改法**：组件挪到 `components/IconPicker.tsx`（TypeManager 照旧导出，类型页、资料库、项目 ··· 换图标、项目面板都用它）。格子 38px（M3 40px）、间距 4px、`auto-fill`；整块限高 264px（手机 40vh）在里面滚；图标 20px。`lib/icons` 的 `PICKER_GROUPS` 分七组，加了 `folder`。打开时把选中的格子滚进可见范围，只滚这一块。
- **emoji**：搜索框右边一个同样大小的格子，透明输入框盖在上面，没打时是笑脸加号；打进一个 emoji 就生效，按字形取（肤色、ZWJ 组合、旗子都算一个），打了别的字不理。
- **皮肤**（都用 token，不写死颜色）：Apple 格子浅灰填充、圆角 8、选中 `--accent` 实心 + `--accent-contrast`；WinUI 圆角 4、选中 `--accent-soft` 底 + 2px `--accent` 描边；M3 圆角 12、state layer 8% / 12%、选中 `--accent-soft`（secondaryContainer）+ `--accent-soft-text`。
- 文案「或者用一个 emoji」「或者用一个 emoji，如 🎙️」「用这个」「没有对得上的图标，可以在下面填一个 emoji」删了。

### 图标选择：整块左右滑、近 300 个图标、不要搜索和 emoji ✅（2026-11-04）
Rei 2026-11-04 原话：「编辑项目中的图标左右滚动，删掉搜索框，emoji不支持」；16:21 更正「不对，是整个lucide icons section左右滑动，不再有文字标题，而是每列占满了占下一列，添加更多lucide icons，包括动物、植物」。先做的「每组一行」作废。

- **网格**：`components/IconPicker.tsx` 只有一个 `.icon-grid`：`grid-auto-flow: column` + `grid-template-rows: repeat(var(--icon-rows), 格高)`，宽屏 5 行、手机 4 行，`overflow-x: auto`，滚动条藏起来，`scroll-snap` 贴格子。没有组名。两头还有图标时 JS 打 `data-more-start` / `data-more-end`，CSS 用 `mask-image` 渐隐 28px。打开时选中的格子滚到中间；↑↓ 同一列挪一格，←→ 跳隔壁列（按当前行数算），Home / End 到头尾，挪到的格子滚进视野。
- **图标**：`lib/icons.ts` 从 60 个加到 295 个，`PICKER_GROUPS` 只管排列顺序：常用、娱乐、学习工作、出行、生活、健康、动物、植物。动物有 paw-print、cat、dog、bird、fish、rabbit、turtle、snail、bug、squirrel、rat、panda 等，植物有 leaf、flower、flower-2、rose、tree-pine、tree-deciduous、tree-palm、sprout、clover、wheat、shrub 等（lucide 1.57 没有 cactus、tulip，没放）。按名字一个个引入（`XxxIcon`，免得 `Map` 之类盖住全局），打包只带这些。以前的 60 个名字都留着，老数据照常画；同一个图形的别名（home / house）只放一个。
- **去掉搜索**：搜索框、搜索结果、「没有对得上的图标」和图标中文关键词表 `lib/icon-keywords.ts` 都删了；`searchable` 参数也删了。
- **去掉 emoji**：emoji 小格、`firstGrapheme` / `emojiFromInput` 删了，只能选 Lucide。`isEmojiIcon` 和 `typeIcon` 画 emoji 的那段留着：项目（`group.icon`）、资料库（`type.icon`）、打卡分类（`category.icon`）的老数据可能存着 emoji，照常显示，打开选择器时不选中格子，用户点了图标才改；数据不迁移、不删。`DEFAULT_GROUP_ICON` 还是 📁（老客户端认它），新建项目界面默认选 `folder`。
- 用这个选择器的地方：项目面板（新建 / 编辑项目）、项目页左上角换图标、资料库编辑器的图标、打卡分类页的「图标和颜色」。
- 文案「搜索图标」「搜图标，比如“书”“运动”」「搜索结果」「没有对得上的图标」「换个词试试，或者在右上角打一个 emoji」「用一个 emoji」「点下面的图标，或者在左边这格打一个 emoji」、早就没人用的「图标（emoji）」，还有组名「娱乐」「学习工作」「出行」「健康」「其它」，九种语言里都删了（「常用」「生活」别处还在用，留着）。单测 `lib/icons.test.ts`：只有 Lucide、不重复、有动物植物、老名字都在、emoji 照常能画。

### 挑任务的搜索框：退格、中文输入法、搜不到标题 ✅（2026-11-02）
Rei 2026-11-02 原话：「bug：做完后解锁弹窗中搜索框中，删除字符会跳转，输入中文有问题，优化」；追加「做完后解锁和先做的搜索搜不到任务标题」。

- 跳转的原因：react-aria 的 Autocomplete 会把输入框里的每个按键再派发一份到列表上，那份的 target 是列表，全局快捷键（N 新建、方向键换任务、打字跳搜索框）只看 target，就当成「没在打字」——在框里打个 n 就弹出新建面板、焦点跑到新建的编辑器里。现在全局快捷键看焦点（`lib/ime.ts` 的 `typingKey`）：焦点在输入框里、或输入法在用这个键，一律让路。
- 组字：框里是拼音（shu）时不拿去过滤，上屏（compositionend）才过滤；选词的那次回车（组字中、WebKit 的 229、compositionend 后 100ms 内）不提交、不新建。`useImeQuery`（自己持有搜索词）、`useImeField`（搜索词在父组件）两种用法。
- 删字时弹层不伸缩：挑任务弹层的列表高度固定，「新建“xxx”」那一行没字时也占着位置。
- 搜标题：挑任务和 ⌘K 用同一套（core `task-match.ts`）：标题 = `taskTitle`（和列表行一样，正文第一行去掉 markdown），搜标题 + 去掉 markdown 的正文，不分大小写，空格不算，字母时也认拼音首字母和全拼（和类型页同一个 tiny-pinyin）。
- 挑「先做完这些 / 做完后解锁」时不列已完成、已关闭的，也不列连上会绕成圈的（以前点了才提示「没有连上」）；「相关任务」照旧。
- 同样改了的搜索框：⌘K、图标选择、类型选择、资料选择（单库、全部库）。
- 手机整页详情的顶栏放不下时（归档的计时打卡：「已归档」+ 计时胶囊把 ··· 挤出屏幕），状态徽标、进度胶囊可以缩，右边的按钮一直都在。

### 编辑器：任务第一行只能是纯文字 ✅（2026-11-03）

Rei 2026-11-03：「任务的标题不渲染任何样式，或者列表，以及其他，任务标题是纯文本不渲染md」。

- **范围**：所有任务都开（详情、新建面板，`MdEditor` 的 `plainTitle`）。2026-11-03 当天先只给标题来自正文的任务开，同一天晚上改成所有任务的标题都是第一行（见下一节「任务标题一律是正文第一行」），挂资料的任务也开了，正文模板挪到第一行下面。日记、资料备注不开。
- **编辑器**（`editor/title.ts`）：
  - 输入规则：Tiptap 的规则（标题、列表、引用、代码块、分隔线、粗斜删、行内代码、清单、折叠块…）由 `guardTitleInputRules` 每条包一层，PM 的规则（链接、`<网址>`、裸网址、`|3x2|`、清单、公式、`$$`）用 `guardTitleRules`；落在第一块里都不触发，字原样留着。走打字、组字结束、回车哪条路都一样。
  - 按键：扩展优先级 1800（ime-guard 2000 之下，下划线 1500 之上）。选区整个在第一块里时，⌘B / ⌘I / ⌘U / ⌘E / ⌘K、⌘⌥0–9 / X / C、⌘⇧B / X / S / E / H / M / 7 / 8 / 9 拦下（⌘K 还不让外面的搜索打开）；回车、Shift+回车只 `splitBlock`，所以 `|a|b|`、`<details>`、`$$` 回车也不变。
  - 粘贴：光标在第一块里，取 `text/plain`：第一行当文字插进去，后面的行交给 markdown 读；有文件的照旧交给拦图片 / 附件。
  - 兜底：`appendTransaction` 每次文档变了都看第一块（`normalizeTitle`）：硬换行、图片处拆段；公式、HTML 片段、脚注换回原文；格式去掉；标题等文字块改成段落；代码块取第一行；引用、列表、提示块、折叠块把第一段拆到最前面（剩下的不合规矩由 schema 补齐）；表格、分隔线、块级公式前面补空段落。光标尽量留在原来那几个字上。撤销时和原事务算一步。
- **存**：`serializeWithTitle`：第一块写成 `escapeTitleLine(文字)`（core `md-text.ts`），后面的块照常写，中间空一行。`\ * _ \` ~ [ $` 都转，`<` 后面跟字母 / `/` / `!` / `?`、像实体的 `&` 才转，行首的 `# - + > = |`、`1.` / `1)` 才转；前后空白去掉。`firstLine` 不用改：转义先当字面量保护起来，去记号的正则碰不到，显示就是原文。添加框（`quickAdd`）、⌘K「新建」、日程、详情里新建关系任务用 `plainTitleMarkdown`（第一行转义，后面照原样）。深链接带来的 `text` 不转（外面可能就是 markdown 正文）。
- **老数据**：打开时 `normalizeTitleDoc` 只改显示，`lastOut` 记规范后的样子，所以只看不改不写回、不触发同步；同步下来的新值同样处理。真改了才按新样子存（第一行 `# 标题` 存成 `标题`）。列表、搜索、⌘K、提醒、小组件的标题照旧用 `firstLine` 去记号，老数据显示不变。
- **⌘? 浮层**：任务里多一行「第一行是标题，只能是纯文字」，九种语言，外语待母语者看。
- 测试：`apps/client/src/components/editor/title.test.ts`（67 项：第一行手打 23 种写法不变、快捷键无效、第二行照常、Shift+回车 / `|a|b|` 回车、第二块上来 8 种被规范、补空段落、撤销、粘贴 4 种、老数据不写回、同步、日记不受影响）；`packages/core/test/title-text.test.ts`（46 项：33 种字面文字往返、老数据标题照旧）。
- 没做：第一行空着时，标题还是取第一条非空行（和以前一样）。

### 任务标题一律是正文第一行，资料只显示缩略图 ✅（2026-11-03）

Rei 2026-11-03 21:00：「重新梳理一下，我新建了一个任务A，然后添加了资料库-电影中的电影B，那么任务列表中，应该显示任务名称是任务A的第一行，电影B只是显示海报缩略图。任务列表中item的第二行小字部分是之前说过的各种属性和状态。」此前还说「任何任务的中文第一行都是标题」。

- **标题**：core `taskTitle(task)` 只看正文：`firstLine(body_md) || 占位`（2026-11-12 09:33 起占位是「未提供描述」/ 倒数日「未命名倒数日」，界面上 `Store.titleOfTask` 按创建时间编号，原来是「空白任务」），不再取类型主字段（资料名）。`taskSubtitle` 删了。客户端 `titleOf` / `viewOf().title` 都走它，所以列表、详情、⌘K（`search.ts`）、挑任务、提醒、小组件、我的一天、时间轴、看板、任务链、完成 / 归档 / 连上的提示、深链接提示都跟着变。以前的取法留成 `itemTitleOf`，只给迁移和新建补第一行用。导出 Markdown 文件夹时文件名照旧 `firstLine || 资料名 || 空白任务`。
- **列表行**（`TaskRow`）：第一行是标题，第二行小字去掉资料名（原来的 `meta-item`），只留类型、项目、日期、重复、相关、状态；第一条资料以外的资料合进「+N」，悬停列出全部（第一条没图时就看不到它，和 Rei 说的「没图就不显示」一致）。行首缩略图（`TaskThumb` 的 `hasItem`）：挂了资料就只用第一条资料的 `image`，版式按资料所在的库（`viewOf().thumbLayout`），没图什么都不放（不用类型图标、不用渐变占位）；没挂资料的照旧。⌘K 的任务行同样。尺寸（`skins.css` 末尾）：Apple、WinUI 竖版海报 24×36（WinUI 2px 圆角加 1px 描边），Material 30×45、8px 圆角，都不超过两行字，有图、没图的行一样高。
- **编辑器**：`plainTitle` 对所有任务开（详情、新建面板），日记、资料备注照旧不开。
- **补第一行**（core `needsTitleLine` / `withTitleLine` / `itemTaskBody`）：正文第一条非空行不是「纯文字标题的存法」（`escapeTitleLine(unescapeMarkdown(行)) === 行`）就算缺标题行，比如空正文、`## 想看理由`、列表、带格式。缺的时候把资料名按 `escapeTitleLine` 转义放到最前面，原来的内容空一行接上。新客户端写的正文第一行总是纯文字，所以只有旧客户端写的和空正文会被补。
  - 新建：`createTask` 挂了资料又没给正文时，正文是「资料名 + 库的正文模板」；新建面板从资料打开（资料库、⌘K「用它新建任务」）或挑第一条资料时预填同样的内容，能改；预填的没改过就跟着换资料。
  - 挂资料：`setTaskItems` 挂上资料后，正文缺标题行就补。
  - 迁移（`Store.migrateTitleLines`）：每次打开、`applyRemote` 拉到任务 / 资料 / 资料关联后都跑，只看「以前标题来自资料名（`itemTitleOf` 非空）且缺标题行」的任务，没有就是空操作。结果只取决于正文和资料名，两台设备各迁一遍得到同一段；补完第一行是纯文字，下次不再动，用户后来改了第一行也不会再插。
  - 同步：补过的正文进 outbox，按行级 LWW 同步。旧客户端在两次同步之间改了同一件任务的正文：旧客户端后写就赢，正文又没有第一行，新客户端拉下来再补一遍，旧客户端写的字都在；迁移后写就赢，旧客户端那次改的正文会丢（只在迁移那一刻撞上才会，概率很小）。
  - 旧客户端（2026-11-03 之前的版本）看迁移过的任务：标题还按资料名显示，列表行标题取正文第一行也是资料名，第二行小字里资料名会再出现一次；详情正文最上面多一行资料名，模板在下面。不影响编辑和同步。
  - 为什么迁移、不在显示时回退：回退要判断「第一行像不像模板」，模板能自定义，判断不稳；而且详情编辑器开了 `plainTitle` 以后，`## 想看理由` 开头的老正文会显示成纯文字段落「想看理由」，第一次改字就当标题存下去。迁移只往前插一行，原文一字不动，幂等、各设备结果一样。
- **演示数据**：《沙丘 2》配一张按名字生成的渐变海报（不用有版权的海报），《繁花》没图，列表里能看到有图、没图两种。
- 测试：`packages/core/test/title-migration.test.ts`（14 项：标题来源、⌘K 标题、模板 / 空 / 列表 / 粗体开头都补、资料名转义、不动的三种、进 outbox、幂等和改过第一行不再插、两台设备结果一样、同步拉到旧任务、`itemTaskBody`、`createTask` 三种、挂资料补第一行）；`packages/core/test/preview.test.ts`（标题、`itemTitleOf`、`isPlainTitleLine`、`needsTitleLine`、`withTitleLine`）；`apps/client/src/lib/view.test.tsx`（7 项：有海报、没海报、多条用第一条、没挂资料，`TaskThumb` 三种）。

### 编辑器：下划线三种、⌘? 写法和快捷键浮层 ✅（2026-11-03）
Rei 2026-11-03 原话：「现在样式支持粗体、斜体、下划线（直线cmd+u、波浪线cmd+u+1、双线cmd+u+2）、cmd+?弹出markdown键盘快捷键tooltip」。任务正文、日记、备注是同一个编辑器，一起有。

- **粗体 / 斜体**：本来就有（⌘B / ⌘I，Windows / Linux 是 Ctrl），存 `**字**` / `*字*`，原文用 `__` / `_` 的照原样写回。补了单测。
- **下划线存法**：markdown 没有下划线，用行内 HTML：直线 `<u>字</u>`、波浪线 `<u class="wavy">字</u>`、双线 `<u class="double">字</u>`。读的时候 remark 把同一层里成对的开、闭标签配成 `underline` 节点（`components/editor/underline.ts` 的 `remarkUnderline`），不成对的、带别的属性的（`<u style=…>`）照旧是 HTML 源码小块，原样存。单引号、大写也认，改过以后写回统一成双引号小写。写出时下划线套在最外面（`<u>**重点**</u>`）：反过来 `这是**<u>重点</u>**内容` 里 `**` 前面是汉字、后面是 `<`，CommonMark 不认它是粗体开头。链接里的下划线也写成套在链接外面（`<u>[字](网址)</u>`），意思一样。普通文字里手打的 `<u>` 写出去转义成 `\<u>`，不会变成下划线。
- **按键**：⌘U 加直线、再按去掉；选了字改选中的，没选改接下来打的字（同 ⌘B）。⌘U 之后 ⌘ 没松开、1 秒内（`UNDERLINE_COMBO_MS`）按 1 / 2：换成波浪线 / 双线，原来就是这种再按同样的组合就去掉（规则在 `nextUnderline`：⌘U 有就去、没有加直线；+1 / +2 是这种就去、不是就换成这种，看的是按 ⌘U 之前的样子）。⌘U+1 之后接着按 2 也行，换成双线。换样式和前面那下 ⌘U 是一次撤销（事务带 `appendedTransaction`，history 并进同一组）。松开 ⌘、超过 1 秒、中间按了别的键，这一组就结束，⌘1 / ⌘2 照常往外传。时间窗里的 ⌘1 / ⌘2 `stopPropagation`，类型页 window 上的 ⌘1 / ⌘2（切常用 / 普通 / 不显示）不会跟着动；全局别处没有 ⌘1 / ⌘2。按键认 `event.code`（KeyU、Digit1），非英文键盘布局也行。
- **组字**：输入法组字中（`isComposing`、229、`view.composing`）⌘U、⌘1 / ⌘2、⌘? 都不处理；ime-guard（优先级 2000）不动，下划线按键是 1500。
- **样式**：`.md u`（编辑器和只读显示一套），线跟字同色、1px、`text-underline-offset` 0.2em；波浪线 `text-decoration-style: wavy`、不避让字形下沿；双线 `double`。三皮肤、深浅色都是字色，不另配颜色。粘贴网页内容只认 `<u>` 标签，不认 `text-decoration: underline` 的样式（网页链接多半是这个，免得粘进来全是下划线）。
- **标题、搜索**：core `stripUnderlineTags`（`preview.ts`）去掉三种下划线标签、不留空格：列表标题取首行（`firstLine`）、⌘K 搜索和片段（`search.ts`，任务正文、日记、资料 / 人物备注）、挑任务的搜索（`task-match.ts` 的 `plainMarkdown`）都用它。搜「wavy」「u」不会命中标签。
- **老版本**：老客户端的编辑器把 `<u>`、`</u>` 显示成两个 HTML 源码小块，中间的字照常显示，存回去不丢；老的只读显示（marked + DOMPurify）本来就显示成下划线，只是三种都是直线。不崩。
- **⌘? 浮层**：⌘?（就是 ⌘⇧/）或 ⌘/（Windows / Linux 是 Ctrl）开关，光标下面弹出（下面放不下放上面，收在视口里），挂在 body 上、`position: fixed`、`pointer-events: none`，只看不点、不抢焦点；Esc、再按一次、点别处、离开编辑器、窗口变大小都收起。Esc 先关浮层，不收起详情。列的都是编辑器真有的（`shortcuts.ts` 的 `shortcutRows`，单测锁着）：粗体、斜体、下划线、波浪线、双线、删除线、行内代码（⌘E）、链接、标题、列表、编号列表、清单、引用、代码块、分隔线、表格、折叠块、公式、换行（⇧↩）。Mac 和 iPad 显示 ⌘ ⌥ ⇧ ↩，别的显示 Ctrl+Alt+Shift+Enter（按平台，不按皮肤）。WinUI 用实色 `--popup-bg`。
- 文案：`trc('格式', …)` 一组格式名 +「写法和快捷键」+ 两行说明，九种语言，外语待母语者看。
- 测试：`components/editor/underline.test.ts`（往返、叠粗斜链接删代码、标题列表表格、不成对、转义、两遍稳定；⌘B / ⌘I；⌘U、+1 / +2、再按去掉、一次撤销、松开 / 超时 / 别的键不算、时间窗里 ⌘1 不外传、空光标、组字不算）、`shortcuts.test.ts`（写法、按键识别、只列真有的、组字不弹）、core `preview` / `search` / `task-match` 去标签、`lib/markdown.test.ts` 只读显示。截图 `work/shots-underline/`。
- 没做：手机上没有快捷键，下划线只能手打 `<u>…</u>`（不在浮层里列）；浮层不能点里面的条目来套格式。

### 版本号分得出第几个 alpha ✅（2026-11-03）
Rei 2026-11-03 22:49 答「要不要让 macOS app 显示 alpha 版本号」：「该改」。以前 `tauri.conf.json` 的 version 写死 0.1.0，装哪个 alpha 都显示 0.1.0，分不出来。

- **规则**放在 `scripts/app-version.mjs`（纯 JS，CI 和 `vite.config.ts` 共用），推标签构建按标签 `v0.1.0-alpha.13` 算，别的构建算「dev + 短哈希」：

  | 平台 | 推标签 v0.1.0-alpha.13 | 手动跑 Actions、本地、网页版 |
  | --- | --- | --- |
  | 设置底部、关于（前端） | v0.1.0-alpha.13 | v0.1.0-dev+2e5b580 |
  | macOS「关于念头团」 | 0.1.0 (13) | 0.1.0 (0) |
  | iOS（规则写好了，ios.yml 没接） | 0.1.0 (13) | — |
  | Windows msi | 0.1.0.13 | 0.1.0 |
  | Windows nsis、exe 资源 | 0.1.0 | 0.1.0 |
  | Linux（AppImage、deb） | 0.1.0 | 0.1.0 |
  | Android versionName / versionCode | 0.1.0-alpha.13 / 100013 | 0.1.0-dev+2e5b580 / 100000 |

- **为什么这样拆**：macOS 的 CFBundleShortVersionString、msi 的版本都只认数字，所以数字部分 0.1.0 不动，alpha 序号放到 CFBundleVersion（`bundle.macOS.bundleVersion`）和 msi 第四段（`bundle.windows.wix.version`）。macOS 关于面板：Rust 菜单传的 `AboutMetadata.version` 是 0.1.0（对应 ApplicationVersion），没传 `short_version`，括号里就是系统从 CFBundleVersion 取的 13，所以 Rust 不用改。
- **预发布序号**：alpha.N → N，beta.N → 300 + N，rc.N → 600 + N；正式版 999（只在 Android 用），非标签构建 0。正式版不填 CFBundleVersion，「关于」只显示 0.1.0。
- **versionCode** = 主 × 10⁷ + 次 × 10⁵ + 修订 × 10³ + 序号，alpha < beta < rc < 正式版 < 下一个版本；主版本最大 209，次、修订最大 99，超了构建直接报错。
- **CI**（`build.yml`）：桌面三个任务和 Android 任务在打包前跑 `node scripts/app-version.mjs apply <平台>`，把版本合进 `src-tauri/tauri.<平台>.conf.json`（Tauri 和 tauri-action 构建时都会合并这个文件；linux、android 的文件 CI 现建，仓库里没有），同时把完整版本写进 `MINDOUGH_VERSION` 给前端。仓库里的 `tauri.conf.json` 还是 0.1.0，以后升版本改这里和标签。
- **前端**：`vite.config.ts` 优先用 `MINDOUGH_VERSION`，没有就按环境自己算（`GITHUB_REF_TYPE=tag` 才用标签名，短哈希取 `GITHUB_SHA`，再没有问 git）。本地和网页版一律是 dev + 短哈希。iOS（ios.yml 只手动触发）的前端也自动是 dev + 短哈希，原生版本没接。
- **设置底部一行小字**：「版本 v0.1.0-alpha.13」。桌面设置窗口在侧栏最下面，Web 宽屏在左边一列下面，手机在七项列表下面。点一下复制完整版本，提示「已复制版本号」；先用浏览器剪贴板，App 里不行再用 clipboard-manager 插件（capabilities 加了 `clipboard-manager:allow-write-text`）。三种皮肤：Apple 灰色小字、按下变淡；WinUI 悬停有浅底小圆角块；Material 胶囊形、强调色淡底。设置 → 关于里的版本也换成同一个字符串。
- 文案 4 条，九种语言。
- 测试：`apps/client/src/lib/app-version.test.ts`（标签解析、序号、各平台、versionCode 排序和上限、merge patch、环境判断）。
- 验证：沙箱和 LightVela 都没有 Rust，原生部分靠 Actions：手动跑了一次 build.yml（非标签构建），结果见 notes。Mac 上要等下一个 alpha 才看得到「0.1.0 (14)」。

### 类型页只有列表滚 ✅（2026-11-03）
Rei 2026-11-03 23:27：「类型页：只有类型列表滚动，而不是整个页面」。页头和搜索框固定，下面的行和说明在 `.cat-list-scroll` 里自己滚；宽屏右边详情单独滚，底部给新建按钮留 96px。窄窗口（≤900px）没选中只放列表，选中了上下各占一半；手机列表卡片停在标签栏上沿，列表底部留 88px 给加号。样式在 `app.css` 的 `.types-page.is-fill`，键盘、拼音搜索、⌘1 / ⌘2 都没动。

### 界面文字不能选 ✅（2026-11-04）
Rei 2026-11-04 16:12：「界面不能selection」。像原生 App 一样，侧栏、顶栏、按钮、列表行、标签、胶囊、设置、菜单、浮层、月历、类型页、资料库卡片、日记活动图都拖不出选区，双击也不选字；手机长按不出系统选字和放大镜。三种皮肤、网页和 App 一样。
- 做法：`app.css` 开头给 `html` 设 `user-select: none` 和 `-webkit-touch-callout: none`（带 `-webkit-` 前缀，照顾 Safari 和 WKWebView）。下面这些再设回 `text`：`input`、`textarea`、能编辑的 `contenteditable`、`.ProseMirror`（编辑器，只读的也算）、`.md`（Markdown 只读内容：发出去的日记正文、资料和人物备注、编辑器没加载完时的占位）、`[data-selectable]`（以后别的地方要能选就加这个属性）。原来就能选的错误信息照旧。
- ⌘A / Ctrl+A（`lib/no-select.ts`）：焦点在输入框或编辑器里照常全选；不在的话不选整页。选区已经在某段能选的内容里，就只选这一段。
- 设置底部的版本号还是点一下复制，本身不能拖选。
- 右键菜单早就全局关了（输入框和编辑器除外），所以 App 里右键不会出「全选」。菜单栏「编辑 → 全选」用鼠标点的那一下走原生命令，不经过 ⌘A 拦截，但它也只能选中上面那些能选的内容。
- 拖图上传、拖动排序不受影响：`user-select` 只管选字，不管拖放。

### 删除桌面小窗 ✅（2026-11-04）
2026-11-04 Rei 要求删除小窗（16:20「删除这个小窗」，指我的一天添加框行尾那个「小窗：置顶显示今天的事」按钮）。整个功能一起删：
- 界面：我的一天添加框行尾的按钮没了，`components/MiniWindow.tsx` 删了，`main.tsx` 不再认 `?window=mini`。
- 窗口：`lib/windows.ts` 去掉 `openMiniWindow`、`setMiniOnTop`、`isMiniWindow`；`isAuxWindow` 现在只指设置窗口。窗口之间同步（`installWindowSync`）、`focusMainWindow`、窗口材质还给设置窗口用，留着。
- 详情：`TaskDetail` 只剩 `pane` 和 `page` 两种，弹窗模式只有小窗在用，连同 `.modal-detail`、`.detail-side` 样式一起删了。
- 权限：`capabilities/default.json` 的 windows 去掉 `mini`，去掉只有小窗用的 `core:window:allow-set-always-on-top`。
- 文案：小窗的 7 条（打开小窗、悬停提示、置顶 / 不再置顶、打开主窗口、今天还没有安排。、加到今天…）9 种语言一起删。
- 手机小组件（Android / iOS，`lib/widget-snapshot.ts`、`src-tauri/src/widget.rs`）和小窗不共用代码，没动。

### 编辑器：⌘K 加链接自动填剪贴板里的链接 ✅（2026-11-04）
Rei 2026-11-04「任务日记编辑器中，选中文本后，cmd+k后自动添加剪贴板中的链接到链接input中」。

- 按 ⌘K 新加链接时读剪贴板，是一条链接就填进「链接」并全选，回车就保存。光标在已有链接里不读，照旧显示原网址。
- 什么算链接：`lib/clip-link.ts` 的 `clipLink`。http(s)、mailto、tel、sms、`www.`（补 https://）、`codex://` 这类别的 App 的链接；先去首尾空白，中间有空白就是一段话，不收；`javascript:` 这类照旧挡掉。`tel:10086` 以前保存不了（会当成主机加端口），这次 `normalizeHref`、`isAppSchemeHref` 也一起认了。
- 怎么读：桌面 App 用 clipboard-manager 的 `readText`（capabilities 加 `clipboard-manager:allow-read-text`，Rust 没改）；网页用 `navigator.clipboard.readText()`，权限已经是 denied 就不问；手机 App 不读。都是先开框再填，用户已经在框里打字就不填。
- ⌘? 浮层多一行「⌘K 加链接时，剪贴板里的链接会自动填上。」，九种语言。
- 测试：`lib/clip-link.test.ts`（纯函数）、`editor/link-clip.test.tsx`（⌘K 开框、填、不覆盖）、`e2e/link-clip/run.mjs`（LightVela 上 Chromium 授权剪贴板，复制 https://example.com 选字 ⌘K 回车成链接；WebKit 没授权也照样开框）。

### 类型和项目的图标统一成彩色方块，项目能选颜色 ✅（2026-11-04）
Rei 2026-11-04 21:41「类型的图标也和项目图标一样，共用样式和图标」；问统一成哪种时答「可以，但类型的颜色很少，也不好看，优化一点，然后统一组件」。

- **一个组件**：`components/IconTile.tsx` 的 `IconTile`，彩色圆角方块 + 白色 Lucide 图标，边长随传的 size，图标按比例缩（16px 以下的小块图标占得多一点）。老数据的 emoji 照常显示。类型（`CategoryTile`）、资料库编辑器的列表和头部、项目（`GroupIcon`）都调它；原来的 `.cat-badge`、`.group-glyph`、`.type-row-icon` 底色那套样式删了。形状按皮肤：Apple 圆角 28%，WinUI 22%，Material 圆形。
- **一个面板**：`components/IconStylePicker.tsx`，上面颜色、下面图标网格（`IconPicker`）。类型页、资料库编辑器、新建 / 编辑项目、项目页左上角都用它。资料库编辑器里单独那行「颜色」去掉了，点头部的图标块改。
- **色板**：core `icon-color.ts` 的 `ICON_COLORS`，18 个，按色相排：红、橙、琥珀、黄绿、绿、翠绿、青绿、青、天蓝、蓝、靛、堇、紫、品红、粉，加棕、蓝灰、灰。前 15 个在 OKLCH 里明度 0.61–0.65、彩度最高 0.17，每个都调到白色图标对比度约 3.5:1；亮暗主题用同一个色值。最后一格照旧能自己调。存 hex，老的 14 色和自己调的颜色照常显示。倒数日卡片的 `CARD_COLORS` 是大块浅底配字，亮暗两套，用途不一样，没合进来。
- **项目颜色**：`group.color`（#rrggbb，可空），客户端迁移 v16 `ALTER TABLE "group" ADD COLUMN "color" TEXT`。空的（老项目）按项目 id 稳定地从前 15 个彩色里挑一个（`groupColor` / `defaultIconColor`，FNV 哈希），每台设备都一样；编辑项目不点颜色就不写。新建项目先随机给一个色板颜色，建好就存下。不认识的值当空。老客户端写来的行没有这个字段，读的时候当空（跟 v14 `my_day_auto`、v15 `card_color` 一样）；老客户端改了项目会把颜色冲掉，回到默认色。云端整行存 JSON，服务端不用改 schema。导出写 `color:`，导入认。
- **尺寸**：侧栏 18px，任务行 14px，属性胶囊和添加框 16px，项目选择器 18px，类型页里项目列表 22px，项目卡片 26px，项目页左上角 28px，⌘K 30px，项目面板预览 40px，类型页详情 44px，资料库编辑器 48px。
- 测试：core `group-color.test.ts`（色板、默认色、改颜色、存取、老行、同步）、`storage`、`archive`、`sync`；client `chip-colors`（新色板也查对比度）、`locales`；core、client `tsc --noEmit`。截图 `work/shots-unified-icons/`。

### 全局搜索改 ⌘F，⌘K 只留给编辑器加链接 ✅（2026-11-05）
Rei 2026-11-05「全局⌘K和编辑器的⌘K冲突，全局用⌘F」。
- 全局搜索（代码里还叫 ⌘K 面板，`CommandPalette`）：Mac 和 iPad 外接键盘按 ⌘F，Windows、Linux 按 Ctrl+F（Mac 上 Ctrl+F 不开，那是光标右移）。判断在 `lib/global-keys.ts`（`isSearchShortcut`），按物理键 KeyF 认，带 ⌥ ⇧ 不算，组字时不开。App 的 window 监听里 `preventDefault`，所以网页版不出浏览器自带的查找，这是有意的。
- 编辑器里 ⌘F 不拦，冒到 window 打开全局搜索（编辑器没有自己的查找）。⌘K / Ctrl+K 在编辑器里总是吃掉、不往外传：有链接框就开链接框，没有就什么都不做；第一行（纯文字标题）照旧不开；组字时不管。编辑器外按 ⌘K 什么都不做，交给浏览器。
- 类型页原来就有 ⌘F 跳到类型搜索框：改成在捕获阶段先拦、`preventDefault`，全局那边看到 `defaultPrevented` 就不开；弹层里不拦。手机布局的类型页没有这个监听，⌘F 开全局搜索。
- 侧栏搜索框的小键帽按键盘显示（`searchKeyLabel`：Mac「⌘F」，别的「Ctrl F」），不再按皮肤猜。我的一天空状态提示改成「⌘F / Ctrl+F」，九种语言。
- Tauri 菜单栏没有 ⌘K 加速键，也没有「查找」项，Rust 没改。
- 这一节之前的条目里说「⌘K」指搜索的，现在都是 ⌘F；说 ⌘K 加链接的不变。
- 测试：`lib/global-keys.test.ts` 9 项；`editor/tiptap.test.ts` 改一项、加一项（⌘K 冒不到 window，⌘F 冒得到，组字不开链接框）。

### 项目能归档 ✅（2026-11-05）
Rei 2026-11-05 原话：「项目可以归档」。

- **存法**：项目上新加 `archived_at`（归档时间，可空），客户端迁移 v17 `ALTER TABLE "group" ADD COLUMN "archived_at" TEXT`。同步照常是整行 LWW，云端整行存 JSON，不用改服务端。老客户端不认这一列：它推上来的行没有这个字段时当没归档（`applyRemote` 补 null，和 v15 `task.archived_at`、v16 `group.color` 一样）；老客户端改了这个项目会把归档冲掉。导出 `_group.md` 写 `archived:`，导入认。
- **core**：`isGroupArchived`、`inArchivedGroup`（`group.ts`）；`Store.archiveGroup` / `unarchiveGroup`（没变不写）、`activeGroups`、`archivedGroups`（最近归档的在前）、`activeTasks`（去掉归档项目里的任务）、`inArchivedGroup(task)`。`myday.ts` 里归档的项目不算「出现在我的一天」，`suggestions` 也跳过归档项目的任务；`backlog` 用 `activeTasks`；`sidebarGroups` 不给归档的（侧栏偏好还记着，取消归档就回来）。
- **为什么只是不显示**：归档不改任务、不删我的一天的行，所以「取消归档后一切恢复」什么都不用补。我的一天按 `lib/project-archive.ts` 的 `visibleDayEntries` 过滤：放进来的时间早于归档时间的藏起来，晚于的（归档后自己从 全局搜索（⌘F）加的）照常显示。
- **界面**：项目 ··· 菜单（`ProjectActions`）加「归档」/「取消归档」，归档了的不给「在侧边栏显示」；项目列表最下面折叠的「已归档（N）」（默认收起）；归档项目页顶上一条提示 + 「取消归档」；积压、时间轴、打卡、倒数日、提醒、小组件用 `activeTasks`；项目选择器 `GroupList` 不列归档的（当前选中的除外）。全局搜索（⌘F）不过滤。
- **测试**：core `group-archive.test.ts`（归档 / 取消、列表和侧栏、任务不动、自动进我的一天、建议、待安排、全局搜索（⌘F）、v16 → v17 迁移、老客户端的行、同步）；client `lib/project-archive.test.ts`（我的一天、小组件）、`locales`。
- **没做**：项目页里的看板、时间轴、任务链视图照常显示归档项目的任务（打开项目就是要看）；类型页里挂着这个类型的项目列表也照常列出归档的。

### 编辑器复制只给纯文本 ✅（2026-11-05）
Rei 2026-11-05「任务编辑器中的复制，不要带样式或者markdown标记」，同一天定了念头团里外都只要纯文本。

- **剪贴板**：复制、剪切只写 `text/plain`，不写 `text/html`，也不写自定义类型。任务和日记共用一个编辑器，行为一样。逻辑都在 `components/editor/clipboard.ts`（`clipboardPlugin`），取代原来的 `copy-details.ts` 和 `extensions.ts` 里的 `markdownClipboard`。
- **写出去的字**：就是看到的字。标题、粗斜删、行内代码、引用、列表符都去掉；有序列表的编号也去掉，嵌套列表不缩进；清单不带勾选框；链接只留文字（文字和网址一样就是网址）。段落、标题、列表项之间各换一行，空段落保留成空行，段落里的 Shift + 回车照留。表格一行一行，格子之间用 Tab 分隔；分隔线不留；代码、公式留原文；脚注写成 `[1]`。折叠块只剩标题一段、正文跟在后面。
- **粘回来**：剪贴板里的字正好是念头团刚复制出去的（`isOwnCopy`，只记最近一次），就按字面一行一段放进来（`literalParagraphs`），不当 markdown 读，不然单换行会读成段内换行、`*` `_` 会变成格式。外来的纯文本照旧按 markdown 解析。粘到任务第一行时，`title.ts` 也走这条规则：第一行进标题，后面的照字面一行一段。VS Code 复制来的代码照旧变代码块。
- **拖动**：拖出编辑器只带纯文本（`dragstart` 时去掉 ProseMirror 写的 `text/html`）。在同一个编辑器里拖着挪位置，ProseMirror 用的是内存里的原内容，格式保留，这是挪动不是复制。拖到另一个编辑器里是纯文本。选区两头在折叠块里时，`unwrapOpenDetails` 拆掉外面那层，挪的时候不会多套一层折叠块。
- **变了的地方**：以前整块复制折叠块再粘回念头团还是折叠块，现在是纯文字。
- **测试**：`editor/clipboard.test.ts` 45 项（只写纯文字、没有记号、剪切、只读也能复制、念头团编辑器之间粘贴、第一行、外来 markdown、折叠块各种选法、拖动）；`editor/tiptap.test.ts` 跟着改。

### 我的一天：分两段、新加的在上、改日期就移出 ✅（2026-11-08）
Rei 2026-11-08 三条：「我的一天中，未完成、完成两个section显示」「添加到我的一天的任务放在最上面」「用户设置的日期不是今天时 取消我的一天」。

- **原来**：做完的（完成、关闭、今天打够卡的打卡）沉到同一张清单底部，和没做完的混在一个可拖动列表里；新加的排最后（sort = 当天最大 + 1），自动加入的 sort 是 0。
- **分两段**：core `myDaySections` 按 `isDoneOn` 分「未完成」「已完成」，`reorderSection` 把一段拖完的顺序拼回整天的顺序再交给 `reorderMyDay`。界面上两个 GridList，各自拖动，不能跨段拖。已完成那段的开关借打卡页的 `habit-archived-*` 样式，收没收存本机设置 `myDayDoneOpen`（默认展开：做完的事刚勾上就看不见，容易以为点错了；Rei 想默认收起就改默认值）。只有一段时不放段标题。关闭的进已完成段，和以前沉底一样，只是不计入「x/y 已完成」。
- **新加的在上**：不加列、不迁移。`addToMyDay` 的 sort 用 `topSort` = 负的加入毫秒数（且比当天已有的都小），越晚越小；拖过的行是 1..N，所以新加的总在它们上面。老客户端只按 sort 从小到大排，看到的也是新的在上；老客户端自己加的还是 max + 1，排最后，这没问题。多台设备各自加的按加入时刻排，同步后顺序一样。
- **自动加入的位置**：自动加的行要各设备写得一模一样（同 id、同时间戳 `AUTO_MY_DAY_HLC`，见上面「项目任务直接进我的一天」），不能用「现在几点」。所以 sort 用 `autoSort`：取任务和它前置里最晚的 `updated_at`（改日期、前置刚做完那一刻），不早于那天 `00:00Z`，取负。同样的数据算出来一样；万一两台设备看到的任务版本不同，算出来的 sort 不同，时间戳相同时各留各的，只影响这一行在两台设备上的位置，拖一次就统一了。
- **改日期就移出**：放在 `Store.updateTask` 里：`scheduled_date` 或 `end_date` 真变了、新开始日不空、任务在设备今天的我的一天里，而新的日期（段）既不含设备的今天、也不含任务时区的今天（`keepsMyDayAfterDate`），就 `removeFromMyDay`。它会写墓碑（`myDayEntryId`），`syncAutoMyDay` 看到当天有过行就不再加。所有改日期的入口都走 `updateTask`，所以不用一个个改；同步拉下来的行走 `applyRemote`，不经过这里，别的设备只收到那条墓碑，不会再移一次。清空日期留着。从提示里撤销改日期不会把它放回我的一天。
- **日期设成今天就加入**（Rei 2026-11-08 21:50「如果日期设置的今天，自动添加到我的一天」）：和上一条对称，也放在 Store 里。`createTask` 写完、`updateTask` 里日期真变了以后调 `joinMyDayOnToday(task, before)`：新的日期（段）含设备的今天或任务时区的今天、改之前不含（`keepsMyDayAfterDate`），就 `addToMyDay`（`topSort`，排未完成最上面，`added_at` 是真实时刻，和手动加入一样，不算自动行）。
  - 不处理：没日期、有 `recurrence`（打卡的开始日只是起点）、完成 / 关闭、置顶（本来就每天在）、`archived_at`（归档的打卡）、归档项目里的、已经在今天的（不动它原来的位置）。倒数日按 `scheduled_date` 算，`target_date` 变了不算（倒数日到了那天本来就有建议 / 项目自动加入）。
  - 当天移出过（有墓碑）：照样加，`addToMyDay` 用同一个 `myDayEntryId` 写 `deleted: false`，墓碑翻回来。移出是「今天别出现」，改日期到今天是用户新的意思，以后者为准。
  - 同步：`applyRemote` 不经过这里，别的设备只收到这台写的那一行，不会再加一次。
  - 撤销：念头团没有「撤销改日期」的提示；改回原来的日子走的也是 `updateTask`，原来是别的日子就按上一条移出，原来没日期的留着（清空日期留着的规则）。
  - 演示数据 `createTask(..., { joinMyDay: false })`，我的一天由 demo 自己排。core 测试里模拟「早就定了今天」的任务也这样建。
  - 项目开着「出现在我的一天」的任务：这台设备改日期时就手动加了（真实时间戳的行），`syncAutoMyDay` 看到当天有行不再加；跨天才变成今天的照旧由自动加入管。
  - 测试：core `myday-date-join.test.ts` 8 项；`myday-auto.test.ts`、`group-archive.test.ts` 里日期是今天的任务改成 `joinMyDay: false` 建。
- **测试**：core `myday-order.test.ts` 13 项（后加的在上、同一毫秒叠上去、拖过后新加的在上、老数据、自动加的位置、autoSort / topSort、两台设备同步后顺序一样、分段与段内拖动、改到以后 / 以前移出且当天不再自动加、改成今天 / 清空 / 段含今天留着、同步不重复移）。演示数据倒着加，显示顺序不变。

### 弹窗搜索框里退格不关窗、不乱跳 ✅（2026-11-08）
Rei 2026-11-08「弹窗的搜索框，backspace删除时会错误地关闭窗口并乱跳转」。2026-11-02 修过一次（e5277ba，见上面「挑任务的搜索框」），那次只让全局快捷键让路，没找到真正的原因。

- **根因**：WebKit（macOS、iOS 的 App 用的 WKWebView）默认开着「退格 = 返回上一页」：Backspace 落在不能打字的元素上、没人 preventDefault，就 `history.back()`。路由在 hash 里，一返回，详情的 `?task=` 没了或回到上一个页面，详情里开着的弹窗跟着卸掉。搜索框能打字，按键为什么落到别处：react-aria 的 Autocomplete（挑任务、币种选择）把输入框里的每个按键再造一份，派发到列表或高亮的那一项上，这份的 target 是列表。Chromium（Windows、安卓、网页版）没有退格返回，所以只在 Mac / iOS 的 App 里出现；Playwright 的 Linux WebKit 也不返回，浏览器里测不出来，只能测到「按键被转发到了列表」这一步。
- **改法**：
  - 源头：`lib/backspace-guard.ts` 的 `keepEditKeysInInput` 挂在 Autocomplete 外层的捕获阶段（`useImeQuery` 的 handlers 带上了，挑任务用；币种选择单独包一层），Backspace / Delete 停在输入框里，不再转发。不能在转发的那份上 preventDefault：Autocomplete 看到被拦，会连原来的按键一起拦，字就删不掉了。
  - 兜底：`installBackspaceGuard`（`main.tsx` 装上）在 window 冒泡阶段，Backspace / Delete 落在不能打字的元素上、焦点也不在输入框 / 文本框 / 编辑器里、没人处理过、不在组字，就 preventDefault。属性胶囊上按退格清除照旧（它自己先处理了）。
  - 空框按退格：类型选择（`CategoryPicker`）以前空框按退格会删掉最后一个已选类型，删光了胶囊消失、弹层跟着关；这个去掉了，去掉已选类型用它上面的 ×。
  - Esc：⌘F 搜索框的 `onKeyDown` 被 react-aria 包过，默认拦住冒泡，Esc 到不了弹窗，一直关不掉；现在别的键都 `continuePropagation`。其他弹窗 Esc 本来就能关。
  - 字母键：全局 N、方向键、类型页打字跳搜索框都已经用 `typingKey`（焦点在能打字的地方或在组字就让路），这次没改。
- **测试**：`lib/backspace-guard.test.tsx` 7 项（页面上退格被拦、输入框 / 文本框 / 编辑器 / 组字不拦、转发的那份不拦、挑任务和币种选择删字时退格 Delete 不再转发到列表而方向键照转）；`TaskSearch.test.tsx` 跟着改。浏览器里逐个弹窗（⌘F、三种关系、属性的类型 / 项目 / 资料 / 日期、新建面板的相关任务）打字、退格到空再多按、Delete，看弹窗还在、地址没变、焦点在框里：`work/shots-tool/popup-backspace.mjs`（LightVela，Chromium + WebKit）。

### 侧栏和任务列表不显示滚动条 ✅（2026-11-08）
Rei 2026-11-08「侧边栏、任务列表的scrollbar不显示」。

- 只藏滚动条，照样能滚。两套写法都写：`scrollbar-width: none`（Firefox、新 Chromium）和 `::-webkit-scrollbar { display: none; width: 0 }`（WKWebView、WebView2、安卓 WebView 都认）。
- 范围：侧栏（`.sidebar`，macOS 无标题栏时滚的是 `.sidebar .nav`）；任务列表的页面由 `App.tsx` 的 `HIDE_SCROLLBAR_PAGES`（我的一天、待安排、积压、时间轴、项目页）在 `.main` 上标 `data-hide-scrollbar`，样式管 `.main`、macOS 无标题栏时的 `.main-scroll` 和项目页的 `.project-scroll`。日记、设置、资料库、类型、打卡、倒数日、编辑器、弹窗都不动。要加页面就加进那个数组。
- 测试：`lib/hide-scrollbar.test.ts`；截图脚本量 `offsetWidth - clientWidth` 为 0（三皮肤）。

### 项目页滚动时页头和添加框不动 ✅（2026-11-08）
Rei 2026-11-08「项目中滚动时，保持输入框以上的部分不动」。

- 做法：`GroupDetail` 把页头、归档提示、添加框包进一个 `.project-head-sticky`（`position: sticky; top: 0`，不透明页面底色，左右多铺一点盖住行的悬停底色），整块固定在中间列顶上；用 `QuickAddBar` 的 `useStuck` 哨兵，滚动后加 `is-stuck` 画底线。里面的添加框不再自己 sticky。没有另开滚动层：宽屏的 `.main`（macOS 无标题栏时的 `.main-scroll`）、手机的 `.main` 照旧是滚动的那一层，四种视图都一样。
- 看板、时间轴横向滚是它们自己的，不受影响。
- 截图核对：三皮肤 × 宽屏 / 手机，滚到底后页头和添加框还在原位置（`work/shots-tool/myday-sections.mjs` 里的项目页一段）。

### 电影不显示「看到哪」 ✅（2026-11-08）
Rei 2026-11-08「任务属性 资料 影视：电影不显示看到哪」。

- 判断在 core `library.ts`：`isMovieItem(item)` 先看资料字段 `kind`（「电影/剧集」，电影 → 是，剧集 → 不是），没选再看 `_source`（`tmdb:movie/…` 是电影，`tmdb:tv/…`、豆瓣、没来源都不算）；`taskFieldsFor(type, items)` = `taskFieldsOf` 去掉 `kind: 'episode'` 的字段，条件是挂的这个库的资料不空且全是电影。
- 用在：任务详情的资料区（`RefsSection` 的任务字段行）、新建面板的任务字段和「从第一行认集数」、详情改正文时自动填集数（挂的是电影就不认）。老任务只选了库没挂资料的（`TypeFields`）没有资料可判断，照常显示。
- 列表行第二行小字、资料卡 `ItemCard`、资料详情页都不显示任务字段里的「看到哪」，没改。值存在 `task.type_data` 里不删；导出照常带上。
- 测试：core `movie-episode.test.ts` 5 项。

### 关系弹窗也列已完成的任务 ✅（2026-11-08）
Rei 2026-11-08「已完成的任务也在关系弹窗中显示」。2026-11-02 起「先做完这些 / 做完后解锁」不列已结束的（`hideFinished`），这次去掉：`RelationPicker` 不再传 `hideFinished`，三种关系都列完成、关闭的任务。`TaskSearch` 本来就把已结束的排在后面、淡色加「已结束」，能选。连一个已完成的前置不会让这件「还不能开始」（派生状态只看没结束的前置）。新建面板的「相关任务」本来就列。`hideFinished` 参数留着，现在没人用。测试 `TaskSearch.test.tsx` 加一项。

### 项目任务只有当前的才自动进我的一天 ✅（2026-11-08）
Rei 2026-11-08「项目"出现在我的一天"，只有当前的显示在我的一天，过期的、没到的都不显示」。

- 规则：`autoMyDayTasks` 多一个条件 `isCurrentFor`：有日期的（非重复）任务，日期是今天、或日期段含今天（设备的今天或任务时区的今天，同 `keepsMyDayAfterDate`）才自动加。以前「今天到期」包括过期，现在过期的不加；没到的本来就不加。
- 没日期的照旧：今天要打卡的打卡、倒数日到了、刚解锁的没日期任务，还按原来的条件自动加。刚解锁但日期不当前的也不加。
- 已经自动加进来的：老版本早上把过期任务加进来了，或者自动加的行后来不当前了，那天就不显示（`isStaleAutoEntry`，在客户端 `visibleDayEntries` 里过滤，我的一天、侧栏数字、小组件都走它）。只是不显示，不删行、不写墓碑。认自动行靠 `added_at` 是那天 `00:00Z` 的字面值（`syncAutoMyDay` 写的，拖动排序不改它）；手动加的是真实时刻，不受影响。
- 项目里过期的任务：开着「出现在我的一天」的项目不进建议（本来就是这样），所以现在过期的项目任务我的一天里看不到，去积压看。要它们回到建议里，改 `suggestions` 里的 `inAutoGroup` 条件就行，等 Rei 定。
- 测试：core `myday-auto.test.ts` 改两项（过期的不再自动加；「移出后当天不再冒出来」换成日期段任务）、加两项（过期 / 段已过 / 没到不加、改到今天就加、打卡照旧；老自动行过期了不显示、手动加的照常）。

### 侧栏「管理」加「已完成」页 ✅（2026-11-08）
Rei 2026-11-08「侧边栏 管理 添加一个"已完成"入口」。

- 入口：侧栏「管理」最下面「已完成」（Lucide circle-check），排在「类型」后面（`lib/nav.ts` `manageEntries` 多一个 `done`）；手机在「更多」的「管理」里。路由 `{ page: 'done' }`，`#/done`，别名 `#/completed`；深链 `view/done`（别名 `view/completed`）。列表页带右列详情（`LIST_PAGES`），不显示滚动条（`HIDE_SCROLLBAR_PAGES`）。
- 列哪些：状态是完成或关闭（core `isFinished`）。规则在 core `done-list.ts`：`doneTasks` 筛选和排序，`doneDays` 按本机日期分段，`doneDayLabel` 写段标题。页面是 `pages/Done.tsx`，行用 `TaskRow`。
- 打卡、倒数日：每天打卡只记 check_in，不改状态，所以还在打的打卡不进来；「不再打卡」（关闭）或标完成的才进来。倒数日一样，关掉或标完成的进来。打卡归档（`archived_at`）不改状态，不影响这页。
- 归档项目里的任务不列：传 `store.activeTasks()`，和积压、待安排一致；取消归档就回来。⌘F 搜索不变。
- 排序：按结束时间从新到旧。结束时间是 `done_at`（完成、关闭都记，重新打开清空）；老数据没有 `done_at` 或读不出时，用 `updated_at`（HLC）的毫秒顶上，所以那件被别处改过就会往前跑。同一时刻按 id 倒序，各端一致。
- 分段：按结束时间落在本机的哪天，不按任务时区（和任务链「X 天前完成」一样用本机日期）。段标题今天 / 昨天 / 具体日期（`formatDate`，不是今年带年份）；理论上没有时间的那段叫「更早」，实际每行都有 `updated_at`，碰不到。
- 取消完成：点行首圆圈（`toggleDone`，结束了就重新打开）或详情里「重新打开」；重新打开后这件立刻从这页消失，行上没加撤销提示（和别的列表一样）。
- 不加迁移，不改云端。新字符串 4 条，9 种语言（7 种待母语者看）。测试：core `done-list.test.ts`（筛选、排序、分段、归档项目、重新打开），client `nav.test.ts`、`deeplink.test.ts`、`hide-scrollbar.test.ts` 跟着改。

### 任务置顶 ✅（2026-11-08）
Rei 2026-11-08「任务支持置顶，置顶的任务在我的一天中永远显示，直到用户手动关闭」。

- 数据：`task.pinned_at`（置顶时间，迁移 v18），空 = 没置顶（2026-11-12 起置顶看内置类型「置顶」，`pinned_at` 只当排序键和给老客户端看，见下面「置顶改成类型」）。`Store.pinTask` / `unpinTask`，已经是那个状态的不写。老客户端写来的行没有这一列，`applyRemote` 补成空（当没置顶）；云端只存整行 JSON，不用改。导出导入写 `pinned`。
- 我的一天怎么显示：不写 my_day 行，按 `pinned_at` 算出虚拟行（core `pinnedDayItems`，id 前缀 `pinned:`），`withPinned` 放到当天清单最前面，同一件也有 my_day 行的只留置顶那项。所以改日期移出、移出当天、项目「出现在我的一天」开关、`isStaleAutoEntry` 都管不着它。客户端的我的一天页、侧栏数字、小组件快照都走 `lib/myday-items.ts` 的 `dayItems`。
- 排序：置顶的在「未完成」段最上面，后置顶的在上；不给拖动把手，`reorderSection` 去掉置顶的，拖别的不会改到它。
- 做完：只做一次的，`done_at` 落在本机哪天，那天就在「已完成」段，之后不显示，`pinned_at` 不动；重新打开（`done_at` 清空）又回来。打卡看那天的周期达没达标，每天都在。**待 Rei 定**：做完以后要不要自动取消置顶、或者一直留在「已完成」段。现在是按这次的说法「做完那天出现，之后不显示但保持置顶」。
- 不显示的：删了的、打卡归档了的、在归档项目里的（取消归档就回来）。
- 别处：置顶的不进「昨天没做完」、建议、待安排（`Store.backlog` 过滤）。菜单（`lib/task-menu.ts`）里置顶了的只给「取消置顶」，不给加入 / 移出我的一天；太阳按钮（详情顶栏、⌘F 搜索结果、行尾）显示成已在今天，点了提示先取消置顶（`lib/actions.ts` `toggleMyDay`）。
- 测试：core `task-pin.test.ts` 15 项（置顶 / 取消、每天出现、排在新加的之上、改日期和移出不影响、项目开关、归档项目、做完 / 关闭 / 打卡、不进建议和待安排、排序、迁移 v17→v18、老客户端行、同步、导入导出）；client `task-menu.test.ts`、`myday-items.test.ts`。

### 置顶改成类型 ✅（2026-11-12）
Rei 2026-11-12 03:44「置顶任务应该用"类型"，一个叫做"置顶"的类型，这样会不会更方便？」、03:46「有置顶类型就置顶。没就不置顶不就好了」。

- 内置类型「置顶」：固定 id `00000000-0000-7000-8001-000000000028`（`PIN_CATEGORY_ID`，seed/builtin-checkin-categories.ts），红色 `#ff3b30`、Lucide `pin`，`builtin: true`。不在 27 个的 SEED 里：不进默认分组（原来落在「其他」，2026-11-12 07:20 起在固定的「内置」组，见「内置类型单独一组「内置」」），不进默认「常用」。老用户打开时 `ensureBuiltinCategories` 补上。名字九种语言走 `dataLabel`（DATA「置顶」）。同名的自建类型「置顶」会按同名合并并进它（内置的留下），挂了那个类型的任务也就置顶了。
- 置顶的唯一依据是类型：`Store.pinnedAt(task)`（挂着「置顶」、类型没设成不显示才返回时间）、`isPinned`、`pinEnabled`、`hasPinCategory`。myday.ts 的纯函数（`pinnedDayItems`、`checkInDayItems`、`makeupDayItems`、`isVirtual*Today`、`yesterdayUnfinished`、`suggestions`）都收一个 `pinOf`，界面和 Store 传 `store.pinnedAt`；不传时还看 `task.pinned_at`（老测试用）。界面上判断置顶都用 `store.isPinned`，别再读 `task.pinned_at`。
- `pinTask` / `unpinTask` = `addTaskCategory` / `removeTaskCategory`（挂在最后）。在类型选择器里勾上、去掉一样。
- 双写：`write()` → `syncRefs` 按类型把 `pinned_at` 写回去（挂上时写成现在，摘掉清空；只改别的类型不动它）。这批直接改了 `pinned_at` 的（导入、`createTask({ pinned_at })`、老代码路径）反过来按它挂 / 摘。单值 `category_id` 跳过「置顶」：它不当主类型，老客户端显示的类型、按类型分区都不受影响。
- 排序键：`pinned_at`；只同步来类型没有 `pinned_at` 的（两台设备的行交错时会有），用关联行 HLC 的时间，再不行用任务 `updated_at` 的时间。
- 老客户端和迁移：`refs_mirror` 签名置顶时多一个 `|P`。只认 `pinned_at` 的客户端置顶（签名里没 P）、取消置顶（签名里有 P、`pinned_at` 空），新客户端在 `legacyLinks` → `legacyPinLink` 里挂上 / 摘掉；关联行比任务行新就不动。补的行 id 由任务 + 类型算出（`taskCategoryId`，task_category 主键），updated_at 用任务行的，不进 outbox：几台设备各补一遍是同一行，不会重复。打开时 `backfillRefs` 跑一遍，就是迁移：以前 `pinned_at` 有值的任务都补挂上。没加 schema 迁移，云端不用改。
- ~~设成不显示（类型的「归档」）：`pinEnabled()` 为假……~~ 2026-11-12 04:20 作废：「置顶」锁定，不能设成不显示，`pinEnabled()` 总是 true（参数留着），见下一节。
- 分区和筛选：`categorySectionOrder` 去掉「置顶」，`sectionTasks` 按任务第一个能成段的类型分（跳过置顶）。打卡、倒数日的类型筛选（`usedCats`）照常列出它。列表第二行、打卡卡片颜色用 `store.categoriesOfTaskNoPin`。重复倒数日的记录不抄「置顶」。
- 测试：core `pin-type.test.ts`（挂 / 摘、选择器、先后、不显示、直接写 pinned_at、倒数日记录、迁移幂等、老客户端置顶 / 取消、只有类型的兜底时间、两台设备同步）；原来的 `task-pin.test.ts` 照过。

### 只有「置顶」是内置类型 ✅（2026-11-12）
Rei 2026-11-12 04:19「内置类型会在类型页显示，但不可以编辑」，04:20 改成「限制只有置顶是内置类型」「现在」。04:41 又加了「收藏」「紧急」「重要」三个内置类型（见下一节），下面说「置顶」的锁定规则对四个都一样。

- 内置类型只剩「置顶」（04:41 起加上收藏、紧急、重要，`BUILTIN_CATEGORIES` 四个）。锁不锁只看 id：core `isBuiltinCategory(c)`（categories.ts）、`Store.isCategoryLocked(id)`。行里的 `builtin` 列不再表示锁定，只表示「原来是内置的」（同名合并时还排在前面）。
- 锁定在 core 挡住：`updateCategory` 返回 false；`setCategoryState` 不改、返回它的档（永远「普通」）；`setCategoryGroup`、`reorderCategories` 跳过它；`remove` 本来就不让删类型。别的路径直接写这一行（`store.update`、导入、同名合并）时，`write()` 里一律按内置定义写（`canonicalBuiltinCategory`）。偏好里给它记的「常用」、换的分组都不算（`frequentCategoryIds` 去掉它、`categoryGroupOverrides` 删掉它）。同名合并 `survivorOrder` 让它永远留下。
- 老客户端（e711402 及以前）还能改它。新客户端打开时、拉到类型行后（`settleCategories` → `settlePinCategory`），这一行和内置定义不一样就用新时间戳写回内置定义（进 outbox）。这样云端也改回来了，老客户端下次拉到也变回原样；老客户端再改，下一台新客户端再改回去。偏好里的常用 / 分组不改写，只是不认。决定：显示和写回都按内置定义，库里改过的名字图标不留。
- 界面：类型页详情（pages/Categories.tsx `CategoryHead`）对它只读：图标块不是按钮、名字是 `h2` 纯文字、没有三档和分组，一行说明「内置类型，不能改。挂了它的任务就是置顶的，每天都在我的一天最上面。」（新文案，九种语言，外语待母语者看；原来那句「设成不显示后……」删了）。手机上它那行不左滑；`useCategoryActions` 对它不动、不出提示，⌘1 / ⌘2 / ⌘3 也就没反应。没有右键菜单（类型页本来就没有）。任务挂上 / 摘掉照常。
- 「置顶」不显示 = 关掉置顶，这条作废：`pinEnabled()` 总是 true，`pinnedAt` 不再看显示状态。以前设成不显示的，打开时改回显示，置顶跟着回来。
- 原来的 27 个内置类型变成普通类型：id 不变（`FORMER_BUILTIN_CATEGORY_IDS`，旧名 `BUILTIN_CATEGORY_IDS` 留着当别名），任务、项目、打卡的关联不动，能改名、换图标颜色、换分组、改档、设成不显示。现在的名字、图标、颜色、显示状态都保持原样，改过的不恢复默认，库里不写任何东西。
- 名字的语言：选「保留多语言显示」，不固化。没改过名的行存的还是中文原名，界面照旧用 `dataLabel` 按当前语言显示；改过名的显示用户写的。理由：固化要每台设备按自己的界面语言写名字，两台语言不同的设备会互相盖（行级 LWW），而且改动会同步给老客户端；不固化什么都不用写。代价：以后用户新建一个叫「运动」的类型也会被翻译显示（以前就这样）。
- 新库不再预置那 27 个，只预置内置类型（`ensureBuiltinCategories`）。为了不丢显示：任务（`category_id` / `checkin_category_id`）、`task_category`、项目指着原内置 id、本机却没这一行时，按原定义补回（`reviveFormerCategories`：打开时、本机写入时、拉完类型 / 任务 / 项目后），用原来的内置时间戳，云端或别的设备上任何真改动都比它新，拉下来就盖掉它。所以新设备还没同步就建了挂「运动」的任务（演示数据就是这样）也能显示；同步后显示的是云端改过的名字。老客户端打开时还会按它们的种子补全 27 个（内置时间戳），推上云端后新客户端也会看到这几行，属于正常数据。
- 「普通」「项目」不是类型，是资料库（task_type）的内置项，这次没动；「项目」资料库 r4 默认归档那条照旧。

### 内置类型「收藏」「紧急」「重要」：标题变色 ✅（2026-11-12）
Rei 2026-11-12 04:41「内置类型再添加几个"收藏"（任务列表中任务标题是黑黄色）、"紧急"（任务列表中任务标题是黑红色）、"重要"（任务列表中任务标题是黑蓝色）。颜色要注意light dark theme。」

- 固定 id 号 29（收藏，Lucide `star`，图标块 #f5a623）、30（紧急，`siren`，#e5484d）、31（重要，`flag`，#0a84ff），`STAR_CATEGORY_ID` / `URGENT_CATEGORY_ID` / `IMPORTANT_CATEGORY_ID`，进 `BUILTIN_CATEGORIES`，和「置顶」一样锁定、打开时补齐、老客户端改过的改回。名字九种语言走 `dataLabel`（DATA）。
- 不当主类型：core `isMarkerCategory`（= 内置类型）。单值 `category_id`（`syncRefs` 的 firstCat）、`categoriesOfTaskNoPin`（列表第二行、打卡卡片颜色）、客户端 `categorySectionOrder`（按类型分区）、重复倒数日记录都跳过它们。
- 标题颜色：core `titleMarkOf(ids)` / `Store.titleMark(task)`，紧急 > 重要 > 收藏（`MARK_ORDER`，我定的）。客户端 `TaskRow` 和倒数日页的行在 `.row-title` 上加 `is-mark-urgent|important|star`；`styles/app.css` 里按 `:root[data-skin][data-theme]` 六组写死 `--mark-*`（不用 color-mix），选择器 (0,4,1) 盖过 Material 选中行的标题色；`.is-done` / `.is-closed` 里照旧 `--text-3`；素净档 `--mark-*` = `--text` 再加粗。对比度用 `work/d1112-builtinlock/contrast.py` 对每套皮肤的底、卡片、悬停、选中底色算过，最低 4.99（亮色）/ 5.02（暗色）。
- 同名合并：以前自己建过叫「收藏」「紧急」「重要」的类型，会按同名合并并进内置的（内置的留下），挂着它们的任务标题跟着变色。
- 测试：core `builtin-lock.test.ts`「收藏 / 紧急 / 重要」两项；UI 自查 `work/d1112-builtinlock/marks.mjs`（三皮肤 × 亮暗，量计算后的颜色）。
- 测试：core `builtin-lock.test.ts`（锁定、直接写也改回、老客户端改过的打开 / 同步时改回并推回云端、同名自建「置顶」并进内置的、新库只有置顶、原内置改过的不恢复且能接着改、缺行补回、补回的不盖云端）；`pin-type.test.ts` 的「设成不显示」改成「不能设成不显示」；`store.test.ts`、`seed.test.ts`、`category-prefs.test.ts` 跟着改。

### 内置类型单独一组「内置」，排在最下面 ✅（2026-11-12）
Rei 2026-11-12 07:20「把置顶、收藏、紧急、重要这四个类型分到"内置"分组中，放在最下面」。

- core 加一个固定分组 id `builtin`（`BUILTIN_CATEGORY_GROUP`，category-prefs.ts）。它不在 `CATEGORY_GROUPS` 里，所以 `isCategoryGroup` 不认它：偏好 `category.groups` 里写了 `=builtin` 也不算，`setCategoryGroup` 换不进去。
- 内置类型在哪组只看 id：`categoryGroupOf` / `defaultCategoryGroup` 对四个内置 id 一律返回 `builtin`，overrides 里有什么都不看。旧数据里给置顶记过的分组（`category.groups`、`category.custom_group_of`）照旧不认，不用迁移，什么都不写。
- 顺序：`categoryGroupOrder` 把它放在「其他」后面，`Store.categoryGroupIds()` 带着它；`groupRank` 让没用过的类型按组排时它也在最后。
- 不能自建同名分组：`createCategoryGroup('内置')` 返回 null；选分组下拉（`CategoryGroupCombo`）不列它，打「内置」或它在当前语言的名字，既搜不到也不出「新建分组」。
- 类型页列表、图标两种模式：「内置」组排在最下面，「不显示」那组也在它上面（Rei 说「放在最下面」，按字面做）。组名走 `trc('类型分组', '内置')`，九种语言。
- 搜索结果（类型页和选择器）：内置类型排在别的类型后面、「新建」那行前面。类型选择器：不搜时最后一组是「内置」；内置类型不进「最近用过」（挂过置顶也一样），只在「内置」组出现。
- 测试：core `category-groups.test.ts`「固定分组「内置」」四项；`builtin-lock.test.ts` 置顶的组改成 `builtin`；client `CategoryGroupCombo.test.ts` 加一项。UI 自查 `work/d1112-builtingroup/bg.mjs`。

### M5 项目视角
- SS / FF / SF 与间隔（lag）。
- 关键路径与日期推算（沿前后关系推最早开始，超出组结束时间标红）。
- 甘特图：项目页「时间轴」视图已有横条和前后关系箭头（2026-10-26），关键路径、拖动改日期还没做。
- 正文逐字合并（CRDT，取代整段 LWW）。

## 删空资料库（Rei 2026-11-10）

Rei 2026-11-10 08:43：「空资料库可以删，有内容的不可以」。起因是早期误建的空资料库「新类型」想去掉。改了 10-17 的「资料库只能改和归档」。

- 判空（`Store.typeContent` / `isTypeEmpty`，纯函数 `typedef.ts` 的 `isTypeContentEmpty`）：没删掉的任务 `type_id` 是它（任何状态，完成、关闭、归档的打卡、归档项目里的都算）、没删掉的资料 `library_item.type_id` 是它、没删掉的项目 `default_type_id` 是它（含归档项目），三样都是 0 才算空。`task_item` 关联的是资料，资料在就不空；删掉的任务不算，因为任务删了不会回来（没有回收站）。
- 谁能删（`typeDeleteBlock`）：普通、人物 → fixed；内置（`builtin` 或种子固定 id）→ builtin，空的也不给删，只能归档；有内容 → not_empty；空的自定义（含复制出来的）→ 能删。归档着的也能删。`Store.deleteType` 不满足就抛 `TypeDeleteError`。
- 为什么内置的不给删：`ensureBuiltinTypes` 只看行在不在、是不是旧内置戳，新版本里墓碑不会被补回；但新设备第一次打开先按种子写内置行、老客户端的补齐逻辑也不一样，不给删最省心，也不用加墓碑判断。
- 删除：`task_type` 行打墓碑（`deleted: true`，HLC 新戳），和删任务一样走 outbox，Worker 的 `sync_row` 按 `updated_at` 整行 LWW，不用改 Worker、不用迁移。顺手把它从 `type_order`、侧边栏资料库偏好里去掉。
- 同步：别的设备拉到墓碑，`list` / 选择器 / 标签条里都没了。比墓碑早的旧改动推上来不复活；删之后另一台设备才改它（HLC 更晚），整行后写的赢，它回来（和别的表一样）。删的同时另一台设备往里加了任务 / 资料：重开时 `reviveReferencedTypes` 把它找回来、归档着，东西不丢。
- 老客户端（没有这次改动的版本）：拉到墓碑就当删了，界面里看不到它；它们的 `reviveReferencedTypes` 也只找回还有任务 / 资料在用的，空库不会被找回；老客户端在拉到墓碑前离线改过它，改动时间比删除晚就会把它带回来。
- 界面：资料库编辑页底部，空的显示「删除资料库」（危险样式），确认框「删除「X」？」「这个资料库是空的。删掉后所有设备上都没有它了，不能恢复。」，删完提示「已删除「X」」，回到列表；已归档列表里空的那行多一个垃圾桶按钮。说明文案按情况四种：空的 / 已归档且空 / 内置 / 有内容（「有内容的资料库不能删……」）。
- 测试：core `test/type-delete.test.ts` 14 项（判空、删除、内置不给删、重开不补回、两端同步墓碑、LWW、同时加内容找回）。

## 手机底部标签栏（Rei 2026-11-10）

Rei 2026-11-10 11:44：「安卓端 tabbar默认显示：我的一天、待安排、打卡、日记、更多」。

- 现在：我的一天 · 等待安排 · 打卡 · 日记 · 更多（「待安排」就是现在叫「等待安排」的那页，路由 `#/backlog` 不变）。以前是 我的一天 · 等待安排 · 打卡 · 时间轴 · 更多。
- 代码：`lib/nav.ts` 的 `MOBILE_TABS`（固定顺序，不再跟侧边栏顺序走）、`mobileTabItems`、`isMobileTab`；`App.tsx` 标签栏和「更多」页都读它。测试 `lib/nav.test.ts`。
- 不能自定义：以前也没有自定义功能，没有存任何偏好，直接改常量，不用迁移。所以老用户（包括 Rei 手机上装着的安卓 app）更新到带这次改动的版本后就是新的五项；网页版刷新后就生效，安卓 / iOS app 要下个 alpha 才看得到。
- 不分平台：安卓、iOS、窄屏网页（宽 ≤ 760px 的手机布局）都用这一套。Rei 只说了安卓，但代码里手机布局本来就不分平台，没为这次单独分。
- 「更多」页沿用原来的分组列表（三皮肤各自样式），按侧边栏分组和顺序列标签栏以外的入口：今天（过期积压）、计划（时间轴、项目、放进侧边栏的项目）、持续（倒数日）、管理（资料库、放进侧边栏的库、类型、已完成），最后设置。日记不再出现在「更多」里。
- 没有新文案（「日记」「更多」都已有 9 种语言）。

## 明确不做（MVP）
多人协作与共享、多层文件夹式分类。

## 工程默认
- 名字：英文 Mindough、中文「念头团」（Rei 2026-10-24 定、10-25 中文名由「思想团」改为「念头团」；做法见上面「App 名字」）；仓库 reiy-leo/mindough，分支 main，MIT
- Web 与同步 API：Cloudflare Worker `mindough`，域名 `app.mindough.rei8t.dev`；`mindough.rei8t.dev` 是介绍页（API 照常能用）
- AGENTS.md（+ CLAUDE.md 指向）、.agents/、docs/PRODUCT.md
- GitHub Actions 打 macOS / Windows / Android 包发布到 Releases；iOS 需 Apple 开发者账号签名（待定）
- 每轮完成后 commit + push

## 待确认
- Web 端风格：跟随访问者系统（默认），还是固定一种？
- 类型的海报 / 图标 MVP 只手动上传或贴链接，自动找图以后做，可以吗？
- ✅ 谁能登录（Rei 2026-10-16 定）：白名单，只 Rei 自己（`ALLOWED_EMAILS=reiy.leoz@gmail.com`），不开放注册。
- ✅ iOS 分发（Rei 2026-10-16 定）：免费 Apple ID + Xcode 个人团队装自己 iPhone（7 天重装，不走 TestFlight），步骤见 docs/IOS.md；小组件要 App Group，先不接。
- ✅ 日记功能（Rei 2026-10-17 审过：「一天一篇，英文Journal，入口按你推荐的做。只要心情（5个太少了…动画svg图标）。设一个「一天从几点开始」（默认 5点）。「这一天」汇总不放在日记中。日记提醒…晚上9点，不论是不是已经写了。将来这日子不能写。」）：J1 已做完上线，见下面「日记 J1」和 [docs/JOURNAL.md](JOURNAL.md) 第 0 节。
- 🟡 滴答清单导入待问：见 IMPORT-DIDA.md「待 Rei 确认」。
- 🟡 附件待问：见上面「附件」的待 Rei 确认（50 MB 上限、资料项要不要附件、Tauri 存到哪）。
- 🟡 日期段待问（2026-10-26）：「可做」现在只看前后关系，开始日还没到的任务也列着（单日任务一样）。要不要改成「开始日到了才算可做」？没改，等 Rei 定。
- 🟡 日记 Feed 流待确认（2026-10-28）：见上面「日记改版：Feed 流」的待确认 8 条。
- 🟡 日记待问（J1 没做）：~~「一天从几点开始」要不要扩展到我的一天 / 打卡 / 提醒~~（2026-11-13 定了，见「设置「时间」」）；日记页要不要只读的「这一天」；「插入时间」「那年今日」⌘K 按日期跳转。

### 项目页「已结束」默认收起 ✅（2026-11-08）
Rei 2026-11-08 21:51「项目的已结束section默认折叠，点击可展开」。

- 只改列表视图（`pages/Groups.tsx`）：原来的 `Section`「已结束 N」换成可点的段标题，样式借我的一天「已完成」那段（`habit-archived-toggle` + 右箭头转 90°，图标 circle-check，`aria-expanded` / `aria-controls`），收起时不渲染行。
- 记在哪：每个项目一份，放进已有的本机设置 `settings.projectViews[项目 id].endedOpen`（`lib/project-view.ts` `ProjectViewPrefs`，`normalizePrefs` 只认 `true`，默认 `false`），和视图、排序在一起，不同步。没像 `myDayDoneOpen` 那样全局一份：项目有大有小，在一个项目里展开不该把别的项目也展开。
- 看板按状态分列，「完成」「关闭」本来就是单独两列，不收；时间轴、任务链不分「已结束」段，不变。
- 没加新文案：用已有的「已结束」，件数单独放在 `.count` 里。

### 看板点卡片打不开详情 ✅（2026-11-08）
Rei 2026-11-08 21:53「项目 看板 不显示详情第三列，点击不显示详情」。按 bug 修：右列本来就在（宽屏一直有，空着时是「点一件任务」），是点了没打开。

- **根因**：看板卡片是 `GridListItem`，里面放 `TaskRow`，能打开详情的只有 `TaskRow` 的标题按钮 `.row-main`。列宽 208px 起，`.row-main` 只有七八十像素宽，卡片的内边距、拖动把手旁、勾选框周围、标题和太阳之间的空隙（量下来约占卡片一半）点了都没反应，GridList 也没有 `onAction`。点到标题文字是能开的，所以时灵时不灵。不是布局把右列藏了，也不是拖动吃掉了点击，`?task=` 在点到标题时照常写。
- **修法**：`ProjectBoard` 的 GridList 加 `onAction` → `ui.openEditor(key)`，卡片任何地方点按 / 回车都打开；卡片里的按钮（勾选、太阳、把手、标题）自己处理，不冒上来，不会开两次。拖动的尾巴（`isDragPress`）、手指长按弹出行菜单后松手（有 `[role="menu"]`）不算。选中的卡片加 `is-selected`，整张卡片染色（原来只染 `.task-row` 那块，左边把手那段不染），`cursor: pointer`。
- **测试**：`components/project/ProjectBoard.test.tsx` 4 项（点留白、点卡片本身都打开，拖动尾巴不开，选中带 `is-selected`）；去掉 `onAction` 时前两项挂。截图脚本 `work/board-tool/probe.mjs`（LightVela，三皮肤宽屏 + 手机，点卡片空隙、拖卡片换列）。

### 详情顶栏日期按钮按日期换图标 ✅（2026-11-08）
Rei 2026-11-08 22:22「任务详情页 顶部工具栏 左侧日期按钮 没日期，显示calendar。今天是今天，则calendar-check。日期是以后，则calendar-chevrons-right，加上显示距离今天几天"5"，不显示+号、-号。日期是以前，则calendar-chevrons-left，加上显示距离今天几天"1"，不显示+号、-号。」

- **四种状态**：没日期 Lucide `Calendar`；今天 `CalendarCheck`；以后 `CalendarChevronsRight` + 天数；以前 `CalendarChevronsLeft` + 天数。数字是纯数字，不带 +/-。原来的 `CalendarDays` 不用了。lucide-react 1.57 里这四个都有，不用升级。
- **天数怎么算**：按日历日算，不按小时。「今天」用任务时区的今天（core `taskToday`，空时区 = 设备），和过期、我的一天一致。
- **日期段**（我定的）：段里含今天就算今天；整段在以后，按开始日算天数（还有几天开始）；整段在以前，按结束日算（结束了几天）。和过期看结束日是一个道理。
- **颜色不变**：设了日期是强调色，过期（做完、关闭的不算）是危险色。所以「以前」的按钮做完了就不红。
- **提示和读屏**：悬停提示是含义加日期文字（「5 天后 · 11月13日 周五」），两者一样时只留一个；读屏「日期：5 天后 · 11月13日 周五」，没日期读「没有日期」。新字符串 3 条（没有日期、{n} 天后、{n} 天前），9 种语言，7 种待母语者看。
- **代码**：core `dateQuickState`（`date-range.ts`）只算状态和天数；客户端 `lib/date-quick.ts` 的 `dateQuickView` / `dateQuickTip` 套上任务时区和文案，`DateQuickButton`（`TaskDatePicker.tsx`）按状态挑图标，有数字时按钮变宽（`.has-count`），不截断。「日期」胶囊不变。
- **测试**：core `test/date-quick.test.ts` 9 项，client `lib/date-quick.test.ts` 5 项（含任务时区、英文单复数）。

### 项目页默认按创建时间倒序，删掉「默认顺序」 ✅（2026-11-08）
Rei 2026-11-08 22:32「项目 默认排序 添加时间 倒序 / 删除"默认排序"」。

- 排序菜单里删了「默认顺序」，只剩创建时间、修改时间、开始时间、到期时间。没选过的项目按创建时间（`created_at`）倒序，新加的在最上。
- 老设置：本机 `settings.projectViews[id].sort` 存的是 `'default'`、没存或认不出时，`normalizePrefs` 读成创建时间倒序，存的 `dir` 不看（老的默认顺序存的是 asc，照用会变成旧的在上）。不改写存的值，用户下次动排序时才存新值。
- 排序按钮的强调色：改得和默认（创建时间倒序）不一样才亮。读屏名一律「排序：创建时间，倒序」这种，删了「排序：{name}」和「默认顺序」两条文案（9 种语言）。
- 手动拖动：项目页本来就不能拖动排序，列表视图没有拖动把手；看板的拖动只改状态（拖到别的列），不碰 `sort` 字段，所以不受影响，也没有「手动」这一项要切。任务链视图里排序照旧只管链的先后。
- 别的页面（我的一天、积压、待安排等）的排序没动，它们不用 `lib/project-view.ts`。

### 严格模式：完成和关闭的任务不能改 ✅（2026-11-08）
Rei 2026-11-08 22:32「设置-任务中，添加严格模式switch，严格模式开启后完成的任务不能修改」；23:38「完成和关闭的任务都锁」。

- **开关**：设置 → 任务 →「严格模式」，默认关。存法照同一页的「显示建议」「日期显示」：本机设置 `settings.strictMode`，不同步。URL 加 `?strict=1` 能临时打开（截图用）。
- **锁什么**：状态是「完成」或「关闭」的任务都锁（`isFinished`，Rei 23:38 改的；之前只锁完成）。
- **两层**：
  1. Store 层（core `strict.ts`）：`store.strictDone` 开着时，`Store.write` 收到碰锁住任务的写入就整批不写，抛 `StrictModeError`。碰 = 改任务行本身，或写挂在它身上的行：前后关系（两头任一是它）、相关任务、我的一天、人物 / 类型 / 资料关联、打卡事件、附件（owner 是它）。这样 ⌘F 里的操作、拖动、看板拖列、计数撤销等入口都挡得住。放行：重新打开（状态改回待办 / 进行中）；完成 ↔ 关闭互换算改，拦下（我定的，界面上本来也没有这个入口：结束了的任务菜单里只有「重新打开」）；删除任务那一批（含任务墓碑）整批放行。`applyRemote` 不经过 `write`，同步下来的照收。
  2. 界面（`lib/strict.ts` `useLocked`）：正文 `readOnly`（清单勾在只读时本来就不响应）；胶囊 `isDisabled`、去掉 × 和「+」；顶栏日期按钮、太阳、添加关系灰掉，剪贴板按钮不出现；附件只读、拖文件不加；关系 / 资料行尾 × 隐藏；详情「…」和行菜单去掉我的一天、置顶。漏网的写入由 `installStrictGuard` 在 window 的 error / unhandledrejection 里接住，提示「严格模式下已完成或已关闭的任务不能修改」。
- **我定的**：删除保留（Rei 让保留）；前后关系两头只要有一头是锁住的任务就不能加 / 去掉，所以也不能把新任务接在一件已完成的任务后面，要先重新打开；计数任务完成后「撤销上一次」也算修改，会被拦。正文写了一半就点完成：没存进去的那点丢掉（卸载时不再写，免得报错）。
- **测试**：core `test/strict.test.ts` 9 项（含关闭的锁、完成 ↔ 关闭互换被拦、关闭的能重新打开 / 删除），client `lib/strict.test.ts` 4 项。

### 普通任务也能记心情 ✅（2026-11-08）
Rei 2026-11-08 22:33「日记的心情属性在普通任务属性中也可以添加」。

- **存储**：`task.mood`（SQLite 迁移 v19，可空，存日记那套心情 id）。行级 LWW 照旧；云端存整行 JSON，不用改；老客户端不认这一列，`applyRemote` 拉到没有 `mood` 的行补成空。导出写 `mood: happy`，导入认不出的值当没记（EXPORT.md）。
- **哪些任务有**：只给普通任务，按 Rei 原话：不重复、不是倒数日（计时、计数算普通任务）。打卡和倒数日的「+」里没有；以前记过的（比如后来改成了打卡）照样显示，能清。判断在 `lib/prop-chips.ts` `canHaveMood`。
- **界面**：详情胶囊行加 PropId `mood`（排在项目后、颜色前），新建面板的胶囊里也有。选择件抽成 `components/journal/MoodGrid.tsx`，日记输入框和任务共用，图标、颜色、名字都是日记那套（core `MOOD_IDS` / `moodLabel`，`MoodIcon`）。列表行第二行显示小脸（我定的：显示，悬停看名字）。
- **不影响**：心情河流只读日记条目，任务心情不进去。严格模式下完成 / 关闭的任务改心情会被拦（属于改任务行）。
- **测试**：core `test/task-mood.test.ts` 5 项（新建 / 清除、v18→v19 迁移、老客户端的行、同步、导入导出），client `lib/prop-chips.test.ts` 加 3 项。

### 添加框长了折行 ✅（2026-11-08）
Rei 2026-11-08 22:35「任务输入框支持换行」，22:38 说明：一行很长时现在左右滚，要多行显示（自动折行）。不是让人打换行。

- 列表顶上的添加框（`QuickAddBar`：我的一天、待安排、积压、项目页）和时间轴每天的添加框换成 `components/WrapInput.tsx`（React Aria `TextArea`，`rows=1`）：长文字软折行，跟着内容长高，最多 6 行（`WRAP_MAX_ROWS`），再多在框里滚；不横向滚。
- 不能有真的换行：回车（不是输入法选词那次，`imeEnter`）提交；Shift / ⌥ / ⌘ / Ctrl + 回车吃掉不做事；输入和粘贴里的 CR / LF 去掉（`stripNewlines`），和以前 `input[type=text]` 的处理一样（不补空格）。
- 手机软键盘：`enterKeyHint="go"`，按回车照旧添加（我定的，和以前单行框一样）。
- 多行时加号图标和行尾按钮贴第一行（`.add-bar:has(.is-wrap)` 顶对齐）。
- 新建面板、⌘F 搜索不是这种单行框（新建面板正文本来就是编辑器），没动。
- 测试：`lib/wrap-input.test.ts` 3 项。

### 列表分区、心情排序、积压和已完成能不分区 ✅（2026-11-08）
Rei 2026-11-08 22:50「我的一天、项目中 右上角功能区添加一个分区，支持按心情（心情从好到坏，排序中添加一项心情）、项目分区，项目中还支持按目标日期（过期、今天、本周、本月、更远）。所有列表支持不分区。」

- **哪里有**：我的一天的列表上方小字右边放「排序」「分区」两个图标按钮；项目页右上角在视图、排序后面加「分区」（只在列表视图出现）；积压的小字右边、已完成页头右边各一个「分区」。
- **分区方式**：我的一天 不分区（默认）/ 按心情 / 按项目；项目页 不分区（默认）/ 按心情 / 按目标日期（项目页里任务都是这个项目的，不给按项目）；积压、已完成 按日期（默认，原来的分段）/ 不分区。
- **规则**（`lib/sections.ts`）：心情从好到坏按日记那 12 张脸的顺序（开心 … 生气），没记心情的放最后「没有心情」；项目按项目列表的顺序，没项目的放最后「没有项目」；目标日期 = 任务日期，日期段看结束日（和积压、过期一致），倒数日看任务日期不看目标日，分 已过期 / 今天 / 本周 / 本月 / 更远 / 没有日期，「今天」按任务时区，本周到这周最后一天（一周从哪天开始用 `weekStartsOn()`，和月历一样）。空分区不显示。
- **分区标题**能点开收起，每个视图记住（本机：我的一天 / 积压（2026-11-10 起才真能折叠）在 `settings.listViews`，项目在 `projectViews[id].collapsed`），不同步。
- **我的一天**：只分「未完成」那段，已完成段不变；置顶的总在分区外最上面。只有不分区 + 手动排序时能拖动（选了别的就没有拖动把手）。排序菜单：手动（默认）/ 心情。
- **项目页排序**加「心情」：正序从好到坏，没心情的正序倒序都在最后。看板、时间轴、任务链不分区，「已结束」那段照旧单独在下面。
- **不变**：时间轴按天分组、项目「已结束」段。打卡（按今天 / 按类型）和倒数日（按日期 / 按类型）本来就有「排列方式」，没加。
- 文案 12 条 9 种语言（本周、本月、更远、没有心情、没有项目、分区、不分区、按心情、按项目、按目标日期、分区：{name}，补回「排序：{name}」），7 种待母语者看。测试 `lib/sections.test.ts` 10 项。
- **Rei 已定**：我的一天开了分区不能拖动排序（2026-11-08 23:35 确认，现状即可）。
- **待 Rei 确认**（我定的）：① 积压、已完成默认仍是按日期；② 分区标题折叠状态不同步。

### 任务列表页去掉右下角新建按钮 ✅（2026-11-08）
Rei 2026-11-08 23:00「任务列表右下角的"+"新建任务按钮都去掉」。

- 我的一天、时间轴、待安排、积压、已完成、项目列表、项目页都不放（宽屏、手机，三种皮肤），顶上的添加框还在；N 照常打开新建面板。
- 23:35「上面那些页的「+」都去掉」：打卡、倒数日、资料库（含资料详情）、人物、类型、设置、手机「更多」也去掉。浮动按钮整个删了：`NewTaskFab`、`lib/nav` `showNewTaskFab`、`.fab` 样式和三皮肤的 `.fab` 规则、类型页给加号留的底部空白。「新建任务」文案新建面板标题还在用，留着。
- 各页剩下的新建入口：打卡页头「新建打卡」、倒数日页头「新建倒数日」、资料库页头「添加」（手机是搜索框旁的加号）+ 空状态按钮 + 搜不到时「新建“xx”」、资料详情「用它新建任务」（类型归档了不给，本来如此）、人物详情「新建相关任务」、人物库同资料库、类型页搜索框打名字「新建」。设置和手机「更多」本来就不是建东西的页面，没补按钮。N 照常。
- 页面通用的底部留白（`.page` 宽屏 96px、手机标签栏上方 88px）和手机提示条的高度没动，原来有一部分是给加号留的，现在只是多一点空白。

### 任务列表行去掉右键菜单 ✅（2026-11-08）
Rei 2026-11-08 23:39「任务列表都删掉右键菜单」。

- `TaskRow` 的 `onContextMenu` 只 `preventDefault`：右键不弹我们的菜单，也不落回浏览器 / 系统菜单（全局 `lib/contextmenu.ts` 本来也拦着）。三种皮肤一样。所有用 `TaskRow` 的列表都跟着变：我的一天、待安排、积压、项目列表视图和看板卡片、项目时间轴和任务链、时间轴、已完成页、人物 / 资料 / 类型详情里的任务列表。关系弹窗里的任务列表不用 TaskRow，本来就没有右键菜单。
- 键盘的菜单键 / Shift+F10 也跟着不开了（它发的也是 contextmenu）。
- 手机长按菜单保留：和右键原来是同一个菜单（TaskRow 里自己写的 Popover + `rowMenu`，没用通用的 `useContextMenuAt`），现在只有长按计时能打开它。
- 菜单里的操作别处都有：查看详情 = 点这一行；加入 / 移出我的一天 = 详情顶栏太阳、详情「…」、我的一天行尾太阳；置顶 / 取消置顶 = 详情「…」。没有只靠右键才有的操作。
- 没动：打卡页一行、倒数日卡片、项目卡片、资料库卡片、侧栏、附件、日记条目的右键菜单（不是任务列表行）。

### 手机项目页用项目颜色的淡底色 ✅（2026-11-08）
Rei 2026-11-08 23:40「移动端的项目 任务列表背景颜色为图标背景颜色，但要淡一点」。

- 只在手机布局、项目自己设了颜色（`group.color`，`normalizeIconColor` 认得的 hex）时；没设过的（图标用 `defaultIconColor` 按 id 挑的）保持原样，宽屏不变。
- 做法：`pages/Groups.tsx` `useProjectTint` 给外层 `.main` 挂 `--project-tint` 和 `data-project-tint`；`app.css` 里 `.main` 背景 = `color-mix(in srgb, 项目色 10%, 皮肤原来的 --bg)`（暗色 14%），页面里的 `--bg` 换成同一个混色，`--bg-image` 去掉（WinUI 的 Mica 渐变这时不画）。固定页头 `.project-head-sticky` 用的是 `var(--bg)`，所以和底色一样不露缝。
- 对比度：截图量过，Apple 亮色次要文字 `--text-2` 在淡底上只有 4.17，所以淡底页面里 `--text-2`、`--text-3` 往主文字色靠 30%；量下来三皮肤亮暗标题都在 12 以上、小字 ≥ 4.5。
- 列表、看板、时间轴、任务链同一页，都跟着变。任务行本身没有底色（透明），字直接压在淡色上；看板卡片、时间轴条等原来就有底色的照旧。手机顶栏、标签栏不变。

### 详情顶栏心情按钮 ✅（2026-11-08）
Rei 2026-11-08 23:44「任务详情 顶部工具栏添加一个心情按钮，点击后可以换心情」。

- 位置：日期快捷按钮右边、剪贴板按钮左边（左边一组都是「这件任务的属性快捷按钮」）。
- `components/task/MoodQuickButton.tsx`：没心情 Lucide `SmilePlus`，`--text-3` 暗淡色；有心情显示 `MoodIcon` 小脸。点开 `MoodGrid`（和日记、属性胶囊共用），写 `task.mood`，点已选的取消。
- 只给 `canHaveMood` 的任务（不重复、不是倒数日：普通、计时、计数）；严格模式锁住时 `isDisabled`。
- 手机顶栏没有溢出菜单：按钮一个 32px，390 宽下返回、徽章、进度、日期、心情、太阳、关系、··· 排得下（截图核对）。
- 新文案「设置心情」9 种语言（7 种待母语者看），「心情：开心」用已有的 `{label}：{value}`。测试 `MoodQuickButton.test.tsx` 4 项。

### 心情颜色用到任务上 ✅（2026-11-08）
Rei 2026-11-08 23:49：心情颜色应用到任务；不改任务行背景，不加左侧色条。

- 列表行第二行的小脸：`MoodIcon` 本来就带 `.mood-<id>`，颜色 = 皮肤令牌 `--mood-<id>`（三皮肤 × 亮暗，和日记同一套），脸填 16% 淡色、五官是实色；看板卡片里是同一个 `TaskRow`，一样。没改代码，截图核对计算后的颜色。
- 详情顶栏心情按钮：有心情时按钮 `style.color = var(--mood-<id>)`，底色 `color-mix(currentColor X%, transparent)`，Apple 14%、WinUI 10%、Material 18%，悬停再加 8%。没心情还是暗淡的 `--text-3`。
- 按心情分区：段标题文字前 8px 圆点 `.section-dot`，颜色 `.mood-<id>`；「没有心情」`--text-3`。原来的心情小脸图标保留。圆点 `aria-hidden`，读屏只读段名。
- 对比度（图形要 3:1）：截图里量，Apple 亮色的开心 #d29a00 对白底只有 2.51，满足 #2fa84f 在 #f5f5f7 上 2.82，令牌加深成 #b07f00（3.57 / 3.28）、#28a046（3.38 / 3.11）。这是日记和任务共用的色板，日记里这两张脸也跟着深一点。其余皮肤、暗色都 ≥ 3。
- 测试：`SectionedList.test.tsx` 2 项，`MoodQuickButton.test.tsx` 加按钮颜色断言。


### 看板视图不要右边的详情栏，详情改成浮层 ✅（2026-11-09）
Rei 2026-11-09 00:25「项目 看板 不显示详情第三列，点击不显示详情」、00:28「切换到看板视图后，不要显示侧边的详情column」。上一次（2026-11-08）当成「点了打不开」修，这次是要看板占满、不要第三列。

- **哪里生效**：桌面布局（宽屏三列和中等宽度）下，项目页视图是「看板」时。判断在 `lib/detail-pane.ts` 的 `detailInModal(route, settings.projectViews)`，App 里 `boardModal` 为真就不放 `DetailPane`，换成 `components/task/DetailModal.tsx`，`.app-desktop` 也不挂 `has-detail`（加 `detail-modal` 类）。网格第三列是 `auto`，不放右列就是 0，看板占满。列表、时间轴、任务链视图和别的页面照旧右列；手机布局本来是整页详情，不走这里。项目页之外没有别的看板。
- **切过去收起**：App 记上一次的 `boardModal`，从假变真那一下 `openEditor(null)`（列表里开着的详情收起，`?task=` 去掉）。直接打开带 `?task=` 的看板链接时不收，直接弹浮层。切回列表：右列照旧（空状态，或之后点开的任务）。
- **浮层**：React Aria `ModalOverlay` + `Modal.modal.modal-center.modal-detail` + `Dialog`，里面是 `TaskDetail mode="modal"`（新模式，和右列一样：有关闭按钮、完成 / 关闭后留着显示「重新打开」，只是顶栏不当 Tauri 窗口拖动区）。720 宽、高 `min(86vh, 900px)` 固定，正文区自己滚。Esc、点外面（`isDismissable`）、右上角 × 都是 `openEditor(null)`；在正文编辑器或输入框里按 Esc 只失焦（编辑器自己存），焦点交给浮层本身，再按一次才关。截图时发现：只 blur 的话焦点落到 body，React Aria 的焦点圈又把它拉回正文，第二次 Esc 还是被编辑器吃掉（编辑器原生 stopPropagation）；所以 `DetailModal` 的 onKeyDown（输入框）和 `TaskDetail` 正文的 onEscape（在 `.modal-detail` 里时）都改成 focus 浮层的 `[role=dialog]`。读屏名是任务标题。严格模式、拖文件加附件、内部的菜单和确认框都跟右列同一份代码。
- **三皮肤**（我定的，都复用各皮肤已有的 `.modal` 外框）：Apple 用居中的 sheet（圆角 12、0.5px 细边，淡入上浮），不用贴顶下滑的 macOS 窗口 sheet，因为网页和三平台要一致；WinUI 用 ContentDialog 式居中对话框（圆角 8、暗底、底栏浅灰）；Material 宽屏用大的基本对话框（28px 圆角、surface-2 底，详情底色也换成 surface-2），不用全屏对话框（那是手机的形式，手机这里本来就是整页）。
- **没做**：浮层里没有 ↑ ↓ 换任务（右列有）；关浮层时内容先清空再淡出（选中已取消）。
- **时间轴页也用浮层**（Rei 2026-11-10「点击任务不显示详情侧边栏」）：`detailInModal` 遇到路由 `agenda` 直接返回真，其余规则不变。
- **项目列表页也用浮层**（Rei 2026-11-11 02:12「项目列表页 不显示任务详情侧边栏」，02:13 说明指侧栏「项目」总览页，不是单个项目页的列表视图）：这页（路由 `groups`）只列项目卡片，没有任务行，但以前在 `LIST_PAGES` 里，宽屏右列常驻一个空状态。现在从 `LIST_PAGES` 去掉，`detailInModal` 遇到 `groups` 也返回真：右列不出，从搜索等处打开任务时弹 `DetailModal`；切进这页时开着的详情收起（同看板）。点卡片还是进项目页，项目页列表视图照旧右列。
- **测试**：`components/task/DetailModal.test.tsx` 5 项（没选中不弹、选中弹且是 modal 模式、Esc 关、输入框里 Esc 不关、× 关）；`lib/detail-pane.test.ts` 加 3 项 `detailInModal`；`components/project/ProjectBoard.test.tsx` 加 2 项（聚焦卡片回车打开、有行菜单时松手不开），共 6 项。

### 侧栏项目显示为列表 / 图标 ✅（2026-11-11）
Rei 2026-11-11 02:15「右上角加一个按钮组…列表…图标」，02:18 改定入口：手机「更多」页和电脑侧栏「项目」那行右边各放一个「···」，菜单「显示为：列表 / 图标」，项目列表页右上角不放；资料库先不共用。

- **存法**：本机设置 `pinnedGroupStyle: 'list' | 'icons'`（`lib/settings.tsx`，默认 list，不同步）；读写经 `lib/pinned-style.ts`（`normalizePinnedStyle`、`pinnedGroupGrid(settings, narrow)`、`usePinnedGroupStyle`）。
- **入口**：`components/PinnedStyleMenu.tsx` 自成一个组件（MenuTrigger + 单选 MenuSection，小标题「显示为」），App 里只是放的位置：侧栏 `SidebarItems` 把「项目」那行包成 `.nav-item-split`，··· 绝对定位在行右边，有鼠标时悬停 / 聚焦 / 菜单开着才显示，`(hover: none)` 常显；「更多」页 `MoreItems` 把那行包成 `.more-item.more-item-split`。以后改成小节右键菜单或别处，只挪这个组件。只在有放进来的项目、且不是中等宽度图标栏时出。
- **图标网格**：选了图标时，连着的置顶项目包进 `.nav-pinned-grid`（「更多」页 `.more-item.more-pinned-grid`），`display: flex; flex-wrap: wrap`，`data-reorder-layout="grid"`、`role="group"`（读屏「放进侧边栏的项目」）。侧栏每格是 `PinnedGroupLink compact`（36×36，只有 GroupIcon 22，`aria-label` / `title` 是项目名）；「更多」页是 `MoreTile`（44×44，GroupIcon 32，长按拿起不挪松开出项目菜单）。`MenuAt` 加了可选 `heading`，只放图标时菜单顶上写项目名。中等宽度（图标栏）不排网格。
- **拖动排序**：`lib/nav-reorder.ts` 认父元素 `data-reorder-layout="grid"`：按 offsetLeft / offsetTop 记每格，落点是离被拖那格中心最近的一格（`gridTargetIndex`），别的格子挪到新顺序里自己那一格（`gridShift`，折行处跨行挪），占位格横竖都跟；手指拿起后横挪也开始拖；键盘多认 ⌥← / ⌥→（`reorderKey(e, grid)`）。列表的算法没动。
- **测试**：`lib/pinned-style.test.ts` 2 项、`lib/nav-reorder.test.ts` 加 3 项（网格落点、跨行挪、⌥← / ⌥→）。截图脚本 `work/d1111-pinstyle/ps.mjs`（LightVela Chromium，三皮肤宽屏 1366 + 960 + 手机 390）。
- **没做**：手机「更多」页列表模式里置顶项目的图标样子没改。资料库那一串的图标显示 2026-11-12 补上，见「侧栏资料库显示为列表 / 图标」。

### 侧栏项目的菜单换成行右边的 ··· ✅（2026-11-11）
Rei 2026-11-11 02:56「添加到侧边栏的项目，右键菜单换成右侧的『···』」。

- **列表样式**：`App.tsx` 新 `PinnedGroupRow`（侧栏）、`MoreGroupRow`（「更多」页）。行外面套一层 div（侧栏 `.nav-item-split.nav-pinned-row`，「更多」页 `.more-item.more-item-split.more-item-sub`），里面是链接和 `RowMoreMenu`（`OverflowMenu`，读屏「「{name}」的更多操作」，菜单项是 `useProjectActions` 那一套）。不挂 `useContextMenuAt`：右键由全局 `lib/contextmenu` 拦掉、什么也不出；`usePinnedReorder` 不给 `openMenu`，手指拿起没挪松开什么也不做。
- **显示**：沿用「项目」那行 ··· 的样式（`.nav-item-more`：悬停这一行、`[data-focus-visible]`、按下、菜单开着才显示，`(hover: none)` 常显），另加 `.nav-pinned-row:has(:focus-visible)`（键盘聚焦到行里的链接也显示）。「更多」页的 `.more-item-more` 一直显示（同「项目」那行）。链接 `padding-inline-end: 36px` 给 ··· 让位，长名字在前面截断。置顶项目行本来没有计数，不用处理和数字重叠。
- **拖动排序**：拖动属性挂在外层 div 上（`lib/nav-reorder` 认直接子元素），··· 跟着整行挪。`RowMoreMenu` 外面一层 `span.row-more-slot`（`display: contents`）拦下 pointerdown / keydown / contextmenu 不往外传：按 ··· 不会拿起这一行，⌥↑ / ⌥↓ 在 ··· 上不挪。新 `reorderShapeOf`（占位格圆角取里面标了 `data-reorder-shape` 的链接）、`reorderFocusOf`（键盘挪完焦点回到链接）。浮起、阴影画在里面的链接上（`.nav-pinned-row.is-reorder-dragging > .nav-item`），外层不画；拖动时 ··· 藏起来。
- **没改的**：图标样式（`PinnedGroupLink compact`、`MoreTile`）和中等宽度图标栏（`NavLink rail`）没地方放 ···，照旧右键 / 长按；资料库那一串照旧右键。
- **文案**：新 1 条「「{name}」的更多操作」9 种语言（7 种待母语者看）。
- **测试**：`lib/nav-reorder-row.test.ts` 4 项（形状、焦点、显示规则）。截图脚本 `work/d1111-rowmore/rm.mjs`（LightVela Chromium，三皮肤宽屏 1366 + 960 + 手机 390「更多」页）。

### 置顶图钉挪到圆圈前面、红色；可开始换绿色插头 ✅（2026-11-09）
（2026-11-12 05:00 起列表里不放图钉了，置顶改成标题加粗，见文末「置顶改成标题加粗；完成、关闭不划线」。）
Rei 2026-11-09 01:03「置顶的任务的pin放在circle前面，就是原本drag handle的地方，颜色用红色。可开始的icon用plug，颜色用绿色。」

- **图钉**：不再放在标题前。有拖动把手的列表（我的一天、待安排、项目看板卡片）用 `TaskRow.tsx` 的 `RowLead`：置顶的那格换成红色图钉，`TaskRow pinInLead` 不再自己放。我的一天的置顶本来就固定在最上、不能拖，那格只是图标（悬停「已置顶」）；待安排和看板里图钉本身还是 `slot="drag"` 的拖动按钮（读屏「已置顶 · 拖动排序 / 拖到别的状态」），看板要能拖到别的状态，所以不拦。没有把手的列表（项目列表视图、时间轴、已完成、积压、类型 / 人物 / 资料里的任务列表、任务链）图钉放在 `.task-row` 左边 12px 留白里（`.row-pin-gutter`，绝对定位），圆圈和没置顶的行对齐，不挪。
- **对齐和大小**（Rei 2026-11-11 08:16「图钉偏上、略偏右，和手柄没对齐」、08:17「大小也要一致」）：把手按钮原来带着浏览器给按钮的 1px 6px 内边距，18px 宽的格子里图标被挤到右边 4px，我的一天里不是按钮的图钉就和下面的把手错开一列；现在 `.drag-handle` 去掉内边距，两者同一列。两个图形宽高比不同，按画出来的高度配平：图钉 12、把手 15（`LEAD_PIN_SIZE` / `LEAD_GRIP_SIZE`），都是 10px 高。图钉头重脚轻，几何居中时墨迹重心比勾选圈中线高约 0.65px，`.drag-handle.is-pin svg` 和 `.row-pin svg` 往下挪 0.65px。没把手的列表行左留白里的图钉也是 12、同样下挪。自查脚本 work/d1111-pinalign/pa.mjs（三皮肤 × 宽屏 / 手机 390 × Chromium / WebKit，我的一天、待安排、项目列表、看板，一行 / 两行，量墨迹重心）。
- **颜色**：图钉用 `--danger`（Apple #ff3b30 / 暗 #ff453a，WinUI #c42b1c / 暗 #ff99a4，Material #b3261e / 暗 #f2b8b5）；插头用 `--success`。
- **可开始**：第二行状态图标 `LockOpen` → Lucide `Plug`，绿色，提示和读屏仍是「可开始」，没改文案。
- **测试**：`components/RowLead.test.tsx` 4 项；`ProjectBoard.test.tsx` 的 TaskRow 替身补上 RowLead。

### 打卡达标后不能再加；打卡页分「今天要打卡 / 已打卡」，不列今天不用打的 ✅（2026-11-09）
Rei 2026-11-09 01:05「打卡 计数 完成4/4 居然还能继续加，不应该这样，今天打卡完成的放在已打卡section，不是今天的打卡不显示。」

- **以前**：计数达标后 +1 照样能点（4/4 → 5/4），Store 不拦；计时达标后「开始」是灰的，点一下的打卡达标后是灰的。
- **core**：`checkin.ts` 加 `capCheckIn(mode, before, kind, amount)` 和 `CheckInMetError`；`Store.checkIn` 记之前先算：周期已达标时 add 正数 / start / resume 抛错，不写；计数没达标时 add 的量截到目标（浮点按 1e-9 取整）。减量、pause、stop、撤销（undoCheckIn 打墓碑）都不拦；倒数日不管。
- **界面**：`CheckInControl` 计数达标后不放快捷按钮，换成灰掉的「今天已达标」勾按钮（列表行、我的一天、打卡页同一个组件）；`CountQuickButtons` 加 `isDisabled`，详情底栏和进度弹层传 `progress.met`；`useCountAdd` 达标时加正数直接提示不调 Store；`CheckInControl` / `TaskDetail` 的 record 接住 `CheckInMetError` 提示；`DeepLinks` 计数达标也走「今天已经打过卡了」，提示里的 +N 用实际记下的量。
- **打卡页**：「按今天」：正在计时 / 今天要打卡（未达标）/ 已打卡（`section.habit-archived.habit-done`，同「已归档」的折叠样式，设置 `checkInsDoneOpen` 本机记住，默认展开）/ 已归档；去掉「其他打卡」。「按类型」不变，照旧列出全部（今天要打的在前），是看今天不用打的打卡的地方；没加新入口。正在计时那段也跟着类型筛选走了（以前不跟）。
- **测试**：`packages/core/test/checkin-cap.test.ts` 5 项。

### 打卡页类型筛选换成下拉 ✅（2026-11-09）
Rei 2026-11-09 01:06「打卡的全部、类型部分换成dropdown，默认显示全部。」

- 原来 `ChipPicker` 一排胶囊（「全部 N」+ 各类型 +「没有类型」）换成 React Aria `Select`（`.checkin-type-select`，按钮是各皮肤已有的 `.input.select-btn`，列表 `.listbox`），选项里类型带 `CategoryLabel` 图标。位置不变：`.filter-row.checkin-filters` 最左，后面「编辑」，`Segmented` 排列方式靠右（我定的：排列方式本来就在这一行，没挪到页头）。
- 默认「全部」，用页面内 state，不写设置：每次进打卡页都是全部（Rei 倾向）。非全部时 `.is-active`：字和箭头强调色、边框掺一点强调色。
- 「全部」不再带件数（下拉里显示件数意义不大，页头小字已有今天 x/y）。

### 今天要打的打卡自动出现在我的一天 ✅（2026-11-09）
Rei 2026-11-09 01:27「打卡任务，如果今天有节点，也要显示在我的一天中。」

- **以前**：今天要打、没达标的打卡只是「建议」（reason 今天要打卡）；只有开着「出现在我的一天」的项目里的打卡会被 `syncAutoMyDay` 写成真行。
- **现在**：core `myday.ts` 新 `checkInDayItems(tasks, groups, checkIns, date, now, seen)`，虚拟行 id 前缀 `checkin:`（`isCheckInEntry`），候选 `isCheckInDayCandidate`：没删、没置顶（置顶走 pinnedDayItems）、`dueToday`（没结束、没归档、建了之后、按规则今天要打）、不在归档项目里。达标的也出（done=true，进「已完成」段）。`seen` = 这一天 my_day 表里有过行（含墓碑）的任务：活行照常由 myDayItems 出，墓碑 = 用户移出了当天。`lib/myday-items.ts` dayItems 拼成 [手动/自动真行, 打卡虚拟行]，再 withPinned。侧栏数字、小组件快照用同一个 dayItems。
- **移出当天**：沿用 `removeFromMyDay`（给 myDayEntryId 写墓碑，会同步）；`Store.isInMyDay` 对虚拟行返回 true（`isVirtualCheckInToday`），所以行菜单 / 详情太阳显示「移出」。加回来 = addToMyDay 把墓碑翻回成真行。
- **拖动**：`Store.reorderMyDay` 遇到没有行的虚拟打卡就写一条真行（myDayEntryId，sort = 新位置）。
- **建议**：`suggestions()` 去掉打卡候选（包括移出了当天的）。
- **测试**：`packages/core/test/myday-checkin.test.ts` 5 项；`myday.test.ts` 建议里去掉 habit，`myday-date-join.test.ts` 打卡改为断言不写行。

### 打卡进度只放进度环 ✅（2026-11-09）
Rei 2026-11-09 01:29「打卡进度只显示circle，不显示"0/1"这种数值」。`CheckInControl`（打卡页行、TaskRow 里的打卡行共用）：计数去掉 `CountNumber` 数字（原来点一下能手输），计时去掉时长文字；进度环外包 `HoverTip.ci-ring`（悬停 400ms 提示，同时是 role=img 的读屏名）：`countTip()`「已打 {value} 次，目标 {target} 次」/ 有单位「已打 {value} {unit}，目标 {target} {unit}」，计时「已计时 {value}，目标 {target}」/「已计时 {value}」。详情（TaskDetail Progress、底栏、进度弹层）不动，手输总数在那里。4 条新文案 9 种语言。

### 打卡能选勾选完成，计数目标最少 2 ✅（2026-11-09）
Rei 2026-11-09 01:30「打卡 计数 最小数值2，打卡中"完成方式"可以选"勾选完成"」。

- core `checkInMode(task)`：有重复、计数、目标 < 2（含空）的当 `once`，别的原样。进度算法本来一样（加一次就达标），所以只在读的时候换，不迁移数据。
- `allowedModes(value, recurring)`：打卡（有 recurrence）三种互换，倒数日只能是倒数日；没重复的照旧。`CompletionChoice` 多 `recurring` 参数，详情胶囊和新建面板都传。
- 计数目标输入框 `min=2`，`modeDefaults('count')` 目标 2。
- 勾选完成的打卡：TaskRow 行首圆圈、CheckInControl 都走新的 `toggleCheckIn`（没达标 = `checkIn add 1`，达标了 = `undoCheckIn(lastCountAdd)`）；详情主按钮达标后是「撤销今天的打卡」。属性胶囊：打卡的完成方式总显示（`isPropSet('mode')`）。
- 新文案 1 条（撤销今天的打卡）9 种语言。测试：core checkin-cap +2，client allowed-modes 3、prop-chips 19。

### 打卡 / 倒数日页「新建」直接进详情，不弹面板 ✅（2026-11-09）
Rei 2026-11-09 01:31：打卡页、倒数日页的「新建」不再弹窗，直接新建一条对应类型的空任务，选中并在右侧详情打开、光标进正文第一行；手机进整页详情；正文空着离开就删掉。

- 新 `lib/blank-task.ts`：`blankInput(kind, categoryId)`（打卡 = FREQ=DAILY、count、目标 2、步长 `newCountConfig(null)`；倒数日 = countdown、target_date null）；`createBlankTask(store, openEditor, kind, cat)` 建任务（`joinMyDay: false`）、记进 sessionStorage `mindough:blank-drafts`、记光标请求、`openEditor`；`sweepBlankTasks(store, editingId)` 把不是当前选中、正文 trim 后为空的草稿 `deleteTask`，写了字的移出草稿表不再管。
- App 里 `useEffect(sweep, [editingId])`：详情卸载时 Body 先存没存的正文（passive cleanup 先于新 effect），所以打了字不会被删。刷新后草稿表还在。
- 光标：TaskDetail Body 给 MdEditor `autoFocus={wantsBodyFocus(id)}`（2 秒内有效，严格模式重复挂载也认），空文档 focus('end') 就是第一行。
- 入口：CheckIns 页头按钮、Countdowns 页头按钮、App 里在 checkin / countdown 页按 N。删 `COUNTDOWN_DEFAULTS`。新建面板 TaskComposer 还有添加框、N、资料库、人物页、深链、「接在后面」在用，不删。
- 字段：弹窗里的完成方式、目标、单位、重复、目标日期、提醒、类型、项目、相关任务在详情本来都有（属性胶囊 + 相关任务）；卡片颜色本来只在详情有。没补新字段，没新文案。
- 原来「没有空任务规则」：代码里以前没有「空着离开就删」，这次是新加的，只管从这两个入口建出来的。
- 测试：client `blank-task.test.ts` 6 项。
- 修：MdEditor 的 autoFocus 原来在 useEffect 里直接 `editor.commands.focus`，从详情第一次挂上时 view 还没挂、抛「reading 'commands' of null」，详情显示「这里出错了」。改成等 `editor.view.dom.isConnected` 再聚焦（最多重试 10 次、每次 30ms，卸载时清掉）。

### 日历「+」在详情浮层里新建 ✅（2026-11-12）
Rei 2026-11-12 06:52：「日期+弹窗用的是之前新建打卡、新建倒数日的那个弹窗，改成和看板模式弹窗同一个组件。」日历的「+」/「添加」不再弹新建面板，改成建一条那天的任务、在详情浮层（`DetailModal`）里打开。

- core `Store.createDraftTask(input)`：照 `createTask` 建在内存里（界面看得见），但 `write` 走草稿分支，只改内存、通知界面，不落盘、不进 outbox；顺带写的别的行照常落盘。`isDraftTask` / `discardDraftTask`（从内存拿掉，什么都不写）。之后任何写入碰到它（任务行本身，或别的行字段里有它的 id，比如挂类型）就先把它落盘并进 outbox，再按新建规则放进今天的我的一天（`joinMyDayOnToday`），从此是普通任务。`deleteTask` 碰到草稿直接丢，不写墓碑。刷新页面草稿就没了（本来就没存过）。
- client `lib/blank-task.ts` 加 `createDateDraftTask(store, openEditor, date)`：`createDraftTask({ body_md: '', scheduled_date: date })`、记进草稿表、要光标、`openEditor`。`sweepBlankTasks` 先试 `discardDraftTask`，不是草稿再按原规则（正文空就 `deleteTask`）。打卡 / 倒数日页的空任务还是直接落盘的老路子，没改。
- 日历页 `create` 换成 `createDateDraftTask`。日历页在桌面布局下本来就用 `DetailModal`（`detailInModal`），手机本来就是整页详情，所以不用另外接浮层。
- ~~我定的：只改了属性、正文空着关掉也删~~ → Rei 2026-11-12 09:22 改成：改过任何属性就留下；只有正文空、属性也没动才删。实现是建好时在 sessionStorage 记一份属性签名（任务行除正文 / 时间戳外的字段 + 指着它的依赖、人物、类型、资料、相关、附件、打卡行，我的一天行不算），离开时比对。N、打卡页、倒数日页的新建不动。
- 测试：core `draft-task.test.ts` 5 项；client `blank-task.test.ts` 加 4 项，`Calendar.test.tsx` 改成查 `createDraftTask` + `openEditor`。


### 纯文本附件点开就能看 ✅（2026-11-09）

Rei 01:46「附件是.txt文件，点击可以和图片一样预览」，又说「加上.md、.csv吧」。

- 哪些算：core `textPreviewFormat(name, mime)`。先看扩展名（txt、md、csv、tsv、log、json、yaml、xml、ini、srt、sql、常见代码……），扩展名不认识再看 MIME（text/*、application/json 等）。RTF、ipynb、以及认得的图片 / 文档 / 表格不算。`attachmentPressAction` 多一种 `'text'`。
- 显示：`components/attachments/TextPreview.tsx`，套灯箱的 `.lightbox-overlay` 和顶栏，中间 `.textpv-sheet`（`--surface` 叠在 `--bg` 上，WinUI 半透明也是实心）。md 走 `Markdown` 组件（同一套 DOMPurify 消毒），csv 用 `parseDelimited` 拆表，切换按钮在顶栏。
- 取内容：`lib/text-preview.ts` `loadAttachmentText`。本机队列 → 本机缓存 → `GET /api/files/<key>`（和原图同一个接口，Web 同源带 cookie，Tauri 带 Bearer，CORS 和图片一样），边读边数，满 1 MB 就取消流，不把整个文件拉下来。Worker 不用改：接口对文本回 `content-disposition: attachment`，fetch 不管它。
- 编码只认 UTF-8（去 BOM，截断处半个字丢掉）；前 8 KB 有 NUL 当二进制；U+FFFD 超过 1% 提示可能是别的编码。GBK 之类的不转码，待定。
- 测试：core attachments（textPreviewFormat）、attachment-cache（按下动作）；client text-preview、TextPreview。
### 补打卡 ✅（2026-11-09）
Rei 2026-11-09 01:52（替代 01:12 的日历补打方案）。

- **不加字段、不迁移**：`check_in.period_key` 就是「算哪一次」。一个周期从应打卡日开始、到下一个应打卡日前一天为止，两次之间记的打卡 `Store.checkIn` 按今天算出的周期键本来就是上一次。所以老客户端、Worker、同步协议都不用改，Worker 没部署。
- **core `makeup.ts`**：`makeupState / makeupNode(task, events, today, now)`：重复、不是每天（`isDailyRule`：DAILY 或 WEEKLY 七天）、不是倒数日、没删没结束没归档、`periodStart(today) < today`、节点不早于创建日、节点没达标 → 返回节点。`makeupStarted`：节点之后到某天之间我的一天有过活行。`isMadeUpPeriod`：现在达标、但只算节点当天（本机日期）的事件不达标 → 补的。
- **Store**：`makeupNode(taskId)`、`startMakeup(taskId)`（= addToMyDay 当天，写真行）；`isInMyDay` / `reorderMyDay` 认补打卡虚拟行（`isVirtualMakeupToday`）。
- **我的一天**：`makeupDayItems`（id 前缀 `makeup:`）：开始过、还在同一个可补节点里，后面几天每天出虚拟行；补完那天（这一周期有当天记的事件）done=true 留在「已完成」，之后不出；这一天有过行（含墓碑）不出。`yesterdayUnfinished` 跳过还在补的。`lib/myday-items.ts` 拼进去。
- **作废**：到下一个应打卡日 `periodStart(today) = today`，makeupState 为 null，按钮、虚拟行都没了；上一次的事件留在原周期，不搬。
- **统计**：`metPeriods` / 连续次数不变，补完的算达成。`RatioIndex.madeUp(taskId, date)` → 打卡行活动图 `Heatmap madeUp` 画 `.heat-cell.is-madeup` 空心格（12% 底 + 1.5px 内描边），提示「补打完成」。全年总图（dayRatio）不区分（我定的：一格是多件任务的合计）。
- **界面**：`components/MakeupButton.tsx`（Lucide `History`，TipButton，在我的一天里时 aria-pressed、强调色），放在 TaskRow 打卡控件前、打卡页行、详情进度面板右侧；严格模式（本机设置 strictMode）不渲染。打卡页「按今天」加一节「可以补打」（今天不用打、能补的）。
- **测试**：`packages/core/test/makeup.test.ts` 8 项。

### 打卡 / 倒数日页头：新建只放图标，打卡页加「显示哪些打卡」下拉 ✅（2026-11-09）
Rei 2026-11-09 01:59。

- 新建：`Button variant="primary" className="btn-icon-only"` + `Tip` + `aria-label`，Lucide `Plus`。
- 打卡页：页面 state `view: 'today' | 'all' | 'archived'`（不记）；React Aria `MenuTrigger` + `Menu selectionMode="single"`（没 disallowEmptySelection，再点选中项 = 取消 = 回 today），图标 Lucide `ListFilter`，非 today 时 `.icon-btn.is-active`。all：`recurring` 平铺（今天要打的先，再按 sort）；archived：`archived`。非 today 时标题换名、列表上方「回到今天」按钮、隐藏全年热力图和「按今天 / 按类型」切换；类型筛选的选项按当前视图的那批任务算。原来底部折叠的「已归档」一节删了（`archivedOpen` 一起删）。
- 倒数日页：没有归档功能（Countdowns 不看 archived_at），不加下拉。


### 色彩三档：素净 / 标准 / 多彩 ✅（2026-11-09）
Rei 2026-11-09：设置 → 外观加「色彩」，三段，默认标准，只存本机，三皮肤亮暗都适用。

- **设置**：`settings.colorLevel`（`plain | standard | vivid`，认不出来当 standard），本机，不同步。`SettingsProvider` 渲染时直接把 `<html data-color-level>` 挂好（心情河流、日记热力图在子组件的 layout effect 里读 CSS 变量，比 provider 的 effect 早）。URL 加 `?color=plain|vivid` 能临时切（截图用）。读档位用 `lib/color-level` 的 `useColorLevel()`（没有 provider 时当标准）。
- **样式**：`styles/color-level.css`，在 skins.css 后面引入，选择器带 `:root` 盖过皮肤令牌。标准档在样式里一条都没有。
  - 素净：亮暗各一套中性强调色（`--accent` 近黑 / 近白，`--accent-contrast` 反过来），`--danger`（亮 #6e6e73、暗 #aeaeb2，对卡片底都过 4.5:1；WinUI 亮色素净档 `--text-3` 加深到 0.58，暗色热力图 1 号数字换深字）、`--success`、`--warning`、`--state-*`、`--heat-color`、`--alert-*`、12 个 `--mood-*` 换成深浅灰；Material 的中性色（2026-11-13 起带蓝，以前带紫）换纯灰，WinUI 不画 Mica 渐变。行内 style 带颜色的（`--chip-color`、`--heat-color-local`、`.meta-type` / `.thumb-icon` / 打卡行首类型图标的 color）用 `!important` 盖成中性色；`.icon-tile` 去掉底色、图标用 `--text-2`；类型筛选胶囊 `--chip-*` 换灰底细描边；资料的按名字渐变占位 `grayscale(1)`；写死颜色的太阳、火苗、调色板「加」、Apple 开关的绿、Material 提示条的紫都换掉。过期（`.meta-date.is-overdue`、`.chain-when.is-overdue`）用 `--danger` 加粗 + `::before` 一个 Lucide circle-alert（mask）。暗色下实心删除按钮换深字。
  - 多彩：`.section-title.is-tinted` 用 `color-mix(心情 / 项目色 65%, --text)`；项目页 `.main[data-project-tint]` 下看板卡片 `border-top: 3px`、时间轴条 `inset 0 3px 0` 项目色；`--detail-tint`（App 里 `useDetailTint` 挂在 `<html>` 上，右列、手机整页、看板浮层都继承）给 `.pane-detail` 顶部 120px 的 16% 淡色渐变；`.ci-ring .ring-fill` 用 `--ci-color`（TaskRow 打卡行、打卡页行上挂类型色）；置顶资料库 `.nav-icon` 用 `--vivid-color`。
- **JS 里算颜色的地方**：`cardColorVars(task, theme, level)` 素净档一律用 core 的 gray（亮 #e0e0e3）；`useProjectTint(g)` 素净不铺、多彩宽屏也铺（`groupColor` 兜底默认色）、标准照旧；TaskRow 多彩档的类型名、项目名用 `readableTint`（往黑 / 白靠，直到对白和 Material 最暗的 #e8e7ee（2026-11-13 前是 #ece6f0）、暗色对 #242426 和 #3a3a3c 都 ≥ 4.5:1）；分区标题 `SectionedList` 多彩档不画色点；心情河流空状态那股素净档不带紫。
- **没做**：老数据里的 emoji 图标本身有颜色，素净档照样显示；选颜色的色板（项目 / 类型 / 倒数日）保持彩色；图片、海报、头像不去色。
- 新文案 6 条（色彩、素净、标准、多彩、说明、外观小字改成「皮肤、语言、明暗、色彩、布局」）9 种语言，7 种待母语者看。测试：client `lib/color-level.test.ts` 12 项。截图脚本 `work/cl-tool/cl.mjs`（LightVela ~/cl-tool）。


### 过期积压按日期分五段，两页改名，项目卡片去掉时间段 ✅（2026-11-10）
Rei 2026-11-10 07:52：「“积压”页，按日期分区不一样，按照这个来：昨天，过去7天，过去一个月，过去一年，更远」；同时「待安排」改名「等待安排」、「积压」改名「过期积压」；07:53「项目列表中 不显示项目时间段」。

- **分区**：`lib/sections.ts` 新加 `overdueBucket` / `sectionOverdue`，只给过期积压页（`pages/Doable.tsx`）用；我的一天、项目页的分区不变。按过期了几天分：昨天 = 1 天前，过去 7 天 = 2–7 天前，过去一个月 = 8–30 天前，过去一年 = 31–365 天前，更远 = 366 天及以前。「一个月」「一年」按天数（30 / 365）算，不按日历月、日历年，这是我定的：跨月、跨年、闰年都不跳，段和段不重叠。天数 = 任务的今天 − 结束日（和 `isTaskOverdue` 同一套）。段内照旧最近过期的在最上面，空段不显示。
- **今天和以后的任务**：Rei 说的五段都是过去的日子。这页原来就有「接下来」（今天和以后，从近到远），保留，放在五段后面，不丢任务。原来的「已过期」段标题不再用在这页。
- **段标题**：昨天、过去 7 天、过去一个月 是新文案；过去一年用打卡热力图那条已有的；更远走 `trc('过期积压', '更远')`（英文 Earlier，和目标日期分区往后的「更远 Later」分开）。9 种语言，7 种待母语者看。
- **改名**：路由 `backlog` / `doable` 和深链不变。所有带这两个页名的文案都换了键（侧栏、页面读屏标题、添加框占位和读屏名、空状态、新建提示、滴答导入「不放进项目（进等待安排）」、解散项目确认、归档项目提示）。各语言「等待安排」沿用原译名（Inbox / Entrada…，意思一样）；「过期积压」改译 Overdue / Überfällig / Atrasadas / En retard / Terlambat / 期限切れ / Просроченное。
- **项目时间段**：项目列表卡片去掉「起止时间 / 不限时间」那一行（连同过期标红）。侧栏的项目本来只有图标和名字，项目页页头 2026-11-04 起就不写日期段，其他列项目的地方（项目选择器、⌘F）也没有时间段。`start_at` / `end_at` 数据照留。「不限时间」这条文案已没人用，留在词典里没删。
- 测试：`lib/sections.test.ts` 加 5 项（各边界天数、跨月 2/28→3/1、跨年 12/31→1/1、365 / 366 天含 2024-02-29、多天任务看结束日、段顺序和空段）。

### 过期积压：最后一段改叫「超过一年」、没到期的叫「还没到期」、去掉分区按钮、段能折叠 ✅（2026-11-10）
Rei 2026-11-10 19:1x：「"接下来"应该换成"超过一年"；点击 section 标题可以折叠」「过期积压不显示分区按钮，只有按日期分区这一种模式」。

- **超过一年**：366 天及以前那段（原「更远」）改叫「超过一年」，规则不变。`trc('过期积压', '更远')` 那条文案删了，换成 `tr('超过一年')`。
- **没到期的任务怎么办**（我定的，待 Rei 确认）：核对过，「接下来」里只有没过期的（`isTaskOverdue` 为假：日期是今天或以后，或日期段还没过完），没混进过期任务；过期天数和过期判断用同一个结束日、同一个任务的今天。PRODUCT 里这页的定义是「定了日期、还没做完」，所以没到期的照旧列在最后一段，不删；改名「还没到期」，免得和上面五段（都是过去的日子）混。顺带把这段的排序从开始日改成到期日（日期段看结束日）：开始日很早、还在进行的日期段原来会排在最前，看着像很久以前的任务。要是 Rei 想让这页只放过期的，删掉 `backlogSections` 里最后一段、改页面小字就行。
- **没有分区按钮**：去掉右上角「分区」（连同「不分区」），固定按日期分段。`settings.listViews.doable.section` 不再读，老设置里存的 'none' 没影响。这页本来就没有排序按钮，其他不变。已完成页的分区按钮照旧。
- **折叠**：改用 `components/SectionedList`（和我的一天、项目页同一个组件）：段标题是按钮，点了收起 / 展开，回车、空格也行，`aria-expanded` + `aria-controls`；收起了哪几段存本机 `settings.listViews.doable.collapsed`（`overdue:<段>`，不同步）。`ListSection.kind` 多一种 `overdue`，图标用日历钟。
- 测试：`lib/sections.test.ts` 加 2 项（段顺序和名字、kind、折叠键、空段）。

### 过期积压只放已过期的，去掉「还没到期」那段 ✅（2026-11-11）
Rei 2026-11-11 02:40（附截图）：「过期积压页里不能有未到期的任务，只列已过期的」；最后那段「还没到期」去掉；366 天及以前那段叫「超过一年」，意思是过期超过一年。上一节「没到期的任务怎么办」那条我定的做法就此作废。

- **core**：新 `overdue-backlog.ts`：`isOverdueBacklogTask(t, now, today)`（没删、没做完、有日期、不是打卡和倒数日、`isTaskOverdue` 为真）、`overdueBacklogTasks`（最近过期在上，结束日一样时开始日晚的在上）；`Store.overdueBacklog(now, today)` 用 `activeTasks()`，归档项目里的不算。今天到期的不算过期，不放。
- **页面**：`pages/Doable.tsx` 只取 `store.overdueBacklog`，不再算 `upcoming`；`backlogSections(overdue, now, today)` 去掉第二个参数，只出过期的 5 段：昨天 1 天 / 过去 7 天 2–7 / 过去一个月 8–30 / 过去一年 31–365 / 超过一年 ≥366，都按结束日算。小字改成「{n} 件已过期」（0 件不写），空状态「没有过期的任务」。
- **侧栏计数**：侧栏只有「我的一天」「等待安排」带数字，「过期积压」本来没有，不用改。
- **文案**：新 2 条「{n} 件已过期」「没有过期的任务」9 种语言（7 种待母语者看）；删 4 条没人用的：「还没到期」「定了日期的都做完了」「{n} 件定了日期还没做完」「{n} 件定了日期还没做完，{m} 件已过期」。
- 测试：core `test/overdue-backlog.test.ts` 5 项（今天 / 明天不放、日期段看结束日、各种不放的、排序、归档项目）；client `lib/sections.test.ts` 过期积压分段 2 项改写（没有「还没到期」、5 段顺序和名字）。

### 打卡页去掉页头，「按今天 / 按类型」放左边 ✅（2026-11-10）
Rei 2026-11-10 08:27：「打卡页 去掉标题和下方统计信息。打卡页 不显示 类型dropdown和编辑btn。打卡页 按今天、按类型btn group放到左边。」

- **页面**：`pages/CheckIns.tsx` 不再用 `PageHeader`。最上面一行 `.filter-row.checkin-toolbar`：左边 `Segmented`（今天视图且有打卡时）或「回到今天」（所有 / 已归档视图），右边 `.checkin-head-actions`（新建、`ListFilter` 下拉，原样搬过来）。全年热力图挪到工具栏下面（08:30 起由设置开关管，见下一节），列表不变。
- **去掉的**：标题、统计行（`metToday`、`best` 一起删）、类型下拉（`cat` state、`byCat` 删，`recurring` / `archived` 就是全部）、「编辑」按钮。新建打卡不再带筛选的类型（传 `null`）。空状态「这个类型下……」不会再出现，换成「还没有打卡」「没有归档的打卡」。
- **没别的入口了的**：打卡页按类型「筛选」没了，只剩「按类型」排列（分组看）；改类型还有侧栏「管理 → 类型」页和类型选择器底部「管理类型…」。没有另加入口。
- **手机**：`App.tsx` 的 `HEADERLESS_PAGES` 加 `checkin`，顶栏标题显示「打卡」，页面里没大标题。
- **样式**：`.checkin-toolbar` 一行不换、两头对齐；删了只给类型下拉用的 `.checkin-type-select`。`.checkin-filters`、`.filter-edit` 倒数日页、资料库还在用，留着。
- 文案：没加新的；「按类型筛选」「全部」「编辑」「这个类型下还没有重复任务」「这个类型下没有归档的打卡」「今天 {metToday}/{length} 已完成 · 最长连续 {best} 天」留在词典里没删。

### 设置 → 打卡：在打卡页顶部显示活动图 ✅（2026-11-10）
Rei 2026-11-10 08:30：「设置里新增「打卡」选项卡，里面一个开关「在打卡页顶部显示活动图」，开=打卡页顶部显示活动图，关=不显示，默认关。」

- **设置项**：`lib/router.ts` `SETTINGS_SECTIONS` 在 `tasks` 和 `journal` 之间加 `checkin`；`pages/Settings.tsx` `SETTINGS_ITEMS` 加一项（Lucide `CalendarCheck2`，名字用 `trc('导航', '打卡')`，小字「打卡页顶部的活动图」），`CheckInSection` 一张卡一个开关。设置窗口、Web、手机共用这份列表，深链 `view/settings/checkin` 自动认。
- **存哪**：`lib/settings.tsx` 新字段 `checkInsYearHeatmap`，默认 `false`，存 localStorage `mindough:settings`，不同步，和 `myDayDefaultToday` 一样。
- **打卡页**：`view === 'today' && settings.checkInsYearHeatmap` 才渲染「过去一年」那张卡。
- **行上的 activity 图标不动**：它是每张打卡自己的活动图（`habitHeatmapOpen`），和顶部总图不是一回事，不重复，没并进开关。
- 文案 3 条，9 种语言（7 种待母语者看）。测试：deeplink 加 `#/settings/checkin`。

### 打卡页只滚下面的分区 ✅（2026-11-11）
Rei 2026-11-11 00:52：打卡页只滚下面的分区；工具栏的按钮和顶部活动图（设置 → 打卡开着时）不动；滚动区不显示滚动条，照样能滚、触屏能滑。

- **做法**：工具栏和「过去一年」那张图包进 `.checkin-head-sticky`，整块 sticky 在顶上，和项目页的 `.project-head-sticky` 一样：不透明页面底色、左右多铺一点，滚动后（`useStuck` 的哨兵看不见了）底下一条细线；页面上边距挪进固定块，一开始滚时页头不会先跟着走一截。
- **为什么不在页面里另开一个滚动层**：滚的还是 `.main`（macOS 无标题栏时是 `.main-scroll`），和我的一天、项目页一样。这样手机上下滑、安全区留白、系统返回手势都走原来那套，不用另管；鼠标在页头上滚轮也照样滚列表。
- **滚动条**：`App.tsx` 的 `HIDE_SCROLLBAR_PAGES` 加 `checkin`（两种写法：`scrollbar-width: none` 和 `::-webkit-scrollbar`）。活动图自己的左右滚动条不归这里管，照旧。
- **手机**：顶部活动图开着时固定块差不多占半屏（390 宽约 300px），是 Rei 要的「不动」；关着只有一行按钮。
- 测试：`lib/hide-scrollbar.test.ts` 加打卡页；LightVela 截图脚本 `work/d1111-ckscroll/ck.mjs`（三皮肤 × 宽屏 / 手机 × 活动图开 / 关，量滚动条宽、滚前滚后工具栏位置、手指滑动）。

### 项目关联资料库 ✅（2026-11-10）
Rei 2026-11-10：项目新建 / 编辑窗口（ProjectSheet）加「资料库」下拉，多选，选中资料库里的任务自动加入这个项目。规则 Rei 原话确认过：库里已有的和以后加的都进；属于别的项目的挪过来；取消勾选后因这个库进来的移到无项目（不回原项目），手动加的不受影响；一个库只能关联一个项目。

- **数据**（迁移 v21）：
  - 新表 `group_library`（`type_id`、`group_id`、`created_at`）。一个库一行，`id = groupLibraryId(type_id)`（`glib-<库 id>`），所以一个库只能关联一个项目；两台设备各关联各的，也只是同一行整行 LWW，后写的赢。取消关联打墓碑，改关联改 `group_id`。项目删了 / 解散了这行不动，只是不生效（撤销删除后又生效）。删空资料库时顺手打墓碑。
  - `task.lib_via`：任务为什么在现在的项目里。资料库 id = 因那个库进来的；`'!'` = 手动挪出过，资料库不再自动挪；空 = 手动放的或无关。
  - 没用 `group` 上的数组列：一个库一个项目要靠唯一性，数组做不到，老客户端改项目还会把整列冲掉。Worker 的 `sync_row` 按表名存整行 JSON，新表不用改 Worker，没 deploy。
- **「库里的任务」**：`Store.taskLibIds`——任务挂的资料（`task_item` → `library_item.type_id`，顺着合并找，按资料顺序）所在的库，关联了人（`task_person`）再加人物库，排最后。只有 `task.type_id`、没挂资料的老任务不算：资料库页里也看不到它们，按「库里的东西」理解更直观。删掉的不算；完成、关闭、归档的算。
- **规则**（纯函数 `project-libraries.ts`）：
  - `placeTask`：`'!'` 不动；`lib_via` 是某个库且还在库里、库还关联着现在的项目，不动；否则跟着原来那个库走（改关联了就到新项目），没有就挑第一个关联着没归档项目的库，都没有就移到无项目。`lib_via` 空：现在的项目已经是它某个库关联的就不动（手动放的），否则挑第一个库的项目挪过去（含原来在别的项目里的）。
  - `manualVia`：用户手动改了任务的项目（`write()` 里比较写前写后的 `group_id`，调用方没自己写 `lib_via` 时）——新项目正是它某个库关联的，交回那个库；它在某个关联着项目的库里，记 `'!'`；都不是，空。
  - `Store.setGroupLibraries(groupId, ids)`：保存面板时调。新关联的库里所有任务直接挪进来（清掉 `'!'`，原来在别的项目的也挪）；去掉的库靠 `settleProjectLibraries` 把因它进来的移出。严格模式锁住的任务跳过（写了会抛 `StrictModeError`）。
- **什么时候整理**：本机写入后（`write()` 末尾），只看这批碰到的任务；碰了 `group_library`、`group`、`task_type` 就看全部；`batch()` 里攒到最后一起做。打开 Store 时的迁移写入不触发（本机数据可能是同步到一半的样子）。同步拉下来的行不在 `applyRemote` 里整理，拉到一半挪任务会把没拉全的任务错挪出去；`SyncEngine.runOnce` 拉完以后调 `Store.settleAfterSync()`，这一轮拉到了相关的行才整理全部，挪了的照常进 outbox。规则只看数据，各设备算出来一样，不会来回改。
- **老客户端**：不认 `group_library`，`applyRemote` 跳过未知表；它推上来的任务没有 `lib_via` 键（新客户端每行都写上，空也写 null）：项目没变就沿用本机的值，项目变了按手动挪动算（`manualVia`，各设备各算，不进 outbox）。所以老客户端改正文不会冲掉 `'!'` 或库 id。剩下的限制：老客户端给任务挂资料不会触发挪动，要等新客户端下一轮同步整理。
- **界面**：`components/project/LibrarySelect.tsx`，在「默认日期：今天」下面。按钮写选中的库名（「、」连起来），空是「不关联」；弹出列表每行图标块 + 库名 + 勾，已关联别的项目的库在名字下面写「已关联：某项目」。一库一项目选的是「弹确认改关联」，没选禁用：禁用要用户去另一个项目取消再回来，多走两步；确认框写明会挪任务，误点也能取消。下面一行说明「选中的资料库里的任务会自动放进这个项目，以后加进库里的也会。」，有任务要挪时加一句「会有 N 件任务放进来。」。只在点「保存 / 创建」时才关联、挪任务。列表只给没归档、能挂资料的库（含人物），已关联这个项目的归档库也列出来，好取消。
- 导出导入：Markdown 导出不带关联和 `lib_via`（导入比较内容时也不算 `lib_via`），导回来的项目没有关联，要重新勾。
- 测试：core `test/project-libraries.test.ts` 19 项（纯函数、关联 / 新加 / 去资料 / 人物库 / 取消关联 / 改关联 / 手动挪出与挪回 / 重新关联 / 严格模式 / 解散与撤销 / 归档 / 删空库 / 老客户端行 / SQLite 读回 / 两台设备同步与同时关联）。文案 7 条 9 种语言（7 种待母语者看）。

### 正文里 @ 提到任务 ✅（2026-11-10）
Rei 2026-11-10 11:34：「任务编辑器、日记编辑器中可以用@选择任务，日记中可@任务和倒数日」。

- **存法**：提及就是一条 markdown 链接 `[标题](mindough://task/<id>)`，地址用 DEEPLINKS 里现成的任务深链。没另造语法（`@[标题](id)` 之类），因为老客户端、导出的文件、别的编辑器都会把它当乱码；普通链接谁都认，老客户端在桌面 App 里点了交给系统，按理会经深链打开那件任务（没实测）。core `task-mention.ts`：`mentionHref` / `mentionIdOf`（只认 `mindough://task/<uuid>`，带参数、别的 host 不算）。
- **编辑器**：新节点 `taskMention`（`components/editor/mention.ts`，行内 atom，属性 id、label）。读入时 remark 插件 `remarkTaskMentions` 把这种链接换成节点（跟在 app-links、inline-links 后面）；写出时写回链接，方括号里换成这件任务现在的标题，找不到就用 label。打开时 canon 按同一套写法算，所以只看不改不写回；改了别的字才顺手刷新标题。节点不能带链接、行内代码 mark（会写成链接套链接）。
- **显示**：`lib/task-mention.ts` 一份「来源」（App 用 `useMentionSource` 挂上 Store 和 `ui.openEditor`），编辑器的节点视图和只读 `Markdown` 都用 `paintMention` 画胶囊，store 一变就重画（签名没变不动 DOM）。只读渲染里链接换成 `<a href="#/task/<id>" data-task-mention>`，点了在 `Markdown.tsx` 就地 `openEditor`，不跳页。
- **打 @**：`mentionExtension`（优先级 1900，低于 ime-guard、高于纯文字标题和行为扩展）在插件视图的 update 里看光标前的字（core `mentionQueryAt`），`view.composing` 时跳过，所以组字时浮层不弹、不筛，上屏后再算；↑ ↓、回车 / Tab、Esc 在 handleKeyDown 里交给 MdEditor。Esc 记下这个 @ 的位置，光标还在它后面就不再弹。候选用 core `mentionCandidates`（标题走 `taskTextMatches(title, '', q)`，和挑任务、⌘F 同一套拼音匹配，只是不搜正文）。
- **浮层放哪**：放在编辑器里面，`position: fixed`，不放 body。放 body 的话，新建面板（React Aria Modal）会把点浮层当成「点了外面」把自己关掉。外层有 transform 时 fixed 相对那一层，所以先放到 0,0 量出原点再减。手机按 visualViewport 算，下面放不下就放到 @ 上面。手指按在浮层上时编辑器失焦也不收浮层，选完把焦点还给编辑器。
- **第一行**：任务第一行只能是纯文字（title.ts）。第一行选候选插标题文字；`literalOf` 遇到有 `leafText` 的行内节点（胶囊）变成它显示的字，所以拖到第一行、删掉第一行让带胶囊的段落顶上来，也都变成文字。老数据第一行是提及：打开时显示成文字，不写回；core `firstLine` 本来就把链接取文字，列表标题不受影响。
- **复制、搜索**：剪贴板只写纯文字，胶囊给现在的标题（`leafText`）。⌘F、挑任务按正文的纯文字搜，搜得到方括号里存的标题；没做按 id 反查现在的标题。
- **没做**：不自动建相关任务（task_link）；不做「被谁提到了」的反向列表；不提到打卡、资料、人物、项目。
- 新文案 2 条（浮层读屏「提到一件任务」、⌘? 浮层一行「打 @ 提到一件任务，点它就打开那件任务。」），9 种语言（7 种待母语者看）。「已结束」「没有找到」「找不到这件任务」「倒数日」「还有 N 天」沿用旧词条。
- 测试：core `task-mention.test.ts` 18 项（地址、范围、过滤排序、光标前的 @）；client `mention.test.ts` 21 项（往返、改名、删了、组字、Esc、插入、第一行、复制、只读渲染）。


### 侧栏置顶的项目、资料库能拖动排序 ✅（2026-11-10）
Rei 2026-11-10 11:45：「侧边栏"在侧边栏展示"的项目列表可以拖拽调整顺序」。资料库放进侧栏的那一串同样好做，一起做了。

- **存哪**：另起两条同步偏好 `group.sidebar_order`、`library.sidebar_order`（id 列表），不加列、不改项目行和类型行，没有迁移。没塞进原来的 `group.sidebar` / `library.sidebar`：老客户端开关侧栏时会整条重写那一条，还照项目页顺序显示；新的这条它们不认识，原样留着。core `library.ts` `orderBySidebar` / `nextSidebarOrder` / `moveInList`，`Store.reorderSidebarGroups` / `reorderSidebarLibraries`。
- **排序规则**：没有排序偏好时跟以前一样（项目按项目页、资料库按资料库顺序），升级后侧栏不变样。有了以后，在顺序里的按顺序，不在的接在后面，按放进侧边栏的先后（`group.sidebar` 本来就是追加写的，老客户端也是）。放进侧边栏时：还没排过、侧栏里已经有别的，先把眼下的顺序记成排序偏好（`freezeSidebarOrder`），所以新放进来的总排最后；放进来、拿出去时都把它从顺序里删掉，取消再放回也排最后。拖的时候写看得见的新顺序，归档着的置顶项目留在后面，取消归档回到原来那一带。没在侧栏里的 id 写不进去。
- **同步**：偏好一行整条 LWW，两台同时拖，后拖的赢。Worker 不用改。
- **手势（`lib/nav-reorder.ts`）**：没用 React Aria 的 `useDragAndDrop`——侧栏项是链接，套 GridList 要重做键盘、读屏和跳转；手机要「长按拿起、挪就拖、不挪松手出菜单」，和现有长按菜单合在一起，RAC 做不到。鼠标 / 触控笔按住挪 4px 开始拖，拖过的那次 click 在捕获阶段吃掉，不跳转；只有一个时不拖。手指按住 450ms 拿起（按下以后滚过或刚滚完不拿起，同 `lib/long-press`），拿起前挪 > 10px 算滑页面；拿起后 touchmove 一律 preventDefault，页面不滚，挪 6px 开始拖，没挪就松手调 `onLiftRelease`。侧栏的置顶项把 `useContextMenuAt` 的长按关掉（`longPress: false`），长按由拖动接管，拿起没挪松手再用新加的 `menu.open` 开同一个菜单；鼠标右键照旧。手指发的 contextmenu 一律 preventDefault。`<a>` 加 `draggable={false}`，不触发浏览器自带的拖链接。
- **动画**：全部直接改 DOM style，拖动时 React 不重渲染。被拖那行 `translateY` 跟手，加 `.is-reorder-dragging`（底色 `--surface` 垫一层 `--bg`，WinUI 半透明面不透字；阴影 `--shadow-pop`；圆角沿用行本身）；中线越过别人的中线就换位，别的行 `transform` 150ms 让一格；落点插一个 `.nav-drop-slot`（`--accent-soft` 底 + 强调色虚线，圆角抄行的），放在容器最后，不打断 `.more-item + .more-item`。松手滑进占位格再写顺序，写完在 `useLayoutEffect` 里清 transform（绘制前，不闪）。拖到滚动区上下 36px 内自己滚。Esc 取消放回。减少动态效果时占位格不过渡。三皮肤各用自己的 `--nav-radius`、`--accent-soft`、`--shadow-pop`，样子跟着皮肤走。
- **键盘**：置顶项上 ⌥↑ / ⌥↓ 上移下移一位，`aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"`，换完把焦点放回它身上。没做读屏播报。
- **用在哪**：宽屏侧栏（含中等宽度图标栏）`components/NavReorderScope.tsx` 包每一节，`PinnedGroupLink` / `PinnedLibraryLink` 用 `usePinnedReorder`；手机「更多」页 `MoreLink` 同样。没有新文案。
- **测试**：core `sidebar-order.test.ts`（纯函数、升级不变样、新放进来排最后、归档留位、老客户端开关、两台同步后拖的赢、资料库），`group-sidebar` / `library-sidebar` 改成按新规则；client `nav-reorder.test.ts`（换位、让位、占位格、键盘）。截图 `work/d1110g/so.mjs`（LightVela `~/so-tool`）：三皮肤亮色宽屏 1366 鼠标拖 + 手机 390 CDP 触摸长按拖。

### 餐厅、目的地接高德：搜地点 + 地图选点 ✅（2026-11-10）
Rei 2026-11-09 定：资料库里「餐厅」和「目的地」（内置类型 travel）只接高德，不接大众点评，也不加大众点评链接。2026-11-10 给了 JS API Key，地图选点一起做。

- **字段**（内置定义 r5，`BUILTIN_TYPES_REVISION` 0005）：两种都加 城市 / 区 `city`、经纬度 `location`（`经度,纬度`，高德坐标 GCJ-02）、电话 `phone`、类别 `category`、评分 `rating`、营业时间 `hours`、高德地图 `amap`（site_id，站点 `amap`，存 POI id，链接到 `https://uri.amap.com/poidetail?poiid=…`）；餐厅另加人均 `cost`（money，人民币）；目的地加地址 `address`。都是资料字段。用户改过的这两种类型照旧由 `withNewBuiltinFields` 补上新字段，不覆盖。没加迁移（字段定义整行存在 task_type 里）。高德地图链接就用 `amap` 字段的链接，没另加一个链接字段；餐厅原有的「链接」留给用户自己填。
- **服务端**（`apps/server/src/lookup/amap.ts`）：`kind=restaurant|place` 只问 `amap` 一个来源。
  - 搜：`/v5/place/text`，`show_fields=business,photos`，`page_size=10`；餐厅加 `types=050000`（餐饮服务），目的地不限。`city` 参数（上次选的城市）→ `region` + `city_limit=false`：优先、不限定（试过 region=上海 搜「北京故宫」照样出北京）。搜索结果已经带全字段，选中后不再请求详情（省配额）。
  - 取一条：`/v5/place/detail?id=`；`id` 也可以是分享短链，Worker 只请求 `surl.amap.com/<码>`、不跟跳转，从 Location（`wb.amap.com/?p=<POI id>,纬度,经度,…`）里取 POI id。别的域名直接 400，不发请求。
  - 字段换算：类别取 type 每段大类后面的部分（「餐饮服务;中餐厅;火锅店」→「中餐厅 · 火锅店」，多类别用 | 分开的都取）；城市 / 区「上海市 黄浦区」（直辖市 city 为空用省）；电话分号换成「 / 」；评分、人均转数字；营业时间取 `opentime_week`，没有就 `opentime_today`。照片取第一张，http 换 https，列表小图 store.is.autonavi.com 加 `?operate=merge&w=160&h=90&position=5`；`/api/lookup/image` 白名单加 `store.is.autonavi.com`、`aos-comment.amap.com`，照片和豆瓣封面一样拉进 R2。
  - 逆地理：`GET /api/lookup/regeo?lng=&lat=` → `/v3/geocode/regeo`（`extensions=all`、`radius=200`），回地址、城市 / 区、附近 5 个地点（按距离）。
  - 缓存：搜索、逆地理 1 天，详情 1 天（营业时间、评分会变，不按 7 天）。
  - 错误：高德 `status=0` 时按 infocode 换成 HTTP 状态码和中文：Key 问题（10001、10002、10005–10009、10012、10013、10026、10041）→ 503 + `unconfigured`；配额、QPS（10003、10004、10010、10014、10019–10021、10029、10044、10045）→ 429 + 新状态 `limited`；参数（20000–20002、20011、20012）→ 400；10015 → 504；其余 502。说明里带 infocode，比如「429 请求太多：高德今天的调用次数用完了，明天再试（10003）」。没配 `AMAP_KEY` → 503「未配置高德 Key」。
  - Key：只从 Worker 机密 `AMAP_KEY` 读，只拼进发往 restapi.amap.com 的地址；报错、结果里都不带地址和 Key（单测查过）。
- **客户端**：`lookupKindOf` 认餐厅 → restaurant、旅行（界面叫目的地）→ place；`lookupSearchText` 对这两种不去季标记，认 POI id、高德链接里的编号、分享文字里的短链；搜索带 `city=` 上次选的城市（本机 localStorage `mindough:amap-city`，选中一条高德结果时记，不同步）。界面语言不影响结果：高德只有中文，非中文界面在候选下面说一句「高德地图只有中文结果」。配额超了显示「高德地图 查询次数超了，过一会儿再试（429 请求太多）」。
- **地图选点**（`components/library/MapPicker.tsx`、`lib/amap.ts`）：资料编辑底部「在地图上选点」（只有餐厅、目的地，且经纬度字段没删）。点了先问 `GET /api/amap/config`（`{ js, rest }`），`js=false` 提示没配置；否则按需注入 `https://webapi.amap.com/maps?v=2.0&key=<JS Key>`（不加 npm 依赖），注入前设 `window._AMapSecurityConfig = { serviceHost: '<API 源>/_AMapService' }`（网页版同源，原生端 `https://app.mindough.rei8t.dev`）。标记可拖、点地图也挪过去；停 400 毫秒后经 `/api/lookup/regeo` 逆地理（Web 服务 Key，不用 JS API 的 Geocoder）。「用这个位置」用 core `applyMapPick`：经纬度总是换；地址、城市 / 区原来空着才填，勾了「地址也换成这个」才覆盖；高德地点编号不动。没有经纬度时地图从北京开始（缩放 11），有就在那一点（缩放 16）。
- **安全密钥代理**（`apps/server/src/amap-proxy.ts`）：`/_AMapService/v4/map/styles` → webapi.amap.com，`/_AMapService/v3/vectordata/` → fmap01.amap.com，其余 `/_AMapService/*` → restapi.amap.com，都附加 `jscode=AMAP_JS_SECRET`（客户端带来的 jscode 丢掉）。只收 GET，只转 key 等于我们 JS Key 的请求（别的 Key 403），没配密钥 503。JS Key 是公开的，前端、Worker 各写一份常量。
- **CSP**：Tauri 加 `script-src 'self' 'unsafe-eval' blob: https://webapi.amap.com https://*.amap.com https://app.mindough.rei8t.dev`（JS API 的 JSONP 走代理）、`worker-src 'self' blob:`，`connect-src` 加 `https://*.amap.com https://*.autonavi.com`；图片本来就放行 https。网页版只有 COEP credentialless，没有 CSP。
- **待办**：
  - 高德控制台 JS Key 的域名白名单（Rei 来配）：app.mindough.rei8t.dev、mindough.rei8t.dev、localhost（macOS / iOS / Linux App 的 tauri://localhost 和本地开发）、tauri.localhost（Windows / Android App）。
  - Mac / 手机 App 要下个 alpha 才有新的 CSP；原生 WebView 里的地图没真机验过。
  - 没做：按当前位置定位、在地图上看所有餐厅、路线。

### 日历：侧栏时间轴换成日历、节假日和农历拆开、日历订阅 ✅（2026-11-10）

Rei 2026-11-10 19:45：「侧边栏时间轴换成"日历"；视图 dropdown 有周、月、年、多日（2-14天可选）、多周（1-6周可选）；默认显示法定节假日；设置中新建一个日历 tab，把农历挪过来，添加一个日历订阅功能。」方案、待确认项见 [CALENDAR.md](CALENDAR.md)。

- 页面：`pages/Calendar.tsx`（删了 `pages/Agenda.tsx`）。路由 id 还叫 `agenda`，`href` 写 `#/calendar`，`#/agenda` 照样认；深链加 `view/calendar`。视图的范围、翻页、排道都在 core `calendar/views.ts`（`calRange`、`stepCalAnchor`、`layoutRow`、`yearMonths`），视图存本机 `settings.calendarView`（`normalizeCalView`）。
- 节假日：不另做内置数据，沿用节假日订阅（原「农历订阅」，`lunar/subscription.ts`、`lib/lunar.ts`）。本机设置 `holidays`（默认开）和 `chineseLunar`（默认关）拆开（Rei 19:53 定）：`useLunar()` 多给 `holidays`、`any`；只开节假日时 `day()` 走 core `holidayCell`（只给休 / 班和放假的节日名）。订阅只要两个开关有一个开着就自动拉。日期面板、日期标题也跟着显示休 / 班。
- 设置：新的一项 `calendar`（`components/CalendarSettings.tsx`，原 `LunarSettings.tsx`）：节假日（开关 + 节假日订阅）、农历开关（只在中文界面）、日历订阅（`components/CalendarSubs.tsx`）。设置 → 任务里的农历去掉了。偏好 key `lunar.sub_url` / `lunar.sub_freq` 没改。
- 日历订阅：同步表 `calendar_sub`（迁移 v22，name / url / color / sort / created_at，整行 LWW）；云端只存整行 JSON，同步部分不用改；老客户端不认这张表，不显示。事件、同步状态、「这台设备看不看」只存本机（`lib/calendar-subs.ts`，localStorage 一条订阅一个 key），展开今天前 1 年到后 2 年、最多 5000 个；6 小时没成功就自动拉，失败隔 1 小时。解析是 core `calendar/ics-events.ts`（复用 `lunar/ics.ts` 的折行，没加依赖）：全天 / 带时间、DTEND / DURATION、Z / IANA TZID / 常见 Windows 时区名 / 浮动时间、RRULE 日周月年 + INTERVAL / COUNT / UNTIL / BYDAY（含第几个星期几）/ BYMONTHDAY / BYMONTH、EXDATE、RECURRENCE-ID、取消的不要。
- Worker `/api/calendar/ics`：重定向改成自己跟（最多 3 跳，每跳重查地址，跳到内网 400），上限 5 MB 边读边数（413），每 IP 每分钟 30 次、fresh=1 6 次（429，实例内计数），主机名再拒 `.localhost` / `.lan` / `.home.arpa` / 纯数字和十六进制主机。
- 拖动改日期（Rei 2026-11-11 06:55）：周、多日、多周、月视图能拖任务和倒数日，年视图不拖；整段平移（core `calendar/drag.ts`），写入走 `store.updateTask`（我的一天跟着走），提示带撤销；手势在 `lib/cal-drag.ts`（鼠标 4px、手指长按 450ms、⌥← / ⌥→、Esc）。细节见 [CALENDAR.md](CALENDAR.md) 第十节。
- 没做：小时刻度的日程视图、订阅事件转任务。

### 日历：默认周、删掉时间轴列表、月视图每格一件 ✅（2026-11-11）

Rei 2026-11-11 00:37 定了 CALENDAR.md 第八节的五条：默认视图改为周（已记住视图的设备不改）；原来按天往下排的时间轴列表彻底删掉；月视图每个格子只显示一个任务，当天有倒数日时优先显示倒数日，另显示当天「任务 + 打卡 + 倒数日」的个数；周、多日视图不画小时刻度；拖动改日期仍是后续；外语界面默认显示节假日维持。细节和我代定的几条见 [CALENDAR.md](CALENDAR.md) 第九节。

- core `calendar/views.ts`：`DEFAULT_CAL_VIEW` 改成周；新 `monthCell(day, items)` 挑一件（倒数日 → 任务 → 订阅事件，打卡不挑）并数任务 + 打卡 + 倒数日。删了 `date-range.ts` 的 `agendaBuckets`。
- 客户端 `pages/Calendar.tsx`：条目多一个 `role`（task / countdown / checkin / event）；倒数日按 `target_date` 进日历；月视图另写 `MonthGrid`（格子自己画竖线和今天底色，不再用排道）；打卡只在月视图按 `dueToday` 逐天算，进个数和当天列表；手机小月历的点换成数字。
- 删掉时间轴列表剩下的：TaskRow `spanNote` / `dateMetaOnly`、`.agenda*` 和 `.meta-span` 样式、Material 皮肤和农历里的 `.agenda-*`、文案「随手记下的琐事，按日期排开」「更早的 N 条」和 `导航|时间轴`。
- 没有迁移，Worker 没改。

### 日历：格子列出当天全部、倒数日在最上、不显示打卡 ✅（2026-11-11）

Rei 2026-11-11 01:08–01:10 改了上一节的几条：日历所有视图和列表都不显示打卡，月视图个数照旧算上打卡；周、多日、多周、月视图都去掉「还有 N 件」，列出当天全部（月视图不再每格一件）；所有视图里倒数日在最上，其后任务，再后订阅事件。细节见 [CALENDAR.md](CALENDAR.md) 第九节。

- core `calendar/views.ts`：`layoutRow(row, items, tier?)` 加分档排道（后一档每件从它覆盖的那几格里前几档用到的最下一道之后开始，保证每天的上下顺序）；新 `calItemTier`、`sortDayItems`（列表顺序）、`dayCount`（个数）；删了 `monthCell`。
- 客户端 `pages/Calendar.tsx`：删了 `MonthGrid`，宽屏月视图也走 `GridView`（没有道数上限、没有「还有 N 件」，给了 `countItems` 时日期旁写个数）；打卡条目只进 `countItems`（月视图个数、手机小月历个数），不进任何格子和列表；`DayList` 用 `sortDayItems`。格子按内容撑高，不在格内滚。
- 删了文案「还有 {n} 件」（9 种语言）和 `.cal-more*`、`.cal-month-*` 样式。
- 没有迁移，Worker 没改。


### 任务详情「+」添加属性菜单重排、分三组 ✅（2026-11-11）
Rei 2026-11-11 02:59（截图：「+」菜单原来是 类型、资料、完成方式、重复、提醒、心情、附件）：重新排序并分三组，组间分隔线：① 日期、完成方式、重复、提醒；② 资料、类型；③ 心情、附件和其他属性。菜单里没有「日期」就跳过；已加属性的胶囊也按这个顺序。
- `lib/prop-chips.ts`：`PROP_ORDER` 改成 日期、完成方式、重复、提醒、资料、类型、心情、项目、卡片颜色；新 `PROP_SECTION`（每项第几组，附件在第 3 组）和 `addMenuSections`（空组不出）；`addMenuItems` 把附件插在第 3 组心情后面、项目前面（没有心情时就是第 3 组第一项）。「其他属性」= 项目、卡片颜色（只有倒数日有），排在附件后面，是我按 Rei 原话「心情、附件和其他属性」的字面顺序定的。
- `components/task/PropChips.tsx`：菜单按组渲染，组间 React Aria `Separator`（`.menu-sep`，三皮肤各自的分隔线样式，和「…」菜单同一个）。胶囊行用同一个 `PROP_ORDER`，所以也变成 日期、完成方式、重复、提醒、类型、心情、项目、卡片颜色，胶囊之间不画分隔。
- 新建面板（TaskComposer）的胶囊是另一套固定排法（类型、资料…），Rei 这次说的是任务详情，没动。
- 没有新文案、没有迁移，Worker 没改。

### 侧栏资料库行右边的 ···、新建面板胶囊顺序、打卡页活动图核对 ✅（2026-11-11）
Rei 2026-11-11 04:27 三件。
- **置顶资料库行右边的 ···**（照 55fd7c4 置顶项目）：`App.tsx` 把 `PinnedGroupRow` 的行抽成 `PinnedNavRow`（侧栏）、`MoreGroupRow` 的行抽成 `MorePinnedRow`（「更多」页），项目、资料库共用；新 `PinnedLibraryRow`、`MoreLibraryRow`，菜单还是 `librarySidebarAction` 那一项（取消在侧边栏显示），读屏复用「「{name}」的更多操作」，没有新文案。不挂 `useContextMenuAt`：右键由全局拦掉，长按拿起没挪松开什么也不做，长按拖排序照旧。显示规则、截断、拖动时藏 ···、按 ··· 不拿起，都是 `.nav-pinned-row` / `.more-item-split` 原有样式，CSS 没改。960 图标栏（`rail`）照旧走 `PinnedLibraryLink` 右键。多彩档的库图标颜色照旧（`vividVar`）。
- **新建面板胶囊顺序**：`lib/prop-chips.ts` 新 `ComposerChipId`（属性 + `related`）和 `composerChipOrder`，按同一份 `PROP_ORDER` 排，相关任务排最后（算其他属性）。`TaskComposer.tsx` 把胶囊放进 `chips` 表，按 `composerChipOrder` 渲染：日期、提醒 ｜ 资料、类型 ｜ 心情、项目、相关任务。新建面板没有「+」菜单，所以不画分隔线（同详情胶囊行）。完成方式、重复在新建面板是下面两段，不是胶囊，没挪；新建面板没有附件。
- **打卡页活动图**：755b215 已经让工具栏和顶部活动图固定（`.checkin-head-sticky`，滚的是 `.main`）。这次截图核对：宽 1366 滚轮、手机 390 手指滑，三种皮肤，开着「顶部活动图」，滚后活动图位置不变、在手机顶栏下面、没被盖住，下面分区滚走，`is-stuck` 细线出来，两端都已固定，没改代码。
- **测试**：`lib/prop-chips.test.ts` 加 2 项。截图脚本 `work/d1111-three/th.mjs`（LightVela Chromium，三皮肤 1366 + 960 + 390）。

### 影视库剧集显示季 ✅（2026-11-11）
Rei 2026-11-11 06:56「资料库「影视库」里的剧集显示 seasons」。

- Worker：新接口 `GET /api/lookup/seasons?id=tv/1399|tt0903747&lang=zh|en`（`lookup/tmdb.ts` 的 `tmdbSeasons`）。id 是 TMDB 剧集编号，或者 IMDb 编号（先 `find` 出剧集，查到的是电影就回 `{ tv: null, seasons: [] }`）。调 TMDB `/tv/{id}`，每季回 `number`（0 是特别篇）、`name`、`year`（首播年）、`episodes`、`poster`（只留 TMDB 图片路径 `/abc.jpg`，别的不收）。Cache API 缓存 1 天（播出中的剧会加季）。要登录，同别的 lookup 接口。
- core `seasons.ts`：存在资料的保留键 `_seasons`（JSON 文字 `{ v: 1, ref, tv, at, seasons }`），跟着资料同步，不加列、不加迁移。`isShowItem`（影视库里「电影/剧集」选了剧集，或没选但来源是 `tmdb:tv/…`）；`seasonsRef`（TMDB 剧集编号优先，其次 IMDb 编号，只有豆瓣的没有）；`needsSeasonsFetch`（没存过、`ref` 和现在的编号对不上、存了超过 30 天才重拉）；`seasonsOf` 按第 1、2…季排，特别篇最后；`seasonTitle` / `seasonSubtitle`（TMDB 默认季名「第 1 季」「Season 1」「Specials」等不另外显示）/ `seasonMeta`（「2011 · 10 集」）。
- 客户端 `lib/seasons.ts` 的 `useSeasonsRefresh`：资料详情页打开、登录且在线、需要拉时在后台拉一次，写回资料；拉不到不写，同一条资料这次会话不再试；页面关掉取消的下次还会拉。写之前再看一眼，资料删了或来源又换了就不写。
- 界面 `components/library/Seasons.tsx`：资料详情页备注下面、「相关任务」上面一节「季 N」，网格卡片：海报小图（TMDB w154 直接加载，加载失败用占位图写 S1 / SP）、季名、TMDB 起的名字、年份 · 集数。宽屏自动排列，手机一行三张。资料来源不是 TMDB 时，下面一行「资料来自 TMDB」（TMDB 要求署名）。
- 默认的取舍（Rei 没定，按派活时给的默认做）：海报不拉进 R2，直接从 image.tmdb.org 加载（季多，存起来不划算；在线搜索结果的小图也是这样）；季名语言跟拉的那台设备的界面语言（中文界面中文，其他英文），换语言不重拉；不显示每季简介、评分；只显示，不记每季观看进度；卡片不能点。
- 新文案：「季 {length}」「特别篇」「{n} 集」，9 种语言（外语待母语者看）。
- 测试：core `seasons.test.ts` 10 项；Worker `lookup.test.ts` 加 3 项；客户端 `lib/seasons.test.ts` 4 项。

### 资料库卡片：目的地只显示名字，名字不出卡片 ✅（2026-11-11）

- **需求**（Rei 2026-11-11 07:00，附截图）：目的地卡片网格里地址那行在相邻卡片间叠成一团，名字也伸到隔壁卡片。目的地只显示名字，地址留在详情；名字限制在卡片宽度内，最多两行，超出省略号，长名用 title / 读屏给全名。别的库同类问题按同一规则修。
- **做法**：`lib/lib-tile.ts` 的 `tileSubText`：内置类型 travel（按 id 认，改过名也认）不出小字，别的库照旧「字段摘要 · N 件任务」。`pages/Library.tsx` 的 `Tile` 用它，名字加 `title`。`library.css`：`.lib-tile` 宽度 100%，`.lib-tile-text` 钉在卡片宽度、`overflow: hidden`，`.lib-tile-name` 定宽、两行截断、`overflow-wrap: anywhere`（没空格的长英文串也折行），`.lib-tile-sub` 块级、单行省略号。
- **别的库**：影视、书、游戏、课程、好物、餐厅、菜谱、人物都用同一个 `Tile`，一起生效。自查时发现书库里没空格的长英文名在第一行被截断、看不到省略号，这次一起修好。
- **复现**：本地 chromium / webkit 用当时 main 的构建没复现出截图里那种叠字（名字本来就有两行截断）；按截图的样子把文字框和名字都钉在卡片宽度内，哪种引擎都不会再伸出去。
- **测试**：client `lib-tile.test.ts` 3 项。截图 `work/d1111-dest/dest.mjs`（LightVela `~/dest-tool`）：每个库加一条长名字（目的地加长中文名 + 地址、无空格英文名），三皮肤 × 宽屏 1280 / 手机 390，目的地另外换成方形、海报版式，检查名字和小字都在卡片内、名字不超过两行、title 是全名、目的地没有小字、餐厅照常显示地址、目的地详情里有地址。

### 资料库和已完成页顶部固定、只滚内容 ✅（2026-11-11）
Rei 2026-11-11 08:10「资料库页面中只有内容部分滚动，顶部固定」，08:11 追加「已完成页也一样，顶部固定，只滚任务列表部分」。

- **组件**：`components/StickyHead.tsx`。`StickyHead` = `useStuck` 的哨兵 + 一块 `.sticky-head`（sticky top 0、不透明 `var(--bg)` + `--bg-image`、左右多铺一点、`is-stuck` 细线），做法照打卡页 `.checkin-head-sticky`；页面加 `has-sticky-head`，宽屏 / 手机 / macOS 无标题栏的上边距挪进固定块。`useScrolledPast` 用 IntersectionObserver（上边扣 64px）看大标题是不是滚到顶栏下面了。
- **资料库页**（`pages/Library.tsx` `LibraryPage`，`.lib-head-sticky`）：PageHeader、库标签条、搜索工具条一起固定；卡片网格、空状态、在线结果在下面滚。
- **资料详情 / 人物详情**（`LibraryItemPage`、`pages/People.tsx` `PersonDetailPage`，`.detail-head-sticky`）：只固定「‹ 返回」一行；大标题滚走后这一行淡入名字（`aria-hidden`，读屏已有 h1）和铅笔按钮（复用「编辑资料」「编辑」，没有新文案）。整块 hero 不固定，是我定的：海报 + 资料表能占半屏以上。
- **已完成页**（`pages/Done.tsx`）：PageHeader（标题 + 分区按钮）固定。
- **滚的还是 `.main`**（macOS 无标题栏 `.main-scroll`），没另开滚动层，手指滑、安全区、返回手势照旧；安卓选字变黑那套（手机整页任务详情 `.pane-body-sheet`、不透明底）在任务详情里，这次没碰；固定块底色本身不透明。
- **滚动条**：`HIDE_SCROLLBAR_PAGES` 加 `library`、`libitem`、`person`（`done` 本来就在）。人物列表页 `people` 没动。
- 测试：`lib/hide-scrollbar.test.ts` 改列表、加一项（sticky 规则、各页固定块里有什么）。截图脚本 `work/d1111-libscroll/ls.mjs`（LightVela Chromium，三皮肤 × 宽屏 1366 亮 / 手机 390 暗 × 四页，量滚动条宽、滚前滚后顶部位置、固定块在上层、底色不透明、内容一开始不被盖、详情页小标题出现）。


### 类型页：每个大类下的类型能显示为图标 ✅（2026-11-11）
Rei 2026-11-11 08:33「类型页中，每个分组下的类型可以按现在的列表展示，也可以按图标展示（图标格子，名称放图标下面）」。

- **入口**：类型页页头右边一个 ···（读屏 / 悬停「类型显示方式」），菜单「显示为：列表 / 图标」打勾。菜单从侧栏项目的 `PinnedStyleMenu` 抽成 `DisplayStyleMenu`（同文件），两处共用，「显示为」「列表」「图标」三条文案也共用；只新加「类型显示方式」一条（9 种语言，7 种待母语者看）。
- **存法**：本机设置 `categoryViewStyle`（`lib/category-view.ts`，值同 `pinnedGroupStyle`：list / icons，认不出来当列表），默认列表，不同步；所有大类一起切，不是每组各记一份（我定的）。
- **图标格子**（`components/CategoryEditor.tsx` `CategoryCell`，`.cat-grid` / `.cat-cell`）：`IconTile` 原样颜色，名字在下面、居中，最多两行、超出省略号、没空格的长串也折行（同资料库卡片 `.lib-tile-name`），`title` 给全名；`repeat(auto-fill, minmax(var(--cat-cell-min), 1fr))` 按宽度自动排几列、放不下折行，不左右滚。图标块原来 40px，比侧栏图标模式大太多（Rei 2026-11-12 00:52），改成和同端侧栏一样：电脑 22px（侧栏格 36×36 里的项目图标块），手机 32px（「更多」页格 44×44 里的），字形跟着是 13 / 19；边长写在 `lib/pinned-tile.ts` 的 `PINNED_TILE`，侧栏（`PinnedGroupLink`、`MoreTileOf`）和类型格（`CategoryCell`、「新建」格）都读它，侧栏格子边长是 CSS 变量 `--pinned-cell` / `--pinned-cell-touch`，以后改一处就行。列宽跟着收：电脑最窄 60px（宽屏左栏一行 6 个）、手机 68px（390 一行 4 个）。「常用」小标签和用了几次不画在格子里（太窄），读屏名照旧「名字，用了 N 次」。
- **照旧的**：点格子 = 点行（宽屏右边出详情、手机整页推进详情）；搜索结果也排成格子，「新建“xxx”」是最后一格；↑↓ 还是按顺序一个一个挪高亮（不按行跳，我定的：搜索框里 ←→ 要留给光标，按行跳会有够不着的格子），回车打开；⌘1 / ⌘2 / ⌘3、⌘F 不变；分组折叠不变；「不显示」的照旧沉到最后一组、图标变淡、名字变灰。
- **手机**：格子里不左滑（改档去详情页），底下说明换成「类型不能删，不想看到就设成不显示；已经挂着的任务和项目照常显示。」（已有文案）。页头 ··· 钉在标题右边（类型页页头不折行），不被长副标题挤到下一行。
- 测试：`lib/category-view.test.ts` 1 项。截图 `work/d1111-typegrid/tg.mjs`（LightVela Chromium，三皮肤 × 宽屏 1366 亮 / 手机 390 暗：默认列表、菜单两项、切图标后每组都是格子、一行几个、名字在图标下且居中、不出格、最多两行、超长名字截断、不左右滚、role / 读屏名、刷新记住、搜索结果是格子 + ↓ + 回车打开、点格子开详情 / 选中高亮、⌘3 后沉到最后一组变淡再 ⌘2 改回、分组折叠、切回列表、··· 和标题同一行）。

### 侧栏资料库显示为列表 / 图标 ✅（2026-11-12）
Rei 2026-11-12 00:24：侧栏里放进来的资料库也要「列表 / 图标」两种显示，入口也用「···」，和项目置顶区一样。

- **存法**：本机设置 `pinnedLibraryStyle: 'list' | 'icons'`（`lib/settings.tsx`，默认 list，不同步），和 `pinnedGroupStyle` 各管各的。`lib/pinned-style.ts` 改成按串取：`pinnedGrid(settings, kind, narrow)`、`usePinnedStyle(kind)`（kind 是 `group` / `library`），旧的 `pinnedGroupGrid`、`usePinnedGroupStyle` 留着包一层。
- **入口**：`PinnedStyleMenu` 加 `kind`（默认 group），读屏名「项目显示方式」/「资料库显示方式」，菜单仍是 `DisplayStyleMenu`。App 里 `SidebarItems` / `MoreItems` 用 `anchorKindOf` 认出「项目」「资料库」那两行（`groups` / `library`，不是放进来的某一个），这一串有东西、又不是中等宽度图标栏时包成 `.nav-item-split` 放 ···。
- **网格**：`pinnedKindOf` 把连着的置顶项按串切开，每串各看各的设置：选了图标就包进 `.nav-pinned-grid`（「更多」页 `.more-item.more-pinned-grid`），`role="group"`，读屏「放进侧边栏的项目」/「放进侧边栏的资料库」。侧栏每格是 `PinnedLibraryLink compact`（36×36，图标 20，`aria-label` / `title` 是库名，右键 / 长按出「取消在侧边栏显示」，`MenuAt heading` 写库名）；960 图标栏还是 `PinnedLibraryLink` 不带 compact。「更多」页是新 `MoreLibraryTile`（44×44，图标 24，同项目的 `MoreTileOf`）。图标用资料库自己的 lucide 图标，不换成带底色的 `IconTile`（我定的：和它列表时的样子一致；侧栏多彩档照旧挂 `--vivid-color`，「更多」页列表行本来不上色，图标也不上色）。拖动排序沿用 `data-reorder-layout="grid"`，`NavReorderScope kind="library"` 本来就有。
- **文案**：新 2 条「资料库显示方式」「放进侧边栏的资料库」，9 种语言（7 种待母语者看）；「显示为」「列表」「图标」共用。
- **测试**：`lib/pinned-style.test.ts` 加 2 项（两串各看各的、没存过是列表）。截图脚本 `work/d1112-libside/ls.mjs`（LightVela Chromium，三皮肤 × 宽屏 1366 亮 + 960 + 手机 390 暗：没放时不出 ···、悬停才显示、默认列表、切图标后成网格、项目那串不跟着变、两串都图标各一块、36×36、折行、不左右滚、读屏名 / 悬停全名、拖动和 ⌥→、右键菜单顶上写库名、点开高亮、多彩档上色、刷新记住、960 不排网格不出 ··· 且右键照旧；手机「更多」页 ··· 常显、换图标、≥ 44、长按松开出菜单、点开）。

### 「+」属性菜单：项目挪进资料那组 ✅（2026-11-12）
Rei 2026-11-12 00:37「项目移到资料那一组」。
- `lib/prop-chips.ts`：`PROP_ORDER` 改成 日期、完成方式、重复、提醒、项目、资料、类型、心情、卡片颜色；`PROP_SECTION` 里项目从第 3 组改到第 2 组。第 2 组原来没有别的排序规则（就是 `PROP_ORDER` 的顺序），项目按要求放第一个。菜单现在是 日期、完成方式、重复、提醒 ｜ 项目、资料、类型 ｜ 心情、附件、卡片颜色。附件还是插在第 3 组心情后面（`addMenuItems` 没改）。
- 共用 `PROP_ORDER` 的地方一起变：详情胶囊行（日期、完成方式、重复、提醒、项目、类型、心情、卡片颜色），新建面板胶囊（`composerChipOrder`：日期、提醒、项目、资料、类型、心情、相关任务）。手机和电脑是同一个 `PropChips` 组件，一起变。没有别处另写这套顺序。
- 没有新文案、没有迁移，Worker 没改。测试 `lib/prop-chips.test.ts` 改顺序、加 3 项。

### 打卡页排列方式换成下拉，加「按心情」 ✅（2026-11-12）
Rei 2026-11-12 00:48：打卡页的按钮组换成下拉菜单，选项是按今天、按类型、按心情，当前项打勾。
- `pages/CheckIns.tsx`：去掉 `Segmented`，换成页内组件 `ArrangeMenu`：React Aria `MenuTrigger` + `Menu selectionMode="single" disallowEmptySelection`，项用通用的 `.menu-item.menu-check`（勾在右边），popover `bottom start`，和「显示哪些打卡」、`SectionMenu` 同一套，三皮肤靠通用 `.menu` 样式。触发器是 `.btn.btn-quiet.checkin-arrange-btn`：当前项名字 + Lucide `ChevronDown`，读屏名「排列方式：{name}」，展开时悬停底色。
- `arrange` 从 `'today' | 'category'` 扩成加 `'mood'`，仍是页面 state、不记。「按心情」以前打卡页没有，这次照「按类型」的列法补上：`MOOD_IDS` 顺序每种一节 +「没有心情」（`isMoodId` 判断），节内今天要打的在前，标题前 `.section-dot.mood-dot.mood-<id>`（同 `SectionedList` 的按心情分区）。
- 样式 `styles/app.css` `.checkin-toolbar .checkin-arrange-btn`（替掉原来的 `.checkin-toolbar > .segmented`）。
- 新文案 1 条「排列方式：{name}」，9 种语言（7 种待母语者看）；「按今天」「按类型」「按心情」「没有心情」「排列方式」共用。没有迁移，Worker 没改。
- 自查脚本 `work/d1112-ckdrop/cd.mjs`（LightVela Chromium，三皮肤 × 宽屏 1366 / 手机 390）。
- 待 Rei 确认：「按心情」用打卡任务本身的心情（任务详情里设的那个），不是每次打卡记的心情。

### 我的一天、项目页分区加「按类型」 ✅（2026-11-12）
Rei 2026-11-12 00:47：「我的一天」和项目页的分区里加「按类型」。

- **分组**（`lib/sections.ts` `sectionTasks(…, 'type', { categories, categoryIdsOf })`）：任务能挂好几个类型，只进一段，进第一个类型（`store.categoryIdsOfTask` 的第一个，就是任务上类型的顺序；和打卡页「按类型」排列一样不重复出现）。没挂类型的、或第一个类型不在传进来的列表里（理论上没有）的，放最后「没有类型」。空段不出现，段里的顺序是传进来的顺序。
- **段的先后**（`categorySectionOrder(store)`）：能显示的按 `store.pickerCategories()`（常用 → 最近用过 → 没用过的按大类，和类型选择器、类型页同一个规则）；设成不显示的照样成段，同样规则排在能显示的后面。没有「归档」这一档，类型只有常用 / 普通 / 不显示。
- **段标题**（`components/SectionedList.tsx`）：前面是类型的 `IconTile` 16px（和类型页、侧栏同一个图标块），「没有类型」是 lucide `Tag`；多彩档标题换成类型色文字（`--section-tint`），「没有类型」不上色。折叠按 `type:<类型 id>` 记。
- **照旧的**：分了区不能拖（我的一天走 `plainRows`，项目页本来分区就不能拖）；我的一天只分未完成的、置顶的在最上面不进分区，「已完成」段照旧；项目页只在列表视图有分区，「已结束」段照旧。分区方式记法不变：我的一天存本机 `listViews.myday.section`，项目页每个项目各记一份（`project-view`），都认 `type`。
- **菜单**：我的一天 不分区 / 按心情 / 按项目 / 按类型；项目页 不分区 / 按心情 / 按类型 / 按目标日期。
- **文案**：`trc('列表分区', '按类型')`、`trc('列表分区', '没有类型')` 2 条，9 种语言（英文 By Category / No Category，和 By Mood 一样大写；其余语言和已有的同字，俄语用单数「По категории」）。没加新中文说法。
- **测试**：`lib/sections.test.ts` 加 2 项（只进第一个类型、不显示的类型成段、没类型最后、不认识的类型算没类型；先后规则），`normalizeListView` / `normalizePrefs` 认 `type`。截图 `work/d1112-bytype/bt.mjs`（LightVela Chromium，三皮肤 × 宽屏 1366 亮 / 手机 390 暗：菜单有「按类型」、成段、「没有类型」在最后、段标题有图标块、一件任务只出现一次、没有拖动把手、不横向溢出、刷新记住、多彩档上色、项目页同样）。

### 日历：去掉页头、视图下拉去标签、天数周数加 − + ✅（2026-11-12）
Rei 2026-11-12 00:54，方案见 [CALENDAR.md](CALENDAR.md) 第十一节。
- `pages/Calendar.tsx`：去掉 `PageHeader`（原来只有图标和标题，没有按钮），换成 `<h1 className="sr-only">`；新 `CountStepper`（IconButton − / InlineNumber / IconButton +，到边界 `isDisabled`），多日、多周共用。
- `styles/calendar.css`：`.cal-view-select .field-label` 宽屏、手机都只给读屏；`.cal-step[data-disabled]` 变淡。
- `lib/mobile-topbar.ts`：`agenda` 进 `HEADERLESS_PAGES`，手机顶栏写「日历」。
- 新文案「少一天」「多一天」「少一周」「多一周」，9 种语言（外语待母语者看）。
- 测试：`pages/Calendar.test.tsx` 加 2 项，顺手给 store 假对象补了 `isLocked` / `get` / `updateTask`（拖动改日期以后 5 项一直报错）；`lib/mobile-topbar.test.ts` 改 1 处。截图 `work/d1112-calhdr/ch.mjs`（三皮肤 × 1366 / 390）。
- 没有迁移，Worker 没改。

### 项目列表页去掉页头、「新建项目」挪到筛选行 ✅（2026-11-12）
Rei 2026-11-12 00:56：项目列表页（侧栏「项目」进的总览页，不是单个项目页）去掉页头；「新建项目」做成图标按钮，放在类别行右侧，标签多时标签区横滑、按钮固定在右；手机没有类别行时也要有入口。
- 原来的页头只有图标 + 标题「项目」、副标题「把相关的任务放在一起」和右边的「新建项目」，除了这个按钮没有别的控件，没有要挪的。
- `pages/Groups.tsx`：去掉 `PageHeader`，加读屏用的 `<h1 className="sr-only">项目</h1>`（同打卡页）。筛选那行改成 `.filter-row.groups-toolbar`：左边 `.groups-filter`（占满剩下的宽度，里面是原来的 `ChipPicker`，胶囊多了自己横滑），右边 `Tip` + `.btn-icon-only.groups-new`（`flex: none`，不被挤）。这一行总是渲染：没有可筛的类型时左边空着，按钮照样靠右，所以电脑和手机在没项目、项目都没类型时也有新建入口。
- `lib/mobile-topbar.ts`：`HEADERLESS_PAGES` 加 `groups`，手机顶栏显示标题「项目」（只有标题，没有搜索）。
- 样式 `styles/project.css`：删掉 `.page-header:has(.groups-new)`，加 `.groups-toolbar` / `.groups-filter`。
- 副标题「把相关的任务放在一起」没人用了，留在词典里没删（同「不限时间」）。没有新文案、没迁移，Worker 没改。
- 测试：`lib/mobile-topbar.test.ts` 改成 groups 只有标题。截图脚本 `work/d1112-projhdr/ph.mjs`（LightVela Chromium，三皮肤 × 宽屏 1366 亮 / 手机 390，Apple 亮、WinUI / Material 暗）：没页头、读屏 h1、按钮和胶囊同一行居中且在最右、悬停提示、手机顶栏标题；胶囊复制多份后筛选区横滑、按钮不挪、页面不横向溢出；点按钮出「新建项目」面板；删光项目后只剩按钮、靠右、能新建。

### 日记：去掉页头、搜索按钮和顶部空白 ✅（2026-11-12）
Rei 2026-11-12 01:10「去掉页头和搜索」，并问顶部空白是不是给 titlebar 留的。来源和规则见 [JOURNAL.md](JOURNAL.md)「2026-11-12」一节。
- `pages/Journal.tsx`：宽屏删 `.jf-side-head`（`h1.page-title` + 搜索 `icon-btn`），手机删 `PageHeader`，两处都换成 `<h1 className="sr-only">日记</h1>`。`Search` 图标、`PageHeader` 不再引入。`mobileTopbar('journal')` 本来就是 `none`，不改。
- `styles/journal.css`：新变量 `--jf-top`（默认 `--space-3` 12px），`.jf-side`、`.jf-main-inner` 的上内边距用它；删 `.jf-side-head` 样式。
- `skin/skins.css`：`.platform-macos-overlay .app-desktop .journal-page.jf { padding-top: 0; --jf-top: var(--space-2) }`。以前通用的 `.page { padding-top: 8px }` 压过日记页的 `padding: 0`，右栏多 8px、分隔线也到不了顶。现在 10px 拖动条 + 8px = 18px，同其他页。
- 没加文案，没有迁移，Worker 没改。截图 `work/d1112-journalhdr/jh.mjs`（三皮肤 × 宽屏 1366 / 宽屏模拟 Mac 壳 / 手机 390，修前修后量离顶距离）。

### 日历：条目去掉圆圈、每件自己的底色、今天 / 选中日调浅 ✅（2026-11-12）
Rei 2026-11-12 01:15，规则见 [CALENDAR.md](CALENDAR.md) 第十二节。
- 新 `lib/cal-item-color.ts`：`calItemHex`（项目 → 类型 → 默认蓝，素净档灰）、`calItemColors`（倒数日卡片色优先；其余走 `chipColors` 混成实色 + 黑白字）。
- `pages/Calendar.tsx` 的 `ItemButton`：去掉 `.cal-item-dot`，挂 `--item-bg` / `--item-fg` / `--item-border`。
- `styles/calendar.css`：任务实色底，倒数日描边 + 粗字，选中改 2px 强调色外圈；今天列改成强调色 5% / 8% 的伪元素；手机选中日浅强调底；全天事件底色和倒数日去掉 color-mix。
- 测试：`lib/cal-item-color.test.ts` 3 项，`pages/Calendar.test.tsx` 加 1 项。没有迁移，Worker 没改，没有新文案。

### 手机搜索改成单独一页，顶栏去掉搜索按钮 ✅（2026-11-12）
Rei 2026-11-12 01:21：手机端任何页面都不显示搜索按钮，搜索改成单独的一页，入口放底部导航或「更多」里。
- **入口**：「更多」页最上面单独一组一行「搜索」（Lucide `Search`，`App.tsx` 的 `SEARCH` 导航项）。没加进底部标签栏：标签栏是 Rei 2026-11-10 定好的「我的一天 · 等待安排 · 打卡 · 日记 · 更多」，不能自定义，加第五项要改他定的结构；「更多」页本来就是其余入口的地方，最上面一行一眼就看到。在搜索页时标签栏「更多」亮着。
- **路由**：`lib/router.ts` 加 `{ page: 'search' }`，`#/search`。关键词写在 hash 的 `?q=` 上（`searchQueryInHash` / `hashWithSearchQuery`），打字时 `history.replaceState` 改当前这条，不攒记录、不触发 hashchange；`?task=` 照常叠在后面（`#/search?q=跑步&task=…`）。手机点任务是 `pushState` 进详情，返回 popstate 回到 `#/search?q=…`，页面没卸载；点资料、人物、项目、日记是 `navigate` 换页，返回时搜索页重新挂载，从 `?q=` 读回关键词。带着关键词进来不自动聚焦（返回时不弹键盘挡结果），空的才聚焦。
- **页面**：`pages/Search.tsx`，`StickyHead` 固定搜索框（React Aria `SearchField`，清除按钮读屏「清除」，`enterKeyHint="search"`，回车只 blur 收键盘；组字中的回车由 `useImeQuery` 处理，同浮层），读屏 `h1`「搜索」。结果列表复用浮层的 `.palette-*` 行样式，样式 `styles/app.css` `.search-page-*`（输入框 16px，iOS 聚焦不放大）。
- **同一套结果**：浮层里的取数和每一行抽到 `components/SearchResults.tsx`：`useSearchHits`（core `search()`，上限 20）、`useRecentTasks`、`openSearchHit`、`SearchTaskRow`、`SearchHitRow`；`CommandPalette` 改用它们，行为不变（↑↓、回车、命令行、Esc 都没动）。搜索页不放「写日记」「从滴答清单导入…」两条命令。
- **顶栏**：`lib/mobile-topbar.ts` 去掉 `search` 一档，我的一天和其他没页头的页一样只放标题；搜索页有自己的搜索框，`none`（不要顶栏这一行）。测试改了。
- **文案**：全用已有词条（「搜索」「搜索任务、资料库、人物、项目」「…」「清除」「最近的任务」「新建「{trim}」并加入我的一天」「没有找到「{trim}」」等），没有新词，9 种语言本来就有。
- **电脑**：⌘F / Ctrl+F 浮层、侧栏顶上的搜索按钮不变；宽屏打开 `#/search` 也渲染这一页（中间列，没有右列常驻）。
- 没有迁移，Worker 没改。自查脚本 `work/d1112-msearch/`（LightVela Chromium，三皮肤 × 手机 390 亮 / 暗 + 宽屏 1366）。


### 倒数日页去掉页头，加视图 / 排序 / 分区下拉 ✅（2026-11-12）
Rei 2026-11-12 01:09：倒数日页去掉页头，页头里有用的控件挪到下面；左上角三个下拉：视图（列表 / 卡片）、排序（到期日期 / 添加日期 + 升序 / 倒序，同一个菜单两组各自打勾）、分区（不分区 / 按类型 / 按目标日期 / 按心情，规则同我的一天、项目页）；默认卡片、到期日期升序、不分区（就是原来的样子）；三项本机记住，不同步；已过期、已完成的现有规则不变。

- **页头去向**：`PageHeader`（「倒数日」标题 + 沙漏图标 + 新建按钮）去掉。新建（加号图标按钮，悬停 / 读屏「新建倒数日」）挪到工具栏右边，和打卡页同一个位置；标题只留读屏用的 `h1.sr-only`；手机顶栏写「倒数日」（`lib/mobile-topbar.ts` 的 `HEADERLESS_PAGES` 加 `countdown`，同打卡页）。类型筛选胶囊照旧在工具栏下面一行。原来那行右边的「排列方式：按日期 / 按类型」按钮组去掉，并进分区（不分区 = 按日期，按类型 = 按类型）。
- **工具栏**（`pages/Countdowns.tsx`，`.filter-row.checkin-toolbar.countdown-toolbar`）：左边 `.countdown-menus` 三个下拉，触发器和打卡页排列方式下拉同一个样子（`.btn.btn-quiet.checkin-arrange-btn`：当前那项 + `ChevronDown`，菜单是通用 `.menu` + `.menu-item.menu-check`，勾在右边，popover `bottom start`）；装不下就折行（外语、手机），加号钉在右上。还没有倒数日时左边空着。排序按钮在名字后面多一个小图标（`ArrowUpNarrowWide` 正序 / `ArrowDownWideNarrow` 倒序），读屏名「排序：到期日期，正序」。
- **视图**：卡片 = 原来的 `CountdownCard`；列表 = `CountdownRow`，外层是 `.task-list.plain` 里的 `.task-row`（行高、内边距、悬停、选中、分隔线同任务列表），里面整块是按钮：行首卡片颜色小圆点（`--cd-dot` = `cardColorStyle(color, theme).bg`；没设颜色、素净档不画、留同宽空位让标题对齐）、类型小图标（同卡片）、标题（单行省略），右边「还有 N 天 / 今天 / 已过 N 天」（数字强调色加粗）。点行开详情，右键 / 长按同卡片的菜单（查看详情 ｜ 颜色…）。列表行不放 ··· 按钮（任务行也没有）。
- **排序**（`lib/countdown-view.ts` `sortCountdowns`）：到期日期 = target_date（就是还有几天），添加日期 = created_at，正序 / 倒序。已过的规则不变：不论按什么排，过了的都在还没到的后面、刚过的在前，排序只管今天和还没到的。所以默认「到期日期正序」= 原来的顺序。值一样保持原顺序。
- **分区**（`sectionCountdowns`）：直接用 `lib/sections.ts` 的 `sectionTasks`（section-by-type 合进 main 的实现）。按类型：只进第一个类型，段的先后 `categorySectionOrder`，没类型的放最后；按目标日期：已过期 / 今天 / 本周 / 本月 / 更远，倒数日看 target_date（`sectionTasks` 本来看 scheduled_date / end_date，这里拿 target_date 换进去再分，段里放回原任务）；按心情：好到坏，没记的最后。段标题能折叠（`SectionedList`），收起了哪几段也记在本机。段里的顺序是排好的顺序。按类型分区时卡片上不再写类型（段标题就是），同原来的「按类型」排列。
- **记法**：本机设置 `listViews.countdown = { view, sort, dir, section, collapsed }`（`useCountdownPrefs`，认不出的值回默认），不同步。类型筛选照旧不记。
- **不变**：只列没关闭、有目标日期、不在归档项目里的倒数日；完成了的（到那天自动标完成）照旧列着；卡片样子、卡片颜色、菜单都没改。
- **文案**：新 3 条「卡片」「到期日期」「添加日期」9 种语言（7 种待母语者看）；「列表」「视图」「视图：{name}」「排序」「排序依据」「顺序」「正序」「倒序」「排序：{name}，{dir}」「分区」「分区：{name}」和分区名都是已有的。Rei 说的「升序」界面上用已有的「正序」（项目页排序同一个词，我定的）。
- **测试**：`lib/countdown-view.test.ts` 10 项（默认值和认值、四种排序、过了的总在后、稳定、三种分区和 target_date）；`mobile-topbar.test.ts` 改一项。截图 `work/d1112-countdown/cdv.mjs`（LightVela Chromium，三皮肤 × 宽屏 1366 亮 / 手机 390（Apple 亮、WinUI / Material 暗）× 卡片 / 列表）。
- **待 Rei 确认**：① 「升序」用了已有的「正序」；② 排序只排还没到的，过了的总在后面、刚过的在前；③ 「排列方式：按日期 / 按类型」去掉、并进分区；④ 列表行不放 ··· 按钮，没设颜色的行首留空位不画点。
### 类型页：「大类」改叫「分组」、能新建分组、显示方式换成下拉 ✅（2026-11-12）
Rei 2026-11-12 01:22 三条：显示方式（列表 / 图标）改成下拉，样子同打卡页「排列方式」；「大类」更名为「分组」；类型编辑器里选分组改成可搜索的下拉，搜不到时最后一项「新建分组“xxx”」。

- **显示方式下拉**（`components/ViewStyleDropdown.tsx`）：页头右边原来的 ···（`DisplayStyleMenu`）换成下拉。按钮写当前那项 + 向下箭头，读屏名「显示为：{name}」；菜单两项「列表」「图标」，当前项打勾，没有小标题。样式 `.btn.view-dropdown-btn` 照抄 `.checkin-arrange-btn`（安静按钮、粗字、10 / 8px 内边距、展开时悬停底色）；截图逐项比过和打卡页那颗按钮的字重、字号、内边距、颜色、高度、图标一样。本机设置 `categoryViewStyle` 没动。侧栏项目 / 资料库的 ··· 菜单还是 `DisplayStyleMenu`，没跟着改。
- **改名**：界面上的「大类」都改叫「分组」：详情字段名（词典 key `大类` → `分组`，九种语言译文本来就是 Group 一类，没改）、分组名的语境 `类型大类` → `类型分组`。代码、偏好名里还叫 group（`category.groups`、`CategoryGroup`）。注意「分组」和项目以前的叫法（COPY 里「项目」一行的「不用」列）重名，但两处界面位置不同、项目那边早不用这个词了。
- **选分组的下拉**（`components/CategoryGroupCombo.tsx`，React Aria `ComboBox`）：框里写当前分组；点框或右边箭头列全部分组（内置前五组 → 自己建的 → 其他），当前项打勾。打字就过滤：名字包含、拼音首字母、全拼（core `filterGroupOptions`，规则同类型搜索 `categoryMatches`；切了界面语言，内置组的中文名也能搜）。没有同名分组（不分大小写、全半角）时最后一项「新建分组“xxx”」（`groupCreateName`），选它就 `store.createCategoryGroup` 再放进去，提示「已把「X」放进「xxx」」带撤销（撤销只把类型挪回去，新建的组留着，空组不在列表里显示）。「新建」出现的规则和类型搜索一样：只要没有同名的就出，搜到别的也照样跟在最后（我定的，和类型页搜索框一致）。键盘 ↑↓ 回车能选；打了字不选、点开别处，框里回到当前分组名。
- **自建分组怎么存**（core `category-prefs.ts`）：原来的大类是固定枚举（`CATEGORY_GROUPS` 六个 id），改到内置组的存同步偏好 `category.groups`（`"<类型 id>=<组>"`），读的时候不认识的组直接丢。新建的分组这样存，**没加表、没加列、不用迁移**：
  - 每个自建组一行偏好 `category.custom_group.<组 id>`，值是名字；组 id 是 `cg-` + UUIDv7，按 id 排就是建的先后。一组一行，两台设备同时新建分组不会互相覆盖（偏好按行 LWW）。
  - 类型放进自建组记在另一行偏好 `category.custom_group_of`（`"<类型 id>=<组 id>"` 列表），优先于 `category.groups`；放回内置组时删掉这一项、写 `category.groups`。只认还在的自建组，组的偏好行被删了类型就回原来的组。
  - 不往 `category.groups` 里写自建组：旧客户端（已装的 App）读它时丢掉不认识的组，改组时又会整列重写，自建组的记录会被冲掉。分开存以后，旧客户端只会把这些类型显示在它原来的内置组里，数据不丢。
  - 内置分组照旧（还是那六个 id、默认组还在 seed）。选择器（`CategoryPicker`）分组、选择器顺序里「没用过的按组排」都认自建组（排在「其他」前）。
- **没做的**：自建分组不能改名、删除、排顺序（没要求）；空的自建组不在类型页显示，但下拉里还列着。两台设备同时把同一个类型换到不同分组，后写的赢（和以前一样）。旧客户端上把类型换到内置组，新客户端仍按自建组显示（自建组的记录优先）。
- 测试：core `category-groups.test.ts` 15 项（过滤、拼音、新建同名判断、偏好行解析、顺序、Store 新建 / 放进 / 换回 / 删组后回退）；client `CategoryGroupCombo.test.ts` 5 项（列全部、过滤、最后一项新建、同名不出、换了语言也认中文名）。截图 `work/d1112-typegroup/tgr.mjs`（LightVela Chromium，三皮肤 × 宽屏 1366 亮 / 手机 390 暗）。
- **追加：手机上我的一天、等待安排、过期积压不放页头**（Rei 2026-11-12 01:56「安卓端「我的一天」「等待安排」「过期积压」三页不显示顶部的页头」）：
  - 理解：去掉页面里的大标题页头，顶栏留一行只写页名（同日历、项目列表、打卡）；不是整条顶栏都去掉。顶栏一去，手机上就没有地方写页名、也放不下排序 / 分区按钮，而且安卓状态栏那截 inset 还得留，所以按「页内去掉、顶栏只留标题」做，待 Rei 确认。
  - 我的一天（`pages/MyDay.tsx`）：手机布局不画 `.myday-head`（大号日期 + 农历 + 排序 / 分区），换成读屏 `h1`「我的一天 · 11月12日 周四」；`DaySortMenu`、`SectionMenu` 用 `lib/topbar-slot.tsx` 的 `TopbarActions`（`createPortal` 到 App 顶栏的 `#topbar-actions`）放到顶栏右边，状态还在页面里。按钮 36px，样式 `styles/app.css` `.topbar-actions`、`.topbar .list-tools`。宽屏照旧。
  - 等待安排、过期积压：页面里本来就没有可见页头（2026-10-26 去掉的，只有读屏 `h1` 和件数小字），顶栏只有标题，这次没改代码。
  - 手机上不再显示今天的日期和农历；要的话可以放回顶栏标题旁边做小字，待 Rei 定。
- **再追加：过期积压页去掉添加框**（Rei 2026-11-12 02:03，电脑和手机都去掉；规则是过期积压不应有新的 / 未来的任务）：`pages/Doable.tsx` 不再用 `QuickAddBar`，读屏 `h1` 和「N 件已过期」小字放进 `StickyHead`（页加 `has-sticky-head`，`.doable-head .list-meta` 去掉原来贴添加框的负边距），照旧固定在顶上。快捷键 N 在这页本来就不是聚焦添加框，而是开新建面板（`App.tsx` `newTaskDefaults` 对 doable 给空默认值），建出来没日期、进等待安排，不会进这页，所以保留不改。占位「现在想做什么？按回车添加到等待安排」没地方用了，九种语言词典里删掉；「添加任务到等待安排」等待安排页还在用。其他页的添加框不动。
- **再追加：过期积压顶上不写件数**（Rei 2026-11-12 10:20「过期积压页：顶部不显示"125件已过期"这种统计信息」，电脑和手机都去掉）：`pages/Doable.tsx` 去掉「N 件已过期」小字；那一行里没有按钮，整块 `StickyHead` 也不要了（页不加 `has-sticky-head`，删 `.doable-head .list-meta`），只留读屏 `h1`，最上面直接是第一段（昨天 / 过去 7 天…）。词条「{n} 件已过期」九种语言删掉；「没有过期的任务」照旧。


### Apple 皮肤新建加号、资料库页去掉页头 ✅（2026-11-12）
Rei 2026-11-12 01:31：「新建倒数日」「新建打卡」「资料库中的添加按钮」在 Apple 皮肤里很不像 Apple 按钮，三处统一，和项目列表页的「＋」一致；01:41：资料库页去掉页头，新建换成图标按钮放在库标签行右边（照项目列表页），「编辑」挪进「…」菜单。

- **共用按钮**（`ui/primitives.tsx` `NewButton`）：Lucide 加号 + `Tip` 悬停提示 + 读屏名，类名 `btn btn-primary btn-icon-only btn-new`。新建打卡、新建倒数日、新建项目、资料库添加四处都换成它（项目列表页原来也是同一个填充方块，一起改，四处才一样）。
- **Apple 样子**（`skin/skins.css` `[data-skin='apple'] .btn.btn-icon-only.btn-new`）：照提醒事项 / Things 3 工具栏、iOS 导航栏：透明底、无边框、强调色加号，图标 20px、笔画 2.25；悬停 `rgba(0,0,0,.06)`、按下 `.11`（暗色 `rgba(255,255,255,.09 / .15)`）圆角 7px；手机 36×36、图标 24px，按下不垫底、加号 opacity .35。不用 color-mix。WinUI、Material 没写这条规则，还是 `.btn-primary.btn-icon-only` 填充方块。
- **资料库页**（`pages/Library.tsx`）：去掉 `PageHeader`（图标 + 标题 + 宽屏副标题 + 宽屏「＋ 添加」），换成 `h1.sr-only`；`.lib-tabs-row` 右端 `OverflowMenu`（编辑资料库 ｜ 在侧边栏显示，归档库只有第一项）+ `NewButton`（`.lib-tabs-add`，读屏「添加到{name}」，宽屏手机同）；搜索行里手机的 `.lib-add-mobile` 和标签行的「编辑」按钮去掉。`types.css` 里标签条 `flex: 1 1 auto`，右边两个按钮 `flex: none`。`HEADERLESS_PAGES` 加 `library`、`people`（人物库也走这页），手机顶栏写「资料库」。
- **文案**：没有新词条（「编辑资料库」「资料库操作」「添加到{name}」都是已有的）。
- **测试**：`lib/mobile-topbar.test.ts` 改了；tsc、nav / i18n / locales 测试过。自查脚本 `work/d1112-applebtn/ab.mjs`（LightVela Chromium，三皮肤 × 宽屏 1366 / 手机 390），截图 `work/shots-d1112-applebtn/before`、`after`。
- **待 Rei 确认**：① 项目列表页的加号也跟着变成 Apple 无边框样子（四处同一个按钮）；② 资料库「…」放在加号左边，菜单里写「编辑资料库」（沿用原按钮的读屏名）；③ WinUI、Material 的资料库添加从「＋ 添加」文字按钮变成填充加号方块（页头去掉了，跟着项目列表页做）。

### 类型页去掉页头、「显示为」下拉挪到搜索框右边 ✅（2026-11-12）
Rei 2026-11-12 02:14：类型页去掉页头；「显示为」下拉（列表 / 图标）放到搜索框右边，同一行。照项目列表、倒数日、日历的做法：读屏留 h1，手机顶栏只留标题。

- 原来的页头是图标 + 标题「类型」+ 副标题（「N 个，用到 U 个……共用」）+ 右边「列表 ⌄」下拉。除了这个下拉没有别的控件，新建类型本来就在搜索框里（打名字，最后一行「新建“xxx”」），没有要挪的。
- `pages/Categories.tsx`：去掉 `PageHeader`，换成 `<h1 className="sr-only">类型</h1>`。`ViewStyleDropdown` 通过 `CategoryList` 新加的 `searchAside` 放进搜索框那行。手机点开一个类型的详情页不变（顶上「全部类型」返回条）。
- `components/CategoryEditor.tsx`：`CategoryList` 加 `searchAside`；给了就包一层 `.cat-list-search-row`（flex，搜索框占满剩下的宽度，下拉 `flex: none`）；没给的地方（选择器等）照旧。
- `lib/mobile-topbar.ts`：`HEADERLESS_PAGES` 加 `types`，手机顶栏写「类型」，只有标题。手机详情页顶栏也是「类型」，下面照旧是「全部类型」返回条。
- 样式 `styles/app.css`：删掉 `.types-page > .page-header` 那几条，加 `.cat-list-search-row`。宽屏、手机同一个布局，不用 color-mix。
- 副标题两条词条（「{n} 个，用到 {u} 个……」）没人用了，九种语言一起删掉。没有新文案、没迁移，Worker 没改。
- 测试：`lib/mobile-topbar.test.ts` 加 types；tsc（client、core）、类型页相关单测过。自查脚本 `work/d1112-typehdr/thd.mjs`（LightVela Chromium，三皮肤 × 宽屏 1366 / 手机 390）：没页头、读屏 h1 看不见、副标题不显示、手机顶栏只有标题；下拉和搜索框垂直居中对齐、在搜索框右边、在列表卡片里，搜索框宽度够用；菜单两项打勾、切图标再切回；打字后下拉不挪、页面不横向溢出；点开详情正常。截图 `work/shots-d1112-typehdr/`。

### 看板卡顿、详情浮层卡顿 ✅（2026-11-12）
Rei 2026-11-12 01:26：项目页切到看板很卡，看板里点任务弹详情浮层也很卡。在 240 件的项目（资料海报、心情、类型胶囊）上量，脚本 `work/d1112-kanbanperf/`（`perf-seed.test.ts` 造数据、`kbperf.mjs` 计时、`kbprof.mjs` 抓 trace、`kbshots.mjs` 截图）。
- **点卡片 / 关浮层卡**：根因是每一行都订阅了整个 UI 状态（`useUi()`），看板的 `GridList` 的 `dependencies` 里又有 `ui.editingId`，App 也不 memo 页面——选中一件任务，四列几百张卡片、整页全部重渲染。再加上 `GridListItem` 每次重渲染都给新的按钮 / 勾选框槽位对象，行里的按钮跟着重来。
  - `lib/ui.tsx` 加 `useUiStable()`（对象不变、字段读最新值）和 `useIsEditing(id)`（只在这件选中 / 取消时重渲染）。`TaskRow`、打卡控件、补打卡、`QuickAddBar`、`ProjectActions`、项目页用前者；行的选中样子用后者。要跟着 UI 状态变的地方照旧 `useUi()`。
  - `App.tsx` 的页面本体 `Page` 用 `memo`（route 只在换页时换对象）。
  - `ProjectBoard`：卡片抽成 `memo` 的 `BoardCard`，选中看 `useIsEditing`；`dependencies` 只留 `store.version`；行外面包一层不变的 `ButtonContext` / `CheckboxContext`（默认槽本来就是空的），拖动把手在外面照常吃 `drag` 槽。
- **切到看板卡**：一次挂四列 240 张卡片。现在每列先出 20 张，看板画出来以后每列用一个任务把剩下的一次补齐（列和列错开 40ms）。列头数字一直是全部件数。试过「滚到列底附近再分批补」：每批都要重建那一列的集合，深滚时一卡几百毫秒，放弃。
- 设备时区记一秒（core `deviceTimeZone`、`date-display` 里的 `deviceZone`）：以前每行都 new 一个 `Intl.DateTimeFormat`。
- 详情浮层高度跟着内容走（Rei 2026-11-12 02:08）：见 PRODUCT 项目页「看板 / 日历的详情浮层」。`.modal-detail` 改成 `height: auto`、`max-height: min(86vh, 900px)`，正文区 `flex: 0 1 auto`；`DetailModal` 的 `useSmoothRecenter` 用 ResizeObserver 看外框高度，一变就让外框从原位置平移到新的居中位置（FLIP 160ms），高度本身当帧到位（做高度动画的话正文会短暂比内容矮，闪滚动条、光标被拉着滚）。入场动画期间、「减少动态效果」时不平移。手机布局的详情是整页，不走浮层，不变。
- 测试：`ProjectBoard.test.tsx` 选中改成订阅、加分批一项；`Calendar.test.tsx` 的 ui 假对象补上新导出。没有迁移，Worker 没改，没有新文案。

### 重复的倒数日 ✅（2026-11-12）
Rei 2026-11-12 03:21：「倒数日如果是重复任务，过了日期就生成一个过期任务，作为这个重复任务的前置任务」。以前倒数日设了重复也只看 target_date，过了只显示「已过 N 天」。规则见 PRODUCT「重复的倒数日」。
- core `countdown-repeat.ts`：`planCountdownRoll`（过去的几次 + 下一次）、`normalizeCountdownRepeat`（改目标日 / 规则时一起收拾，`Store.createTask` / `updateTask` 调）、`countdownRecordId` / `countdownRecordDepId`（FNV 算的确定 id，和 taskLinkId 同一种写法）。`Store.rollRecurringCountdowns()` 写记录（`createTask` + 类型 + 前后关系，已有这一行——含墓碑——就不写）并把 target_date 换成下一次，整批一次提交；客户端 `lib/countdown-roll.ts` 挂在 App 上，打开、换天、数据变了（含同步拉下来）都看一遍，没东西要滚时不写。
- 记录的状态定成「完成」：不然重复倒数日会一直「还在等 N 件事」（前置没完成就被阻塞）。代价是记录会进已完成页那天。2026-11-13 改成待办，见下面「错过的倒数日不自动完成」。
- 打卡判断换成 `habitRule` / `isHabit`（checkin.ts）：倒数日的重复不算打卡。周期键、今天要打卡、连续次数、活动图、我的一天「昨天没做完」、提醒、打卡页、详情底栏 / 进度、行首重复图标、补打卡、「…」菜单都改用它；日历让重复的倒数日照常画在目标日。
- 加了公历「每年」规则（`FREQ=YEARLY;BYMONTH;BYMONTHDAY`，2 月 29 日平年取 28 日）：生日、纪念日要用。界面上只给倒数日（日子跟着目标日，不用另选月日）；core 的打卡逻辑也认它。老客户端不认没有 RSCALE 的 YEARLY，当不重复。
- 没有迁移（不加列），Worker 没改。新文案 3 条（只这一次 / 循环倒数 / 说明），九种语言，外语待母语者看。
- 待 Rei 确认：记录用「完成」而不是「待办」；严格模式下不生成记录但照样换目标日；归档项目里的不滚（取消归档后补上）；选过去的日子直接跳到下一次、不补记录；一次最多补 400 条；公历每年只给倒数日。

### 倒数日只有日期、没有目标日：不见了（修好 2026-11-12）
Rei 2026-11-12 07:57：「我新建了一个前天的倒数日，添加了每年重复，这个倒数日不见了」。复现：日历前天那格「+」（或 alpha.25 里日历「+」弹的新建面板）建任务 → 完成方式改倒数日 → 加「循环倒数」。日期在 `scheduled_date`、`target_date` 空着；倒数日页、日历只看 `target_date`，都不列；加重复时没有目标日，默认规则按今天（每年11月12日），日期胶囊因为有重复也藏了。倒数日页「新建」先选日子 / 先选重复都没问题（目标日照规则跳到 2027-11-10）。
- core `fillCountdownTarget`：倒数日没有目标日、有日期，就把日期挪成目标日（日期段取开始那天），`scheduled_date` / `end_date` 清空；`Store.createTask` / `updateTask` 在 `normalizeCountdownRepeat` 前调，所以规则跟着落到那天、过去的日子跳到下一次。
- `Store.repairCountdownDates()`（`rollRecurringCountdowns` 开头调：打开、换天、数据变了）：修已经不见的那种行（没删、没完成 / 关闭的倒数日，`target_date` 空、`scheduled_date` 有），走 `updateTask`，不补记录，别的行不碰；草稿任务不碰。老客户端（alpha.25 及以前）还会产生这种行，新网页打开时修；App 要下个 alpha。
- 测试 core `countdown-past-date.test.ts`：新建过去日子 + 每年 / 每年农历 / 每月 / 每周 / 每隔几天，四条路径（一起给、先日子后重复、先重复后日子、日历「+」改倒数日），加草稿、新建面板、修旧数据。

### 置顶改成标题加粗；完成、关闭不划线 ✅（2026-11-12）
Rei 2026-11-12「已完成和已关闭的任务不要删除线」；05:00「置顶的任务在任务列表中不显示前面的 pin icon，而是用粗体显示任务标题」。

- **不划线**：`.is-done .row-title`、详情前后关系 `.dep-item.is-done .dep-title`、任务链卡片 `.chain-card.is-done / .is-closed .chain-card-title` 去掉 `line-through`，灰色（`--text-3`）照旧。Material 选中的行原来把标题改成强调色字，完成 / 关闭的选中时现在也保持灰色（`skin/skins.css`），不然不划线以后选中时看不出已经结束。日历格子、时间轴横条本来就没划线。没动的：正文清单勾上的项（`editor.css`，那是正文格式）、@ 提到的任务找不到时的胶囊（`.task-mention.is-missing`，不是完成态）。
- **置顶加粗**：`RowLead` 不再放图钉——能拖的那格是普通把手（aria-label「已置顶 · 拖动排序」），不能拖的是同宽占位；没把手的列表行左边留白里的图钉（`.row-pin-gutter`）删了，`TaskRow` 的 `pinInLead` 参数、`LEAD_PIN_SIZE` 一起删。`TaskRow` 和倒数日页的行给标题加 `.is-pinned`（`font-weight: 700`），后面跟一个读屏用的「已置顶」。做完 / 关闭的置顶不加粗（回到 500）。挂了收藏 / 紧急 / 重要的：加粗和颜色叠在一起。
- **素净档**：收藏 / 紧急 / 重要原来是加粗，和置顶撞了，改成标题下面一道 `--text-2` 灰线（1.5px、离字 3px、不避让字形）：紧急实线、重要虚线、收藏点线。做完 / 关闭的不画线。这条是我定的，待 Rei 确认。
- **没改的**：侧栏置顶项目 / 资料库的图钉、各菜单里「置顶 / 取消置顶」的图标。
- **测试**：`components/RowLead.test.tsx` 改成 4 项（置顶没有图钉）。UI 自查 `work/d1112-nostrike/ns.mjs`，截图 `work/shots-d1112-nostrike/`。

### 项目列表卡片统一 ✅（2026-11-12）
Rei 2026-11-12 07:51：「这个项目列表看上去好难看，不协调，优化一下」（Apple 皮肤宽屏三列截图）。原来的毛病：同一行被拉成一样高，只有卡住的项目有第二行，旁边的卡片下半截空着，没第二行的几行又矮，高矮不齐；名字后面的类型小标签各用各的颜色，和图标块的颜色打架；描边加阴影偏重。
- **结构**（`pages/Groups.tsx` 的 `GroupCard`）：第一行图标块 26 + 名字（15px、600，一行，长了省略，右边给 ··· 留位置）；第二行一直在，和名字左对齐，12px 灰字（`--text-2`）：「N 件待办」（没结束的任务数），卡住的跟「 · N 件还不能开始」（橙色 `--state-blocked`，素净档本来就是灰）；没任务「没有任务」，都结束了「都做完了」。类型（`CategoryLabel plain`）放在第二行右边，灰色单色，最多占 45%，长了省略。
- **尺寸**：两行高度写死（26 + 6 + 16 = 48），加上下内边距 12 是 72，Apple、WinUI 加 1px 细边是 74，Material 没边是 72，左右内边距 14，网格间距 8 → 12，列最窄 240 → 280（900 宽排两列）；第二行放不下时先把类型缩成只剩图标，再省略「N 件待办」，「还不能开始」最后省略；圆角照各皮肤 `.card`（Apple 14、WinUI 8、Material 12）。
- **边框**：去掉阴影，Apple、WinUI 只留 1px 细边，Material 照旧填充无边；悬停换 `--surface-2`，按下再深一点。
- 手机、中屏一样的卡片（手机一列）。起止时间段照旧不显示；不写完成比例。
- 文案：新增「{n} 件待办」「都做完了」两条，九种语言（外语待母语者看）；「没有任务」「{blocked} 件还不能开始」沿用。
- 待 Rei 确认：第二行写「N 件待办」算不算 2026-11-04 说的「进度不显示」（我理解进度是完成比例，剩几件不算）；类型挪到第二行右边、变灰。


### 手机顶栏不写页名，我的一天顶栏放今天的日期 ✅（2026-11-12）
Rei 2026-11-12 09:39（安卓 Material 截图）：「顶部"我的一天"换成今天的日期（和PC端保持一致），下方和输入框之间留白太多，保持输入框上下留白均衡」；09:41：「为什么手机端的每一页的顶部都有header，没有删除。例如打卡页，顶部还会显示"打卡"这两个字，页面都不用header，优化一下」。

- **顶栏**（`App.tsx` `MobileTopbarRow`，`lib/mobile-topbar.ts` 档名 `title` 改 `bar`）：不再画 `.topbar-title`，只剩左格 `#topbar-lead` 和右格 `#topbar-actions`，页面用 `lib/topbar-slot.tsx` 的 `TopbarLead` / `TopbarActions`（portal）填。MutationObserver 看两格：两格都空加 `is-empty`，高度只剩 `env(safe-area-inset-top)`（同 `.topbar-inset`，网页版 0），不留空行；只有右格加 `no-lead`，44px（Material 48px）一行。读屏页名放顶栏里的 `sr-only`。状态栏留白、返回手势没动。
- **我的一天**：日期 + 农历抽成 `components/MyDayTitle.tsx`（`formatDateZh` 跟界面语言 + `LunarLine`），宽屏 `.myday-head` 和手机顶栏左格用同一个；手机里 17px / 600，农历 13px 跟在后面，放不下省略。上下留白：以下面为准（添加框下沿到「未完成」字上沿 26.6px，三皮肤一样），上面从顶栏日期字下沿量，原来 Apple / WinUI 28.3、Material 36.3（顶栏 64），添加框那块是 sticky，负外边距会被卡在滚动区顶上（只把下面列表拉上去），所以改内边距：`.myday-page` 上内边距 8 → 0，`.add-bar-sticky` 上内边距 8 → 15（Apple / WinUI）/ 7（Material）。
- **已完成**：`PageHeader`（非 compact）在手机上只出读屏 h1，`actions` 送顶栏右格；`Done.tsx` 手机不再包 `StickyHead`（顶栏本来固定）。设置首页也走这条（没有按钮，顶栏收起）。
- **更多**：页头换成 `h1.sr-only`。**设置分区页**：只留「‹ 设置」返回，大标题 `.settings-push-title` 换成 `h1.sr-only`（样式删了）。
- **没动**：项目 / 人物 / 资料详情页（标题是这一条的名字，项目还能点名字改名、点图标换图标）、日记、搜索页（本来就没有顶栏）；宽屏全部不变。
- **测试**：`lib/mobile-topbar.test.ts` 改成 bar / none；`lib/hide-scrollbar.test.ts` 已完成那条改成宽屏 `<StickyHead>{header}</StickyHead>`。自查 `work/myday-head/survey.mjs`（三皮肤 × 亮暗 × 390，每页量顶栏、页头、添加框、字形间距并截顶部 300px），截图 `work/shots-d1112-mydayhead/before`、`after`。

### 已完成页去掉页头和分区按钮，固定按日期分段 ✅（2026-11-12）
Rei 2026-11-12 10:19：「已完成页：去掉header，也去掉分区按钮切换功能，默认按照日期分区，不能修改。」

- **页面**（`pages/Done.tsx`）：去掉 `PageHeader`（标题、图标）和包它的 `StickyHead`，只留 `h1.sr-only`；手机上原来 `PageHeader` 送到顶栏右格的分区按钮也没了，顶栏两格都空，收成状态栏那一截。页面不再加 `has-sticky-head`，改 `done-page`；第一段日期标题：`.done-page > .sr-only:first-child + .section` 宽屏上外边距 0、手机 12px（页面上内边距宽屏 20、手机 8，凑成 20），顶部到标题字上沿 26.6px，和我的一天添加框到「未完成」、打卡页工具行到「今天要打卡」（210cf96）一样。
- **分区**：`SectionMenu`、`useListView('done')` 不用了，固定按天分段。`lib/list-views` 删掉 `DateSection` / `DATE_SECTIONS`，`ListPage` 去掉 `done`，积压的 section 一律是 `date`；本机设置里旧的 `listViews.done` 留着不读，不迁移。设置页本来就没有这一项。
- **文案**：「按日期」只给已完成的分区菜单用，九种语言一起删（`SECTION_LABEL` 去掉 `date`）。
- **测试**：`lib/hide-scrollbar.test.ts` 已完成那条改成「没有页头 / 分区按钮 / StickyHead、有读屏 h1、第一段不叠外边距」；`lib/sections.test.ts` 积压那条改成固定按日期。自查 `work/done-page-hdr/`，截图 `work/shots-d1112-donehdr/`。

### 设置「时间」：一天从几点开始全局生效 ✅（2026-11-13）
Rei 2026-11-13 01:16：「设置中新建一个"时间"选项卡；把"日记"中的"一天从几点开始"移动到这个"时间"选项卡中，这个会更改我的一天、过期积压、日历、项目、打卡、倒数日、日记中的"一天"的范围。」

- **设置**：`SETTINGS_SECTIONS` 在「提醒」和「任务」之间加 `time`（Lucide `Clock`，`trc('设置分区','时间')`，小字「一天从几点开始，「今天」都按它算」），放在它影响的那几项前面。里面一张卡一项「一天从几点开始」（0–23 整点），说明写清影响范围、提醒不变。日记一项只剩「每天提醒写日记」。值和同步键不变（pref `journal.day_start`，默认 5），老数据照用，不迁移。深链 `#/settings/time`、`mindough://view/settings/time` 自动认。
- **core**（`day-start.ts`）：`dayOf(时刻, 时区?)` 算某个时刻是哪天（钟点没到开始时间就算前一天），`logicalToday(now, 时区?)` 是逻辑今天，`nextDayBoundary` 是下一次换天。全局一个值：`Store.open` 用 `bindDayStart` 接上，每次现取偏好，同步过来的新值马上生效；没接 Store（纯函数单测）按 0 点。Store 加 `dayStart()`、`today()`、`dayOf()`；`journalDayStart()` / `journalToday()` 留作旧名。
- **跟着变的地方**：
  - 「今天」：Store 里原来 `toDateKey(this.now())` 的默认参数全换成 `this.today()`（我的一天加入 / 移出 / 自动加、补打卡、待安排、过期积压、打卡、计数撤销、改日期进出我的一天、重复倒数日滚动）；`taskToday` / `todayIn`（任务时区的今天、过期判断、日期快捷按钮）走 `logicalToday`。
  - 某个时刻算哪天：打卡归哪天（`check_in.period_key` 用逻辑今天）、补打卡判断、做完那天（我的一天「已完成」、已完成页按天分段、任务链的完成日）、建任务那天、归档那天（应打卡日的起止）都用 `dayOf`。
  - 界面：我的一天、过期积压、可做、已完成、日历（今天高亮、今天列）、项目（时间轴今天线、列表过期色）、打卡页、倒数日页、任务详情 / 新建 / 行、深链 `date=today`、小组件快照、@ 倒数日后缀，原来 `toDateKey(now)` 的全换成逻辑今天。
  - 换天：页面原来就每 30 秒 / 1 分钟用 `useNow` 重算「今天」，现在到开始时间那一分钟换天（我的一天自动加、重复倒数日滚动跟着跑）。
  - 计时提醒取打卡周期时也用逻辑今天（不然凌晨计时的提醒对不上周期）。
- **不变**：提醒响的时刻（按真实时钟）；打卡提醒仍按日历日排；@ 插入「今天日期」「当前时间」是真实时间；设置 →「日期显示」的预览；日历订阅拉取的范围；同步时间「昨天 HH:mm」。
- **测试**：core `test/day-start.test.ts`（开始时间 0 / 4 点，凌晨 2 点：今天、日记、任务时区今天、过期、我的一天、打卡归属、连续天数、倒数日天数、重复倒数日滚动、换天时刻、时区）。

### 手机长按任务不出菜单 ✅（2026-11-13）
- **要求**（Rei 2026-11-13 01:37）：「安卓端 长按任务还是会显示右键菜单，更改成不显示」。安卓 App 和手机网页是同一套触摸逻辑，一起改；电脑右键不变。
- **改动**：
  - `TaskRow`：去掉行菜单（`rowMenu` 一起删）。手指长按的计时留着，只用来认出长按：按满 500ms 再松手不算点开，不然长按松手会打开详情；挪动、滚动照旧作废。右键本来就不开菜单（2026-11-08），`onContextMenu` 照旧只 preventDefault。所有用 TaskRow 的地方都跟着变：我的一天、等待安排、过期积压、已完成、项目列表 / 看板 / 时间轴 / 任务链、类型、人物、资料里的任务。
  - `useContextMenuAt` 加 `systemTouchMenu`：`longPress: false` 时默认放过手指发的 contextmenu（日记正文要系统拷贝）；`systemTouchMenu: false` 连系统那层也拦。打卡页的行、倒数日的卡片和行改用 `{ longPress: false, systemTouchMenu: false }`：手机长按什么也不出（照样计时，`consumeLongPress()` 吞掉松手那次点按），鼠标右键菜单照旧。
  - 日历的任务块、⌘K 搜索结果、任务链卡片本来就没有长按菜单：日历长按是拿起拖动（`lib/cal-drag`），其余靠全局拦截（`lib/contextmenu`）和 `user-select: none` 不出系统菜单。
  - 能拖的列表长按照常拿起拖动（React Aria 的触屏长按拖动没碰）。
- **手机上只剩详情能做的**：置顶 / 取消置顶（详情「…」）；打卡归档 / 取消归档（详情「…」；已归档一节行尾的「取消归档」还在）；倒数日列表行改颜色（详情「卡片颜色」；卡片视图右上角 ··· 还在）；加入 / 移出我的一天在没有行尾太阳的列表里也只能进详情（顶栏太阳或「…」）。
- **不在这次**：侧栏图标样式（pinnedGroupStyle=icon）的项目 / 资料库长按拿起不挪再松开出菜单，那是项目 / 资料库不是任务，照旧。附件长按菜单、项目卡片长按菜单也照旧。
- **测试**：`ui/context-menu-at.test.tsx` 加三条（`systemTouchMenu: false` 手指长按不出、系统菜单拦掉、松手那次点按吞掉；轻点不算长按；鼠标右键照常）；`lib/task-menu.test.ts` 删掉 `rowMenu` 的用例。

### Material 皮肤紫换蓝 ✅（2026-11-13）
Rei 2026-11-13 01:46：Material 3 皮肤（安卓默认）整体是紫色，「换成和 Apple 皮肤一样的蓝」。

- **强调色**：`--accent` 亮 #0068d9、暗 #0a84ff；亮色比 Apple 深一档（见下面「亮色强调色加深」），暗色和 Apple 一样；`--accent-hover` 亮 #0058c4、暗 #409cff；`--heat-color` 跟强调色，热力图的两档淡色照旧由它和 `--heat-empty` 混出来。
- **派生色**：按 M3 Tonal Spot 从 #007aff 推（`@material/material-color-utilities`，脚本 `work/m3-blue/gen.mjs`），一一对应原来紫的那一档：
  - 淡底和上面的字：`--accent-soft` / `--nav-active-bg` 亮 #dbe2f9（secondary 90）配 #141b2c（13.3:1），暗 #3f4759（secondary 30）配 #dbe2f9（7.2:1）。选中行、导航选中、选中的胶囊、分段按钮、图标格子都走这一对。
  - 暗色强调色上的字 `--accent-contrast` 从 #381e72 换成 #001a41（primary 10），在 #0a84ff 上 4.7:1；白字只有 3.65:1，所以没跟 Apple 用白字。亮色还是白字。
  - 焦点圈：亮 `rgba(0, 104, 217, 0.4)`，暗色单独一条 `rgba(10, 132, 255, 0.5)`；选中文字底亮 `rgba(0, 104, 217, 0.22)`、暗 `rgba(10, 132, 255, 0.35)`。
  - 中性色（页面底、卡片、描边、正文、第二三级文字）换成带一点蓝的 neutral / neutral-variant：亮 #f9f9ff / #f3f3fa / #ededf4 / #e8e7ee，描边 #c4c6d0 / #74777f，字 #1a1b20 / #44474f / #565e71；暗 #111318 / #1a1b20 / #1e1f25 / #282a2f，描边 #44474f / #8e9099，字 #e2e2e9 / #c4c6d0 / #a9abb4。第三级文字在最深的卡片底上亮 5.3:1、暗 6.3:1。
  - 提示条（toast）：亮色底 #2f3036、动作按钮 #adc6ff（7.7:1）；暗色底 #e2e2e9、动作按钮 #0058c4（5.1:1，#007aff 在浅底上只有 3.1:1）。
  - 时间轴垫底 `--tl-base` 暗色 #111318；`readableTint` 的亮色最暗卡片底改成 #e8e7ee。
- **分类色**：提示块「重要」`--alert-important` 和视频附件 `--file-video` 用 Apple 皮肤同款紫（亮 #8944ab、暗 #bf5af2），和「注意」的蓝（#0061a4 / #9ecaff）、文档的蓝分开；其他文件附件 `--file-file` 换成中性灰 #5c5e66 / #c4c6d0。
- **安卓原生层**：仓库里只有 `scripts/android-webview.sh` 写死了 WebView 和窗口的不透明底（跟 Material 的 `--bg`），改成 0xFFF9F9FF / 0xFF111318。启动图标背景 `ic_launcher_background` 本来就是蓝（#2BA4FB）；主题、状态栏、colors.xml 是 CI 里 `tauri android init` 现生成的，仓库里没有，也没有脚本去改，这次不动。下次发版生效。
- **没动**：素净档（`color-level.css` 那几段照旧）；其它皮肤；用户自己给类型选的颜色（列表里还会有紫，那是数据）；心情河流空状态那一股淡紫（三个皮肤共用）。没加 color-mix。
- **对比度**：一开始亮色用 Apple 的 #007aff，白字只有 4.02:1，当字放在浅底上 3.6–4.0:1，留给 Rei 定。
- **亮色强调色加深、紫和深蓝保留**（Rei 2026-11-13 05:56「按你推荐来」，三条都按推荐）：
  1. 亮色 `--accent` / `--heat-color` 从 #007aff 换成深一档的 #0068d9：白字 5.27:1；当字放在页面底 #f9f9ff 上 5.03:1、白卡片上 5.27:1、#f3f3fa 上 4.77:1、#ededf4 上 4.53:1（最深的 #e8e7ee 上 4.29:1）。悬停 `--accent-hover` 跟着深一档成 #0058c4（白字 6.58:1）；焦点圈、选中文字底换成 `rgba(0, 104, 217, …)`。暗色 #0a84ff 不变。Apple 皮肤不变，还是 #007aff。
  2. 「重要」提示块和视频附件保留紫（#8944ab / #bf5af2），不改。
  3. 暗色强调色上的字保留深蓝 #001a41（4.7:1），不改白字。
- **测试**：新加 `lib/material-blue.test.ts`（亮色强调色 #0068d9、暗色和 Apple 一致、亮色白字 ≥ 4.5:1 且悬停更深、焦点圈跟新蓝、「重要」保留紫、没有 M3 紫、正文 / 容器字 / 暗色强调色上的字 ≥ 4.5:1、两段色板不用 color-mix）；`lib/list-surface.test.ts` 页面底改成 #f9f9ff。自查 `work/m3-blue/m3.mjs`（Material 亮暗 × 1366 / 390 × 我的一天、详情、日历、打卡、设置、日期选择器，量真实元素的字色和底色，扫一遍紫），截图 `work/shots-d1113-m3blue/`。

### 打卡完成时存正文、打卡描述 ✅（2026-11-13）
- Rei 05:01：打卡每次达标，正文标题下面有内容就新建一条已完成的前置任务，内容挪过去，打卡只留标题。05:09：打卡加「打卡描述」，正文下面一直显示，存正文时不动。
- core `checkin-archive.ts`（拆正文、什么算内容、存档正文、确定 id），写入在 `Store.checkIn` / `undoCheckIn`（archiveCheckInBody / retractCheckInArchive），`CheckInResult.archived`。触发只在本机打卡这条路径，applyRemote 不碰，所以别的设备不会再生成。
- 定下来的几件事（Rei 没说，我定的）：标题后加「 · YYYY-MM-DD」（补打卡写被补的那天）；附件算内容、跟着挪；关系用 FS（前置已完成不锁打卡）；撤回只认「本机这次打开后刚生成、没改过」（内存里记生成时的 updated_at），其余不动；严格模式先建待办再标完成。
- 打卡描述存 task.checkin_note（迁移 v23），纯文字 AutoTextarea；老客户端推上来的行没有这一列时沿用本机值。
- 客户端 `lib/body-flush.ts`：Store.beforeCheckIn 打卡前把详情里没存的正文 / 描述先存，避免存档拿旧正文、编辑器又把旧正文写回。
- 05:30 加一次性补存：`Store.backfillCheckInArchives` / `backfillCheckInArchivesOnce`（本机 meta `checkin_backfill_v1`），Store.open 末尾（有打卡才做）和 SyncEngine 拉完一轮后（新设备空库）各调一次；节点 = 今天所在周期达标就用它，否则上一个周期；id 固定用第 1 条。

### 打卡描述改成属性、显示成框；「重新打开」只放图标 ✅（2026-11-13）
- Rei 07:25「打卡描述做成属性，在属性dropdown中放在心情、附件一组。打卡显示成一个box,背景略深，统一圆角」；07:27「重新打开也icon btn」。
- `lib/prop-chips`：`AddMenuId` 加 `checkin_note`，第 3 组按 心情、打卡描述、附件、卡片颜色 排；`addMenuItems / addMenuSections` 第 4 个参数 canAddNote；`checkInNoteShown(note, opened)`。
- `TaskDetail`：框从正文下面挪到 `.detail-props` 里胶囊和附件中间；本组件记「打开着」（换任务就清），打卡、没锁、框没显示时给 PropChips `onAddNote`。
- `CheckInNote`：`autoFocus`、`onOpenChange`（聚焦 true；删空后失焦 / Esc、点 × 时 false）；× 走 `setCheckInNote(null)` + 撤销提示。删了只读空态「没有打卡描述」（九语言词条一并删）。
- 样式：`.checkin-note` 圆角 `--radius-lg`（同属性卡片）；底色半透明黑叠在详情底上（亮 0.045、暗 0.24），三皮肤亮暗都比详情底深一点。原想照属性卡片用 `--surface-2`，实测 WinUI 亮色手机和各皮肤暗色下它比详情底还亮，不是「略深」，所以没用；没用 color-mix。
- 判断：「打卡 box」理解成打卡描述这个框（同一句话前半句说的就是它），打卡快捷按钮、进度区没动。「重新打开」用 rotate-ccw、默认灰色图标按钮，「这件事已经做完了。」那行留着。

### 打卡描述框挪到胶囊行上面 ✅（2026-11-13）
- Rei 09:18「打卡描述被放在属性行底部了么？放在上面」。
- `TaskDetail`：`CheckInNote` 挪成 `.detail-props` 的第一项，在正文下面、胶囊行上面；胶囊行、附件、资料跟在后面。间距还是 `.detail-props` 的 gap（--space-3），圆角、底色、加 / 收起 / × 都没变。
- 判断：放在 `.detail-props` 里而不是正文和属性块之间单独一块，这样它和胶囊的距离同胶囊和附件的距离一样，算属性块的一部分。

### 打卡描述框去掉框头，只靠占位 ✅（2026-11-13）
- Rei 09:31「打卡描述的label不要，换成用placeholder」。
- `CheckInNote`：删掉 `.checkin-note-head`（notebook-text 图标 + 「打卡描述」），框里只剩 `AutoTextarea`；`section` 从 `aria-labelledby` 改成 `aria-label="打卡描述"`，输入框读屏名照旧。占位沿用「添加打卡描述…」（九语言本来就有，意思够清楚）。
- × 挪进框里右上角（`position: absolute; top: 8px; right: 6px`，和第一行字居中）；桌面悬停 / 键盘聚焦才出来，手机照旧没有；桌面给输入框右边留 20px，字不压到 × 下面。
- 内边距 8px 16px 12px → 8px 12px；圆角、底色不变。
- 文案：「打卡描述」还用在读屏名、「+」菜单、清除提示里，没有词条变成没用，所以没删词条。

### 错过的倒数日不自动完成 ✅（2026-11-13）
Rei 2026-11-13 08:38：「错过的倒数日不要直接设置成"已完成"」。
- 查下来：不重复的倒数日过了目标日，代码里没有地方改它的状态（客户端、同步、Worker、迁移都没有），一直是待办、显示「已过 N 天」。自动写「完成」的只有重复倒数日滚动时生成的那次记录：`Store.writeCountdownRecord` 建行时 `status: '完成'`、`done_at: recordDoneAt(那天)`（那天本机中午），由客户端 `lib/countdown-roll.ts`（打开、换天、数据变了）调 `rollRecurringCountdowns` 触发。
- 改法：记录建成待办、`done_at` 空；重复倒数日照旧滚到下一次。新加 `Store.blockingEdges()`：`edges()` 去掉 `isCountdownRecordEdge`（前置是倒数日、id = `countdownRecordId(后续, 前置目标日)`）。`derived()`、`setStatus` 的解锁、`syncAutoMyDay` 和我的一天页的「刚解锁」都改用它，所以记录待办不挡重复倒数日，点完记录也不算解锁。「先做完这些」、任务链、项目时间轴照旧用 `edges()`，记录照样列着。
- 去向：倒数日页（已过 N 天）、日历那天。过期积压（`isOverdueBacklogTask` 跳过倒数日）、等待安排（有目标日的倒数日不进）、昨天没做完（0682146 起跳过倒数日）、建议 / 自动进我的一天（只看目标日 = 今天）都不列。
- 旧数据：`Store.restoreAutoDoneCountdownRecords()` 只改三条都对上的：id = `countdownRecordId(某个后续, 自己的目标日)`（看依赖表，墓碑也算）；完成、没删、不重复的倒数日；`isAutoRecordDoneAt`：完成时间等于本机算的那天中午，或者是整分钟、离那天 UTC 中午不超过 14 小时（别的时区的设备生成的）。改成待办、清 `done_at`，直接写行，不走 `setStatus`。`restoreAutoDoneCountdownRecordsOnce`（本机 meta `countdown_record_undone_v1`）：Store.open 末尾（本机有倒数日才做）、SyncEngine 第一次拉完各调一次；严格模式下也改（改回待办 = 重新打开，严格模式本来放行）。
- 没改表结构，Worker 没改，没加文案（「已过 N 天」本来就有）。
- 测试：core `countdown-missed.test.ts`（9 项：不重复的不改、记录待办且不挡、普通前置照挡、去向、认自动完成时间、只改自动完成的、只做一次、严格模式、新设备同步后做）；`countdown-repeat.test.ts` 第一项改成待办。
- 待 Rei 确认：记录不挡重复倒数日（上面当初选「完成」就是为了不挡）；只做一次，老版本 App（alpha.3 及以前）下次发版前滚动时还会写「完成」的记录，做过迁移的设备不会再改回；手动完成靠完成时间分辨，恰好在那天中午整点 0 秒点完成的会当成自动的（几乎不会）。
