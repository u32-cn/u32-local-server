const fs = require('fs')
const path = require('path')
const os = require('os')
const { isAllowed } = require('./permission')
const { toPosix } = require('./posix-path')
const logger = require('./logger')
const { escapeHtml, relLink, redirect } = require('./utils')
const { getDefaultConfig } = require('./config')

const DEFAULT_MIME_TYPES = getDefaultConfig().file.mime

function getMimeType(filePath, customMime = {}) {
  const ext = path.extname(filePath).toLowerCase()
  return customMime[ext] || DEFAULT_MIME_TYPES[ext] || 'application/octet-stream'
}

// function resolveFilePath(urlPath) {
//   if (urlPath.startsWith('/file/')) {
//     const rest = urlPath.slice('/file/'.length)
//     if (rest.startsWith('~/')) {
//       const resolved = toPosix(path.join(os.homedir(), rest.slice(2)))
//       logger.debug(`[FILE-SERVER] Resolved ~/ path: ${rest} -> ${resolved}\n`)
//       return resolved
//     }
//     logger.debug(`[FILE-SERVER] Resolved absolute path: ${rest}\n`)
//     return toPosix(rest)
//   }
//   return urlPath
// }

function resolveFilePath(urlPath) {
  if (urlPath.startsWith('/file/')) {
    const rest = urlPath.slice('/file/'.length)
    if (rest.startsWith('~/') || rest === '~') {
      const pathPart = rest === '~' ? '' : rest.slice(2)
      const resolved = path.posix.normalize(toPosix(path.join(os.homedir(), pathPart)))
      logger.debug(`[FILE-SERVER] Resolved ~/ path: ${rest} -> ${resolved}\n`)
      return resolved
    }
    // 新增：处理绝对路径（Linux/Unix 以 / 开头）
    if (rest.startsWith('/')) {
      logger.debug(`[FILE-SERVER] Resolved absolute path: ${rest}\n`)
      return path.posix.normalize(toPosix(rest))
    }
    // Windows 盘符路径（如 C:/path）
    if (/^[A-Za-z]:/.test(rest)) {
      logger.debug(`[FILE-SERVER] Resolved Windows drive path: ${rest}\n`)
      return path.posix.normalize(toPosix(rest))
    }
    // 相对路径（加上前导斜杠）
    logger.debug(`[FILE-SERVER] Resolved relative path: /${rest}\n`)
    return path.posix.normalize(toPosix('/' + rest))
  }
  return path.posix.normalize(urlPath)
}

