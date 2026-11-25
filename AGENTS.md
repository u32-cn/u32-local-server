# AGENTS.md — AI agent 行为纪律

本文件只写 AI 在此仓库执行任务时必须遵守的纪律与易错坑。**所有事实性内容（架构、路由、配置、命令、发版流程等）以 [README.md](README.md) 为准**，本文件不重复。

## 硬性禁令

1. **零依赖**：运行期禁止引入任何第三方 npm 包，只用 Node.js 内置模块。唯一例外是构建期 devDependency `postject`（SEA 注入 blob 用），它不进运行包；不得新增其他 npm 依赖
2. **跨平台**：所有改动必须兼容 Windows 与 Linux；路径统一 POSIX 风格（`/` 分隔符，Windows 盘符 `C:\path` → `/C:/path`）
3. **权限不变式**：allow 命中即放行（读写须条目 `write=true`）；`allow` 为空 = 拒绝所有。拒绝列表（deny）已移除，不得重新引入。任何改动不得破坏该模型
4. **MIME 优先级**：配置 `file.mime` 覆盖内置默认值，不得反转
5. **访问规则新增只能经弹窗**：allow 的**新增**唯一写入口是主服务内授权对话框 `/access-dialog`，由用户浏览选中文件夹并点「允许」后落盘。**AI 禁止直接编辑 `~/.u32-local-server/config/main.json`，禁止调用 `/config/api` 的 `add`/`remove`/`setAllowWrite`（已移除，返回 410），禁止直接调 `/access-dialog/api/grant`（需页面内嵌 token，外部直调必 403）**。删除允许规则是收紧权限，可在 `/config` 页点「删除」或调 `removeAllow`，不需弹窗。AI 需要新增授权时只能引导用户打开 `/access-dialog`（或执行 `u32-ls access`），不得代改配置
6. **敏感信息红线**：
   - `/status` 不采集任何敏感信息是既定设计（`process.env`、磁盘卷、主机名、用户名/uid/gid、家目录、网络接口 IP/MAC 一律不读取），改代码不得引入采集
   - 不提交含本机绝对路径、密钥、token 的文件（register 生成的脚本统一写入 `runtime/`，该目录已在 `.gitignore`，保持忽略）
7. **文档同步义务**：改功能时同步 `docs/readme/*.md`（唯一源，同时供 Pages 站点与 `/docs/<name>.md` 使用）、`docs/llms.txt`（`/llms.txt` 的唯一源，本地服务动态替换 `{{PORT}}`；Pages 站点原样发布，改过一次后就别再复制出别的副本）、`CHANGELOG.md`；涉及桥连接机制时同步 `docs/readme/bridge-connection-lifecycle.md`

## 易错坑（实测）

### 全局安装位置（AI 托管会话专属坑）

