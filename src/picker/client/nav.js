// picker 导航：API 调用、导航历史、地址栏面包屑、侧栏（最近访问 + 允许的目录）

import { showMessage, showMenu, icon, escapeHtml, escapeAttr } from './ui.js'

const RECENT_KEY = 'u32picker.recent'
const LAST_KEY = 'u32picker.last'
const RECENT_MAX = 10

function loadJson(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key))
    return v == null ? fallback : v
  } catch {
    return fallback
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 隐私模式/配额满时静默失败，不阻塞主流程
  }
}

// 输入框内容规范化：去首尾引号、反斜杠转正斜杠（服务端 resolvePath 再展开 ~/）
function normInput(v) {
  return String(v || '').trim().replace(/^["']|["']$/g, '').replace(/\\+/g, '/')
}

function parentName(p) {
  const t = p.replace(/\/+$/, '')
  const segs = t.split('/')
  return segs[segs.length - 1] || p
}

export function createNav({ els, state, cfg, onLoaded, onFilePath }) {
  // 与页面同路径前缀拼接，反代子路径（/xyz/picker）下同样正确
  const apiBase = location.pathname.replace(/\/+$/, '') + '/api/'
  let hist = []
  let histIdx = -1

  function getJson(query) {
    return fetch(apiBase + query).then(r => r.json())
  }

  function updateNavButtons() {
    els.backBtn.disabled = histIdx <= 0
    els.fwdBtn.disabled = histIdx >= hist.length - 1
    els.upBtn.disabled = !state.parentPath
  }

  function pushHistory(path) {
    if (hist[histIdx] === path) return
    hist = hist.slice(0, histIdx + 1)
    hist.push(path)
    histIdx = hist.length - 1
  }

  // 去掉盘根尾斜杠后作为去重键：S:/ 与 S: 视为同一目录
  function recentKey(p) {
    return String(p).replace(/\/+$/, '')
  }

  function getRecent() {
    const list = loadJson(RECENT_KEY, [])
    if (!Array.isArray(list)) return []
    const seen = new Set()
    return list.filter(r => {
      if (!r || typeof r.path !== 'string' || !r.path) return false
      // 兼容历史记录里的裸盘符（S: → S:/）
      if (/^[a-zA-Z]:$/.test(r.path)) r.path = r.path + '/'
      const k = recentKey(r.path)
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }

  function recordRecent(path) {
    const list = getRecent().filter(r => recentKey(r.path) !== recentKey(path))
    list.unshift({ path, name: parentName(path) })
    saveJson(RECENT_KEY, list.slice(0, RECENT_MAX))
  }

  function removeRecent(path) {
    saveJson(RECENT_KEY, getRecent().filter(r => recentKey(r.path) !== recentKey(path)))
    renderSidebar()
  }

  // 当前路径命中的最具体允许根目录（用于侧栏高亮）
  function matchedRoot(path) {
    let best = null
    for (const r of cfg.roots) {
      const root = r.path.replace(/\/+$/, '')
      if (path === root || path.indexOf(root + '/') === 0 || root === '') {
        if (!best || root.length > best.length) best = root
      }
    }
    return best
  }

  function sideItemHtml(item, isRecent) {
    return '<button class="side-item" data-path="' + escapeAttr(item.path) + '"' +
      (isRecent ? ' data-recent="1"' : '') + ' data-u32-name="side-item">' +
      icon('folder') +
      '<span class="side-name">' + escapeHtml(item.name || item.path) + '</span>' +
      icon('arrow-right', 'side-arrow') +
      '</button>'
  }

  function renderSidebar() {
    const recent = getRecent()
    els.recentHint.hidden = recent.length > 0
    els.recentList.innerHTML = recent.map(r => sideItemHtml(r, true)).join('')
    els.rootsList.innerHTML = cfg.roots.map(r => sideItemHtml(r, false)).join('')
    const root = matchedRoot(state.curPath || '')
    els.sidebar.querySelectorAll('.side-item').forEach(el => {
      const p = el.dataset.path.replace(/\/+$/, '')
      el.classList.toggle('active', p === root || el.dataset.path === state.curPath)
    })
  }

  function renderAddr() {
    const p = state.curPath || ''
    // 按根前缀切分，保留盘根尾斜杠（S:/ 而非 S:），否则点击面包屑会退化成「盘的当前工作目录」
    const parts = []
    let rest = ''
    if (p === '/') {
      parts.push({ label: '/', path: '/' })
    } else if (/^[a-zA-Z]:/.test(p)) {
      parts.push({ label: p.slice(0, 2), path: p.slice(0, 2) + '/', drive: true })
      rest = p.slice(3)
    } else if (p.startsWith('/')) {
      parts.push({ label: '/', path: '/' })
      rest = p.slice(1)
    }
    let acc = parts.length ? parts[parts.length - 1].path : ''
    for (const seg of rest.split('/')) {
      if (!seg) continue
      acc = acc + seg
      parts.push({ label: seg, path: acc })
      acc = acc + '/'
    }
    const html = parts.map((part, i) => {
      const sep = i > 0 ? icon('arrow-right', 'crumb-sep') : ''
      const label = part.drive
        ? '<span class="crumb-drive">' + icon('drive') + '<span>' + escapeHtml(part.label) + '</span></span>'
        : escapeHtml(part.label)
      return sep + '<button class="crumb-seg" data-nav="' + escapeAttr(part.path) + '" data-u32-name="crumb-seg">' + label + '</button>'
    }).join('') + '<div class="crumb-blank" id="crumbBlank" data-u32-name="crumb-blank"></div>'
    els.crumbs.innerHTML = html
  }

  function beginEditAddress() {
    els.addrView.hidden = true
    els.addrInput.hidden = false
    els.addrInput.value = state.curPath || ''
    els.addrInput.focus()
    els.addrInput.select()
  }

  function endEditAddress() {
    els.addrInput.hidden = true
    els.addrView.hidden = false
  }

  function load(path, record) {
    return getJson('ls?path=' + encodeURIComponent(path)).then(data => {
      if (!data.ok) {
        showMessage(data.error || '加载失败')
        return false
      }
      state.curPath = data.path
      state.parentPath = data.parent
      state.write = data.write === true
      state.entries = data.entries || []
      state.selected = null
      state.filter = ''
      els.searchInput.value = ''
      if (record !== false) pushHistory(data.path)
      saveJson(LAST_KEY, data.path)
      recordRecent(data.path)
      renderAddr()
      renderSidebar()
      updateNavButtons()
      onLoaded()
      return true
    }).catch(err => {
      showMessage('加载失败: ' + err.message)
      return false
    })
  }

  // 路径直达：目录 → 导航；文件 → onFilePath（按模式回传或回填）；不存在 → 提示
  function gotoPath(raw) {
    const target = normInput(raw)
    if (!target) return Promise.resolve(null)
    return getJson('ls?path=' + encodeURIComponent(target)).then(data => {
      if (data.ok) {
        load(data.path)
        return 'dir'
      }
      return getJson('stat?path=' + encodeURIComponent(target)).then(st => {
        if (!st.ok) {
          showMessage(st.error || '路径不可访问')
          return null
        }
        if (!st.exists) {
          showMessage('路径不存在:\n' + target)
          return null
        }
        if (st.type === 'dir') {
          load(st.path)
          return 'dir'
        }
        if (onFilePath) onFilePath(st)
        return 'file'
      })
    }).catch(err => {
      showMessage('加载失败: ' + err.message)
      return null
    })
  }

  function back() {
    if (histIdx <= 0) return
    const target = hist[histIdx - 1]
    load(target, false).then(ok => {
      if (!ok) return
      histIdx--
      updateNavButtons()
    })
  }

  function forward() {
    if (histIdx >= hist.length - 1) return
    const target = hist[histIdx + 1]
    load(target, false).then(ok => {
      if (!ok) return
      histIdx++
      updateNavButtons()
    })
  }

  function up() {
    if (state.parentPath) load(state.parentPath)
  }

  function refresh() {
    if (!state.curPath) return Promise.resolve(false)
    return load(state.curPath, false)
  }

  function navigateTo(path) {
    if (!path) return
    load(path)
  }

  // 侧栏事件：点击导航；最近访问失效时提示并移除；右键移除
  els.sidebar.addEventListener('click', ev => {
    const el = ev.target.closest('.side-item')
    if (!el) return
    const path = el.dataset.path
    load(path).then(ok => {
      if (ok) return
      if (el.dataset.recent === '1') {
        removeRecent(path)
        showMessage('该目录已不可访问，已从「最近访问」中移除。', { icon: 'warning' })
      }
    })
  })
  els.sidebar.addEventListener('contextmenu', ev => {
    const el = ev.target.closest('.side-item[data-recent="1"]')
    if (!el) return
    ev.preventDefault()
    const path = el.dataset.path
    showMenu(ev.clientX, ev.clientY, [
      { label: '打开', action: () => load(path) },
      { label: '从最近访问中移除', action: () => removeRecent(path) },
    ])
  })

  // 地址栏：面包屑点击导航，空白区域进入编辑
  els.crumbs.addEventListener('click', ev => {
    const seg = ev.target.closest('[data-nav]')
    if (seg) return load(seg.dataset.nav)
  })
  els.addrView.addEventListener('click', ev => {
    if (ev.target.closest('[data-nav]')) return
    beginEditAddress()
  })
  els.addrDrop.addEventListener('click', ev => {
    ev.stopPropagation()
    beginEditAddress()
  })
  els.addrInput.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') {
      const v = els.addrInput.value
      endEditAddress()
      gotoPath(v)
    } else if (ev.key === 'Escape') {
      ev.stopPropagation()
      endEditAddress()
    }
  })
  els.addrInput.addEventListener('blur', () => {
    if (!els.addrInput.hidden) endEditAddress()
  })

  function init() {
    renderSidebar()
    if (!cfg.roots.length) {
      els.emptyPane.hidden = false
      els.emptyPane.textContent = '允许列表为空，请点击侧栏「允许的目录」旁的齿轮按钮前往配置页添加目录'
      updateNavButtons()
      return
    }
    const last = loadJson(LAST_KEY, '')
    const usable = typeof last === 'string' && last && cfg.roots.some(r => {
      const root = r.path.replace(/\/+$/, '')
      return last === root || last.indexOf(root + '/') === 0
    })
    load(usable ? last : cfg.roots[0].path)
  }

  return {
    init,
    load,
    gotoPath,
    back,
    forward,
    up,
    refresh,
    navigateTo,
    beginEditAddress,
    endEditAddress,
    renderSidebar,
    recordRecent,
    parentName,
  }
}
