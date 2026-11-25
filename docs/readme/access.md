# 访问规则授权（/access-dialog）

**新增**允许规则的唯一写入口是主服务内的授权对话框 `/access-dialog`：用户选目录、点「允许」后写入配置。**删除**允许规则在 `/config` 页直接操作（收紧权限，无需弹窗）。

## AI 行为约束

> **禁止直接编辑 `~/.u32-local-server/config/main.json`，禁止直接调用 `/access-dialog/api/grant`（无 token 必 403）。需要新增访问规则时，只能引导用户打开 `http://127.0.0.1:<port>/access-dialog`（或执行 `u32-ls access [path]`），由用户点「允许」后才会写入。**

`/config/api` 的 `add` / `remove` / `setAllowWrite` 已移除（返回 `410 Gone` + 引导）；删除请调用 `removeAllow`。403 路径错误同样给出引导。

## 入口

| 入口 | 方式 |
|---|---|
| `/config` 页 | 允许列表下方「添加目录」按钮 → 弹窗打开对话框，关闭后自动刷新列表 |
| 文件选择器 `/picker` | 侧栏「允许的目录」旁齿轮按钮 → 弹窗打开对话框 |
| 终端 | `u32-ls access [path]` —— 薄壳命令，仅用浏览器打开对话框（`path` 预填待授权目录），**不再起任何临时服务** |
| 外部宿主 | 给用户一个链接 `http://127.0.0.1:<port>/access-dialog?path=<posix 路径>`，用户点击后浏览器打开确认。URL 里只允许 `path`，**不得拼接任何 token** |

主服务未启动时以上入口均不可用（授权是为服务服务的）。

## 对话框操作

- **待授权文件夹**：显示 `?path=` 预填路径（或「未选择」，点「浏览文件夹…」选）；预填路径不存在时自动回退到最近存在的上级并提示
- 只读 / 读写单选（默认只读）
- **允许**：写入允许列表并提示成功；**取消**：关闭窗口不写入
- **浏览文件夹…**：页面内居中模态框（同源 iframe），地址栏 / 后退 / 前进 / 上级，选中后 postMessage 回传——可浏览任意目录（不受 allow 列表限制，授权页正是要给未授权目录授权）

## 安全模型

| 防线 | 挡什么 |
|---|---|
| token 服务端生成、只内嵌对话框 HTML（无单独领 token 接口、URL 不带 token） | CSRF：外部网页发得出请求但拿不到凭证 |
| 写请求必须带 `X-Access-Token` 自定义头（跨域发不出） | 同上，双保险 |
| token 单次消耗 + 10 分钟过期 | 凭证泄露后攻击窗口极小 |
| `X-Frame-Options: DENY` + `CSP: frame-ancestors 'self'` | 外部网站 iframe 嵌入（clickjacking）；只能弹窗/直接打开，地址栏 127.0.0.1 可见 |
| 全局 Host 校验 + 写接口 Origin 校验（router 层） | DNS rebinding、跨站 POST |
| 仅本机可访问（沿用全局策略） | 局域网其他机器 |

人工确认不变式保持：写入只发生在用户看到待授权路径并点「允许」那一刻。

## 删除允许规则

在 `http://127.0.0.1:<port>/config` 页允许列表点「删除」即删、即时生效。API：`POST /config/api { "action": "removeAllow", "path": "<posix 路径>" }`。删除是收紧权限，不需用户弹窗授权。

## 拒绝列表（deny）已移除

deny 列表功能已整体删除：`/config` 页不再展示、配置迁移时自动丢弃存量 `deny` 条目、权限模型简化为「allow 命中即放行（读写须 `write=true`），allow 空 = 拒绝所有」。

## 与其他入口的关系

- `/config` 页：允许列表可删除、不可新增；MIME 与端口可改
- 首页 / 文件选择器里「403 去加允许列表」的提示，引导用户执行 `u32-ls access` 或打开 `/access-dialog`
- 配置文件结构：`file.access.deny` 字段不再存在，见 [config.md](config.md)
