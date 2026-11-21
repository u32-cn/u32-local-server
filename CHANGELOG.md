# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed
- 🔧 发版自动化补全：`release.yml` 新增 `publish-npm` job，push tag 后安装包发布成功即自动 `npm publish --provenance`（依赖仓库 secret `NPM_TOKEN`）；README 发版流程同步——**tag 必须推到 github remote**（origin 是 codeup 镜像，不触发 Actions）

### Docs
- 📝 文档站首页导航版本号不再硬编码脱节：`apply()` 同步导航版本为 latest.yml 解析值，硬编码仅作 JS 失效兜底

## [1.8.0] - 2026-11-20

### Added
- ✨ Windows 安装包自动升级：新增 `u32-ls update [--check] [-y]`（查 GitHub Releases 最新版 → 下载 setup exe 到 `~/.u32-local-server/update/` → 拉起安装向导）与首页「软件更新」运维卡（`GET /api/update` 检测、`POST /api/update {action:'download'|'install'}` 触发，Origin 同源校验沿用写接口防线）；安装器加 `PrepareToInstall`（停服务 + `u32-ls tray-stop` 结束托盘）避免覆盖 exe 时 EBUSY；npm 版不受影响（提示走 npm 升级）
- 🔔 新增 `u32-ls tray-stop`：读 `tray.lock` 里的 PID 精确结束托盘进程，清理锁文件
- 📝 文档站首页补 Windows 下载入口：hero 区新增「下载 Windows 安装包」主按钮（GitHub Releases latest，按钮缀最新版本号徽标），快速开始区补安装包直链与 SmartScreen 提示

### Changed
- 🔧 文档站「让 AI 帮我安装」提示词瘦身：去掉「Windows 优先用免 Node 安装包，macOS/Linux 用 npm」尾巴——系统分流逻辑 llms.txt 已有，页面提示词只负责指向 URL

### Docs
- 📝 installation.md 增「自动升级（Windows 安装包版）」节；cli.md 命令表补 `update` / `tray-stop` 与升级缓存目录；home.md 补「软件更新卡」机制；llms.txt 索引同步
- 📝 llms.txt 安装节重写：Windows 下载改为「GET latest.yml 取 version → 拼自域名直链」（国内稳定，CDN 回源 Releases），细节全部指向 installation.md；installation.md 下载节同步（直链首选 + GitHub 兜底），自动升级节更新为「自动下载缓存 + 就绪后安装」交互

## [1.7.1] - 2026-11-19

### Docs
- 📝 明确安装方案按系统选择：Windows 优先免 Node 安装包，macOS/Linux 不出安装包、只用 npm 安装。同步 README、安装文档、`llms.txt`、文档站「让 AI 帮我安装」提示词及发版流程说明
- 📝 免 Node 安装包落地 GitHub Releases 下载链接（releases/latest），文档各处「下载 exe」补真实入口
- 📦 新增 `.github/workflows/release.yml`：push `v*.*.*` tag 自动在 Windows runner 构建安装包（icon → SEA → Inno Setup）并创建 GitHub Release 上传 exe；tag 与 `package.json` version 不一致时构建失败；Release notes 自动取 CHANGELOG 对应版本段。本地手动打包流程保留备用

## [1.7.0] - 2026-11-19

### Changed
- 🔧 首页「接入 AI」区精简为一句话指令（读取 llms.txt 后汇报在线桥实例、能力及操控方式），移除原 6 条场景指令与说明文案，列表改单列
- 🔔 托盘与快捷方式改为单入口：开始菜单只留一个 `u32-local-server`，点击执行新增的 `u32-ls launch`（启动服务+托盘，均幂等）；旧版双快捷方式安装时自动清理
- 🔔 托盘图标按服务状态切换：运行中=激活（红 LS），未运行=置灰（灰 LS），每 1.5s 探测端口；`resources/ls-gray.ico` 由 `build-icon.js` 生成
- 🔔 托盘「查看网页」只调默认浏览器打开首页，不再启动服务（服务没开就是打不开）；「退出托盘」更名「退出」

