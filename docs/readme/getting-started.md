# 启动与上手（Getting Started）

本文覆盖首次启动、验证、AI 托管会话注意事项与首次使用流程。安装见 [installation.md](installation.md)。

> `{{PORT}}` 为占位符，按实际端口使用（未改动时默认 19527）。

## 启动

先判断执行环境，这是**分支不是补救**：

- **用户自己的终端在跑** → `u32-ls start`（默认端口 19527，仅监听 127.0.0.1；端口被占用时报告用户，不要改配置）
- **你在 WorkBuddy / Cursor 等 AI 托管会话里代用户执行** → **不要**执行 `u32-ls start`，直接走下面的计划任务方案

### ⚠️ AI 托管会话进程回收（实测）

在 WorkBuddy 托管会话里由 AI 执行 `u32-ls start` 拉起的进程，会在该轮命令结束后 **1~5 分钟内**消失：启动瞬间 curl 200 正常、日志无 FATAL 也无 shutdown、PID 文件残留（`status` 报 stale）。原因未定位，但可排除崩溃。**其他 AI 工具或终端未做验证，不要据此推断。** 别信固定秒数：曾记为 40~70 秒，2026-11-18 复测为「启动后 109 秒仍 HTTP 200、269 秒内已消失」，区间不稳定。

在 WorkBuddy 里需要服务长驻时：

- 让用户自己在终端跑 `u32-ls start`，或 `u32-ls register` 开机自启
- 由 AI 拉起则用 Windows 计划任务，父进程为 Task Scheduler，实测存活 5 分钟以上。**daemon 的 detached spawn 在该环境下同样被回收**（`u32-ls start` 本身就是 detached spawn），WMI `Win32_Process Create` 被该环境安全策略拦截

用 Windows 计划任务拉起（PowerShell；必须用 node 绝对路径——`u32-ls` 装在用户级 `%APPDATA%\npm`，计划任务的系统 PATH 找不到它，`schtasks /TR "u32-ls start"` 的写法在 PowerShell 里引号嵌套也会失败）：

```powershell
$exe = "C:\Program Files\nodejs\node.exe"   # 先 where node 确认真实路径
$js  = "$env:APPDATA\npm\node_modules\u32-local-server\src\index.js"
$act = New-ScheduledTaskAction -Execute $exe -Argument ('"' + $js + '" start')
$trg = New-ScheduledTaskTrigger -Once -At (Get-Date).AddYears(1)
$set = New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0 -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName u32-ls -Action $act -Trigger $trg -Settings $set -Force
Start-ScheduledTask -TaskName u32-ls
```

该触发器不跨重启，重启后重跑 `Start-ScheduledTask -TaskName u32-ls`，或改用 `-AtLogOn` / `u32-ls register`。计划任务 `State` 显示 `Ready` 属正常（`u32-ls start` 是 daemon 化，任务瞬间完成退出），判断依据是 `LastTaskResult=0` 且端口在监听。

## 验证（必须观察 ≥5 分钟再下结论）

实测 90 秒时 200 正常、5 分钟内进程可能已消失，只看启动瞬间不可靠：

- `u32-ls status` 为 Running
- `netstat` 有 `127.0.0.1:19527 LISTENING`（或实际配置端口）
- `curl http://127.0.0.1:{{PORT}}/llms.txt` 返回 200

## 首次使用：解除 403

访问 `/file/...` 返回 403 = 路径不在允许列表（**默认拒绝所有文件**，这是安全设计不是故障）。解决：

1. 打开 `/config` 配置页面
2. 「允许列表」→ 添加路径：`~/`（主目录）或 `/C:/imgs/` 等绝对路径，可设只读/读写
3. 保存，即时生效

详见 [file-access.md](file-access.md) 与 [config.md](config.md)。

## 30 秒上手

```bash
BASE=http://127.0.0.1:{{PORT}}

# 1. 读某个功能的完整文档（如浏览器桥）
curl $BASE/docs/bridge.md

# 2. 看有哪些在线浏览器桥 App
curl $BASE/bridge/api/apps

# 3. 代理任意 URL（绕过跨域）
curl $BASE/proxy/https://api.example.com/data
```

## 收尾提醒（AI 执行时）

把结果告诉用户。不要修改用户项目代码；失败时贴完整报错，不要擅自换替代方案。
