# CORS 代理（/proxy/）

绕过浏览器跨域限制，代理任意 HTTP/HTTPS 请求。代理地址 = 服务地址 + `/proxy/` + 目标 URL。

```javascript
// 原始请求（可能被 CORS 阻止）
fetch('https://api.example.com/data')

// 走代理（本机默认 http://127.0.0.1:{{PORT}}）
fetch('http://127.0.0.1:{{PORT}}/proxy/https://api.example.com/data')
```

## 特性

- 注入 CORS 头（`access-control-allow-origin: *` 等），浏览器可直接 fetch
- 删除 `x-frame-options` / `content-security-policy` 头 → 目标页面可被 iframe 嵌入
- 删除 `accept-encoding` 头 → 返回未压缩原文（便于处理）
- 支持所有 HTTP 方法（GET/POST/PUT/DELETE/PATCH…），body 原样转发
- 页面本身：`GET /proxy/` 有使用说明页

## 典型用途

- 前端页面请求第三方 API（无 CORS 头）被浏览器拦截
- iframe 嵌入第三方页面（被 X-Frame-Options 拒绝）
- 抓取网页内容做文本分析

## 注意

- 仅监听 127.0.0.1，代理不对公网暴露
- 目标 URL 必须带协议（`https://` 或 `http://`）
