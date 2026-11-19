# 浏览器桥（/bridge）

AI 与浏览器页面之间的透明转发层。页面注册后循环**长轮询**蹲守指令；AI 通过 HTTP 下发消息并**同步等待页面回包**。服务器只透传，业务语义完全由页面自定义。

## 接入须知：语义与限制（先读这个）

接入前必须知道的语义，设计协议时据此取舍：

| 语义 | 说明 | 接入方对策 |
|---|---|---|
| 消息**至多送达一次** | poll 响应交付后消息即出队，页面收到后崩溃则消息丢失 | AI 靠 504 感知失败，自行决定重试 |
| 无重入队 | 超时/交付后都不重入队（避免重复执行风险） | 指令设计为**幂等** |
| /send 超时（默认 30s → 504） | 超时后消息从队列移除，页面不会收到过期指令 | 页面耗时操作可在业务层做异步确认 |
| 全部状态在内存 | 服务器重启名册即清空 | 页面客户端自动重注册，无需人工干预 |
| 桥消息 1MB body 上限 | 大数据不能塞 JSON 回包 | 走「临时产物」HTTP 直传（见下文） |

连接如何维持、页面死亡如何判定、完整时序——机制解释见 [桥连接机制](bridge-connection-lifecycle.md)。

## 身份模型（权威定义）

| 标识 | 粒度 | 谁生成 | 生命周期 |
|---|---|---|---|
| `appId` | 一种 App 一个 | 页面侧定（代码常量） | 与 App 代码同生命周期 |
| `appInstanceId` | 一个页面实例一个 | **页面侧生成、必传** | **单次页面加载内固定**：加载时生成（UUID，内存持有），断线重连沿用同一 id；刷新=新页面=新实例，多开标签页各自独立 id |
| 消息 `id` | 一条指令一个 | 服务器生成 | 指令与回包的配对凭证 |

**多实例指代**：同一页面开多个标签页即多个实例。用户给短码时按「appInstanceId 前 2 字符」（不区分大小写）匹配：唯一命中才发指令；命中 0 条或多条时列出全部候选让用户重选，**禁止猜**。发指令始终用完整 appInstanceId。

`appInstanceId` 由页面生成、服务器不代生成的设计原因（防幽灵实例）与下线判定机制，见 [桥连接机制](bridge-connection-lifecycle.md) 第 2、6 节。

## AI 侧用法（三步）

```bash
BASE=http://127.0.0.1:{{PORT}}

# ① 有哪些 App 在线（读 help 学会用法）
curl $BASE/bridge/api/apps
# [ { "appId": "my-tool", "help": "图片压缩工具。指令: compress {url,quality} → {base64}", "instances": 1 } ]

# ② 在线实例列表，拿 appInstanceId
curl $BASE/bridge/api/pages
# [ { "appInstanceId": "0f8a…", "appId": "my-tool", "url": "…", "title": "…", "help": "…", "connectedAt": …, "lastSeen": … } ]

# ③ 发指令，挂起直至页面回包（timeoutMs 默认 30000，超时 → 504）
curl -X POST $BASE/bridge/api/send/0f8a… -H "Content-Type: application/json" \
  -d '{"type":"compress","payload":{"url":"…","quality":80},"timeoutMs":30000}'
# → { "id": "9c1e…", "payload": { "base64": "…" } }   成功
# → { "id": "9c1e…", "error": "…" }                    页面报错
# → 504 { ok:false, id, error:"reply timeout" }        页面无回包
# → 404 { ok:false, error:"unknown or offline appInstanceId" }  实例不在线
```

## 页面侧接入

