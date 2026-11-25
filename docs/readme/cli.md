# 命令行（u32-ls / u32-local-server）

npm 全局安装后提供 `u32-ls`（别名 `u32-local-server`）命令。安装步骤与 npm 落点检查见 [installation.md](installation.md)。

> **AI 注意**：禁止直接编辑配置文件 `~/.u32-local-server/config/main.json` 或调用写配置的 HTTP 接口。需要新增访问规则时只能执行 `u32-ls access`（或引导用户打开 `/access-dialog`），由用户在授权对话框点「允许」后写入。

## 命令一览

| 命令 | 说明 |
|---|---|
| `u32-ls launch` | 启动服务 + 托盘图标（幂等；安装包唯一快捷方式入口。Linux/macOS 等同 `start`） |
| `u32-ls start` | 启动后台服务器（默认端口 19527，仅监听 127.0.0.1） |
| `u32-ls stop` | 停止 |
| `u32-ls restart` | 重启 |
| `u32-ls status` | 查看运行状态与 PID |
| `u32-ls logs -n 20 [-f] [--all] [--level debug]` | 查看日志（-f 跟踪） |
| `u32-ls url <path>` | 输出本地文件/目录的访问 URL |
| `u32-ls open [path]` | 浏览器打开首页或指定文件（无参开首页） |
| `u32-ls copy-url <path>` | 复制 URL 到剪贴板 |
| `u32-ls access [path]` | **访问规则唯一写入口（薄壳）**：用浏览器打开主服务授权对话框 `/access-dialog`（`path` 预填待授权目录），用户选目录、点「允许」即写入，即时生效。AI 只能引导打开对话框，禁止直接改配置，见 [access.md](access.md) |
| `u32-ls register` | 注册开机自启（Windows 另加右键菜单：在浏览器中打开/复制 URL） |
| `u32-ls unregister` | 取消注册 |
| `u32-ls tray` | 启动系统托盘图标（仅 Windows；右键菜单：启动/停止/查看网页/退出。图标按服务状态置灰/激活，查看网页只开浏览器不启动服务） |
| `u32-ls tray-stop` | 结束托盘进程（读 `tray.lock` 里的 PID 精确结束；安装器升级前自动调用） |
| `u32-ls update [--check] [-y]` | Windows 安装包自动升级：查 GitHub 最新 Release → 比对版本 → 下载 setup exe 到 `~/.u32-local-server/update/` → 拉起安装向导。`--check` 只查不装，`-y` 免确认。npm 版提示走 `npm i -g u32-local-server@latest` |
| `u32-ls clear-artifacts` | 清空浏览器桥临时产物目录（等效 `DELETE /bridge/api/artifacts`） |
| `u32-ls version` / `-v` | 版本号 |
| `u32-ls help` | 帮助（中英文对照） |

## 文件位置

- 配置：`~/.u32-local-server/config/main.json`
- 日志：`~/.u32-local-server/logs/server.log`
- PID：`~/.u32-local-server/server.pid`
- 托盘锁：`~/.u32-local-server/runtime/tray.lock`
- 升级安装包缓存：`~/.u32-local-server/update/`
- 桥临时产物：`~/.u32-local-server/tmp/bridge-artifacts/`（见 [bridge.md](bridge.md)）
