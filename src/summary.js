// 首页摘要数据：SSR 首屏与 GET /api/summary 共用同一份计算，
// 保证"页面看到的"和"轮询拿到的"永远一致。
// 只输出计数与布尔，不含路径、主机名、用户名等敏感信息。

const artifacts = require('./artifacts')
const serviceStatus = require('./service-status')

// 产物统计要 walk 目录 + 逐文件 stat，前端 5s 轮询时加一层短缓存
const ARTIFACT_TTL_MS = 2000
let artifactCache = { at: 0, value: { count: 0, bytes: 0 } }

function artifactStats() {
  if (Date.now() - artifactCache.at < ARTIFACT_TTL_MS) return artifactCache.value
  let value
  try {
    const s = artifacts.stats()
    value = { count: s.count || 0, bytes: s.bytes || 0 }
  } catch {
    value = { count: 0, bytes: 0 }
  }
  artifactCache = { at: Date.now(), value }
  return value
}

function bridgeCounts() {
  try {
    const c = require('./bridge').counts() || {}
    return { apps: c.appCount || 0, instances: c.instanceCount || 0 }
  } catch {
    return { apps: 0, instances: 0 }
  }
}

function collect(config) {
  const art = artifactStats()
  const svc = serviceStatus.detect()
  return {
    generatedAt: Date.now(),
    port: config.port,
    pid: process.pid,
    uptimeSec: Math.floor(process.uptime()),
    allowCount: (config.file.access.allow || []).length,
    bridge: bridgeCounts(),
    artifacts: { count: art.count, bytes: art.bytes },
    services: svc,
  }
}

module.exports = { collect }
