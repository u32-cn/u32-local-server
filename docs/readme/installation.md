# 安装（u32-local-server）

本文是安装的唯一权威文档。安装目标：把 `u32-local-server` 装成 npm 全局包（提供 `u32-ls` 命令）。

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

不需要装 Node，直接下载 `u32-local-server-setup-<版本>.exe` 双击安装。

- 安装内容：单文件 `u32-ls.exe`（Node SEA，自带运行时），默认装到 `%LOCALAPPDATA%\Programs\u32-local-server`（用户目录，不弹 UAC）
- **不写 PATH**。开始菜单**只有一个** `u32-local-server` 快捷方式，点击执行 `u32-ls launch`：启动服务 + 拉起托盘（两者幂等，重复点不会起第二份）
- 安装时调用 `u32-ls register` 注册开机自启与右键菜单（HKCU），并执行 `launch` 立即启动服务与托盘；旧版双快捷方式会被安装器自动清理；卸载时 `u32-ls unregister` 清理注册表
- 托盘图标右键菜单：**启动服务 / 停止服务 / 查看网页 / 退出**；左键双击 = 查看网页。「查看网页」只调默认浏览器打开首页，**不会启动服务**——服务没开就是打不开。「退出」结束托盘程序。
- 托盘图标按服务状态切换：**服务运行中=激活**（白底红字 `LS`），**未运行=置灰**（灰字 `LS`），每 1.5s 探测端口自动更新。源文件 `resources/ls.svg`，托盘用 `resources/ls.ico` / `resources/ls-gray.ico`（16/32px）
- 托盘为 **Windows-only**（PowerShell + .NET NotifyIcon，零第三方依赖）；Linux/macOS 用 `u32-ls start` + 浏览器
- 安装包约 24MB（exe 本体 84.8MB，Inno Setup LZMA2 压缩）；服务端功能与 npm 版完全一致
- 注意：exe 未做代码签名，首次运行 Windows SmartScreen 可能提示，选择「仍要运行」

> 维护者构建：`node scripts/build-icon.js` → `node scripts/build-sea.js` → `ISCC.exe scripts/installer.iss`。SEA 不支持交叉编译，各平台需在本平台构建；目前仅 Windows 安装包落地。
