# AGENTS.md — AI agent 行为纪律

本文件只写 AI 在此仓库执行任务时必须遵守的纪律与易错坑。**所有事实性内容（架构、路由、配置、命令、发版流程等）以 [README.md](README.md) 为准**，本文件不重复。

## 硬性禁令

1. **零依赖**：禁止引入任何第三方 npm 包，只用 Node.js 内置模块
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

## 审批要求

- 修改、提交、发布（commit / push / npm publish / 打 tag）前先向用户说明方案，经同意后执行
- 删除文件、改 `.gitignore`、改 `package.json` 的 `files` 白名单，同样先征得同意
