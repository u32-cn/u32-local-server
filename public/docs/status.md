# 运行状态（/status）

只读观察页，展示服务器进程与宿主机的实时状态；同一份数据以 JSON 提供在 `/status/api`。

## 页面 /status

顶栏常驻：运行指示点、PID、运行时长、监听地址、CPU 使用率、RSS；右侧可切自动刷新间隔（2s / 5s / 10s / 暂停）或手动刷新。运行时长由前端每秒本地自增，不受轮询间隔影响。

区块：

| 区块 | 内容 |
|---|---|
| 服务与进程 | 名称/版本、当前 PID、父进程 PID、入口脚本、Node 二进制、argv0、包根目录、工作目录、启动参数、execArgv、是否 TTY、进程启动时间、已运行时长 |
| HTTP 服务与文件 | 监听状态与真实地址（`server.address()`）、地址族、配置端口、PID 文件及其中的值（是否与当前进程一致）、配置文件路径/大小/最后修改、日志文件路径/大小/最后写入 |
| 运行时与 Node | node 版本、release、platform、arch、locale、时区与 UTC 偏移、V8 堆上限与可用堆、可执行文件 |
| 操作系统 | 类型/内核版本/架构、登录 shell、CPU 型号/主频/逻辑核/并行度、系统负载（Windows 无此值）、物理内存总量/空闲/使用率、系统运行时长 |
| 进程资源 | CPU 使用率（2s 采样，多线程下可 >100%，含义为"占单核百分比"）、RSS/heap/external/ArrayBuffers、堆使用率、历史峰值 RSS、累计 CPU 时间、缺页次数、磁盘读写操作次数、上下文切换、信号次数 |
| 浏览器桥 | App 数、在线实例、挂起轮询、挂起发送、积压消息 |
| 请求指标 | 请求总数、进行中、4xx/5xx 总数，以及按方法/状态段/路由前缀分布、活跃资源类型、最近 20 条请求（时间/方法/路径/状态/耗时） |
| 依赖组件版本 | `process.versions` 全量 |

交互：点击任意值即复制；表格区可横向/纵向滚动。

## JSON /status/api

`GET`，`Cache-Control: no-store`，带 `access-control-allow-origin: *`。

```jsonc
{
  "ok": true,
  "generatedAt": 1763460000000,   // 本次采集时间戳（ms）
  "startedAt": 1763200000000,     // 进程启动时间戳（ms）
  "uptimeSec": 260000,            // 运行时长（秒）
  "flat": { "app.pid": "24812", "proc.rssBytes": "182.4 MB", "...": "已格式化字符串" },
  "tables": { "tbl-recent": [["2026-11-18 18:44:30", "GET", "/status/api", "200", "1.2 ms"]] },
  "raw": { "app": {}, "server": {}, "runtime": {}, "os": {}, "proc": {}, "ifaces": [], "metrics": {}, "bridge": {} }
}
```

- `raw` 是未格式化的原始值，数值字段自带单位后缀：`Bytes` / `Sec` / `Ms` / `Usec` / `Percent` / `At` / `Count` / `Mhz`
- `flat` 是页面上看到的那份格式化文本，`tables` 是动态表格的当前行
- 不采集环境变量与磁盘卷容量：前者含密钥风险，后者无运维价值

典型用途（判断服务健康）：

```bash
BASE=http://127.0.0.1:19527
curl -s $BASE/status/api | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.raw.app.pid, j.uptimeSec+'s', j.flat['proc.rssBytes'], j.flat['proc.cpuPercent'])})"
```

## 指标口径

- 计数在 `router.js` 入口一处挂钩，`res` 的 `finish`/`close` 时结算状态码与耗时
- **不含 `/status` 与 `/status/api` 自身请求**，避免观察行为污染指标
- 计数为进程内内存值，重启归零

## 安全

- 页面与接口只由 `127.0.0.1` 上的服务提供，沿用全局 Host 白名单（防 DNS rebinding）
- **不采集任何敏感信息**：环境变量、磁盘卷容量、主机名、用户名、uid/gid、家目录、网络接口（IP/掩码/MAC）一律不读取、不输出
- 输出中的所有路径都经 `maskPath()` 处理，家目录前缀替换为 `~`（如 `~/.u32-local-server/config/main.json`）；最近请求列表里的路径同样脱敏
- 程序自身路径（入口脚本/包根目录/工作目录）按设计保留，用于排查部署问题
