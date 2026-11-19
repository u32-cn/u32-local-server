const logger = require('./logger')
const { escapeHtml } = require('./utils')

function renderPage(config) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Proxy Tool - u32-local-server</title>
  <link rel="stylesheet" href="../public/css/space-grotesk.css">
  <link rel="stylesheet" href="../public/css/all.min.css">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #FFFFFF;
      color: #000000;
      line-height: 1.5;
      font-size: 14px;
    }

    .container {
      max-width: 1000px;
      margin: 0 auto;
      padding: 40px 20px;
    }

    .header {
      border-bottom: 2px solid #000000;
      padding-bottom: 20px;
      margin-bottom: 40px;
    }

    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .logo {
      font-size: 32px;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 5px;
    }

    .tagline {
      font-size: 13px;
      color: #666;
      font-weight: 400;
    }

    .home-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border: 1px solid #000000;
      background: #FFFFFF;
      color: #000000;
      font-family: 'Space Grotesk', sans-serif;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      text-decoration: none;
    }

    .home-btn:hover {
      background: #000000;
      color: #FFFFFF;
    }

    .section {
      margin-bottom: 40px;
    }

    .section-title {
      font-size: 16px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 1px solid #E5E5E5;
    }

    .url-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 20px;
    }

    .url-label {
      font-size: 14px;
      font-weight: 700;
      min-width: 80px;
    }

    .url-input-wrapper {
      flex: 1;
      display: flex;
      gap: 0;
    }

    .url-input {
      flex: 1;
      padding: 12px;
      border: 1px solid #000000;
      border-right: none;
      font-family: 'Space Grotesk', monospace;
      font-size: 14px;
      background: #FAFAFA;
    }

    .url-input:focus {
      outline: none;
      background: #FFFFFF;
    }

    .url-display {
      flex: 1;
      padding: 12px;
      border: 1px solid #E5E5E5;
      font-family: 'Space Grotesk', monospace;
      font-size: 13px;
      background: #FFFFFF;
      color: #333;
      word-break: break-all;
    }

    .icon-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 12px 16px;
      border: 1px solid #000000;
      background: #FFFFFF;
      color: #000000;
      font-family: 'Space Grotesk', sans-serif;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
    }

    .icon-btn:hover {
      background: #000000;
      color: #FFFFFF;
    }

    .icon-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .icon-btn:disabled:hover {
      background: #FFFFFF;
      color: #000000;
    }

    .help-text {
      margin-top: 20px;
      padding: 15px;
      background: #F5F5F5;
      border-left: 3px solid #000000;
      font-size: 13px;
      line-height: 1.6;
      color: #555;
    }

    .help-text code {
      font-family: 'Space Grotesk', monospace;
      background: #FFFFFF;
      padding: 2px 6px;
      font-size: 12px;
      border: 1px solid #E5E5E5;
    }

    @media (max-width: 768px) {
      .url-row {
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
      }

      .url-label {
        min-width: auto;
      }

      .url-input-wrapper {
        width: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <div class="header-content">
        <div>
          <div class="logo">CORS Proxy Tool</div>
          <div class="tagline">绕过跨域限制，访问任意网址</div>
        </div>
        <a href="../" class="home-btn"><i class="fas fa-home"></i> 首页</a>
      </div>
    </header>

    <div class="section">
      <div class="section-title">输入网址</div>

      <div class="url-row">
        <div class="url-label">原网址</div>
        <div class="url-input-wrapper">
          <input 
            type="url" 
            id="urlInput" 
            class="url-input" 
            placeholder="example.com 或 https://example.com"
            autofocus
          >
          <button class="icon-btn" id="copyOriginalBtn" disabled title="复制">
            <i class="fas fa-copy"></i> 复制
          </button>
          <button class="icon-btn" id="openOriginalBtn" disabled title="访问">
            <i class="fas fa-external-link-alt"></i> 访问
          </button>
        </div>
      </div>

      <div class="url-row">
        <div class="url-label">代理网址</div>
        <div class="url-input-wrapper">
          <div class="url-display" id="proxyUrl">-</div>
          <button class="icon-btn" id="copyProxyBtn" disabled title="复制">
            <i class="fas fa-copy"></i> 复制
          </button>
          <button class="icon-btn" id="openProxyBtn" disabled title="访问">
            <i class="fas fa-external-link-alt"></i> 访问
          </button>
        </div>
      </div>

      <div class="help-text">
        <strong>使用说明：</strong><br>
        • 输入网址时可省略 <code>http://</code> 或 <code>https://</code> 前缀，自动补全为 HTTPS<br>
        • 代理会移除 <code>accept-encoding</code> 和 <code>x-frame-options</code> 头<br>
        • 自动添加 CORS 头，允许跨域访问<br>
        • 代理格式：<code><span id="proxy-format"></span>/proxy/https://example.com</code>
      </div>
    </div>
  </div>

  <script>
    const urlInput = document.getElementById('urlInput')
    const proxyUrlDisplay = document.getElementById('proxyUrl')
    const copyOriginalBtn = document.getElementById('copyOriginalBtn')
    const copyProxyBtn = document.getElementById('copyProxyBtn')
    const openOriginalBtn = document.getElementById('openOriginalBtn')
    const openProxyBtn = document.getElementById('openProxyBtn')

    // 站点基址 = 当前访问地址去掉 /proxy/ 部分（经反向代理访问时自动带上代理前缀，如 https://example.com/ls）
    const siteBase = new URL('../', location.href).href.replace(/\/$/, '')
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

      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return trimmed
      }

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

      const proxyUrl = siteBase + '/proxy/' + normalizedUrl
      proxyUrlDisplay.textContent = proxyUrl
      copyOriginalBtn.disabled = false
      copyProxyBtn.disabled = false
      openOriginalBtn.disabled = false
      openProxyBtn.disabled = false
    }

    urlInput.addEventListener('input', updateProxyUrl)

    copyOriginalBtn.addEventListener('click', async () => {
      const normalizedUrl = normalizeUrl(urlInput.value)
      if (normalizedUrl && isValidUrl(normalizedUrl)) {
        const success = await copyToClipboard(normalizedUrl)
        if (success) {
          const originalText = copyOriginalBtn.innerHTML
          copyOriginalBtn.innerHTML = '<i class="fas fa-check"></i> 已复制'
          setTimeout(() => {
            copyOriginalBtn.innerHTML = originalText
          }, 1500)
        }
      }
    })

    copyProxyBtn.addEventListener('click', async () => {
      const normalizedUrl = normalizeUrl(urlInput.value)
      if (normalizedUrl && isValidUrl(normalizedUrl)) {
        const proxyUrl = siteBase + '/proxy/' + normalizedUrl
        const success = await copyToClipboard(proxyUrl)
        if (success) {
          const originalText = copyProxyBtn.innerHTML
          copyProxyBtn.innerHTML = '<i class="fas fa-check"></i> 已复制'
          setTimeout(() => {
            copyProxyBtn.innerHTML = originalText
          }, 1500)
        }
      }
    })

    openOriginalBtn.addEventListener('click', () => {
      const normalizedUrl = normalizeUrl(urlInput.value)
      if (normalizedUrl && isValidUrl(normalizedUrl)) {
        window.open(normalizedUrl, '_blank')
      }
    })

    openProxyBtn.addEventListener('click', () => {
      const normalizedUrl = normalizeUrl(urlInput.value)
      if (normalizedUrl && isValidUrl(normalizedUrl)) {
        const proxyUrl = siteBase + '/proxy/' + normalizedUrl
        window.open(proxyUrl, '_blank')
      }
    })

    urlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const normalizedUrl = normalizeUrl(urlInput.value)
        if (normalizedUrl && isValidUrl(normalizedUrl)) {
          const proxyUrl = siteBase + '/proxy/' + normalizedUrl
          window.open(proxyUrl, '_blank')
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
