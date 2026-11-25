# 配置管理（/config）

Web 界面查看配置、管理 MIME 与端口；配置文件位于 `~/.u32-local-server/config/main.json`。

## 访问规则只能经弹窗修改

**允许列表 / 拒绝列表在 `/config` 页为只读。**

> AI 行为约束：禁止直接编辑 `~/.u32-local-server/config/main.json`，禁止调用任何写配置的 HTTP 接口。需要增删访问规则时，必须执行 `u32-ls access` 打开浏览器确认页，由用户操作后才会写入。

`/config/api` 的 `add` / `remove` / `setAllowWrite` 已移除（返回 410 Gone + 引导）。**新增**访问规则的唯一写入口是 [u32-ls access](access.md) 弹窗，由用户浏览选中文件夹并点「允许」后落盘，立即生效无需重启。**删除允许规则**在本页点「删除」或调用 `POST /config/api {action:'removeAllow', path}` 即删（收紧权限，无需弹窗授权）；拒绝列表删除仍禁止（410，放宽权限）。

## 页面操作

- **允许列表**：展示路径与 只读/读写 模式，可点「访问」快捷浏览、「删除」直接移除；**新增**点列表下方「添加目录」按钮（拉起 `u32-ls access` 授权窗口，由用户选目录并确认），也可在终端执行 `u32-ls access`
- **拒绝列表**：只读展示，优先级高于允许列表；增删走 `u32-ls access`（删除禁止）
- **MIME Types**：自定义扩展名 → Content-Type 映射，覆盖内置默认
- **端口**：修改监听端口（需重启生效）
- **重启服务**：页面顶栏按钮，重启后自动跳转新端口配置页
- **停止服务**：页面顶栏按钮（红色），确认后停止服务——页面由服务本身提供，停止后即无法访问；重启方式：托盘菜单、开始菜单/桌面快捷方式、终端 `u32-ls start`

## 配置文件结构

```json
{
  "port": 19527,
  "trustedHosts": [],                    // 反向代理/自定义域名场景的 Host 允许列表
  "file": {
    "access": {
      "allow": [ { "path": "~/", "write": true } ],   // write=false 只读
      "deny": []
    },
    "mime": { "dat": "application/octet-stream" }
  }
}
```

- 允许列表为空 → 拒绝所有文件访问（默认）
- 拒绝列表优先于允许列表
- 配置中 `~/` 自动解析为用户主目录
- 旧格式（allow 字符串条目、`file.write` 开关）自动迁移

## REST API（POST /config/api）

| action | 参数 | 说明 |
|---|---|---|
| `add` / `remove` / `setAllowWrite` | — | **已移除**，返回 410 Gone + 引导（新增改用 `u32-ls access`，删除改用 `removeAllow`） |
| `removeAllow` | path | 删除允许列表条目（收紧权限，直接删、即时生效） |
| `launchAccess` | — | 拉起 `u32-ls access` 授权窗口（不写配置；写入由用户在弹窗里点「允许」完成） |
| `resolvePath` | 路径 | **已移除**，返回 410 Gone |
| `addMime` / `removeMime` | 扩展名, type | 自定义 MIME |
| `setPort` | port | 修改端口 |
| `restart` | port | 重启服务（保存端口后触发） |
| `stop` | — | 停止服务（先应答再自我终止） |

安全：Host 白名单（防 DNS rebinding）+ 同源 Origin 校验（防跨站 CSRF）。重启/停止通过绝对路径 spawn 自身运行时执行 daemon 命令，不依赖 PATH。
