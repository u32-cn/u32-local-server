// 允许列表/拒绝列表权限校验
// - allow 条目：{ path, write }，write=true 读写，write=false 只读（兼容旧字符串条目，视为只读兜底）
// - deny 条目：字符串路径，拒绝列表优先于允许列表
function entries(list) {
  return list || []
}

// 兼容字符串与对象条目，取出路径
function entryPath(e) {
  return typeof e === 'string' ? e : e.path
}

// 配置中的路径已存储为 resolvePath 后的绝对路径，这里只需末尾补 / 防止前缀误伤
const normalize = (p) => (p.endsWith('/') ? p : p + '/')

function isDenied(filePath, config) {
  const deny = entries(config.file.access.deny)
  const normalizedPath = normalize(filePath)
  return deny.some(d => normalizedPath.startsWith(normalize(entryPath(d))))
}

// 命中的允许条目（未命中返回 null）
function matchAllow(filePath, config) {
  const allow = entries(config.file.access.allow)
  const normalizedPath = normalize(filePath)
  for (const a of allow) {
    if (normalizedPath.startsWith(normalize(entryPath(a)))) return a
  }
  return null
}

// 读权限：拒绝列表未命中 且 允许列表命中（允许列表为空时拒绝所有）
function isAllowed(filePath, config) {
  if (isDenied(filePath, config)) return false
  return matchAllow(filePath, config) !== null
}

// 写权限：读权限基础上，命中的允许条目须 write=true
function isWritable(filePath, config) {
  if (isDenied(filePath, config)) return false
  const a = matchAllow(filePath, config)
  if (!a) return false
  return typeof a === 'object' ? a.write === true : false
}

module.exports = { isAllowed, isWritable, matchAllow, isDenied }
