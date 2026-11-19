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
