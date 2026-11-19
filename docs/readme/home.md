# 首页 /

服务启动后打开的第一个页面。定位是**控制台**而不是介绍页：一屏之内看清「现在什么状态」和「能点什么」，产品介绍统一放在文档站 `https://u32-local-server.u32.cn/`。

## 页面结构

固定四层，1440×900 下不需要滚动：

1. **顶栏**：服务状态点、版本号、监听地址、页面导航（首页 / 状态 / 配置 / 文档站）
2. **状态带**：运行时长、允许路径数、桥在线实例、临时产物占用
3. **六宫格入口**：文件访问 `/file/`、文件选择器 `/picker`、CORS 代理 `/proxy/`、浏览器桥 `/bridge`、运行状态 `/status`、配置 `/config`。每格可点进页面，右上角「复制」复制该页面的完整 URL
4. **运维行**：
   - 系统集成 —— 开机自启、右键菜单的**真实注册状态**，以及注册 / 取消注册按钮
   - 临时产物 —— 当前占用、清理策略、打开目录、清空全部
5. **折叠区**（默认收起）：接入 AI（`llms.txt` 地址 + 6 条场景指令）、常用命令（4 条，完整列表在 `/docs/cli.md`）

## 条件提示条

只在需要动手时出现，不需要时整条不渲染：

| 条件 | 提示 |
| --- | --- |
| 允许列表为空 | 红色：所有文件访问都会被拒绝，点「去配置」 |
| 开机自启未注册 | 橙色：系统重启后服务不会自动拉起，点「立即注册」 |

## 数据来源

- 首屏由服务端 SSR 内联一次快照，**不闪白**
- 之后前端每 5 秒拉 `GET /api/summary`，只做定点文本替换，不重绘 DOM——`<details>` 折叠状态、选中文本、滚动位置都不受影响
- 运行时长每秒本地自增，每次拉取用服务端 `uptimeSec` 校正，避免长时间开着页面后偏差累积

## 接口

### GET /api/summary

首页状态带的数据源，与 SSR 首屏同一份计算。只含计数与布尔，不含路径、主机名、用户名。

```json
{
  "ok": true,
  "generatedAt": 1795069279765,
  "port": 19527,
  "pid": 20796,
  "uptimeSec": 6,
  "allowCount": 3,
  "denyCount": 0,
  "bridge": { "apps": 0, "instances": 0 },
  "artifacts": { "count": 0, "bytes": 0 },
  "services": { "platform": "win32", "autostart": true, "contextMenu": true, "degraded": false }
}
```

### GET /api/service-status

服务注册状态（只读探测）。

```json
{ "ok": true, "platform": "win32", "autostart": true, "contextMenu": true, "degraded": false }
```

`degraded: true` 表示探测本身失败（Windows 下 `reg.exe` 不可用或被安全策略拦截），此时页面按「未注册」展示。

### POST /api/service

```json
{ "action": "register" }
```

由**当前 node 运行时**直接拉起本包入口执行（`process.execPath` + `src/index.js`），不依赖 `u32-ls` 是否在 `PATH` 里。

返回 `{ "ok": true, "accepted": true }` 只代表子进程已拉起，**不代表已生效**。页面点击后会轮询 `GET /api/service-status`（每 1.5 秒，最多 8 次）确认真实结果；未达预期会明确显示「注册未生效」，不会出现「点了就显示已注册」的假成功。

Linux 下写 `/etc/systemd/system` 需要 root，接口返回：

```json
{ "ok": false, "error": "requires-root", "hint": "sudo u32-ls register" }
```

页面据此提示用户到终端执行，而不是空等。

## 注册状态怎么探测

| 平台 | 开机自启 | 右键菜单 |
| --- | --- | --- |
| Windows | `reg query HKCU\Software\Microsoft\Windows\CurrentVersion\Run` 中是否存在 `U32LocalServer` 值 | `reg query HKCU\Software\Classes\*\shell\U32Open` 是否成功 |
| Linux | `/etc/systemd/system/u32-local-server.service` 是否存在 | 不支持，恒为 false |

- 结果缓存 1.5 秒：每次探测都要 fork `reg.exe`，5 秒一次轮询不能每次都拉进程
- 只查询，绝不写入注册表；不读环境变量、用户名、家目录（沿用 `/status` 的脱敏红线）

## 视觉基准

三页（首页 / 状态 / 配置）共用 `public/css/base.css` 的 token 与组件：浅灰底 `#F6F6F8`、白卡 + 14px 圆角、1px `#E8E8EC` 边框、单一强调色 `#2563EB`、状态色仅用于绿/琥珀/红标签。页面专属样式留在各自页面的 `<style>` 里，跨页复用的才进 `base.css`。
