# 文件选择器（/picker）

Windows 10 文件对话框风格的网页文件/文件夹选择器，可嵌入宿主页面（iframe 或弹窗）。

## 在线引导页

打开 `http://127.0.0.1:{{PORT}}/picker-guide`：展示三种模式的最小接入配置脚本（弹窗打开 + postMessage 监听），每张卡片配「试用」按钮，点后弹窗打开对应模式的 /picker，选中结果以回传 JSON 直接显示在卡片下方，适合首次接入前快速理解协议。

## 在线演示

打开 `http://127.0.0.1:{{PORT}}/picker-demo`：可切换三种模式与各 URL 参数（mode/type/allowEmpty/chrome）、iframe/弹窗两种嵌入方式，实时展示拼出的 picker URL 与 postMessage 回传 JSON，页面底部附宿主集成最小代码。

## 打开方式

```
http://127.0.0.1:{{PORT}}/picker?mode=open-file
```

| URL 参数 | 取值 | 说明 |
|---|---|---|
| `mode` | `open-file`（默认）/ `open-dir` / `save-file` | 打开文件 / 选择文件夹 / 另存为 |
| `type` | 逗号分隔扩展名，如 `png,jpg,webp` | 预置文件类型过滤（含中文类型名下拉） |
| `allowEmpty` | `1` | open-dir 模式允许空选 |
| `chrome` | `0` | 隐藏标题栏与外框（嵌入 iframe 时用） |

## 三种模式行为

- `open-file`：选文件，双击或点主按钮回传
- `open-dir`：只允许选目录（文件灰显、文件名框只读显示当前目录名）
- `save-file`：输入文件名；校验非法字符；同名询问替换；**回传 overwrite 标记但不落盘**（写入由宿主调 `/api/fs` 完成）

## 回传协议（postMessage）

宿主用 iframe 嵌入（监听 `message`）或 `window.open` 弹窗（读 event 后窗口自动关闭）：

```js
{
  source: 'u32-picker',
  action: 'select' | 'cancel',
  mode: 'open-file' | 'open-dir' | 'save-file',
  overwrite: true,   // 仅 save-file 同名替换时出现
  selection: [{ name, type: 'file'|'directory', path, url }]
}
// path：服务器端 POSIX 绝对路径（如 /C:/imgs/a.png）
// url ：/file/ 直链
```

## 配套只读 JSON API

| 接口 | 说明 |
|---|---|
| `GET /picker/api/roots` | 允许列表根目录（含 `write` 标记） |
| `GET /picker/api/ls?path=<目录>` | 目录条目（name/type/typeLabel/size/mtime，目录在前）+ `parent`/`write`；路径经允许列表校验 |
| `GET /picker/api/stat?path=<路径>` | `{ exists, type, typeLabel, size, mtime }`，save-file 同名检测用 |

## 键盘与交互

- 单击选中、双击目录进入、双击文件回传/回填；右键菜单（新建文件夹、复制路径等）
- 键盘：`Esc` 取消、`Enter` 确认、`↑↓` 选择、`Backspace` 上级、`Ctrl+L` 聚焦地址栏、`F5` 刷新
- 侧栏：最近访问（localStorage，最多显示 5 条，超出滚动）+ 允许的目录（齿轮按钮打开 `/access-dialog` 授权对话框，授权关闭后自动刷新列表）
- 文件列表不按时间分组；默认隐藏 `.` 开头的隐藏项，「组织 → 显示隐藏的项目」可切换（localStorage 记忆）