### Fixed
- 🐛 修复安装后托盘启动报错 `800A0401 语句未结束`：`cmd-tray.js` 生成 `ws.Run` 的 VBS 时未把命令行包裹为单个字符串，改为对内部双引号做 `""` 转义并整体包一层引号，安装即拉起托盘不再弹编译错误

### Added
- 🔔 新增 Windows 系统托盘（`u32-ls tray`）：白底红字 LS 图标（`resources/ls.svg` → `build-icon.js` 生成 16/32px ICO，零依赖），右键菜单启动/停止/查看网页/退出托盘，左键双击打开网页；用 Windows 自带 PowerShell + .NET NotifyIcon 实现，脚本/图标从 SEA 嵌入资源释放到用户目录，由 wscript 拉起以避开会话进程回收
- 📦 安装包**不再写 PATH**，改由开始菜单快捷方式进入（控制台 / 系统托盘），安装完自动拉起托盘图标
- 📦 新增 Windows 免 Node 安装包：`node scripts/build-sea.js` 用 Node SEA 把源码与 `public/`、`docs/`、`src/picker/` 静态资源打包成单文件 `dist/u32-ls.exe`；`ISCC.exe scripts/installer.iss` 用 Inno Setup + LZMA2 产出约 24MB 的 `u32-local-server-setup-<版本>.exe`，安装即写入 PATH 并注册开机自启 / 右键菜单，卸载时自动清理
- 🔧 新增 `src/sea-assets.js` 资源抽象层：SEA 模式经 `sea.getAsset()` 读嵌入资源，node 直跑模式仍走磁盘；`register` / `unregister` 生成的 VBS 与 systemd unit 在 SEA 下改为直接调用 exe，运行时脚本目录改到用户目录，兼容安装到 Program Files 的只读场景
- ✨ 新增 `/picker-guide` 文件选择器引导页：三张模式卡片（打开文件 / 选择目录 / 另存为）各附 iframe 接入脚本与「试用」按钮，点击后以内置模态 iframe 窗口打开 /picker，选中结果实时显示在卡片下方；首页六宫格「文件选择器」入口改指向该引导页（/picker 与 /picker-demo 保持不变）
- 📚 文档站纳入本地服务：新增 `/docs`（重定向）、`/docs/index.html`、`/docs/reader.html`、`/docs/assets/...`、`/docs/readme/<name>.md` 路由，离线环境下访问 `http://127.0.0.1:<port>/docs` 即可看到完整排版文档；`/docs/<name>.md` 旧直链兼容保留；各页面导航「文档 ↗」改指阅读页
- ✨ 首页重做为一屏控制台：顶栏 → 状态带（运行时长 / 允许路径 / 桥在线 / 产物占用）→ 六宫格入口 → 运维行 → 折叠区（AI 指令 / 常用命令）。全页高度由约 3300px 降到一屏，移除「关于 / 功能特性 / 快速开始 / 命令参考」四块重复文案，产品介绍统一归文档站
- ✨ 新增 `GET /api/summary`（首页状态带数据源，与 SSR 首屏同一份计算，只含计数与布尔）与 `GET /api/service-status`（只读探测开机自启 / 右键菜单是否已注册：Windows 查 Run 键与 shell 键，Linux 查 systemd unit 文件，结果缓存 1.5s）
- ✨ 首页「系统集成」卡显示真实注册状态并支持一键注册 / 取消；「临时产物」卡并入运维行，保留打开目录与清空
- ✨ 新增 `public/css/base.css`：三页共用的 token（浅灰底 #F6F6F8 / 白卡 14px 圆角 / 单一强调色 #2563EB）与顶栏、卡片、按钮、标签、提示条、表单基准
- ✨ 新增 `src/fmt.js`（状态页与首页共用格式化，避免同一数值两种写法）、`src/summary.js`、`src/service-status.js`、`public/js/home.js`、`public/favicon.svg`
- ✨ 新增 `docs/readme/home.md`

