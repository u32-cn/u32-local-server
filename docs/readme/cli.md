# 命令行（u32-ls / u32-local-server）

npm 全局安装后提供 `u32-ls`（别名 `u32-local-server`）命令。安装步骤与 npm 落点检查见 [installation.md](installation.md)。

## 命令一览

| 命令 | 说明 |
|---|---|
| `u32-ls start` | 启动后台服务器（默认端口 19527，仅监听 127.0.0.1） |
| `u32-ls stop` | 停止 |
| `u32-ls restart` | 重启 |
| `u32-ls status` | 查看运行状态与 PID |
| `u32-ls logs -n 20 [-f] [--all] [--level debug]` | 查看日志（-f 跟踪） |
| `u32-ls url <path>` | 输出本地文件/目录的访问 URL |
| `u32-ls open [path]` | 浏览器打开首页或指定文件（无参开首页） |
| `u32-ls copy-url <path>` | 复制 URL 到剪贴板 |
| `u32-ls register` | 注册开机自启（Windows 另加右键菜单：在浏览器中打开/复制 URL） |
| `u32-ls unregister` | 取消注册 |
| `u32-ls clear-artifacts` | 清空浏览器桥临时产物目录（等效 `DELETE /bridge/api/artifacts`） |
| `u32-ls version` / `-v` | 版本号 |
| `u32-ls help` | 帮助（中英文对照） |

## 文件位置

- 配置：`~/.u32-local-server/config/main.json`
- 日志：`~/.u32-local-server/logs/server.log`
- PID：`~/.u32-local-server/server.pid`
- 桥临时产物：`~/.u32-local-server/tmp/bridge-artifacts/`（见 [bridge.md](bridge.md)）
