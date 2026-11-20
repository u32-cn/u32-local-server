#!/usr/bin/env node

// Windows 安装包自动升级（核心模块）：
// - check：GET GitHub API latest release，比对当前版本
// - 自动调度：服务启动 30s 后首次 check，之后每 6h 一次；发现新版且本地无对应缓存 → 自动后台下载
// - 缓存约束：~/.u32-local-server/update/ 恒等于「恰好一个 = 最新版」的 setup exe（或空），
//   下载前先清掉旧版本 exe 与 .part 残片
// - install：对缓存里的 exe 拉起安装向导（用户点「下一步」完成升级；installer.iss 的
//   PrepareToInstall 先停服务与托盘，避免 EBUSY 覆盖 exe 失败）
// 状态查询走 status()：{ current, latest, updateAvailable, downloaded, downloading, progress, error }
// 仅 Windows 安装包版有意义；npm 版升级走 `npm i -g u32-local-server@latest`。

const fs = require('fs')
const path = require('path')
const os = require('os')
const https = require('https')

const PKG = require('../package.json')
const VERSION = PKG.version
const REPO = 'u32-cn/u32-local-server'
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`
const UPDATE_DIR = path.join(os.homedir(), '.u32-local-server', 'update')
const CHECK_FIRST_DELAY_MS = 30 * 1000      // 启动后首次检测延迟
const CHECK_INTERVAL_MS = 6 * 3600 * 1000   // 周期检测间隔 6h

// ---- 运行时状态（进程内单例）----
const state = {
  latest: null,            // 'v1.8.0' | null（未检测到）
  updateAvailable: false,
  downloading: false,
  progress: 0,             // 0-100
  downloaded: false,       // 缓存里已有最新版 exe
  downloadedFile: null,
  error: null,             // 最近一次 check/download 失败原因
  lastCheckAt: null,
  autoTimer: null,
  firstTimer: null,
}

let seaMode = false
try { seaMode = require('./sea-assets').IS_SEA } catch { seaMode = false }

// 统一 https GET：跟随重定向（GitHub 302 到 release-assets 域）
function fetchUrl(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: headers || {} }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        return resolve(fetchUrl(res.headers.location, headers))
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error('HTTP ' + res.statusCode + ' for ' + url))
      }
      resolve(res)
    })
    req.on('error', reject)
    req.setTimeout(15000, () => req.destroy(new Error('timeout: ' + url)))
  })
}

function getJson(url) {
  return fetchUrl(url, {
    'User-Agent': 'u32-local-server-updater',
    'Accept': 'application/vnd.github+json',
  }).then(res => new Promise((resolve, reject) => {
    let body = ''
    res.on('data', c => body += c)
    res.on('end', () => {
      try { resolve(JSON.parse(body)) } catch (e) { reject(e) }
    })
    res.on('error', reject)
  }))
}

// 版本比较：逐段数值比对（v1.10.0 > v1.9.9）；不等返回 1/-1，相等返回 0
function compareVersions(a, b) {
  const pa = String(a).replace(/^v/, '').split('.')
  const pb = String(b).replace(/^v/, '').split('.')
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = parseInt(pa[i] || '0', 10)
    const y = parseInt(pb[i] || '0', 10)
    if (x !== y) return x > y ? 1 : -1
  }
  return 0
}

// 缓存目录清理：只保留 fileName 这一个安装包；删旧版 exe 与 .part 残片（fileName 为 null 全清）
function pruneCache(fileName) {
  try {
    if (!fs.existsSync(UPDATE_DIR)) return
    for (const name of fs.readdirSync(UPDATE_DIR)) {
      const keep = name === fileName
      const isExe = /^u32-local-server-setup-.*\.exe$/.test(name)
      const isPart = name.endsWith('.part')
      if (!keep && (isExe || isPart)) {
        try { fs.unlinkSync(path.join(UPDATE_DIR, name)) } catch {}
      }
    }
  } catch {}
}

// 查缓存目录里是否已有指定版本的完整安装包
function cachedFileFor(version) {
  const plain = String(version).replace(/^v/, '')
  const wanted = `u32-local-server-setup-${plain}.exe`
  try {
    const p = path.join(UPDATE_DIR, wanted)
    if (fs.existsSync(p) && fs.statSync(p).size > 0) return p
  } catch {}
  return null
}

// 查最新版 + 找 setup exe 资产（返回裸信息，不动状态）
async function fetchLatest() {
  const rel = await getJson(API_URL)
  const latest = rel.tag_name
  const asset = (rel.assets || []).find(a => /^u32-local-server-setup-.*\.exe$/.test(a.name))
  if (!asset) throw new Error('latest-release-has-no-installer')
  return {
    latest,
    updateAvailable: compareVersions(latest, VERSION) > 0,
    downloadUrl: asset.browser_download_url,
    assetName: asset.name,
    size: asset.size,
  }
}

// 一次完整检测：更新状态；发现新版且缓存缺失时自动触发后台下载
async function check(silent) {
  try {
    const info = await fetchLatest()
    state.latest = info.latest
    state.updateAvailable = info.updateAvailable
    state.error = null
    state.lastCheckAt = Date.now()
    if (info.updateAvailable) {
      const cached = cachedFileFor(info.latest)
      state.downloadedFile = cached
      state.downloaded = !!cached
      if (cached) pruneCache(path.basename(cached))
      else if (!state.downloading) downloadLatest(info).catch(() => {})
    } else {
      // 已是最新：清掉升级完成后的残留安装包
      state.downloaded = false
      state.downloadedFile = null
      pruneCache(null)
    }
    return status()
  } catch (err) {
    state.error = err.message
    if (!silent) throw err
    return status()
  }
}

// 后台下载最新版安装包（.part → 原子改名 → 清旧）；进行中重复调用直接返回
async function downloadLatest(preFetched) {
  if (state.downloading) return status()
  let info = preFetched
  try {
    if (!info) {
      info = await fetchLatest()
      state.latest = info.latest
      state.updateAvailable = info.updateAvailable
      if (!info.updateAvailable) return status()
    }
    const cached = cachedFileFor(info.latest)
    if (cached) {
      state.downloaded = true
      state.downloadedFile = cached
      pruneCache(path.basename(cached))
      return status()
    }
    state.downloading = true
    state.progress = 0
    state.error = null
    fs.mkdirSync(UPDATE_DIR, { recursive: true })
    // 先清旧版与残片，保证目录里最终只有一个 exe
    pruneCache(null)
    const dest = path.join(UPDATE_DIR, info.assetName)
    const part = dest + '.part'
    const res = await fetchUrl(info.downloadUrl, { 'User-Agent': 'u32-local-server-updater' })
    const total = parseInt(res.headers['content-length'] || '0', 10)
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(part)
      let got = 0
      res.on('data', (c) => {
        got += c.length
        state.progress = total > 0 ? Math.min(100, Math.floor(got / total * 100)) : 0
      })
      res.on('error', reject)
      out.on('error', reject)
      out.on('finish', resolve)
      res.pipe(out)
    })
    fs.renameSync(part, dest)
    state.downloading = false
    state.progress = 100
    state.downloaded = true
    state.downloadedFile = dest
  } catch (err) {
    state.downloading = false
    state.progress = 0
    state.error = err.message
  }
  return status()
}

// 对缓存里的安装包拉起安装向导；file 缺省取 downloadedFile
function install(file) {
  const target = file || state.downloadedFile
  if (!target || !fs.existsSync(target)) return { ok: false, error: 'no-downloaded-installer' }
  // cmd /c start：detached 脱离本进程生命周期（服务重启/进程退出都不影响安装向导）
  const { spawn } = require('child_process')
  const child = spawn('cmd.exe', ['/c', 'start', '', `"${target}"`], {
    detached: true, stdio: 'ignore', windowsHide: true, shell: false,
  })
  child.unref()
  return { ok: true, launched: target }
}

// 对外状态快照（/api/update GET 与 CLI check 共用）
function status() {
  return {
    ok: true,
    current: VERSION,
    latest: state.latest,
    updateAvailable: state.updateAvailable,
    downloaded: state.downloaded,
    downloading: state.downloading,
    progress: state.progress,
    error: state.error,
    file: state.downloadedFile,
    assetName: state.downloadedFile ? path.basename(state.downloadedFile) : null,
    npmHint: seaMode ? null : 'npm i -g u32-local-server@latest',
  }
}

// 自动调度：启动 30s 后首次 check，之后每 6h（仅服务进程内调用一次）
function scheduleAuto() {
  if (state.firstTimer || state.autoTimer) return
  state.firstTimer = setTimeout(() => {
    check(true)
    state.autoTimer = setInterval(() => check(true), CHECK_INTERVAL_MS)
  }, CHECK_FIRST_DELAY_MS)
  if (state.firstTimer.unref) state.firstTimer.unref()
}

module.exports = { check, downloadLatest, install, status, scheduleAuto, compareVersions, pruneCache, UPDATE_DIR, VERSION }
