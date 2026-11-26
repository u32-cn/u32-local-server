// picker 列表渲染：排序 / 搜索与类型过滤 / 隐藏项过滤 / 详细信息与大图标视图
// 视图与排序状态放在共享 state 上，main.js 只负责事件绑定与选中动作

import { escapeHtml as esc, escapeAttr as escAttr, icon } from './ui.js'

const HIDDEN_KEY = 'u32picker.showHidden'

export function getShowHidden() {
  try {
    return localStorage.getItem(HIDDEN_KEY) === '1'
  } catch {
    return false
  }
}

export function setShowHidden(v) {
  try {
    localStorage.setItem(HIDDEN_KEY, v ? '1' : '0')
  } catch {
    // 隐私模式/配额满时静默失败
  }
}

function joinPath(base, name) {
  return base.replace(/\/+$/, '') + '/' + name
}

function parentName(p) {
  const t = p.replace(/\/+$/, '')
  const segs = t.split('/')
  return segs[segs.length - 1] || p
}

function fmtSize(n) {
  if (typeof n !== 'number' || isNaN(n)) return ''
  if (n < 1024) return n + ' B'
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n
  for (let i = 0; i < units.length; i++) {
    v = v / 1024
    if (v < 1024 || i === units.length - 1) return v.toFixed(v < 10 ? 1 : 0) + ' ' + units[i]
  }
  return ''
}

function pad2(n) {
  return n < 10 ? '0' + n : String(n)
}

function fmtTime(iso) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.getFullYear() + '/' + pad2(d.getMonth() + 1) + '/' + pad2(d.getDate()) +
    ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes())
}

function extOf(name) {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(i + 1).toLowerCase() : ''
}

// 类型下拉值 → 允许的扩展名数组（null 表示全部）
export function typeFilterExts(value) {
  if (!value || value === '*') return null
  const list = value.match(/\*\.([a-zA-Z0-9]+)/g)
  if (!list) return null
  return list.map(t => t.slice(2).toLowerCase())
}

