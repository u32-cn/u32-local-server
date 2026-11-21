# u32-local-server

本地 HTTP 文件服务器 + CORS 代理，纯 Node.js 零依赖。

文档站：<https://u32-local-server.u32.cn/>（站点主页即仓库 `docs/` 目录下的 `index.html`，`docs/` 就是站点根）

## 两个核心用途

### 一、让 Web 应用安全地使用本机文件

Web 端本来就能读写本地文件——File System Access API 已经能拿到目录句柄。麻烦在授权：句柄的权限不能跨会话保持，页面刷新、换个标签、第二天再打开，都要用户重新点一遍确认；想给同一个应用备好一组目录长期使用，普通网页做不到（持久授权目前只有已安装的 PWA 才申请得到）。于是每次用都要手动走一遍授权流程，这也正是很多 Web 应用最终放弃本地文件能力的原因。

u32-local-server 把这层授权移到服务端，一次配置、长期可用：

- **允许目录写一次**：配置里逐条声明路径，并标明**只读**还是**读写**；`deny` 列表优先于 `allow`
- **页面直接用**：页面通过 `/file/` 读、`/api/fs` 写，不再弹授权框，刷不刷新都一样
- **自带文件选择器**：`/picker` 提供 打开文件 / 选择文件夹 / 另存为 三种模式，嵌进 iframe 或弹窗即可，浏览范围受允许列表约束，不必自己再造一个目录浏览器

安全边界是确定的：只监听 `127.0.0.1`，不暴露公网；不在允许列表里的路径一律拒绝；写接口另带同源 Origin 校验，挡住跨站请求。

### 二、让 AI 工具直接操控你的 Web App

页面接入 `/bridge` 后向服务端注册，并声明一份 `help`——这个页面接受哪些指令、返回什么。AI 工具因此在 `/bridge/api/apps` 里发现它，POST 一条消息，同步拿到结构化回包。

- AI 不需要理解你的界面结构，也不需要截图、识别和模拟点击
- 服务器只做透明转发，指令的业务语义完全由页面自己定义
- 一条指令至多送达一次，超时 504 由 AI 侧自行重试；状态全在内存，重启即清空

**两个用途都要求 Web 端按协议改造**，不是装上就透明生效：文件服务要按 `/file/`、`/api/fs` 的参数与权限约定取数；桥要按 注册 → 长轮询 → 回包 的约定接入。改造本身很小，但省不掉。

## 功能特性

- 📁 **本地文件访问** - 通过 HTTP 访问本地文件系统，支持 Windows 盘符和 `~/`
- 🌐 **CORS 代理** - 绕过跨域限制，代理任意 HTTP/HTTPS 请求
- 🗂️ **文件选择器** - Windows 10 对话框风格的网页文件选择器，支持打开文件/选择文件夹/另存为，可嵌入宿主页面（iframe/弹窗）
- ✍️ **文件写入 API** - REST API 支持写入/追加/建目录/删除/移动/复制/查询（按路径的 只读/读写 权限控制）
- 🌉 **浏览器桥** - AI 与浏览器页面之间的长轮询透明转发层：页面注册后蹲守指令，AI 下发消息并同步等回包
- 🔐 **权限控制** - 允许列表/拒绝列表机制控制文件访问（路径可设 只读/读写），拒绝列表优先
- 🎨 **可视化配置** - Web 界面管理端口、允许列表/拒绝列表（只读/读写）、MIME 类型
- 🚀 **开机自启** - 注册为系统服务（Windows 注册表 Run 键 / Linux systemd）
- 📋 **右键菜单** - Windows 集成文件/文件夹右键菜单
- 🖥️ **免 Node 安装包（仅 Windows）** - 单文件 exe 自带 Node 运行时，约 24MB 安装包，双击安装、不写 PATH、无需装 Node；macOS/Linux 无安装包，用 npm 版
- 🔔 **系统托盘（Windows）** - 通知区域图标，按服务状态置灰/激活，右键启动/停止/查看网页/退出（查看网页不启动服务）
- 📺 **目录浏览** - 美观的目录列表页面
- 🔁 **反向代理友好** - 页面全部使用相对链接，可直接挂到 Nginx 子路径