### Changed
- 🔧 `/api/service` 改为用 `process.execPath` 直接拉起本包入口执行注册，不再 `execSync('start cmd /c u32-ls register')`——后者在 `u32-ls` 不在 PATH 时会静默失败却回 `ok:true`（假成功）。返回 `accepted:true` 只代表子进程已拉起，页面轮询 `/api/service-status` 确认真实结果，未达预期显示「注册未生效」；Linux 下返回 `error: requires-root` 并提示 `sudo u32-ls register`
- 🔧 注册 / 取消注册按钮由隐式 `event.target` 改为按 `data-svc-action` 定位，点图标子元素不再把状态写到图标上
- 🔧 状态页与配置页套用同一视觉：统一顶栏（首页 / 状态 / 配置 / 文档）、卡片圆角与配色、按钮与表单样式；状态页调试级字段（argv / execArgv / 缺页 / 上下文切换等 43 项）默认折叠，点「全部字段」展开（实测 35 → 78 行）
- 🔧 状态页请求指标排除 `/api/summary` 与 `/api/service-status` 轮询，避免首页每 5s 刷新污染指标
- 🔧 `/favicon.ico` 回 204 并新增 SVG 图标，消除每页控制台的 403 与指标里的 4xx 噪音；`public/` 静态资源 MIME 表补 `.svg`
- 🔧 其余子页面统一到 `public/css/base.css`：`/bridge`、`/picker-demo`、`/proxy/`、`/file/` 目录列表与 403/500 错误页改用同一顶栏（品牌 + 版本 + 地址 + 导航）、白卡分区、按钮与页脚；配置页补地址与统一页脚、页宽对齐 1140，状态页补地址
- 🔧 `/proxy/` 与 `/picker-demo` 去掉 FontAwesome 按钮图标与 `space-grotesk.css` 引用，表单 / 按钮改用 base.css 基准

### Docs
- 📝 明确安装方案按系统选择：Windows 优先免 Node 安装包，macOS/Linux 不出安装包、只用 npm 安装。同步 README、安装文档、`llms.txt`、文档站「让 AI 帮我安装」提示词及发版流程说明
- 📝 文档体系深度整理（Diátaxis 分类：教程/指南/参考/解释，每条知识只留一个权威源）：
  - 新增 `docs/readme/installation.md`（安装唯一权威文档：前置、npm 落点检查、自检、误装清理）与 `docs/readme/getting-started.md`（启动、≥5 分钟验证标准、AI 托管会话回收陷阱与计划任务方案、首次 403 解除、30 秒上手）；原 llms.txt 内两处重复的安装/回收警示块与 PowerShell 脚本副本迁出合并
  - `docs/llms.txt` 重写为「产品简介 → 核心特色 → 安装摘要 → 启动摘要 → 功能文档索引（12 篇全，新增收录 bridge-connection-lifecycle，补 installation/getting-started）→ 全局约定」，正文细节全部改为链接到对应文档
  - `docs/readme/bridge.md` 重构：「接入须知」（at-most-once、超时、内存状态等语义）前置为第一节的表格，身份模型定为权威定义处；机制细节改为指向 lifecycle 文档
  - `docs/readme/bridge-connection-lifecycle.md` 重定位为纯机制解释文档：笔记体头部（日期/实现位置）改为标准文档导语，身份模型表与语义限制改为引用 bridge.md，不再两处维护
  - `docs/readme/cli.md`：补 `clear-artifacts` 命令（此前只在 bridge.md 提及、命令表缺失）、桥临时产物路径；安装段改指向 installation.md；删「技术特性」节（产品级卖点并入 llms.txt 核心特色）
  - `docs/readme/home.md`：删「视觉基准」节（内部 CSS 设计笔记，对功能使用者无价值）
- 📝 `docs/` 重构为 GitHub Pages 站点（`.nojekyll` + `index.html` 主页 + `assets/` + `reader.html` 站内渲染），经 EdgeOne 回源分发到 `u32-local-server.u32.cn`
- 📝 文档合并为单一源：`public/docs/*.md` 与 `docs/bridge-connection-lifecycle.md` 移入 `docs/readme/`，`src/router.js` 的 `/docs/<name>.md` 改读该目录，npm `files` 白名单增列 `docs/readme`；改一处同时作用于站点与运行时
- 📝 README 新增「两个核心用途」：本地文件服务（对比 File System Access API 的授权模型）与 AI 桥接服务，并说明两者都需 Web 端按协议改造
- 🔧 `public/css/space-grotesk.css` 的三个 `@font-face` 由 `fonts.gstatic.com` 改为本地 `public/webfonts/space-grotesk-*.woff2`，消除境外 CDN 依赖

