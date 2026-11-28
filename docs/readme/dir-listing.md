# 目录清单规范 u32-dir-listing（`.u32-dir.json`）

> 统一的机器可读目录清单标准：动态 HTTP 服务现场生成、静态托管预生成实体文件，**双实现同格式**，消费方（AI、脚本、前端）只认一种结构，不关心对面是动态服务还是静态站。

## 当前状态

**已实现**：

- 动态端点：`GET /file/<目录>/.u32-dir.json`，服务端现场生成（纯内存，不落盘）
- 静态生成器：`u32-ls gen-dir-listing <dir> [--deep]`（见 [/docs/cli.md](cli.md)）
- `/file/<目录>/` HTML 列表页导航区有「清单 JSON」入口

格式变更须升 `version`。

## URL 约定

- 动态服务：`GET http://127.0.0.1:{{PORT}}/file/<目录路径>/.u32-dir.json`，服务端对目录现场 `readdir` 拼装返回，`Content-Type: application/json; charset=utf-8`
- 静态托管：目录下预生成同名实体文件 `.u32-dir.json`（如 GitHub Pages、OSS 静态站），纯静态可取
- 文件名以点开头，属约定产物，不与业务文件混用

## 格式

遵循 AI 工作仓库 `rules/general/json-file-format.md` 信封规范（magic / version / meta / data 四字段，缺一不可）。

```json
{
  "magic": "u32-dir-listing",
  "version": 1,
  "meta": {
    "author": "vtxf",
    "created": "2026-11-28T02:00:00Z",
    "updated": "2026-11-28T02:00:00Z",
    "generator": "u32-local-server@1.2.3",
    "title": "目录清单",
    "u32-origin": "dynamic"
  },
  "data": {
    "writable": false,
    "entries": [
      { "name": "notes", "type": "dir",  "sizeBytes": null, "mtime": "2026-11-20T08:00:00Z" },
      { "name": "a.txt", "type": "file", "sizeBytes": 1024, "mtime": "2026-11-27T12:30:00Z" }
    ]
  }
}
```

### 顶层（规范信封）

| 字段 | 值 |
|---|---|
| `magic` | 固定 `u32-dir-listing` |
| `version` | `data` 结构版本，当前 `1`；不兼容变更必须 +1 |
| `meta` | 通用信封层：`author`/`created`/`updated` 必填，`generator` 建议填（动态版 `u32-local-server@x.y.z`，静态版写生成器名+版本）；时间 UTC `Z` |
| `data` | 见下 |

### data v1 字段（固定存在，缺值写 `null`）

| 字段 | 类型 | 语义 |
|---|---|---|
| `writable` | boolean | 动态版：当前路径是否可写；静态版固定 `false` |
| `entries` | object[] | 条目数组，见下 |

> v1 **不含** `path`/`parent` 字段：静态实体文件会发布到公网，写入本机目录路径会泄露目录结构（且当前无消费方依赖）；清单对应哪个目录由获取 URL/实体文件所在目录自明。

### entries 条目

| 字段 | 类型 | 语义 |
|---|---|---|
| `name` | string | 文件/目录名（非全路径） |
| `type` | string | `dir` / `file` |
| `sizeBytes` | integer \| null | 字节数；目录固定 `null` |
| `mtime` | string \| null | 修改时间，ISO 8601 UTC `Z`；取不到时 `null`；**静态版为生成时刻快照，不保证实时** |

### 排序与过滤（version 1 语义约定）

- 排序：目录在前，同级按 `name` 的 `localeCompare(b, 'zh')` 升序
- 过滤：不过滤隐藏文件（`.git` 等照常列出）；stat 失败的条目（权限/悬空符号链接）跳过
- `origin: "static"`（见下）时整份 `entries` 是生成时刻快照

### 自定义 meta 字段 `u32-origin`

- 取值 `dynamic`（服务运行时生成）/ `static`（构建期预生成），缺省视为未知
- 消费方可据此决定是否信任 `mtime` 实时性
- 属 json-file-format 规范 meta 自定义字段（命名空间前缀 `<命名空间>-<字段名>`），语义由本页定义，通用规范只管命名与"未知即忽略"

## 权限（动态版）

- 请求 `<目录>/.u32-dir.json` 等价于读该目录，权限检查对象是**目录本身**（allow 允许列表命中即返回，未命中 403）；不因"看起来是个 json 文件"绕过 allow 模型
- 目录内若存在真实 `.u32-dir.json` 实体文件，**实体文件优先**（保证动态/静态所得一致）；实体文件 magic 或 version 不符时报错，**不得兜底重新生成**

## 读取契约

按 json-file-format.md 第八节执行，摘要：

1. JSON 解析失败 / 四字段缺失或类型错误 → 报错
2. `magic` 不为 `u32-dir-listing` → 视为非本类型文件，中止
3. `magic@version` 无解析器 → 报错（当前只支持 `u32-dir-listing@1`）
4. `meta` 未知字段（含其他命名空间自定义字段）忽略并继续；`data` 未知字段报错

## 与其他接口的关系

- `/picker/api/ls?path=...`：本地交互式浏览的 JSON API，保留不动；`u32-dir-listing` 面向跨环境（动态+静态）标准交换
- `/file/<目录>/`：人类可读 HTML 目录列表，保留不动

## 实现

### 动态端点

- `GET /file/<目录>/.u32-dir.json`：权限检查对象是目录本身（allow 命中即返回，未命中 403）；目录不存在 404、不是目录 400
- 实体文件优先：目录内有真实 `.u32-dir.json` 时校验 `magic@version` 后原样返回；非法（非 JSON / magic 不符 / 版本不支持）返回 **422**，错误信息含实际 magic@version，**不兜底重新生成**
- 无实体文件时现场生成（纯内存，不落盘）；错误响应统一 `{ ok: false, error }`
- 目录排序、条目结构同 [/picker](picker.md) 的 `ls` 行为：目录在前、`localeCompare(…, 'zh')`、stat 失败条目跳过

### 静态生成器

```
u32-ls gen-dir-listing <dir> [--deep] [--prune-if <文件名>]...
```

- 默认只为 `<dir>` 生成一份；`--deep` 递归子目录各生成一份（不可读目录跳过并在日志标注）
- `--prune-if <文件名>`（可重复传，任一命中即剪）：目录内存在指定边界文件时，该目录**整体跳过**——不生成其清单、不递归子目录，并顺带删除其自身与子目录下已生成的清单实体文件。生成器不认识任何业务文件名——哪个文件当边界由调用方策略决定（如 u32-earth 资源库用 `.u32-earth-assets.json`）
- `u32-origin: "static"`；覆写既有实体文件保留原 `created`、刷新 `updated`
- 输出 UTF-8 无 BOM、LF、缩进 2 空格；逐文件打印 `[OK] <路径> (<N> entries)`，结束打印汇总
