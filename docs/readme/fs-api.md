# 文件写入 API（POST /api/fs）

对允许列表内（且为**读写**模式）的路径执行文件写入操作。`stat` 为只读操作，只需可读。

## 调用方式

```bash
curl -X POST http://127.0.0.1:{{PORT}}/api/fs \
  -H "Content-Type: application/json" \
  -d '{"action":"write","path":"/C:/tmp/hello.txt","content":"aGVsbG8=","overwrite":true}'
```

`content` 一律为 **base64** 编码。`path` 用 POSIX 风格（`/C:/...` 或 `~/...` 或 Linux 绝对路径）。

## 操作一览

| action | 参数 | 说明 |
|---|---|---|
| `write` | `path`, `content`(base64), `overwrite`?, `mkdirs`? | 写文件（overwrite=true 覆盖已有；mkdirs=true 自动建父目录） |
| `append` | `path`, `content`(base64) | 追加到文件尾 |
| `mkdir` | `path`, `recursive`?(默认 true) | 建目录 |
| `delete` | `path` | 删除（递归，直接删除无回收站，谨慎） |
| `move` | `from`, `to`, `overwrite`? | 移动（跨盘自动 copy+delete） |
| `copy` | `from`, `to`, `overwrite`? | 复制 |
| `stat` | `path` | 查询 `{ exists, type: 'file'|'directory', size, mtime }` |

## 响应与错误码

信封：`{ ok: true, ... }` 或 `{ ok: false, error: "..." }`

| 码 | 含义 |
|---|---|
| 405 | 非 POST |
| 403 | 路径不在允许列表，或为只读模式 |
| 404 | 路径不存在 |
| 409 | 目标已存在且 overwrite=false |
| 400 | 参数错误 / JSON 非法 |
| 500 | IO 失败 |

## 安全

- 路径权限：允许列表，路径级 只读/读写（`/config` 页面可切换，即时生效）
- 同源 Origin 校验（浏览器跨站 POST 拒绝；curl/CLI 无 Origin 头放行）+ 仅监听 127.0.0.1