### Changed
- 🔧 `register` 生成的 VBS 脚本（hidden/open/copy-url）从仓库根目录移至 `runtime/` 子目录，`.gitignore` 同步改为忽略整个 `runtime/`；运行时生成物不再污染项目根目录

### 注意（升级需操作）
- ⚠️ 从旧版本升级后，Windows 下需重跑 `u32-ls unregister && u32-ls register`：注册表中记录的是 VBS 的绝对路径，不重注册右键菜单与开机自启会指向已不存在的旧位置

## [1.6.0] - 2026-11-18

### Added
- ✨ 新增运行状态页 `/status` 与 JSON 接口 `/status/api`：采集 PID/父 PID/启动时间/运行时长/程序路径/监听地址/配置文件与日志/PID 文件一致性/Node 运行时与 versions/OS/进程资源（rss、heap、CPU%、峰值、缺页、磁盘读写、上下文切换）/活跃资源/桥计数/请求指标；首屏 SSR 完整渲染，前端按 2s/5s/10s/暂停 拉接口只做 `data-k` 定点替换与动态表体重建（滚动/折叠/选中不丢），运行时长前端每秒本地自增，点击任意值复制
- ✨ 状态页数据显示层统一按字段单位后缀（`Bytes/Sec/Ms/Usec/Percent/At/Count/Mhz`）格式化；CPU 使用率由 2s `setInterval().unref()` 两次 `process.cpuUsage()` 求差
- ✨ 桥状态页 `/bridge` 实例表格拆「ID短码」「实例 ID」两列：短码取 `appInstanceId` 前 2 字符（不区分大小写），多实例时按短码指定操作对象，发指令仍用完整 ID
- ✨ 首页头部新增运行状态入口（heartbeat 图标）
- ✨ 新增 `public/docs/status.md`，并在 `llms.txt` 索引登记

### Changed
- 🔧 `/bridge/api/artifact/<appInstanceId>` 上传回包由短 URL 改为本地文件路径 `{ ok, artifactId, bytes, path }`，AI 直接读 `path`，免二次 HTTP 下载；`GET /bridge/api/artifact/<artifactId>` 下载兼容保留
- 🔧 `public/docs/bridge.md` 补齐临时产物全部端点（上传/下载/统计/清空/打开目录）与生命周期说明（启动清空 + 7 天 TTL + 1GB LRU + 单文件 64MB）
- 🔧 状态页不采集任何敏感信息：不读 `process.env`、不读磁盘卷容量、不输出主机名/用户名/uid/gid/家目录/网络接口 IP 与 MAC，输出路径经 `maskPath()` 把家目录前缀替换为 `~`
- 🔧 请求指标钩子在 router 入口一处调用，`/status*` 自身请求不计数，避免观察行为污染指标

### Fixed
- 🐛 `/bridge/api/reply` 在 error 回包时也透传页面 payload：此前固定只回 `{ id, error }`，页面端附带的附加信息（如 runScript 失败时已捕获的 console 日志）被剥掉；现为 `{ id, error, payload? }`，成功路径行为不变

### Docs
- 📝 `public/llms.txt` 顶部新增警示：WorkBuddy 托管会话内由 AI 拉起的服务进程会在命令结束后 40~70 秒静默消失（非崩溃，原因未定位），常驻请用户自行 `u32-ls start` 或用 Windows 计划任务；`AGENTS.md` 开发命令节同步引用

## [1.5.0] - 2026-11-16

### Added
- ✨ 浏览器桥新增 artifact 临时产物服务：页面大产物（截图/导出）HTTP 直传 `POST /bridge/api/artifact/<appInstanceId>`，AI 拿短 URL 下载，免 base64 走 JSON 回包；存储 `~/.u32-local-server/tmp/bridge-artifacts/<YYYY>/<MM>/`，7 天 TTL + 总量 1GB LRU 驱逐 + 单个 64MB 上限，均可配 `bridge.artifact.*`
- ✨ `GET /bridge/api/artifacts` 统计、`DELETE /bridge/api/artifacts` 清空、CLI `clear-artifacts` 子命令
- ✨ 首页「临时产物」卡片新增「打开临时目录」按钮：`POST /bridge/api/artifacts/open`（仅 Windows，explorer 打开）

