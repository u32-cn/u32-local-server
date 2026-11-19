const path = require('path')

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// 生成点式相对链接：pagePath 为当前页面 URL 路径（服务器所见），target 为站内目标路径
// 例：relLink('/', '/config') => './config'；relLink('/file/~/a/b/', '/config') => '../../../config'
// 相对链接由浏览器按当前地址解析，经 Nginx 子路径转发（剥前缀）时前缀自动保留，无需任何配置
function relLink(pagePath, target) {
  const base = pagePath.endsWith('/') ? pagePath : pagePath.slice(0, pagePath.lastIndexOf('/') + 1)
  let rel = path.posix.relative(base, target)
  if (!rel.startsWith('.')) rel = './' + rel
  return rel
}

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'access-control-allow-headers': '*',
}

// 302 重定向（临时）：本地路径常增删改，301 会被浏览器永久缓存导致改路径后行为僵死；
// location 必须是相对链接（ './x'、'../x' ），浏览器按当前 URL 解析，反代前缀自动保留
function redirect(res, location) {
  res.writeHead(302, Object.assign({ Location: location }, CORS_HEADERS))
  res.end()
}

module.exports = { escapeHtml, relLink, redirect, CORS_HEADERS }