## 快速开始

### 安装

**按系统选方案**：Windows 优先用下方的免 Node 安装包（双击即装、无需 Node）；macOS / Linux 没有安装包，用 npm 安装。

```bash
npm install -g u32-local-server
```

要求 Node.js >= 18。

> **注意确认 npm 属于你自己的环境**：`npm i -g` 必须落到你自己的 npm 全局目录。若在 AI 工具（WorkBuddy / Cursor 等）的托管终端里执行，`npm` 可能指向该工具自带的 node 运行时（prefix 形如 `C:\Users\<你>\.workbuddy\binaries\node\versions\<版本>-<构建>`），装在那里只有该工具会话能用，你自己的终端、资源管理器、计划任务都会 `u32-ls: command not found`。装前先跑 `npm config get prefix` 确认；落点不对就用系统 node 的 npm 显式安装：`"C:\Program Files\nodejs\npm.cmd" i -g u32-local-server`。

**Windows 免 Node 方案**：从 [GitHub Releases](https://github.com/u32-cn/u32-local-server/releases/latest) 下载 `u32-local-server-setup-<版本>.exe` 双击安装。exe 用 Node SEA 把源码与运行时打成单文件，自带 Node，目标机器无需装 Node。

- 装到 `%LOCALAPPDATA%\Programs\u32-local-server`（用户目录，`lowest` 权限，不弹 UAC）；**不写 PATH**
- 开始菜单**唯一** `u32-local-server` 快捷方式，点击执行 `u32-ls launch`：启动服务 + 拉起托盘（幂等，重复点不会起第二份）
- 安装时自动 `register`（HKCU 开机自启 + 右键菜单）并 `launch`；托盘图标按服务状态切换：运行中=红 LS、未运行=灰 LS，右键启动/停止/查看网页/退出，查看网页只开浏览器不启动服务
- 安装包约 24MB（exe 本体 ~85MB，Inno Setup LZMA2 压缩）；服务端功能与 npm 版完全一致
- exe 未签名，首次运行 SmartScreen 可能提示，选「仍要运行」
- 详见 [docs/readme/installation.md](docs/readme/installation.md)

### 启动服务器

```bash
# 启动服务器（后台运行）
u32-ls start

# 停止服务器
u32-ls stop

# 开发模式（前台运行，监听文件变化）
npm run dev
```

默认端口 `19527`，仅监听 `127.0.0.1`。启动后访问：

- 首页（控制台）：`http://localhost:19527/` —— 状态带 + 六宫格入口 + 系统集成注册状态 + 临时产物清理，一屏内完成，详见 [docs/readme/home.md](docs/readme/home.md)
- 运行状态：`http://localhost:19527/status` —— 进程/内存/请求指标，调试级字段默认折叠
- 配置页面：`http://localhost:19527/config`
- 文件选择器：`http://localhost:19527/picker`
- 选择器演示页：`http://localhost:19527/picker-demo`
- 浏览器桥状态：`http://localhost:19527/bridge`

## 使用场景

### 1. 访问本地文件

直接通过浏览器访问：

- Linux 用户目录：`http://localhost:19527/file/~/`
- Linux 绝对路径：`http://localhost:19527/file/home/user/file.txt`
- Windows 盘符：`http://localhost:19527/file/C:/Users/user/file.txt`

或者使用命令行工具：

```bash
# 获取文件/目录 URL
u32-ls url /path/to/file

# 在浏览器中打开
u32-ls open /path/to/file

# 复制 URL 到剪贴板
u32-ls copy-url /path/to/file
```

> 注意：默认配置 `file.access.allow` 为空，拒绝所有文件访问。需先在配置页面或配置文件中添加允许列表。

### 2. CORS 代理

用于绕过浏览器的跨域限制：

```javascript
// 原始 URL（可能有跨域问题）
fetch('https://api.example.com/data')

// 使用代理（无跨域问题）
fetch('http://localhost:19527/proxy/https://api.example.com/data')
```

代理特性：

- 删除 `accept-encoding` 头（返回未压缩内容）
- 删除 `x-frame-options` 头（允许 iframe 嵌入）
- 注入 CORS 头（允许跨域访问）
- 支持所有 HTTP 方法（GET/POST/PUT/DELETE/PATCH 等）

### 3. 文件选择器（Picker）

Windows 10 对话框风格的网页文件/文件夹选择器，支持**打开文件 / 选择文件夹 / 另存为**三种模式，浏览范围受允许列表限制：

```
http://localhost:19527/picker                     # 打开文件（默认）
http://localhost:19527/picker?mode=open-dir       # 选择文件夹
http://localhost:19527/picker?mode=save-file      # 另存为
http://localhost:19527/picker?type=*.jpg;%20*.png # 预置文件类型过滤
```

参数：`mode=open-file|open-dir|save-file`、`type=<过滤模式>`、`allowEmpty=1`（打开模式下允许文件名留空＝选当前文件夹，兼容旧行为）、`chrome=0`（隐藏内置标题栏，宿主自带窗框时用）。

界面与交互（Win10 度量）：

- 标题栏、后退/前进/向上、地址栏（面包屑 ↔ 可编辑切换，粘贴路径或 `Ctrl+L` 直达，反斜杠自动转正斜杠）、刷新、当前目录搜索框
- 工具条：组织▾（刷新/排序/新建文件夹）、新建文件夹、视图▾（详细信息 / 大图标）、帮助
- 列表：按修改日期分组（今天/昨天/本周早些时候/上周/更早，组头可折叠）、列头排序、滚动条 Win 风
- 侧栏：「最近访问」（localStorage，最多 10 条，失效条目点击后自动移除）＋「允许的目录」（齿轮按钮新标签打开 `/config`）
- 键盘：`Esc` 取消、`Enter` 主按钮、`↑↓` 选中、`Backspace` 向上、`Ctrl+L` 地址栏、`F5` 刷新
- 提示统一为自绘 Win 风格消息框/确认框，不使用 `alert/confirm`

模式差异：

| `?mode=` | 主按钮 | 列表 | 双击文件 | 文件名框 |
|---|---|---|---|---|
| `open-file` | 打开(O) | 文件可选 | 直接回传 | 可输入 |
| `open-dir` | 选择文件夹 | 仅目录可选，文件灰显 | 进入目录 | 只读显示当前目录名 |
| `save-file` | 保存(S) | 文件仅回填文件名 | 回填文件名 | 必填，校验非法字符，已存在则询问是否替换 |

**保存模式只回传目标路径与 `overwrite` 标记，不落盘**（写入由宿主调用 `/api/fs` 完成）。

选中结果经 `postMessage` 回传宿主（iframe 用 `parent`，弹窗用 `opener` 后自关）：

```json
{
  "source": "u32-picker",
  "action": "select",
  "mode": "open-file",
  "overwrite": false,
  "selection": [{ "name": "a.png", "type": "file", "path": "/C:/imgs/a.png", "url": "/file/C:/imgs/a.png" }]
}
```

`path` 为服务器端 POSIX 绝对路径；`url` 为 `/file/` 直链；`overwrite` 仅在 `mode=save-file` 时出现。无宿主窗口（直接打开页面）时，结果以消息框显示便于调试。

配套只读 JSON API：

- `GET /picker/api/roots` - 返回允许列表根目录（含 `write` 标记）
- `GET /picker/api/ls?path=<目录>` - 返回目录条目（name/type/typeLabel/size/mtime，目录在前）与 `parent`/`write`，路径经允许列表校验
- `GET /picker/api/stat?path=<路径>` - 返回 `exists`/`type`/`typeLabel`/`size`/`mtime`，供保存模式检测同名文件
- `GET /picker/style.css`、`/picker/icons.svg`、`/picker/client/*.js` - 页面静态资源（固定白名单）

### 4. 文件写入 API（/api/fs）

REST API 对允许列表内文件执行写入操作（写操作要求路径为**读写**模式，`stat` 只需可读；`/config` 页面可切换模式，即时生效无需重启）：

```bash
curl -X POST http://localhost:19527/api/fs \
  -H "Content-Type: application/json" \
  -d '{"action":"write","path":"/C:/tmp/hello.txt","content":"aGVsbG8=","overwrite":true}'
```

| action | 参数 | 说明 |
|---|---|---|
| `write` | `path`, `content`(base64), `overwrite`, `mkdirs` | 写文件 |
| `append` | `path`, `content`(base64) | 追加 |
| `mkdir` | `path`, `recursive`(默认 true) | 建目录 |
| `delete` | `path` | 删除（递归，无回收站） |
| `move` | `from`, `to`, `overwrite` | 移动（跨盘自动 copy+delete） |
| `copy` | `from`, `to`, `overwrite` | 复制 |
| `stat` | `path` | 查询文件信息 |

响应信封：`{ ok, ...|error }`。

错误码：405 非 POST / 403 路径不在允许列表或为只读 / 404 不存在 / 409 目标已存在且 overwrite=false / 400 参数错误 / 500 IO 失败。

**安全两层**：① 路径权限（`isAllowed`/`isWritable`，拒绝列表优先，路径级 只读/读写）；② 同源 Origin 校验防 CSRF + 仅监听 127.0.0.1。

### 5. 浏览器桥（/bridge）

AI 与浏览器页面之间的透明转发层：页面注册后循环长轮询蹲守指令，AI 通过 HTTP 下发消息并同步等回包。服务器只透传，消息业务语义完全由页面自定义。

**第一步：页面侧接入** —— 引入客户端脚本，`onMessage` 里写自己的业务（返回值自动作为回包）。身份模型：`appId`（一种 App 一个）+ `appInstanceId`（一个页面实例一个，页面侧生成、必传，缺省客户端自动生成 UUID）：

```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>桥接页面</title></head>
<body>
<script src="http://127.0.0.1:19527/public/bridge-client.js"></script>
<script>
  U32Bridge.connect({
    appId: 'my-tool',        // 必传：App 种类标识
    help: '图片压缩工具。指令: compress { url, quality } → { base64 }',  // 必传：给 AI 看的功能与协议说明
    // appInstanceId: 'fixed-id',  // 可选：缺省客户端自动生成 UUID（重连自动沿用同一 id）
    onMessage: async (msg) => {          // msg = { id, type, payload }
      if (msg.type === 'compress') {
        /* 业务处理 msg.payload */
        return { payload: { base64: '...' } }   // 成功回包
      }
      return { error: '未知指令: ' + msg.type }            // 失败回包
    }
  }).then(h => console.log('已连接', h.appInstanceId))
</script>
</body>
</html>
```

把上面的 HTML 保存为 `demo.html` 并在浏览器打开（或嵌入你已有的页面），页面即自动注册并蹲守 AI 指令。

**第二步：AI 侧操作** —— 先看有哪些 App（读各自的 `help` 学会用法），挑一个实例发指令：

```bash
# 有哪些 App 在线，各有多少实例，help 是什么
$ curl http://127.0.0.1:19527/bridge/api/apps
[ { "appId": "my-tool", "help": "图片压缩工具。指令: compress …", "instances": 1 } ]

# 在线实例列表，拿到 appInstanceId
$ curl http://127.0.0.1:19527/bridge/api/pages
[ { "appInstanceId": "0f8a…", "appId": "my-tool", "url": "…/demo.html", "title": "桥接页面", "help": "…", … } ]

# 向该实例发消息，挂起直至页面回包（或 30s 超时 → 504）
$ curl -X POST http://127.0.0.1:19527/bridge/api/send/0f8a… \
    -H "Content-Type: application/json" \
    -d '{"type":"compress","payload":{"url":"…","quality":80}}'
{ "id": "9c1e…", "payload": { "base64": "…" } }
```

页面接口明细：

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/bridge/api/register` | 页面注册，body `{ appId, help, appInstanceId, url?, title? }` → `{ appInstanceId }`（`appInstanceId` 页面侧生成、必传，缺失/非法 400）；同 id 重连按 upsert 覆盖旧状态 |
| GET | `/bridge/api/poll/<appInstanceId>` | 长轮询取消息，挂起至有消息或 25s 空心跳 |
| POST | `/bridge/api/reply` | 页面回包 `{ id, payload \| error }`，按消息 id 幂等 |
| GET | `/bridge/api/apps` | AI 查在线 App（按 appId 聚合，含 help 与实例数） |
| GET | `/bridge/api/pages` | AI 查在线实例列表 |
| POST | `/bridge/api/send/<appInstanceId>` | AI 发消息并同步等回包，`timeoutMs` 默认 30000 |

错误码：appInstanceId 不存在/已下线 → 404；回包超时 → 504；参数非法 → 400。消息至多送达一次（页面崩溃丢消息靠 504 感知，AI 自行重试）。全部状态在内存，服务器重启即清空。

### 6. 反向代理（Nginx）

v1.2.0 起页面内全部使用相对链接，可直接挂到 Nginx 子路径下，无需额外配置：

```nginx
# 子路径转发（挂在大站下）：proxy_pass 结尾带 /，剥掉 /ls 前缀
location /ls/ {
    proxy_pass http://127.0.0.1:19527/;
}

# 根路径转发（独立域名/端口）同样支持
location / {
    proxy_pass http://127.0.0.1:19527;
}
```

访问 `https://example.com/ls/` 即可，页面内导航、目录浏览、静态资源、配置页均自动适配代理前缀。

## 配置

### 配置文件

位置：`~/.u32-local-server/config/main.json`

首次启动自动创建，默认配置：

```json
{
  "port": 19527,
  "file": {
    "access": {
      "allow": [],
      "deny": []
    },
    "mime": {}
  },
  "proxy": {}
}
```

- `file.access.allow`: 允许列表，条目为 `{ path, write }`（`write=true` 读写，`false` 只读；空=拒绝所有）
- `file.access.deny`: 拒绝列表，字符串路径前缀（优先级更高）
- `file.mime`: 自定义 MIME 类型（覆盖内置默认值）
- 配置中的 `~/` 自动解析为用户主目录
- 旧格式（allow 为字符串数组、`file.write.enabled` 开关）加载时自动迁移：字符串条目转为 `{ path, write: true }`，`file.write` 字段删除

### 权限模型

- `allow`: 允许列表，允许访问的路径前缀，每条可设 只读/读写
- `deny`: 拒绝列表，拒绝访问的路径前缀
- **优先级**: `deny` > `allow`（拒绝列表优先）
- `allow` 为空时，拒绝访问所有文件
- 读文件（含 `/file/`、`/picker`、`stat`）只需可读；写操作（`/api/fs` 的 write/append/mkdir/delete/move/copy）要求路径为读写模式
- 路径支持 `~/` 表示用户主目录

示例：

```json
{
  "file": {
    "access": {
      "allow": [
        { "path": "~/", "write": true },
        { "path": "/mnt/data", "write": false }
      ],
      "deny": ["~/敏感文件夹", "/etc"]
    }
  }
}
```

### 配置页面

访问 `http://localhost:19527/config` 可视化管理：

- 修改端口号
- 添加/删除访问规则
- 切换允许路径的 只读/读写 模式（即时生效）
- 自定义 MIME 类型

## 命令参考

| 命令 | 说明 |
|---|---|
| `u32-ls launch` | 启动服务 + 托盘图标（幂等；安装包快捷方式入口。Linux/macOS 等同 `start`）|
| `u32-ls start` | 启动后台服务器 |
| `u32-ls stop` | 停止服务器 |
| `u32-ls restart` | 重启服务器 |
| `u32-ls status` | 查看服务器状态 |
| `u32-ls logs [-f]` | 查看服务器日志 |
| `u32-ls url <path>` | 获取文件 URL |
| `u32-ls open <path>` | 在浏览器中打开 |
| `u32-ls copy-url <path>` | 复制 URL 到剪贴板 |
| `u32-ls register` | 注册开机自启 + 右键菜单 |
| `u32-ls unregister` | 取消注册 |
| `u32-ls tray` | 启动 Windows 系统托盘图标（仅 Windows；按服务状态置灰/激活）|
| `u32-ls clear-artifacts` | 清空浏览器桥临时产物（不经 init，独立完成清空并汇报） |
| `u32-ls version` | 显示版本号 |
| `u32-ls --help` | 显示帮助信息 |

## 系统集成

### Windows

运行 `u32-ls register` 后：

- **开机自启**: 注册到注册表 `Run` 键
- **文件右键菜单**:
  - 「在浏览器中打开」- 直接在浏览器打开文件
  - 「复制 URL」- 复制文件的访问 URL
- **文件夹右键菜单**:
  - 「在浏览器中打开」- 在浏览器浏览文件夹
  - 「复制 URL」- 复制文件夹的访问 URL
- **文件夹背景右键**:
  - 「在浏览器中打开当前目录」- 快速打开当前文件夹

**系统托盘**（免 Node 安装包）：通知区域常驻图标，运行中=红 LS / 未运行=灰 LS（每 1.5s 探测端口自动切换）。右键菜单：启动服务 / 停止服务 / 查看网页 / 退出；左键双击 = 查看网页。「查看网页」只调默认浏览器打开首页，不会启动服务。

### Linux

运行 `u32-ls register` 后：

- **systemd 服务**: 创建用户级服务（需要 sudo）
- **开机自启**: 用户登录时自动启动服务

## 路由表

| 路由 | 功能 |
|---|---|
| `/proxy/<url>` | CORS 代理（删除 accept-encoding / x-frame-options，注入 CORS 头）|
| `/file/<path>` | 文件访问（Windows 盘符/`~/` 支持）|
| `/picker` | 文件选择器页面（`?mode=open-file|open-dir|save-file`、`?type=` 预置过滤）|
| `/picker-demo` | 选择器演示页（模式/参数切换、iframe/弹窗两种嵌入、回传结果实时展示）|
| `/picker/api/roots`、`/picker/api/ls`、`/picker/api/stat` | 选择器只读 JSON API |
| `/picker/style.css`、`/picker/icons.svg`、`/picker/client/*.js` | 选择器页面静态资源（固定白名单）|
| `/api/fs` | 文件写入 API（POST，按路径 只读/读写 权限）|
| `/bridge/api/*` | 浏览器桥 API（register/poll/reply/pages/send，长轮询）|
| `/public/bridge-client.js` | 浏览器桥页面客户端脚本 |
| `/api/service` | 服务注册 API |
| `/config` | 配置管理页面 |
| `/config/api` | 配置 REST API |
| `/llms.txt` | 站点说明（面向 LLM） |
| `/docs` | 重定向到 `/docs/index.html`（文档站首页，离线可看）|
| `/docs/index.html`、`/docs/reader.html` | 文档站页面（固定白名单，读包内 `docs/`）|
| `/docs/assets/...` | 文档站静态资源（css/js/字体/marked vendor）|
| `/docs/readme/<name>.md` | 功能文档（阅读页 fetch 目标，与 Pages 站点同路径同文件）|
| `/docs/<name>.md` | 功能文档旧直链（兼容保留，读包内 `docs/readme/`）|
| `/public/...` | 静态资源 |
| `/` | 首页；Linux 下其他路径直接映射到文件系统 |

## 安全模型

- 仅监听 `127.0.0.1`，不暴露到外网
- 所有文件访问（含 picker API）经 `isAllowed` 允许列表校验，拒绝列表优先
- 写接口（`/config/api`、`/api/fs`、`/api/service`、`/bridge/api/*` POST）有同源 Origin 校验，阻断跨站 CSRF
- 文件写入要求路径为读写模式（允许列表条目 `write: true`）

## 技术架构

- **纯 Node.js** - 运行期零依赖，无第三方包，只用内置模块（构建期唯一 devDependency 是 `postject`，仅用于 SEA 注入，不进运行包）
- **HTTP 服务器** - 原生 `http` 模块
- **路径处理** - 统一 POSIX 路径，自动识别 Windows 盘符和 `~/`
- **MIME 类型** - 内置 60+ 文件类型（文本/图片/视频/音频/文档/压缩包/3D 模型/字体）
- **跨平台** - Windows（taskkill/VBS/注册表）与 Linux（信号/systemd）双支持
- **免 Node 打包** - Node SEA（单可执行应用）+ Inno Setup LZMA2 安装包，仅 Windows；托盘用系统自带 PowerShell + .NET NotifyIcon + wscript，无第三方运行时

## 开发

### 源码运行

```bash
git clone <repo>
cd u32-local-server

# 开发模式（监听文件变化）
npm run dev

# 手动启动
node src/index.js start
```

要求 Node.js >= 18，零依赖（`package.json` 无 `dependencies`，只用内置模块），无构建、无 lint 步骤。

### 测试

浏览器桥全链路测试（先启动服务器，再跑测试；空心跳用例需等 25s，整体约 100s）：

```bash
npm start                 # 先启动服务器
node test/bridge.test.js  # 默认打 http://127.0.0.1:19527，可传自定义 baseUrl
```

覆盖：注册→send→poll→reply 全链路、error 回包、reply 幂等、/send 超时 504、404/400、upsert 重连、/apps 聚合。

### 架构

```
src/index.js          # 入口：命令分发（launch/start/stop/restart/status/logs/url/open/copy-url/
                      #       register/unregister/tray/clear-artifacts/version/help）+ startServer()
src/router.js         # 服务器路由分发；POST 写接口同源 Origin 校验防 CSRF；请求指标钩子
src/config.js         # 配置读写（~/.u32-local-server/config/main.json），旧格式自动迁移
src/permission.js     # 权限校验：isAllowed / isWritable，deny 优先于 allow，allow 空=拒绝所有
src/posix-path.js     # 路径转换：Windows C:\path → /C:/path，统一 POSIX 分隔符
src/file-server.js    # /file/ 文件服务 + 目录列表 HTML + 60+ MIME 类型
src/proxy.js          # /proxy/ CORS 代理（删 accept-encoding / x-frame-options，注入 CORS 头）
src/config-page.js    # /config 配置页面 + /config/api REST API
src/home-page.js      # / 首页
src/status-page.js    # /status 运行状态页（SSR）+ /status/api JSON
src/sysinfo.js        # /status 数据采集（不读任何敏感信息；maskPath 家目录脱敏）
src/bridge-status.js  # /bridge 桥状态观察页
src/fs-api.js         # /api/fs 文件写入 API（write/append/mkdir/delete/move/copy/stat）
src/bridge.js         # 浏览器桥长轮询转发层（register/poll/reply/apps/pages/send）
src/artifacts.js      # 桥临时产物服务（7 天 TTL + 1GB LRU + 单文件 64MB）
src/picker.js         # 选择器入口（仅委托）→ src/picker/ 目录：
                      #   api.js 只读 JSON API / page.js HTML 骨架 / assets.js 静态资源白名单
                      #   style.css Win10 配色 / icons.svg 图标雪碧图 / client/*.js 前端逻辑
src/daemon.js         # start/stop/restart/status/logs 守护进程管理
                      #   Windows: taskkill + VBS；Linux: spawn + PID 文件
src/sea-assets.js     # 资源读取抽象：SEA 模式走 sea.getAsset，node 直跑走磁盘
src/cmd-launch.js     # launch：启动服务 + 托盘（均幂等），安装包快捷方式入口
src/cmd-tray.js       # tray：释放嵌入的 ps1/双 ICO 到 runtime，经 wscript 拉起托盘
src/file-logger.js    # 文件日志 + 2MB 轮转（保留 10 个历史文件）
src/logger.js         # 双输出日志（控制台 + 文件）
src/tail-util.js      # tail -f 实现
src/cmd-service.js    # register/unregister：注册表 Run 键自启 + 右键菜单 + 动态生成 VBS
scripts/build-sea.js  # SEA 打包：bundle 源码 + 嵌入静态资源 → dist/u32-ls.exe
scripts/build-icon.js # 零依赖从点阵生成 ls.ico（红/激活）与 ls-gray.ico（灰/未运行）
scripts/installer.iss # Inno Setup：产出 u32-local-server-setup-<版本>.exe
scripts/tray.ps1      # Windows 托盘助手（PowerShell NotifyIcon，端口探测切图标）
resources/            # ls.svg 源图 + ls.ico / ls-gray.ico 两态托盘图标
```

### 启动 / 停止流程

启动：`u32-ls start` → daemon.js spawn 子进程（同入口、不带命令参数）→ 子进程落到 `startServer()`：加载配置 → 创建 HTTP 服务器 → 注册路由 → 监听端口 → listen 成功回调中写 PID 文件（PID 文件唯一写入者）。

`u32-ls launch`（安装包快捷方式入口）= 探 PID 文件，服务未运行则走上述 start 流程；Windows 再经 `cmd-tray.js` 用 wscript 拉起 `tray.ps1`。托盘写 `runtime/tray.lock` 记录自身 PID，`launch` 与安装 `[Run]` 重复触发时幂等跳过。托盘每 1.5s TCP 探测端口切图标；菜单「查看网页」直接开浏览器不碰服务，「退出」结束托盘进程。

停止：`u32-ls stop` → 读 PID 文件 → Windows `taskkill /PID xxx /T /F` / Linux `process.kill(pid, SIGTERM)` → 删 PID 文件。

日志位于 `~/.u32-local-server/logs/server.log`，单文件 2MB 轮转、保留 10 个历史文件。

### 发版流程

1. `package.json` 与 `package-lock.json` 的 `version` 同步升级
2. `CHANGELOG.md` 顶部新增 `[X.Y.Z] - 日期` 段，按 Added / Changed / Fixed / Docs 分类
3. 提交 `chore(release): vX.Y.Z——<改动摘要>`
4. 打 tag `vX.Y.Z` 并推送
5. **npm publish（自动）**：同一 tag 触发 `publish-npm` job（`release.yml` 第二个 job），安装包发布成功后自动 `npm publish --provenance` 到 npmjs.org；依赖仓库 secret `NPM_TOKEN`（npmjs Access Tokens 生成 Automation 类型 token 后配到 GitHub 仓库 Secrets，一次性配置）。`files` 白名单含 `src/`、`public/`、`docs/readme/`、`docs/llms.txt`、`docs/index.html`、`docs/reader.html`、`docs/assets/`、`package.json`、`README.md`、`CHANGELOG.md`；`test/`、`LICENSE` 不进 npm 包
6. **Windows 免 Node 包 + npm 发布（自动）**：推送 tag 即自动构建并发布——`.github/workflows/release.yml` 在 `windows-latest` runner 上跑 icon/SEA/Inno 全链路（tag 与 `package.json` version 不一致会 fail；Release notes 取 CHANGELOG 对应版本段），产物挂 `https://github.com/u32-cn/u32-local-server/releases/latest`；随后 `publish-npm` job 自动发布 npm 包。**务必 `git push github vX.Y.Z` 把 tag 推到 GitHub（origin 是 codeup 镜像，不触发 Actions），本地无需打包也无需手动 publish**；手动打包/发布流程保留备用：`node scripts/build-icon.js` → `node scripts/build-sea.js`（产出 `dist/u32-ls.exe`）→ `ISCC.exe scripts/installer.iss` / `npm publish`。SEA 不支持交叉编译；**仅提供 Windows 免 Node 包；Linux/macOS 不出安装包，用 npm 安装（Node.js ≥ 18）**

### 相关文档

- **`docs/` 是文档站主页**：仓库 `docs/` 目录就是 GitHub Pages 站点根，`docs/index.html` 即站点首页（<https://u32-local-server.u32.cn/>），GitHub Pages 出站、EdgeOne 回源加速；**本地服务同样伺服这批文件**（`/docs`、`/docs/index.html`、`/docs/reader.html`、`/docs/assets/...`），离线环境下访问 `http://127.0.0.1:<port>/docs` 即可看到完整排版文档
- `docs/reader.html?doc=<id>` - 站内 markdown 阅读页，`?doc=` 取 `docs/readme/` 下的文件名（不含 `.md`）；Pages 与本地服务同路径可用（本地 fetch 目标 `/docs/readme/<id>.md` 由 `src/router.js` 映射到包内目录）
- `docs/readme/*.md` - **文档唯一源**：既是 Pages 站点的正文，也是 npm 包内 `/docs/<name>.md` 的伺服内容（`src/router.js` 按文件名映射到该目录），改一处两边生效
- `docs/llms.txt` - 面向 LLM 的功能索引，指向上述 `/docs/*.md`；**唯一源**：本地服务 `/llms.txt` 动态替换其中 `{{PORT}}` 后返回，Pages 站点原样发布（含占位符与默认端口说明）
- `AGENTS.md` - AI agent 行为纪律（事实性内容以本 README 为准）

## 许可证

MIT，见 [LICENSE](LICENSE)。