### Changed
- 🔧 产物统计与清空改为以磁盘实况为准（含手工放进目录、不在内存名册的文件）
- 🔧 首页清空产物后重新查询统计，有在线桥页面持续上传新产物时向用户说明

## [1.4.0]

### Added
- ✨ 文件选择器支持三种模式：`?mode=open-file`（打开文件，默认）、`open-dir`（选择文件夹）、`save-file`（另存为）；另存为只回传路径与 `overwrite` 标记，不落盘
- ✨ 选择器界面按 Windows 10 对话框高保真重做：标题栏、地址栏双态（面包屑 ↔ 可编辑）、当前目录搜索、组织/新建文件夹/视图/帮助工具条、按修改日期分组（今天/昨天/本周早些时候/上周/更早）与折叠、列头排序、详细信息/大图标视图、Win 风滚动条与 Win 风图标
- ✨ 侧栏改为「最近访问」（localStorage，最多 10 条，失效自动移除）＋「允许的目录」（齿轮按钮新标签打开 `/config`）
- ✨ 键盘操作：`Esc` 取消、`Enter` 主按钮、`↑↓` 选中、`Backspace` 向上、`Ctrl+L` 地址栏、`F5` 刷新；提示统一为自绘 Win 消息框，不再使用 `alert/confirm`
- ✨ 新增只读 API `GET /picker/api/stat`（存在性/类型/大小/时间），`ls` 返回增加 `typeLabel`/`write`
- ✨ 选择器静态资源路由：`/picker/style.css`、`/picker/icons.svg`、`/picker/client/*.js`（固定白名单）

### Changed
- 🔧 选择器代码按职责拆分到 `src/picker/{api,page,assets}.js` + `src/picker/client/{main,list,nav,ui,actions}.js`，`src/picker.js` 仅作入口委托
- 🔧 `open-file` 模式下「文件名留空＝选当前文件夹」转为显式参数 `?allowEmpty=1`，默认行为对齐 Windows（必须先选文件）
- 🔧 `/picker/` 规范化重定向到 `/picker`

### Fixed
- 🐛 修复裸盘符路径（如 `S:`）被 fs 解释为该盘「当前工作目录」，导致只列出极少条目并把坏路径写入最近访问/上次目录的问题：服务端统一规范化为 `S:/`，面包屑盘根段保留尾斜杠
- 🐛 修复大图标视图下图标被一并隐藏的问题
- 🐛 修复「新建文件夹」成功后未选中新目录、未回填文件名的问题

## [1.2.0] - 2026-08-22

### Fixed
- 🐛 修复经 Nginx 等反向代理转发后页面打不开的问题：所有页面（首页/配置页/代理页/目录列表/允许列表页/错误页）的链接、样式表引用、fetch 请求全部改为点式相对路径（`./x`、`../x`），由浏览器按当前访问地址解析，代理前缀自动保留，零配置
- 🐛 修复目录 URL 缺尾斜杠时 301 丢失末段的问题（`/file/~` 曾被重定向到 `/file/`）：尾斜杠判断改用浏览器原始路径，`/file/~%2F` 这类整段编码形式也会 301 到带真实尾斜杠的规范形式，页面相对链接不再解析错误；重定向 Location 取末段重新 `encodeURIComponent`，中文路径安全
- 🐛 允许列表页（file 首页）条目链接改为逐段编码（保留真实 `/` 分隔符），不再生成 `%2F` 整段编码链接
- 🐛 移除页面中硬编码的 `http://localhost:PORT`（导航按钮、错误页提示、改端口跳转提示等）
- 🐛 代理页生成的代理 URL 改为按浏览器当前地址（`location`）计算，经代理访问时自动生成带前缀的正确 URL
- 🐛 配置页修改端口后的跳转：直连本机时自动切换到新端口，经反向代理访问时保持代理地址不变