export function createList({ state, cfg, els, onSelectionChange }) {
  function passesFilter(e, exts, keyword, showHidden) {
    if (!showHidden && e.name.charAt(0) === '.') return false
    if (keyword && e.name.toLowerCase().indexOf(keyword) === -1) return false
    if (exts && e.type === 'file') {
      if (exts.indexOf(extOf(e.name)) === -1) return false
    }
    return true
  }

  function compare(a, b) {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    const d = state.sort.dir
    if (state.sort.key === 'mtime') {
      return (new Date(a.mtime) - new Date(b.mtime)) * d || a.name.localeCompare(b.name, 'zh')
    }
    if (state.sort.key === 'type') {
      return a.typeLabel.localeCompare(b.typeLabel, 'zh') * d || a.name.localeCompare(b.name, 'zh', { numeric: true })
    }
    if (state.sort.key === 'size') {
      return ((a.size || 0) - (b.size || 0)) * d || a.name.localeCompare(b.name, 'zh', { numeric: true })
    }
    return a.name.localeCompare(b.name, 'zh', { numeric: true }) * d
  }

  // 可见条目：过滤 → 排序（扁平列表，不分组）
  function computeVisible() {
    const exts = typeFilterExts(state.typeValue)
    const keyword = (state.filter || '').trim().toLowerCase()
    const showHidden = getShowHidden()
    return state.entries
      .filter(e => passesFilter(e, exts, keyword, showHidden))
      .sort(compare)
  }

  function rowType(e) {
    return e.type
  }

  function iconFor(e) {
    if (e.type === 'dir') return icon('folder')
    const ext = extOf(e.name)
    return icon(ext === 'exe' ? 'file-exe' : 'file')
  }

  function renderRow(e) {
    const path = joinPath(state.curPath, e.name)
    const selectable = !(cfg.dirOnly && rowType(e) !== 'dir')
    const dim = cfg.dirOnly && rowType(e) !== 'dir'
    const cls = 'entry' + (dim ? ' dim' : '') + (state.selected && state.selected.path === path ? ' selected' : '')
    return '<div class="' + cls + '" data-path="' + escAttr(path) + '" data-type="' + e.type + '"' +
      ' data-selectable="' + (selectable ? '1' : '0') + '" data-u32-name="list-entry">' +
      '<div class="cell c-icon" data-u32-name="entry-icon">' + iconFor(e) + '</div>' +
      '<div class="cell c-name" data-u32-name="entry-name">' + esc(e.name) + '</div>' +
      '<div class="cell c-mtime" data-u32-name="entry-mtime">' + fmtTime(e.mtime) + '</div>' +
      '<div class="cell c-type" data-u32-name="entry-type">' + esc(e.typeLabel || '') + '</div>' +
      '<div class="cell c-size" data-u32-name="entry-size">' + (e.type === 'dir' ? '' : fmtSize(e.size)) + '</div>' +
      '</div>'
  }

  function render() {
    const items = computeVisible()
    const html = items.map(renderRow).join('')
    els.listBody.classList.toggle('grid-view', state.view === 'icons')
    els.listBody.innerHTML = html
    els.emptyPane.hidden = items.length > 0
    if (!items.length) {
      els.emptyPane.textContent = state.filter || state.typeValue !== '*'
        ? '没有匹配的文件（检查搜索词或文件类型筛选）'
        : '此文件夹为空'
    }
    // 选中项若已不在可见列表，清空选中（保留文件名框用户输入）
    if (state.selected && !items.some(it => it.path === state.selected.path)) {
      state.selected = null
    }
    updateSortIndicators()
  }

  // 过滤后所有可选条目（用于上下键导航）
  function visibleItems() {
    return computeVisible()
      .filter(e => !(cfg.dirOnly && e.type !== 'dir'))
      .map(e => ({ name: e.name, type: e.type, path: joinPath(state.curPath, e.name) }))
  }

  function updateSortIndicators() {
    els.listHead.querySelectorAll('.lh-cell[data-col]').forEach(cell => {
      const ind = cell.querySelector('.sort-ind')
      if (!ind) return
      const col = cell.dataset.col
      ind.innerHTML = col === state.sort.key ? icon(state.sort.dir > 0 ? 'sort-up' : 'sort-down') : ''
    })
  }

  function selectPath(path) {
    if (!path) {
      state.selected = null
      render()
      return
    }
    const e = state.entries.find(it => joinPath(state.curPath, it.name) === path)
    if (!e) return
    if (cfg.dirOnly && e.type !== 'dir') return
    state.selected = { name: e.name, type: e.type, path }
    els.listBody.querySelectorAll('.entry').forEach(row => {
      row.classList.toggle('selected', row.dataset.path === path)
    })
    if (onSelectionChange) onSelectionChange(state.selected)
  }

  function moveSelection(delta) {
    const items = visibleItems()
    if (!items.length) return
    let idx = state.selected ? items.findIndex(it => it.path === state.selected.path) : -1
    idx += delta
    if (idx < 0) idx = 0
    if (idx >= items.length) idx = items.length - 1
    const target = items[idx]
    selectPath(target.path)
    const row = els.listBody.querySelector('.entry[data-path="' + CSS.escape(target.path) + '"]')
    if (row) row.scrollIntoView({ block: 'nearest' })
  }

  function setSort(key) {
    if (state.sort.key === key) {
      state.sort.dir = -state.sort.dir
    } else {
      state.sort = { key, dir: 1 }
    }
    render()
  }

  function setView(view) {
    state.view = view
    render()
  }

  function setFilter(text) {
    state.filter = text
    render()
  }

  function setTypeValue(value) {
    state.typeValue = value
    render()
  }

  function entryAt(path) {
    const e = state.entries.find(it => joinPath(state.curPath, it.name) === path)
    return e || null
  }

  return {
    render,
    selectPath,
    moveSelection,
    setSort,
    setView,
    setFilter,
    setTypeValue,
    visibleItems,
    entryAt,
    parentName,
    joinPath,
  }
}
