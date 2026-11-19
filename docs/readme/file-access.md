# 本地文件访问（/file/）

通过 HTTP 访问本地文件系统。URL 相对于服务地址（本机默认 `http://127.0.0.1:{{PORT}}`）。

## URL 格式

```bash
# ~ 代表用户主目录（推荐写法）
GET /file/~/Documents/report.pdf
#   → 展开为 /home/<user>/Documents/report.pdf 或 C:/Users/<user>/Documents/report.pdf

# Windows 盘符绝对路径
GET /file/C:/Users/user/file.txt

# Linux 绝对路径
GET /etc/hosts
```

## 行为

- 文件 → 按扩展名返回对应 `Content-Type`（内置 60+ MIME，含文本/图片/视频/音频/文档/压缩包/3D 模型/字体；配置 `file.mime` 可覆盖）
- 目录 → 返回美观的目录列表 HTML（可继续点击浏览）
- Range 请求支持（视频/音频可拖动进度）

## ⚠️ 权限模型（重要）

- **默认拒绝所有文件**（允许列表为空时），访问返回 403
- 只有允许列表内的路径可访问；拒绝列表优先于允许列表
- 403 的解决办法：打开 `/config` 配置页面 →「允许列表」→ 添加路径（如 `~/` 或 `C:/imgs/`）→ 保存
- 路径可设 **只读/读写** 两种模式（读写才能通过 `/api/fs` 写入）
- 配置修改即时生效，无需重启