### Changed
- 🔧 目录访问统一 301 重定向到带尾斜杠形式（`/file/~/a` → `/file/~/a/`），保证相对链接解析基准正确（与 Nginx/Apache 等文件服务器行为一致）
- 🔧 `/proxy` 重定向到 `/proxy/`、`/config/` 重定向到 `/config`，页面 URL 形态唯一
- 🔧 目录列表条目链接由绝对路径改为 `./名字`（目录带尾斜杠），且保留用户当前的 `~` 缩写 URL 形态
- 🔧 llms.txt 中 URL 示例改为相对路径形式

## [1.1.1] - 2026-08-21

### Fixed
- 🐛 Linux: systemd unit 模板修复——ExecStart 使用绝对路径 node/入口（带引号），解决 nvm 环境下 `env: node not found`
- 🐛 Linux: 补充 `Type=forking` + `PIDFile`（start 为 fork 守护化命令，缺省 simple 会导致服务被 systemd 误判/清杀）
- 🐛 Linux: unit 补充 `HOME`/`PATH` 环境变量与 `RestartSec=3`，避免重启风暴
- 🐛 Linux: `sudo` 调用时通过 `SUDO_USER` 让服务以真实用户运行（User=/HOME 不再指向 root）
- 🐛 Linux: 注册前自动停掉手动启动的实例，避免 "Server is already running" 启动失败
- 🐛 Linux: 注册后校验 `systemctl is-active`，失败时提示 journalctl，不再假报成功
- 🐛 Windows: VBS 启动脚本由裸 `npx` 改为绝对路径 node + 入口（`process.execPath` 解析、`Chr(34)` 处理空格路径），不再依赖登录环境 PATH
- 🐛 Windows: unregister 后提示运行中的服务器不会被停止（`u32-ls stop`）

### Added
- ✨ 平台支持检测：macOS / 未启用 systemd 的 Linux（如 WSL 未配置 `[boot] systemd=true`）等场景给出中英文明确提示后退出
- ✨ 从 npx 缓存运行 register 时给出警告（缓存清理会导致自启失效）

## [0.1.0] - 2026-05-07

### Added
- 🎉 初始版本发布
- ✨ 本地文件 HTTP 服务
- ✨ CORS 代理功能
- ✨ 可视化配置页面
- ✨ 权限控制（白名单/黑名单）
- ✨ 60+ MIME 类型内置支持
- ✨ 目录浏览功能
- ✨ 命令行工具（start/stop/url/open/copy-url）
- ✨ 开机自启注册（Windows + Linux）
- ✨ Windows 右键菜单集成
- ✨ 跨平台路径处理（Windows 盘符/~/）
- ✨ 纯 Node.js 实现，零依赖

### Features
- 文件访问
  - Linux: 直接映射到文件系统
  - Windows: 支持 `/file/` 前缀访问盘符
  - 通用: 支持 `~/` 表示用户主目录
- CORS 代理
  - 删除 accept-encoding 头
  - 删除 x-frame-options 头
  - 注入 CORS 头
  - 支持所有 HTTP 方法
- 配置管理
  - Web 可视化界面
  - REST API
  - 自动创建默认配置
- 权限模型
  - deny 优先于 allow
  - 空白名单 = 允许所有
  - 路径前缀匹配

### Technical Details
- Node.js >= 18.0.0
- 无第三方依赖
- 跨平台支持（Windows/Linux）
- 配置文件: `~/.u32-local-server/config/main.json`
- 默认端口: 19527

## [0.2.0] - 2026-05-07

### Added
- ✨ Windows 文件夹背景右键菜单支持
  - 在文件夹内空白处右键可直接打开浏览器
  - 支持复制文件夹 URL 到剪贴板

## [0.3.0] - 2026-05-07

### Changed
- 🔒 权限模型从黑名单模式改为白名单模式（更安全）
- 🚫 默认 allow 列表从 `["~/"]` 改为 `[]`（拒绝所有访问）
- ⚠️ 首次使用需要在配置页面添加白名单才能访问文件

### Migration Notes
- 升级后默认拒绝所有文件访问
- 请访问 http://localhost:19527/config 添加白名单规则
- 例如添加 `~/` 可访问用户主目录

