# 安装（u32-local-server）

本文是安装的唯一权威文档。安装目标：把 `u32-local-server` 装到本机（提供 `u32-ls` 命令）。

## 按系统选方案（先看这里）

- **Windows**：优先用免 Node 安装包，见下方 [免 Node 安装包（Windows）](#免-node-安装包windows)。自带运行时，双击即装，无需装 Node。
- **macOS / Linux**：**没有安装包**，只能用下方的 npm 安装（需 Node.js ≥ 18）。不要找 .dmg / .pkg / .deb / AppImage，本项目不出这些包。

## 前置

```bash
node -v && npm -v    # Node.js ≥ 18
```

未装则先装 LTS（`winget install OpenJS.NodeJS.LTS` 或官网 https://nodejs.org/ ），装完重开终端。

## 安装落点检查（不能跳）

装前先跑：

```bash
npm config get prefix
```

若输出落在 `...\.workbuddy\binaries\node\versions\...`、`...\AppData\Local\Programs\Cursor\...` 这类 **AI 工具私有路径**，说明你的 npm 属于该工具自带的 node 运行时：

- 该路径不在用户持久化 PATH 里（User/Machine PATH 均无，仅工具会话内临时注入），用户自己的终端、资源管理器、`schtasks` 计划任务一律 `u32-ls: command not found`
- 目录名带版本指纹，工具升级运行时即换目录，装的包变孤儿
- 与用户侧同名包版本分叉（两份绑不同 node），只升级一份就行为不一致

此时改用**显式指向用户真实 npm 全局目录**安装（Windows）：

```bash
"C:/Program Files/nodejs/npm.cmd" i -g u32-local-server    # 落到 %APPDATA%\npm
```

路径按实际 Node.js 安装目录调整；否则常规 `npm i -g u32-local-server` 即可。

## 安装自检

1. `%APPDATA%\npm\u32-ls.cmd` 存在（用户全局 bin 里有 shim）
2. **新开一个普通终端**（非 AI 会话）跑 `u32-ls -v`，有版本输出才算装好。不要只在 AI 会话里验证就下结论。

## 误装清理

若曾误装到 AI 工具私有运行时：确认用户侧那份可用后，卸掉工具私有那份（在该工具会话里 `npm un -g u32-local-server`），不留双份。

## 免 Node 安装包（Windows）

不需要装 Node，下载安装包双击安装（约 24MB，未签名，SmartScreen 提示选「仍要运行」）。

**下载（首选直链，国内稳定）：**

1. GET 版本元数据：<https://u32-local-server.u32.cn/data/win/latest.yml>，取 `version` 字段（形如 `1.8.0`）
2. 拼直链下载：`https://u32-local-server.u32.cn/download/win/u32-local-server-setup-<version>.exe`（CDN 边缘缓存回源 GitHub Releases；元数据里 `files[0].sha256` 可校验完整性）
3. **兜底**（直链不可用时）：<https://github.com/u32-cn/u32-local-server/releases/latest>（资产名 `u32-local-server-setup-<版本>.exe`）

**安装行为：**
- 安装内容：单文件 `u32-ls.exe`（Node SEA，自带运行时），默认装到 `%LOCALAPPDATA%\Programs\u32-local-server`（用户目录，不弹 UAC）
- **不写 PATH**。开始菜单**只有一个** `u32-local-server` 快捷方式，点击执行 `u32-ls launch`：启动服务 + 拉起托盘（两者幂等，重复点不会起第二份）
- 安装时调用 `u32-ls register` 注册开机自启与右键菜单（HKCU），并执行 `launch` 立即启动服务与托盘；旧版双快捷方式会被安装器自动清理；卸载时 `u32-ls unregister` 清理注册表
- 托盘图标右键菜单：**启动服务 / 停止服务 / 查看网页 / 退出**；左键双击 = 查看网页。「查看网页」只调默认浏览器打开首页，**不会启动服务**——服务没开就是打不开。「退出」结束托盘程序。
- 托盘图标按服务状态切换：**服务运行中=激活**（白底红字 `LS`），**未运行=置灰**（灰字 `LS`），每 1.5s 探测端口自动更新。源文件 `resources/ls.svg`，托盘用 `resources/ls.ico` / `resources/ls-gray.ico`（16/32px）
- 托盘为 **Windows-only**（PowerShell + .NET NotifyIcon，零第三方依赖）；Linux/macOS 用 `u32-ls start` + 浏览器
- 安装包约 24MB（exe 本体 84.8MB，Inno Setup LZMA2 压缩）；服务端功能与 npm 版完全一致
- 注意：exe 未做代码签名，首次运行 Windows SmartScreen 可能提示，选择「仍要运行」

> 维护者构建：`node scripts/build-icon.js` → `node scripts/build-sea.js` → `ISCC.exe scripts/installer.iss`。SEA 不支持交叉编译；本项目**只出 Windows 安装包**，macOS/Linux 不出包、用 npm 安装。

## 自动升级（Windows 安装包版）

已装用户升级不用再手动下安装包，两种入口等价：

- **控制台首页 → 运维 → 软件更新**：自动检测最新版并后台下载（启动 30s 后 + 每 6h），新版就绪后卡片提示「新版已就绪」，点「安装新版本」拉起安装向导，向导会先停服务与托盘再覆盖安装，配置与授权目录全部保留
- **命令行**：`u32-ls update`（查新版→自动下载缓存→询问是否立即安装；`--check` 只查；`-y` 免确认直接装）

机制细节：版本元数据实时查 GitHub API `releases/latest`；安装包下载到 `~/.u32-local-server/update/`（缓存**恒只保留一个最新版** exe，旧版与 .part 残片自动清理）；升级不影响配置——Inno Setup 覆盖安装不动 `~/.u32-local-server/` 下的用户数据。npm 版升级走 `npm i -g u32-local-server@latest`，不走这条链路。