function directoryListing(dirPath, urlPath, config) {
  const entries = fs.readdirSync(dirPath)
  const tableRows = entries.map(name => {
    try {
      const full = path.join(dirPath, name)
      const stat = fs.statSync(full)
      const href = './' + encodeURIComponent(name) + (stat.isDirectory() ? '/' : '')
      const size = stat.isDirectory() ? '-' : formatSize(stat.size)
      const modified = stat.mtime.toISOString().slice(0, 19)
      return `<tr><td><a href="${escapeHtml(href)}">${escapeHtml(name)}${stat.isDirectory() ? '/' : ''}</a></td><td>${size}</td><td>${modified}</td></tr>`
    } catch { return '' }
  }).join('')

  const listItems = entries.map(name => {
    try {
      const full = path.join(dirPath, name)
      const stat = fs.statSync(full)
      const href = './' + encodeURIComponent(name) + (stat.isDirectory() ? '/' : '')
      const icon = stat.isDirectory() ? '<i class="fas fa-folder"></i>' : '<i class="fas fa-file"></i>'
      return `<li class="file-item"><a href="${escapeHtml(href)}">${icon}<span>${escapeHtml(name)}${stat.isDirectory() ? '/' : ''}</span></a></li>`
    } catch { return '' }
  }).join('')

  const parentPath = path.posix.dirname(urlPath)
  const shouldShowBack = parentPath && parentPath !== '.' && parentPath !== urlPath
  
  let backButtonsHtml = ''
  if (shouldShowBack) {
    const parentFilePath = resolveFilePath('/file/' + parentPath.slice('/file/'.length))
    const hasParentPermission = isAllowed(parentFilePath, config)
    
    if (hasParentPermission) {
      backButtonsHtml = `
        <div class="nav-buttons-group">
          <a href="../" class="back-link"><i class="fas fa-arrow-left"></i> 返回上级</a>
          <a href="${escapeHtml(relLink(urlPath, '/file'))}" class="back-link"><i class="fas fa-home"></i> file首页</a>
        </div>
      `
    } else {
      backButtonsHtml = `
        <div class="nav-buttons-group">
          <div class="back-link disabled"><i class="fas fa-ban"></i> 上级目录无访问权限</div>
          <a href="${escapeHtml(relLink(urlPath, '/file'))}" class="back-link"><i class="fas fa-home"></i> file首页</a>
        </div>
      `
    }
  } else {
    backButtonsHtml = `
      <div class="nav-buttons-group">
        <a href="${escapeHtml(relLink(urlPath, '/file'))}" class="back-link"><i class="fas fa-home"></i> file首页</a>
      </div>
    `
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(urlPath)}</title>
  <link rel="stylesheet" href="${escapeHtml(relLink(urlPath, '/public/css/space-grotesk.css'))}">
  <link rel="stylesheet" href="${escapeHtml(relLink(urlPath, '/public/css/all.min.css'))}">
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
      margin-bottom: 30px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .path {
      font-size: 24px;
      font-weight: 700;
      word-break: break-all;
    }

    .nav-buttons {
      display: flex;
      gap: 10px;
    }

    .nav-btn {
      padding: 8px 16px;
      border: 1px solid #000000;
      background: #FFFFFF;
      color: #000000;
      text-decoration: none;
      font-family: 'Space Grotesk', sans-serif;
      font-size: 13px;
      font-weight: 700;
      transition: all 0.2s;
    }

    .nav-btn:hover {
      background: #000000;
      color: #FFFFFF;
    }

    .view-toggle {
      display: flex;
      gap: 0;
      border: 1px solid #000000;
      margin-bottom: 20px;
    }

    .view-btn {
      padding: 10px 20px;
      border: none;
      border-right: 1px solid #000000;
      background: #FFFFFF;
      color: #000000;
      font-family: 'Space Grotesk', sans-serif;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
    }

    .view-btn:last-child {
      border-right: none;
    }

    .view-btn.active {
      background: #000000;
      color: #FFFFFF;
    }

    .view-btn:hover:not(.active) {
      background: #F5F5F5;
    }

    .table-view {
      display: block;
    }

    .list-view {
      display: none;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #000000;
    }

    th {
      background: #F5F5F5;
      padding: 12px 15px;
      text-align: left;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 12px;
      letter-spacing: 0.05em;
      border-bottom: 1px solid #000000;
    }

    td {
      padding: 12px 15px;
      border-bottom: 1px solid #E5E5E5;
      font-size: 13px;
    }

    tr:last-child td {
      border-bottom: none;
    }

    tr:hover td {
      background: #F5F5F5;
    }

    a {
      color: #000000;
      text-decoration: none;
      font-weight: 500;
    }

    a:hover {
      text-decoration: underline;
    }

    .file-list {
      list-style: none;
      border: 1px solid #000000;
    }

    .file-item {
      border-bottom: 1px solid #E5E5E5;
    }

    .file-item:last-child {
      border-bottom: none;
    }

    .file-item a {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 15px 20px;
      text-decoration: none;
      transition: background 0.2s;
    }

    .file-item a:hover {
      background: #F5F5F5;
    }

    .file-item i {
      font-size: 16px;
      color: #666;
    }

    .file-item span {
      flex: 1;
      font-family: 'Space Grotesk', monospace;
      font-size: 13px;
    }

    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      border: 1px solid #000000;
      text-decoration: none;
      color: #000000;
      font-weight: 700;
      transition: all 0.2s;
    }

    .back-link:hover {
      background: #000000;
      color: #FFFFFF;
    }

    .nav-buttons-group {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
    }

    .back-link.disabled {
      opacity: 0.5;
      cursor: not-allowed;
      background: #F5F5F5;
      color: #666;
    }

    .back-link.disabled:hover {
      background: #F5F5F5;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="path">${escapeHtml(urlPath)}</div>
      <div class="nav-buttons">
        <a href="${escapeHtml(relLink(urlPath, '/'))}" class="nav-btn">首页</a>
        <a href="${escapeHtml(relLink(urlPath, '/config'))}" class="nav-btn">配置</a>
      </div>
    </div>

    ${backButtonsHtml}

    <div class="view-toggle">
      <button class="view-btn active" onclick="showView('table')"><i class="fas fa-table"></i> 表格</button>
      <button class="view-btn" onclick="showView('list')"><i class="fas fa-list"></i> 列表</button>
    </div>

    <div id="table-view" class="table-view">
      <table>
        <tr>
          <th>Name</th>
          <th>Size</th>
          <th>Modified</th>
        </tr>
        ${tableRows}
      </table>
    </div>

    <div id="list-view" class="list-view">
      <ul class="file-list">
        ${listItems}
      </ul>
    </div>
  </div>

  <script>
    function showView(view) {
      const tableView = document.getElementById('table-view');
      const listView = document.getElementById('list-view');
      const buttons = document.querySelectorAll('.view-btn');

      if (view === 'table') {
        tableView.style.display = 'block';
        listView.style.display = 'none';
        buttons[0].classList.add('active');
        buttons[1].classList.remove('active');
      } else {
        tableView.style.display = 'none';
        listView.style.display = 'block';
        buttons[0].classList.remove('active');
        buttons[1].classList.add('active');
      }
    }
  </script>
</body>
</html>`
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
}

function renderAllowListPage(config, urlPath) {
  const allowList = (config.file.access.allow || []).map(e => typeof e === 'string' ? e : e.path)

  // 链接逐段编码（保留真实 / 分隔符）。整段 encodeURIComponent 会把 / 编成 %2F，
  // 浏览器把 ~%2F 当文件名，页面内相对链接解析全部错误
  const encodePathSegs = p => p.split('/').map(encodeURIComponent).join('/')

  const listItems = allowList.length > 0
    ? allowList.map(p => {
        const href = relLink(urlPath, '/file/' + encodePathSegs(p))
        return `<li class="file-item">
          <a href="${escapeHtml(href)}">
            <i class="fas fa-folder"></i>
            <span>${escapeHtml(p)}</span>
          </a>
        </li>`
      }).join('')
    : `<li class="empty-message">
        <div class="empty-icon"><i class="fas fa-folder-open"></i></div>
        <div class="empty-text">当前允许列表为空</div>
        <div class="empty-hint">请前往<a href="${escapeHtml(relLink(urlPath, '/config'))}">配置页面</a>添加要访问的路径</div>
      </li>`

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>/file - 允许访问的路径</title>
  <link rel="stylesheet" href="${escapeHtml(relLink(urlPath, '/public/css/space-grotesk.css'))}">
  <link rel="stylesheet" href="${escapeHtml(relLink(urlPath, '/public/css/all.min.css'))}">
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
      margin-bottom: 30px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .path {
      font-size: 24px;
      font-weight: 700;
      word-break: break-all;
    }

    .nav-buttons {
      display: flex;
      gap: 10px;
    }

    .nav-btn {
      padding: 8px 16px;
      border: 1px solid #000000;
      background: #FFFFFF;
      color: #000000;
      text-decoration: none;
      font-family: 'Space Grotesk', sans-serif;
      font-size: 13px;
      font-weight: 700;
      transition: all 0.2s;
    }

    .nav-btn:hover {
      background: #000000;
      color: #FFFFFF;
    }

    .intro {
      background: #F5F5F5;
      border: 1px solid #000000;
      padding: 20px 25px;
      margin-bottom: 30px;
    }

    .intro-title {
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .intro-text {
      font-size: 13px;
      line-height: 1.6;
      color: #333;
    }

    .path-list {
      list-style: none;
      border: 1px solid #000000;
    }

    .file-item {
      border-bottom: 1px solid #E5E5E5;
    }

    .file-item:last-child {
      border-bottom: none;
    }

    .file-item a {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 15px 20px;
      text-decoration: none;
      transition: background 0.2s;
    }

    .file-item a:hover {
      background: #F5F5F5;
    }

    .file-item i {
      font-size: 16px;
      color: #666;
    }

    .file-item span {
      flex: 1;
      font-family: 'Space Grotesk', monospace;
      font-size: 13px;
    }

    .empty-message {
      padding: 60px 20px;
      text-align: center;
    }

    .empty-icon {
      font-size: 48px;
      color: #999;
      margin-bottom: 20px;
    }

    .empty-text {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 10px;
    }

    .empty-hint {
      font-size: 14px;
      color: #666;
    }

    .empty-hint a {
      color: #000000;
      font-weight: 700;
      text-decoration: none;
      border-bottom: 1px solid #000000;
    }

    .empty-hint a:hover {
      background: #000000;
      color: #FFFFFF;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="path">/file</div>
      <div class="nav-buttons">
        <a href="${escapeHtml(relLink(urlPath, '/'))}" class="nav-btn">首页</a>
        <a href="${escapeHtml(relLink(urlPath, '/config'))}" class="nav-btn">配置</a>
      </div>
    </div>

    <div class="intro">
      <div class="intro-title">
        <i class="fas fa-info-circle"></i>
        允许访问的路径
      </div>
      <div class="intro-text">
        以下是配置的允许访问路径列表。点击路径可查看目录内容。
        ${allowList.length > 0 ? `<br>当前共有 <strong>${allowList.length}</strong> 个允许访问的路径。` : ''}
      </div>
    </div>

    <ul class="path-list">
      ${listItems}
    </ul>
  </div>
</body>
</html>`
}

