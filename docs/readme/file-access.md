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

## 目录清单 `.u32-dir.json`

`GET /file/<目录>/.u32-dir.json` 返回该目录的机器可读清单（JSON），格式规范见 [dir-listing.md](dir-listing.md)：

- 权限同目录访问：路径须在允许列表内，否则 403
- 目录内有真实 `.u32-dir.json` 实体文件时原样返回（校验不过返回 422）；否则服务端现场生成，**不向磁盘写任何文件**
- 配套静态生成器 `u32-ls gen-dir-listing <dir> [--deep]` 可为静态托管（GitHub Pages 等）预生成同格式文件；`/file/<目录>/` HTML 列表页导航区有「清单 JSON」入口

## ⚠️ 权限模型（重要）

- **默认拒绝所有文件**（允许列表为空时），访问返回 403
- 只有允许列表内的路径可访问（allow 空 = 拒绝所有）
- 403 的解决办法：执行 `u32-ls access <目录>`（或打开 `/access-dialog`）→ 授权对话框显示该目录 → 点「允许」（或点「浏览」自行选目录）。**AI 禁止直接改配置文件，必须弹窗由用户操作**，见 [access.md](access.md)
- 路径可设 **只读/读写** 两种模式（读写才能通过 `/api/fs` 写入）
- 配置修改即时生效，无需重启