```html
<script src="http://127.0.0.1:{{PORT}}/public/bridge-client.js"></script>
<script>
  U32Bridge.connect({
    appId: 'my-tool',            // 必传
    help: '图片压缩工具。指令: compress { url, quality } → { base64 }',  // 必传
    appInstanceId: 'fixed-id',   // 可选；不传则客户端自动生成 UUID（重连自动沿用同一 id）
    onMessage: async (msg) => {  // msg = { id, type, payload }
      if (msg.type === 'compress') {
        return { payload: { base64: '...' } }   // 成功回包
      }
      return { error: '未知指令: ' + msg.type }  // 失败回包
    }
  }).then(h => console.log('connected', h.appInstanceId))
</script>
```

`help` 是必传的协议自述：AI 经 `GET /bridge/api/apps` 读 help 即学会该 App 的指令用法。自研客户端（不走 bridge-client.js）按相同协议实现即可，机制细节见 [桥连接机制](bridge-connection-lifecycle.md)。

## HTTP 接口一览

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/bridge/api/register` | 页面注册，body `{ appId, help, appInstanceId, url?, title? }` → `{ appInstanceId }`（`appInstanceId` 页面侧生成、必传，缺失/非法 400）；同 id 重连按 upsert 覆盖旧状态 |
| GET | `/bridge/api/poll/<appInstanceId>` | 长轮询取消息，挂起至有消息或 25s 空心跳（`{ messages: [] }`），一次可带多条积压 |
| POST | `/bridge/api/reply` | 页面回包 `{ id, payload \| error }`，按消息 id 幂等（重复提交忽略返回 ok） |
| GET | `/bridge/api/apps` | 按 appId 聚合：`[{ appId, help, instances }]` |
| GET | `/bridge/api/pages` | 在线实例列表（含 `pendingMessages` 待下发积压数） |
| POST | `/bridge/api/send/<appInstanceId>` | AI 发消息并同步等回包；不支持按 appId 群发 |
| POST | `/bridge/api/artifact/<appInstanceId>` | 页面直传大产物（截图/导出），原始字节为 body，`?name=` 主题名（≤32 字符）；实例须在线；回 `{ ok, artifactId, bytes, path }`，`path` 为本地文件路径，交付口径即此路径 |
| GET | `/bridge/api/artifact/<artifactId>` | 按产物 id 下载文件流（兼容保留；AI 优先直接读上传回包给的 `path`） |
| GET | `/bridge/api/artifacts` | 产物统计 `{ count, bytes, dir }`（以磁盘为准，含手工放入的文件） |
| DELETE | `/bridge/api/artifacts` | 清空全部产物（含手工放入、不在册的文件） |
| POST | `/bridge/api/artifacts/open` | Windows 用资源管理器打开产物目录（其他平台返回 unsupported） |
| GET | `/bridge` | 浏览器桥状态页（只读观察页，每 3s 自动刷新：App/实例/在线状态/积压消息） |

错误码：实例不存在/已下线 → 404；回包超时 → 504；参数非法 → 400。

## 临时产物（bridge-artifacts）

用途：绕开桥消息 1MB body 上限——页面的大产物（截图/导出数据）走 HTTP 直传落盘，AI 拿本地文件路径直接读取，免 base64 塞 JSON。

```
页面截好图 → POST /bridge/api/artifact/<实例id>（原始字节）
           ← { artifactId, bytes, path }        服务器落盘
页面把 path 通过桥消息告诉 AI → AI 直接读 path 文件
```

- 存储位置：`~/.u32-local-server/tmp/bridge-artifacts/<YYYY>/<MM>/<YYYYMMDD-HHMMSS-<主题名>.<ext>>`，`tmp/` 整目录随时可删
- 生命周期：启动清空（会话级数据）+ 7 天 TTL 过期 + 总量 1GB LRU 驱逐 + 单个 64MB 上限（超限 413）；均可配 `bridge.artifact.{ttlMs,maxBytes,maxTotalBytes}`
- 首页「临时产物」卡片可看统计/清空/打开目录；CLI `u32-ls clear-artifacts` 等效清空
- 只有在册实例能上传；手工放进目录的文件统计可见、清空会删，但不会被 AI 消费
