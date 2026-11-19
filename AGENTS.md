# AGENTS.md — AI agent 行为纪律

本文件只写 AI 在此仓库执行任务时必须遵守的纪律与易错坑。**所有事实性内容（架构、路由、配置、命令、发版流程等）以 [README.md](README.md) 为准**，本文件不重复。

## 硬性禁令

1. **零依赖**：运行期禁止引入任何第三方 npm 包，只用 Node.js 内置模块。唯一例外是构建期 devDependency `postject`（SEA 注入 blob 用），它不进运行包；不得新增其他 npm 依赖
2. **跨平台**：所有改动必须兼容 Windows 与 Linux；路径统一 POSIX 风格（`/` 分隔符，Windows 盘符 `C:\path` → `/C:/path`）
3. **权限不变式**：`deny` 优先于 `allow`；`allow` 为空 = 拒绝所有。任何改动不得破坏该模型
4. **MIME 优先级**：配置 `file.mime` 覆盖内置默认值，不得反转
5. **敏感信息红线**：
   - `/status` 不采集任何敏感信息是既定设计（`process.env`、磁盘卷、主机名、用户名/uid/gid、家目录、网络接口 IP/MAC 一律不读取），改代码不得引入采集
   - 不提交含本机绝对路径、密钥、token 的文件（register 生成的脚本统一写入 `runtime/`，该目录已在 `.gitignore`，保持忽略）
6. **文档同步义务**：改功能时同步 `docs/readme/*.md`（唯一源，同时供 Pages 站点与 `/docs/<name>.md` 使用）、`docs/llms.txt`（`/llms.txt` 的唯一源，本地服务动态替换 `{{PORT}}`；Pages 站点原样发布，改过一次后就别再复制出别的副本）、`CHANGELOG.md`；涉及桥连接机制时同步 `docs/readme/bridge-connection-lifecycle.md`

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

在 WorkBuddy 托管会话里 `npm start` / `u32-ls start` 拉起的服务进程，会在该轮命令结束后 40~70 秒静默消失（日志无 FATAL、PID 文件残留、端口消失，非崩溃，原因未定位）。需常驻服务时：让用户自己启动，或用 Windows 计划任务拉起；不要反复重启排查。

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

## 审批要求

- 修改、提交、发布（commit / push / npm publish / 打 tag）前先向用户说明方案，经同意后执行
- 删除文件、改 `.gitignore`、改 `package.json` 的 `files` 白名单，同样先征得同意
