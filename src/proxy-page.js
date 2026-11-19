// CORS 代理页（/proxy/）：输入网址 → 生成代理地址，一键复制/访问
// 视觉基准与首页一致：public/css/base.css
const logger = require('./logger')
const PACKAGE_JSON = require('../package.json')

const GITHUB_URL = 'https://github.com/u32-cn/u32-local-server'

function renderPage(config) {
  const version = PACKAGE_JSON.version
  const addr = config && config.port ? '127.0.0.1:' + config.port : ''
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CORS 代理 - u32-local-server</title>
  <link rel="icon" type="image/svg+xml" href="../public/favicon.svg">
  <link rel="stylesheet" href="../public/css/base.css">
  <style>
    .row2 { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
    .row2:last-child { border-bottom: 0; }
    .row2 .k { width: 76px; flex-shrink: 0; font-size: 12.5px; color: var(--dim); }
    .row2 input[type="url"] {
      flex: 1; min-width: 240px; font-family: var(--mono); font-size: 12.5px;
      color: var(--ink); background: #fff; border: 1px solid var(--line-hi);
      border-radius: 8px; padding: 8px 11px; outline: none;
    }
    .row2 input[type="url"]:focus { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(37,99,235,.12); }
    .row2 .out {
      flex: 1; min-width: 240px; font-family: var(--mono); font-size: 12.5px; color: var(--dim);
      background: #F7F7F9; border: 1px solid var(--line); border-radius: 8px; padding: 8px 11px;
      word-break: break-all;
    }
    .row2 .btns { display: flex; gap: 8px; }
    .tips { padding: 14px 18px; font-size: 12.5px; color: var(--dim); line-height: 1.9; }
    .tips code { font-family: var(--mono); font-size: 11.5px; background: #F4F4F7; border-radius: 4px; padding: 1px 5px; }
    .tips ul { margin: 0; padding-left: 18px; }
    @media (max-width: 720px) { .row2 .k { width: 100%; } }
  </style>
</head>
<body>
<header class="topbar">
  <div class="wrap topbar-in">
    <div class="brand"><span class="dot ok"></span>u32-local-server<span class="ver">v${version}</span></div>
    <span class="addr">${addr}</span>
    <nav class="nav">
      <a href="../">首页</a>
      <a href="../status">状态</a>
      <a href="../config">配置</a>
      <span class="sep"></span>
      <a href="./docs" target="_blank" rel="noopener">文档 ↗</a>
    </nav>
  </div>
</header>

<main class="main wrap">
  <div class="h">CORS 代理<span class="right">绕过跨域限制，转发任意 HTTP/HTTPS 请求</span></div>

  <div class="card">
    <div class="row2">
      <span class="k">原网址</span>
      <input type="url" id="urlInput" placeholder="example.com 或 https://example.com" autofocus>
      <div class="btns">
        <button class="btn" id="copyOriginalBtn" disabled>复制</button>
        <button class="btn" id="openOriginalBtn" disabled>访问</button>
      </div>
    </div>
    <div class="row2">
      <span class="k">代理网址</span>
      <span class="out" id="proxyUrl">-</span>
      <div class="btns">
        <button class="btn" id="copyProxyBtn" disabled>复制</button>
        <button class="btn btn-primary" id="openProxyBtn" disabled>访问</button>
      </div>
    </div>
  </div>

  <div class="h">使用说明</div>
  <div class="card">
    <div class="tips">
      <ul>
        <li>输入网址时可省略 <code>http://</code> 或 <code>https://</code> 前缀，自动补全为 HTTPS</li>
        <li>代理会移除 <code>accept-encoding</code> 与 <code>x-frame-options</code> 头，并注入 CORS 头</li>
        <li>代理格式：<code><span id="proxy-format"></span>/proxy/https://example.com</code></li>
        <li>详见 <a href="./docs/cors-proxy.md" target="_blank" rel="noopener" style="color:var(--blue)">cors-proxy 文档</a></li>
      </ul>
    </div>
  </div>
</main>

<footer class="pagefoot">
  <div class="wrap in">
    <span>u32-local-server v${version} · MIT</span>
    <div class="links">
      <a href="./docs" target="_blank" rel="noopener">文档站</a>
      <a href="../llms.txt" target="_blank" rel="noopener">llms.txt</a>
      <a href="${GITHUB_URL}" target="_blank" rel="noopener">GitHub</a>
    </div>
  </div>
</footer>

<script>
    const urlInput = document.getElementById('urlInput')
    const proxyUrlDisplay = document.getElementById('proxyUrl')
    const copyOriginalBtn = document.getElementById('copyOriginalBtn')
    const copyProxyBtn = document.getElementById('copyProxyBtn')
    const openOriginalBtn = document.getElementById('openOriginalBtn')
    const openProxyBtn = document.getElementById('openProxyBtn')

    // 站点基址 = 当前访问地址去掉 /proxy/ 部分（经反向代理访问时自动带上代理前缀，如 https://example.com/ls）
    const siteBase = new URL('../', location.href).href.replace(/\\/$/, '')
    document.getElementById('proxy-format').textContent = siteBase

    function isValidUrl(string) {
      try {
        const url = new URL(string)
        return url.protocol === 'http:' || url.protocol === 'https:'
      } catch (_) {
        return false
      }
    }

    async function copyToClipboard(text) {
      try {
        await navigator.clipboard.writeText(text)
        return true
      } catch (err) {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        try {
          document.execCommand('copy')
          document.body.removeChild(textarea)
          return true
        } catch (e) {
          document.body.removeChild(textarea)
          return false
        }
      }
    }

    function normalizeUrl(input) {
      const trimmed = input.trim()
      if (!trimmed) return trimmed
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
      return 'https://' + trimmed
    }

    function updateProxyUrl() {
      const rawInput = urlInput.value.trim()
      const normalizedUrl = normalizeUrl(rawInput)

      if (!rawInput || !isValidUrl(normalizedUrl)) {
        proxyUrlDisplay.textContent = '-'
        copyOriginalBtn.disabled = true
        copyProxyBtn.disabled = true
        openOriginalBtn.disabled = true
        openProxyBtn.disabled = true
        return
      }

      proxyUrlDisplay.textContent = siteBase + '/proxy/' + normalizedUrl
      copyOriginalBtn.disabled = false
      copyProxyBtn.disabled = false
      openOriginalBtn.disabled = false
      openProxyBtn.disabled = false
    }

    urlInput.addEventListener('input', updateProxyUrl)

    copyOriginalBtn.addEventListener('click', async () => {
      const normalizedUrl = normalizeUrl(urlInput.value)
      if (normalizedUrl && isValidUrl(normalizedUrl)) {
        if (await copyToClipboard(normalizedUrl)) {
          const t = copyOriginalBtn.textContent
          copyOriginalBtn.textContent = '已复制'
          setTimeout(() => { copyOriginalBtn.textContent = t }, 1500)
        }
      }
    })

    copyProxyBtn.addEventListener('click', async () => {
      const normalizedUrl = normalizeUrl(urlInput.value)
      if (normalizedUrl && isValidUrl(normalizedUrl)) {
        if (await copyToClipboard(siteBase + '/proxy/' + normalizedUrl)) {
          const t = copyProxyBtn.textContent
          copyProxyBtn.textContent = '已复制'
          setTimeout(() => { copyProxyBtn.textContent = t }, 1500)
        }
      }
    })

    openOriginalBtn.addEventListener('click', () => {
      const normalizedUrl = normalizeUrl(urlInput.value)
      if (normalizedUrl && isValidUrl(normalizedUrl)) window.open(normalizedUrl, '_blank')
    })

    openProxyBtn.addEventListener('click', () => {
      const normalizedUrl = normalizeUrl(urlInput.value)
      if (normalizedUrl && isValidUrl(normalizedUrl)) window.open(siteBase + '/proxy/' + normalizedUrl, '_blank')
    })

    urlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const normalizedUrl = normalizeUrl(urlInput.value)
        if (normalizedUrl && isValidUrl(normalizedUrl)) {
          window.open(siteBase + '/proxy/' + normalizedUrl, '_blank')
        }
      }
    })
</script>
</body>
</html>`
}

function serve(req, res, config) {
  logger.debug(`[PROXY-PAGE] Serving proxy page\n`)
  const html = renderPage(config)
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'access-control-allow-headers': '*',
  })
  res.end(html)
}

module.exports = { serve }
