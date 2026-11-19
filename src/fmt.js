// 展示层格式化工具：状态页与首页共用，避免两处各写一套导致同一数值两种写法。
// 命名约定见 sysinfo.js：数值字段用带单位后缀的键名（Bytes / Sec / Ms / Percent / At / Count / Mhz）。

function pad2(n) {
  return String(n).padStart(2, '0')
}

function fmtBytes(n) {
  if (!Number.isFinite(n)) return null
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return (i === 0 ? String(Math.round(v)) : v.toFixed(v >= 100 ? 0 : 1)) + ' ' + units[i]
}

function fmtDuration(sec) {
  sec = Math.max(0, Math.floor(sec || 0))
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return (d > 0 ? d + 'd ' : '') + pad2(h) + ':' + pad2(m) + ':' + pad2(s)
}

function fmtTime(ms) {
  if (!Number.isFinite(ms)) return null
  const d = new Date(ms)
  return (
    d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' +
    pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds())
  )
}

function fmtNumber(n) {
  if (!Number.isFinite(n)) return null
  return n.toLocaleString('en-US')
}

// 按字段名后缀统一格式化：采集层只负责给数值，单位语义写在键名里
function fmtValue(key, v) {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? '是' : '否'
  if (typeof v === 'number') {
    const suffix = key.split('.').pop()
    if (/Bytes$/.test(suffix)) return fmtBytes(v)
    if (/At$/.test(suffix)) return fmtTime(v)
    if (/Percent$/.test(suffix)) return v.toFixed(1) + '%'
    if (/Mhz$/.test(suffix)) return fmtNumber(v) + ' MHz'
    if (/Sec$/.test(suffix)) return fmtDuration(v)
    if (/Ms$/.test(suffix)) return v.toFixed(1) + ' ms'
    if (/Usec$/.test(suffix)) return (v / 1e6).toFixed(3) + ' s'
    if (/Count$/.test(suffix)) return fmtNumber(v)
    if (/Hours$/.test(suffix)) return (v >= 0 ? '+' : '') + v
    return String(v)
  }
  return String(v)
}

module.exports = { pad2, fmtBytes, fmtDuration, fmtTime, fmtNumber, fmtValue }