function renderErrorPage(code, title, filePath, reason, solution, pagePath) {
  const configTip = pagePath
    ? `<p class="config-link">配置页面：<a href="${escapeHtml(relLink(pagePath, '/config'))}">${escapeHtml(relLink(pagePath, '/config'))}</a></p>`
    : ''
  const solutions = solution.map(s => `<li>${escapeHtml(s)}</li>`).join('')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${code} ${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${escapeHtml(relLink(pagePath || '/', '/public/css/space-grotesk.css'))}">
  <link rel="stylesheet" href="${escapeHtml(relLink(pagePath || '/', '/public/css/all.min.css'))}">
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
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 20px;
    }

    .error-box {
      border: 2px solid #000000;
      padding: 30px;
      margin-bottom: 30px;
    }

    .error-header {
      display: flex;
      align-items: center;
      gap: 15px;
      margin-bottom: 20px;
      padding-bottom: 20px;
      border-bottom: 1px solid #E5E5E5;
    }

    .error-code {
      font-size: 48px;
      font-weight: 700;
      color: #000000;
      line-height: 1;
    }

    .error-title {
      font-size: 24px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .path-label {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 10px;
      color: #666;
    }

    .path {
      background: #F5F5F5;
      padding: 15px;
      border: 1px solid #000000;
      font-family: 'Space Grotesk', monospace;
      font-size: 13px;
      word-break: break-all;
      margin-bottom: 20px;
    }

    .reason-label {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 10px;
      color: #666;
    }

    .reason {
      font-size: 14px;
      line-height: 1.6;
      color: #333;
    }

    .solution-box {
      border: 1px solid #000000;
      padding: 25px;
    }

    .solution-title {
      font-size: 16px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 15px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .solution-list {
      list-style: none;
      padding: 0;
    }

    .solution-list li {
      padding: 10px 0;
      padding-left: 25px;
      position: relative;
      font-size: 14px;
      line-height: 1.6;
    }

    .solution-list li:before {
      content: "▸";
      position: absolute;
      left: 0;
      font-weight: 700;
      color: #000000;
    }

    .config-link {
      margin-top: 20px;
      font-size: 13px;
    }

    .config-link a {
      color: #000000;
      font-weight: 700;
      text-decoration: none;
      border-bottom: 1px solid #000000;
    }

    .config-link a:hover {
      background: #000000;
      color: #FFFFFF;
    }

    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      border: 1px solid #000000;
      text-decoration: none;
      color: #000000;
      font-weight: 700;
      margin-top: 20px;
      transition: all 0.2s;
    }

    .back-link:hover {
      background: #000000;
      color: #FFFFFF;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="error-box">
      <div class="error-header">
        <div class="error-code">${code}</div>
        <div class="error-title">${escapeHtml(title)}</div>
      </div>

      <div class="path-label">请求路径</div>
      <div class="path">${escapeHtml(filePath)}</div>

      <div class="reason-label">原因</div>
      <div class="reason">${escapeHtml(reason)}</div>
    </div>

    <div class="solution-box">
      <div class="solution-title">
        <i class="fas fa-lightbulb"></i>
        解决方案
      </div>
      <ul class="solution-list">
        ${solutions}
      </ul>
      ${configTip}
    </div>

    <a href="${escapeHtml(relLink(pagePath || '/', '/'))}" class="back-link"><i class="fas fa-home"></i> 返回首页</a>
  </div>
</body>
</html>`
}

function serve(req, res, config) {
  let urlPath
  let rawPath
  let filePath
  try {
    const url = new URL(req.url, `http://${req.headers.host}`)
    rawPath = url.pathname
    urlPath = decodeURIComponent(rawPath)
    logger.debug(`[FILE-SERVER] Decoded URL path: ${urlPath}\n`)
    filePath = resolveFilePath(urlPath)
  } catch (err) {
    logger.error(`[FILE-SERVER] ERROR: Failed to decode URL: ${err.message}\n`)
    res.writeHead(400, { 
      'Content-Type': 'text/html; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'access-control-allow-headers': '*',
    })
    return res.end(renderErrorPage(400, 'Bad Request', req.url,
      'URL 解码失败：' + (err.message || '未知错误'),
      ['检查 URL 中是否包含非法的编码字符', '尝试直接通过目录列表页面导航到目标文件'],
      '/'))
  }

  const isFileRoute = urlPath.startsWith('/file/')
  const isFileHome = urlPath === '/file' || urlPath === '/file/'
  
  if (isFileHome) {
    logger.debug(`[FILE-SERVER] Serving file home page (allow list)\n`)
    const html = renderAllowListPage(config, urlPath)
    res.writeHead(200, { 
      'Content-Type': 'text/html; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'access-control-allow-headers': '*',
    })
    return res.end(html)
  }
  
  logger.debug(`[FILE-SERVER] Route type: ${isFileRoute ? 'file route' : 'direct path'}\n`)
  logger.debug(`[FILE-SERVER] Checking permissions for: ${filePath}\n`)

  if (!isAllowed(filePath, config)) {
    const reasons = []
    const solutions = ['在配置页面中将该路径添加到允许列表']
    const deny = (config.file.access.deny || []).filter(r => filePath.startsWith(r))
    const allow = (config.file.access.allow || []).map(e => typeof e === 'string' ? e : e.path)
    if (deny.length > 0) {
      reasons.push(`该路径被拒绝列表拦截：${deny.join(', ')}`)
      solutions.push('从拒绝列表中移除匹配的规则')
    } else if (allow.length > 0) {
      reasons.push(`该路径不在允许列表中，当前允许列表：${allow.join(', ')}`)
    } else {
      reasons.push('访问被拒绝')
    }
    logger.error(`[FILE-SERVER] ACCESS DENIED: ${filePath}\n`)
    logger.error(`[FILE-SERVER] Reason: ${reasons.join('；')}\n`)
    res.writeHead(403, { 
      'Content-Type': 'text/html; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'access-control-allow-headers': '*',
    })
    return res.end(renderErrorPage(403, 'Forbidden', filePath,
      reasons.join('；'), solutions, urlPath))
  }
  logger.debug(`[FILE-SERVER] Permission check passed\n`)

  if (!fs.existsSync(filePath)) {
    const solutions = ['检查文件路径是否正确']
    const parentDir = path.dirname(filePath)
    if (!fs.existsSync(parentDir)) {
      solutions.push('父目录不存在：' + parentDir)
    } else {
      solutions.push('父目录存在，尝试通过目录列表页面导航到目标文件')
      try {
        const entries = fs.readdirSync(parentDir)
        const similar = entries.filter(e => e.toLowerCase().replace(/\s/g, '') === path.basename(filePath).toLowerCase().replace(/\s/g, ''))
        if (similar.length > 0) {
          solutions.push(`找到相似文件：${similar.join(', ')}（可能是大小写或空格不匹配）`)
        }
      } catch { }
    }
    if (filePath !== encodeURIComponent(filePath)) {
      solutions.push('路径中包含中文或特殊字符，确认 URL 编码是否正确')
    }
    // 链接逐段编码（保留真实 / 分隔符），与 renderAllowListPage 的 encodePathSegs 同理：
    // 整段 encodeURIComponent 会把 / 编成 %2F，浏览器把它当文件名，后续相对链接基准全错
    solutions.push(`通过目录列表浏览文件：${relLink(urlPath, '/file/' + parentDir.split('/').map(encodeURIComponent).join('/'))}`)
    logger.error(`[FILE-SERVER] NOT FOUND: ${filePath}\n`)
    res.writeHead(404, { 
      'Content-Type': 'text/html; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'access-control-allow-headers': '*',
    })
    return res.end(renderErrorPage(404, 'Not Found', filePath,
      '文件或目录不存在', solutions, urlPath))
  }

  try {
    const stat = fs.statSync(filePath)
    if (stat.isDirectory()) {
      // 目录统一重定向到带尾斜杠形式，保证页面相对链接（./x、../）的解析基准正确
      // 判断必须用浏览器原始路径 rawPath：/file/~%2F 解码后以 / 结尾，但浏览器地址无真实尾斜杠，
      // 会把 ~%2F 当文件名导致页面内相对链接全部解析错误
      if (!rawPath.endsWith('/')) {
        // 目标为解码路径 + 尾斜杠，逐段重新编码为真实斜杠形式（Location 头纯 ASCII，中文安全）
        const targetDecoded = urlPath.endsWith('/') ? urlPath : urlPath + '/'
        const targetEncoded = targetDecoded.split('/').map(encodeURIComponent).join('/')
        // 浏览器相对基准是 rawPath 的上级目录（末段被当文件名），%2F 形式时基准远高于目标，
        // 必须相对该基准计算完整多段路径，单段 './末段/' 会丢层级
        const rawDir = rawPath.slice(0, rawPath.lastIndexOf('/') + 1)
        let rel = path.posix.relative(rawDir, targetEncoded)
        if (!rel.startsWith('.')) rel = './' + rel
        logger.debug(`[FILE-SERVER] Redirecting directory to trailing-slash form: ${targetDecoded}\n`)
        return redirect(res, rel + '/')
      }
      logger.debug(`[FILE-SERVER] Serving directory listing: ${filePath} (${fs.readdirSync(filePath).length} entries)\n`)
      res.writeHead(200, { 
        'Content-Type': 'text/html; charset=utf-8',
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'access-control-allow-headers': '*',
      })
      return res.end(directoryListing(filePath, urlPath, config))
    }

    const mime = getMimeType(filePath, config.file.mime || {})
    const finalMime = mime.startsWith('text/') && !mime.includes('charset')
      ? mime + '; charset=utf-8'
      : mime

    // Range 请求（视频/音频拖动进度条）：返回 206 分段流；非法范围回 416
    const rangeHeader = req.headers.range
    if (rangeHeader) {
      const m = rangeHeader.match(/^bytes=(\d*)-(\d*)$/)
      if (m && (m[1] !== '' || m[2] !== '')) {
        let start
        let end
        if (m[1] === '') {
          // 后缀形式 bytes=-N：最后 N 字节
          start = Math.max(0, stat.size - parseInt(m[2], 10))
          end = stat.size - 1
        } else {
          start = parseInt(m[1], 10)
          end = m[2] === '' ? stat.size - 1 : parseInt(m[2], 10)
        }
        if (isNaN(start) || isNaN(end) || start > end || start >= stat.size) {
          res.writeHead(416, {
            'Content-Range': `bytes */${stat.size}`,
            'access-control-allow-origin': '*',
          })
          return res.end()
        }
        if (end >= stat.size) end = stat.size - 1
        logger.debug(`[FILE-SERVER] Range request: ${start}-${end}/${stat.size}\n`)
        res.writeHead(206, {
          'Content-Type': finalMime,
          'Content-Length': end - start + 1,
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
          'access-control-allow-headers': '*',
        })
        return fs.createReadStream(filePath, { start, end }).pipe(res)
      }
    }

    logger.debug(`[FILE-SERVER] Serving file: ${filePath} (${stat.size} bytes, ${finalMime})\n`)
    res.writeHead(200, {
      'Content-Type': finalMime,
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'access-control-allow-headers': '*',
    })
    const stream = fs.createReadStream(filePath)
    stream.on('end', () => {
      logger.debug(`[FILE-SERVER] File transfer completed: ${filePath}\n`)
    })
    stream.on('error', (err) => {
      logger.error(`[FILE-SERVER] ERROR: Stream error for ${filePath}: ${err.message}\n`)
    })
    stream.pipe(res)
  } catch (err) {
    logger.error(`[FILE-SERVER] ERROR: Failed to serve file ${filePath}: ${err.message}\n`)
    res.writeHead(500, { 
      'Content-Type': 'text/html; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'access-control-allow-headers': '*',
    })
    res.end(renderErrorPage(500, 'Internal Server Error', filePath,
      err.message || '未知错误',
      ['检查服务器对文件的读取权限', '如果路径包含特殊字符，尝试通过目录列表导航'],
      urlPath))
  }
}

module.exports = { serve }