在 WorkBuddy / Cursor 等托管会话里直接 `npm i -g u32-local-server`，npm 解析到的是**该工具自带的 node 运行时**，prefix 形如
`C:\Users\<用户>\.workbuddy\binaries\node\versions\<版本>-<构建>\`。该路径不在用户持久化 PATH 里，后果：用户自己的终端、资源管理器、`schtasks` 计划任务一律 `u32-ls: command not found`；工具升级运行时后该目录里的全局包变孤儿。

**执行规则**：
- 显式指向用户真实 npm 全局目录：`"C:/Program Files/nodejs/npm.cmd" i -g u32-local-server`（落到 `%APPDATA%\npm`）
- 安装后两步自检：`npm config get prefix` 不得是工具私有路径；`%APPDATA%\npm\u32-ls.cmd` 必须存在
- 让用户**新开一个普通终端**跑 `u32-ls -v` 有输出才算可用
- 若 AI 会话已误装一份，确认用户那份可用后卸掉，不留双份

### WorkBuddy 会话进程回收陷阱

在 WorkBuddy 托管会话里 `npm start` / `u32-ls start` 拉起的服务进程，会在该轮命令结束后 40~70 秒静默消失（日志无 FATAL、PID 文件残留、端口消失，非崩溃，原因未定位）。

**硬性规则（2026-11-25 实测再次踩坑，用户已明确要求记住）**：
- **禁止在会话里直接启动或重启常驻服务**——不要用 `node src/index.js start/restart`、不要用后台任务起服务，哪怕只是"临时测试"
- **AI 默认自己用 Windows 一次性计划任务拉起**（`schtasks /create /sc once` + `/run`），父进程变 `svchost` 脱离会话树；用完 `/delete`
- **只有计划任务失败/受限时，才告知用户可以自行在普通终端跑**（给命令即可，不代劳）。不是一上来就把启动推给用户
- 不要反复重启排查；服务打不开先查是不是旧全局包/会话回收，不是代码问题

### 端口占用

端口 `19527` 被占用时**不要改项目配置**，报给用户处理。

## Windows 免 Node 包纪律（SEA + Inno Setup）

事实性内容见 README「免 Node 安装包」「发版流程」，此处只记 AI 必须遵守的坑。

**打包**
- 新增静态资源目录/文件必须同步 `scripts/build-sea.js` 的 `ASSET_DIRS`（或显式文件列表）；key 统一 POSIX 相对路径且与 `src/sea-assets.js` 的 `assetKey()` 对齐，否则 SEA 下 404 而 node 直跑正常（最难查的一类 bug）
- `src/picker/client/*.js` 是浏览器端 ES 模块，**禁止**进 Node bundle；`build-sea.js` 已排除 `src/picker/client`
- `postject` 的 `inject()` 真实签名是 `inject(filename, resourceName, resourceData, options)`。资源名是 `NODE_SEA_BLOB`，但 Windows 官方 node.exe 的 fuse 字节是 `NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`——`sentinelFuse` 必须传这个长 fuse 名，`inject` 才找得到并翻转标志位；写成 `NODE_SEA_BLOB` 或 postject 默认的 `POSTJECT_SENTINEL_*` 都会静默失败（exe 能生成但 SEA 不生效）
- SEA 不支持交叉编译，各平台包须在本平台构建；目前只有 Windows 包
- 重建 exe 前**先停托盘与服务进程**（`taskkill` u32-ls.exe + 结束跑 `tray.ps1` 的 powershell），否则 `EBUSY: resource busy or locked, copyfile ... node.exe`
- 本机 Inno Setup 装在 `.vtxf/tools/inno6/ISCC.exe`（`.vtxf/` 已 gitignore）；语言文件用英文名 `Default.isl`（`ChineseSimplified.isl` 本机发行版没有）

**托盘（Windows-only）**
- VBS `ws.Run` 的命令行必须**整体包一层引号**，内部每个双引号写成 `""`（`cmdLine.replace(/"/g, '""')`）；否则 `"exe" -arg` 被解析成字符串+裸标识符，报 `800A0401 语句未结束`
- VBS 路径反斜杠不是转义符，**禁止**用 `JSON.stringify` 拼路径（会双写 `\`）
- `scripts/tray.ps1` 由 `cmd-tray.js` 写 UTF-8 **BOM** 再交给 PowerShell 5.1；无 BOM 时中文注释按 ANSI 解码乱码、直接语法错误退出。VBS 启动器写 UTF-16LE + BOM
- node 直接 `spawn('powershell.exe')` 拉托盘在托管会话里会被静默回收；改用 `wscript.exe` 跑启动器 VBS（`register` 已验证此方式能常驻）
- 托盘进程靠 `~/.u32-local-server/runtime/tray.lock`（存 PID）互斥；`launch` 与安装 `[Run]` 都会触发 tray，必须幂等
- 「查看网页」只能 `Start-Process <url>`，**不得**调 `u32-ls open`——`cmd-open.js` 会自动启动服务，违背「没开服务就打不开」的约定

**安装器**
- 用 `{userpf}`（`%LOCALAPPDATA%\Programs`）+ `PrivilegesRequired=lowest`，不弹 UAC；**不写 PATH**（含 HKCU），入口只靠开始菜单快捷方式
- 快捷方式改名/合并后，旧 `.lnk` 不会自动消失，须在 `[InstallDelete]` 显式删除历史名称
- 单快捷方式指向 `launch`；`[Run]` 里 `register` + `launch` 分两行

## 发版纪律

- **tag 必须显式推到 github remote**：`git push github vX.Y.Z`。origin（codeup）只是镜像，**不触发 GitHub Actions**；tag 不上 GitHub 就没有自动打包、GitHub Release、npm publish、latest.yml 更新
- 发版全自动链路（tag 触发 `release.yml`）：Windows 安装包构建 → GitHub Release → `publish-npm` job 自动 `npm publish --provenance`（依赖仓库 secret `NPM_TOKEN`）→ latest.yml 提交回 main 触发 Pages 部署。本地无需打包、无需手动 publish
- **`NPM_TOKEN` secret 前置条件**（2026-11-21 引入 publish-npm 时确定，**尚未配置**）：npmjs.com → Access Tokens → 生成 **Automation** 类型 token → GitHub 仓库 `u32-cn/u32-local-server` → Settings → Secrets and variables → Actions → 新增 `NPM_TOKEN`。未配置时打 tag，`publish-npm` job 必失败（安装包发布不受影响）。AI 检测到 publish-npm 失败且日志报 token/认证错误时，先检查此项
- tag 与 `package.json` version 不一致会 fail；npm 包进 `files` 白名单改动属 `package.json` 变更，先征得同意

## 审批要求

- 修改、提交、发布（commit / push / npm publish / 打 tag）前先向用户说明方案，经同意后执行
- 删除文件、改 `.gitignore`、改 `package.json` 的 `files` 白名单，同样先征得同意
