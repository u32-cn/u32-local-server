# 配置管理（/config）

Web 界面管理服务器配置；也可直接编辑配置文件 `~/.u32-local-server/config/main.json`（页面改动即时落盘并生效，无需重启）。

## 页面操作

- **允许列表**：每条可切换 只读/读写（读写才能经 `/api/fs` 写入）；添加路径支持 `~/`、`C:/path/`、Linux 绝对路径
- **拒绝列表**：优先于允许列表，命中即拒绝
- **MIME Types**：自定义扩展名 → Content-Type 映射，覆盖内置默认
- **端口**：修改监听端口（需重启生效）

## 配置文件结构

```json
{
  "port": 19527,
  "trustedHosts": [],                    // 反向代理/自定义域名场景的 Host 允许列表
  "file.access.allow": [ { "path": "~/", "write": true } ],   // write=false 只读
  "file.access.deny": [],
  "file.mime": { "dat": "application/octet-stream" }
}
```

- 允许列表为空 → 拒绝所有文件访问（默认）
- 拒绝列表优先于允许列表
- 配置中 `~/` 自动解析为用户主目录
- 旧格式（allow 字符串条目、`file.write` 开关）自动迁移

## REST API（POST /config/api）

| action | 参数 | 说明 |
|---|---|---|
| `add` / `remove` | 路径条目 | 增删允许/拒绝列表条目 |
| `setAllowWrite` | 路径, write | 切换条目 只读/读写，即时生效 |
| `addMime` / `removeMime` | 扩展名, type | 自定义 MIME |
| `setPort` | port | 修改端口 |

安全：Host 白名单（防 DNS rebinding）+ 同源 Origin 校验（防跨站 CSRF）。
