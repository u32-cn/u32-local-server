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
  const version = require('../package.json').version
  const addr = config && config.port ? '127.0.0.1:' + config.port : ''
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
  <link rel="stylesheet" href="${escapeHtml(relLink(urlPath, '/public/css/base.css'))}">
  <link rel="stylesheet" href="${escapeHtml(relLink(urlPath, '/public/css/all.min.css'))}">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; }
    .container { max-width: 1140px; margin: 0 auto; padding: 0 28px; }
    .pathbar { display: flex; align-items: center; gap: 10px; margin: 22px 0 12px; }
    .path { font-family: var(--mono); font-size: 12.5px; color: var(--dim); word-break: break-all; }
    .nav-buttons-group { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
    .back-link { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--dim); background: #fff; border: 1px solid var(--line-hi); border-radius: 8px; padding: 5px 11px; text-decoration: none; }
    .back-link:hover { color: var(--blue); border-color: var(--blue); background: var(--blue-soft); }
    .back-link.disabled { color: var(--faint); background: #F7F7F9; border-color: var(--line); cursor: not-allowed; }
    .view-toggle { display: inline-flex; border: 1px solid var(--line-hi); border-radius: 8px; overflow: hidden; margin-bottom: 12px; }
    .view-btn { font-family: inherit; font-size: 12.5px; padding: 5px 14px; border: 0; background: #fff; color: var(--dim); cursor: pointer; }
    .view-btn + .view-btn { border-left: 1px solid var(--line-hi); }
    .view-btn.active { background: var(--blue); color: #fff; }
    .table-view, .list-view { background: #fff; border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
    .list-view { display: none; }
    table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    th { font-size: 11.5px; font-weight: 500; color: var(--faint); text-align: left; background: #FAFAFB; padding: 9px 18px; border-bottom: 1px solid var(--line); }
    td { padding: 9px 18px; border-top: 1px solid var(--line); color: var(--ink); }
    tr:hover td { background: #FAFAFB; }
    td a { color: var(--ink); text-decoration: none; }
    td a:hover { color: var(--blue); }
    .file-list { list-style: none; margin: 0; padding: 0; }
    .file-item { display: flex; align-items: center; gap: 10px; padding: 9px 18px; border-top: 1px solid var(--line); font-size: 12.5px; }
    .file-item:first-child { border-top: 0; }
    .file-item:hover { background: #FAFAFB; }
    .file-item i { color: var(--faint); width: 14px; }
    .file-item span { color: var(--faint); font-size: 11.5px; margin-left: auto; }
    @media (max-width: 900px) { .container { padding: 0 16px; } }
  </style>
</head>
<body>
<header class="topbar">
  <div class="wrap topbar-in">
    <div class="brand"><span class="dot ok"></span>u32-local-server<span class="ver">v${version}</span></div>
    <span class="addr">${addr}</span>
    <nav class="nav">
      <a href="${escapeHtml(relLink(urlPath, '/'))}">首页</a>
      <a href="${escapeHtml(relLink(urlPath, '/status'))}">状态</a>
      <a href="${escapeHtml(relLink(urlPath, '/config'))}">配置</a>
      <span class="sep"></span>
      <a href="${escapeHtml(relLink(urlPath, '/docs/reader.html?doc=file-access'))}" target="_blank" rel="noopener">文档 ↗</a>
    </nav>
  </div>
</header>

  <main class="container">
    <div class="pathbar">
      <i class="fas fa-folder-open" style="color:var(--faint)"></i>
      <span class="path">${escapeHtml(urlPath)}</span>
    </div>

    ${backButtonsHtml}

    <div class="view-toggle">
      <button class="view-btn active" onclick="showView('table')"><i class="fas fa-table"></i> 表格</button>
      <button class="view-btn" onclick="showView('list')"><i class="fas fa-list"></i> 列表</button>
    </div>

    <div id="table-view" class="table-view">
      <table>
        <tr>
          <th>名称</th>
          <th>大小</th>
          <th>修改时间</th>
        </tr>
        ${tableRows}
      </table>
    </div>

    <div id="list-view" class="list-view">
      <ul class="file-list">
        ${listItems}
      </ul>
    </div>
  </main>

  <footer class="pagefoot">
    <div class="wrap in">
      <span>u32-local-server v${version} · MIT</span>
      <div class="links">
        <a href="${escapeHtml(relLink(urlPath, '/llms.txt'))}" target="_blank" rel="noopener">llms.txt</a>
        <a href="https://github.com/u32-cn/u32-local-server" target="_blank" rel="noopener">GitHub</a>
      </div>
    </div>
  </footer>

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
  <link rel="stylesheet" href="${escapeHtml(relLink(urlPath, '/public/css/base.css'))}">
  <link rel="stylesheet" href="${escapeHtml(relLink(urlPath, '/public/css/all.min.css'))}">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; }
    .container { max-width: 1140px; margin: 0 auto; padding: 0 28px 40px; }
    .intro { background: #fff; border: 1px solid var(--line); border-radius: var(--radius); padding: 22px 24px; margin-top: 22px; }
    .intro-title { font-size: 15px; font-weight: 500; margin-bottom: 8px; }
    .intro-text { font-size: 13px; color: var(--dim); line-height: 1.8; }
    .empty-icon { font-size: 26px; color: var(--faint); margin-bottom: 10px; }
    .empty-text { font-size: 14px; color: var(--ink); margin-bottom: 6px; }
    .empty-hint { font-size: 12.5px; color: var(--dim); }
    .empty-hint a, .intro-text a { color: var(--blue); }
    .nav-btn { font-size: 12.5px; color: var(--dim); }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="wrap topbar-in">
      <div class="brand"><span class="dot ok"></span>u32-local-server<span class="ver">v${require('../package.json').version}</span></div>
      <span class="addr">${config && config.port ? '127.0.0.1:' + config.port : ''}</span>
      <nav class="nav">
        <a href="${escapeHtml(relLink(urlPath, '/'))}">首页</a>
        <a href="${escapeHtml(relLink(urlPath, '/status'))}">状态</a>
        <a href="${escapeHtml(relLink(urlPath, '/config'))}">配置</a>
        <span class="sep"></span>
        <a href="${escapeHtml(relLink(urlPath, '/docs/reader.html?doc=file-access'))}" target="_blank" rel="noopener">文档 ↗</a>
      </nav>
    </div>
  </header>

  <div class="container">

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
  <link rel="stylesheet" href="${escapeHtml(relLink(pagePath || '/', '/public/css/base.css'))}">
  <link rel="stylesheet" href="${escapeHtml(relLink(pagePath || '/', '/public/css/all.min.css'))}">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; }
    .container { max-width: 1140px; margin: 0 auto; padding: 0 28px 40px; }
    .error-box, .solution-box { background: #fff; border: 1px solid var(--line); border-radius: var(--radius); padding: 22px 24px; margin-top: 22px; }
    .error-header { display: flex; align-items: baseline; gap: 12px; margin-bottom: 16px; }
    .error-code { font-family: var(--mono); font-size: 22px; font-weight: 500; color: var(--red); }
    .error-title { font-size: 15px; font-weight: 500; }
    .path-label, .reason-label { font-size: 11.5px; color: var(--faint); margin-top: 12px; }
    .path, .reason { font-size: 12.5px; color: var(--ink); word-break: break-all; margin-top: 3px; }
    .path { font-family: var(--mono); }
    .solution-title { font-size: 13px; font-weight: 500; margin-bottom: 8px; }
    .solution-box { font-size: 13px; color: var(--dim); line-height: 1.8; }
    .solution-box a, .config-link a { color: var(--blue); }
    .back-link { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--dim); background: #fff; border: 1px solid var(--line-hi); border-radius: 8px; padding: 6px 12px; text-decoration: none; margin-top: 16px; }
    .back-link:hover { color: var(--blue); border-color: var(--blue); background: var(--blue-soft); }
    .config-link { margin-top: 14px; font-size: 12.5px; }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="wrap topbar-in">
      <div class="brand"><span class="dot ok"></span>u32-local-server<span class="ver">v${require('../package.json').version}</span></div>
      <nav class="nav">
        <a href="${escapeHtml(relLink(pagePath || '/', '/'))}">首页</a>
        <a href="${escapeHtml(relLink(pagePath || '/', '/status'))}">状态</a>
        <a href="${escapeHtml(relLink(pagePath || '/', '/config'))}">配置</a>
        <span class="sep"></span>
        <a href="${escapeHtml(relLink(pagePath || '/', '/docs/reader.html?doc=file-access'))}" target="_blank" rel="noopener">文档 ↗</a>
      </nav>
    </div>
  </header>

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