## [0.4.0] - 2026-05-07

### Added
- ✨ 命令行添加 `version` 命令显示版本号
- ✨ 帮助信息添加版本号显示
- ✨ 首页 footer 显示版本号
- 🎨 首页 UI 优化，配置检查状态更明显

## [0.5.0] - 2026-05-07

### Added
- 🌐 帮助信息全面中英文化，所有命令和选项添加中文说明
- 🏠 首页新增「系统服务」section，详细说明 register 功能
- 🪟 Windows 系统：强调右键菜单功能（在浏览器打开、复制 URL）
- 🐧 Linux 系统：说明 systemd 服务功能
- 📱 系统服务卡片采用渐变色设计（Windows 蓝色、Linux 橙色）
- 📲 帮助信息添加功能特性介绍（文件服务、CORS 代理、权限控制、配置管理、跨平台）
- ✅ 命令参考表格添加 register 的详细说明（Windows 右键菜单）
- 📱 新增响应式设计，移动端自动调整为单列布局

## [1.0.1] - 2026-05-11

### Fixed
- 🐛 修复 Windows 右键菜单打开文件夹时 URL 末尾多 `/` 的问题
  - 修复 VBS 脚本中字符串拼接错误（src/cmd-service.js:34）
  - 错误：`WScript.Arguments(0) & """"`（四个双引号）
  - 正确：`WScript.Arguments(0) & """`（三个双引号）
  - 影响：修复前生成的命令为 `node "..." open "S:\tmp""`（末尾多双引号）
  - 修复后生成的命令为 `node "..." open "S:\tmp"`（正确）

## [1.0.0] - 2026-05-08

### 🎉 正式版发布 - 生产就绪

### Added
- ✨ 完整的首页用户体验
  - 新增「关于」介绍卡片，展示项目核心价值
  - 新增文件访问和 CORS 代理快速入口
  - 优化系统服务说明（Windows 右键菜单 / Linux systemd）
  - 新增服务注册/取消注册交互按钮
- ✨ 服务管理 API
  - 新增 `/api/service` POST 接口
  - 支持异步触发 `register`/`unregister` 命令
  - 跨平台支持（Windows 使用 `start cmd`，Linux 使用后台执行）
- 🎨 首页 UI 大幅优化
  - 新增 header 按钮组（文件访问、CORS 代理、配置）
  - 系统服务卡片重新设计，更清晰的特性列表
  - 新增服务操作按钮（注册服务、取消注册）
  - 改进按钮状态反馈（加载中、成功、失败）

### Changed
- 🔧 优化路由逻辑，区分 `/proxy` 和 `/proxy/` 路径
- 🎯 首页交互体验改进，添加实时状态反馈
- 📝 命令参考表格更新（添加 restart、unregister 命令）

### Technical Details
- 零依赖纯 Node.js 实现
- 完整的跨平台支持（Windows/Linux/macOS）
- 生产就绪的稳定性
- API 稳定，可作为主要版本发布

## [1.0.2] - 2026-05-11

### Fixed
- 🐛 修复 VBS 脚本引号转义问题
  - 使用 `Chr(34)` 替代直接的双引号转义
  - 修复 VBS 模板字符串引号数量错误
  - 提升路径转义的兼容性
- 🐛 移除 VBS 调试弹窗代码
  - 清理临时调试代码
  - 改善用户体验
- 📝 将 temp 目录加入 .gitignore

## [1.1.0] - 2026-05-23

### Added
- ✨ 支持 .log 日志文件浏览器直接查看
- ✨ 新增 22 种常用文件格式浏览器预览支持
  - 前端框架：.jsx, .tsx, .vue
  - 配置文件：.ini, .toml, .properties, .env, .conf, .cfg
  - 文档：.markdown, .tex, .latex
  - 编程语言：.php, .c, .h, .cpp, .hpp, .cc, .cxx, .java, .go, .rs
- 📝 所有新增格式均可通过浏览器直接查看内容

## [Planned]

### Planned Features
- 文件上传支持
- 文件搜索功能
- Range 请求支持
- HTTPS 支持
- 访问日志记录