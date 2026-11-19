// picker 主入口：状态机、事件绑定、模式提交、postMessage 回传
// 依赖注入：list.js（列表渲染）、nav.js（导航/侧栏）、actions.js（工具条/右键菜单动作）、ui.js（图标与自绘弹窗）

import { loadIcons, mountIcons, showMessage, showConfirm, escapeHtml } from './ui.js'
import { createList, typeFilterExts } from './list.js'
import { createNav } from './nav.js'
import { createActions, rememberFilename } from './actions.js'

const cfg = window.__PICKER_CFG__

const state = {
  curPath: null,
  parentPath: null,
  write: false,
  entries: [],
  selected: null,
  sort: { key: 'name', dir: 1 },
  view: 'details',
  filter: '',
  typeValue: cfg.type || '*',
  collapsed: {},
}

const els = {
  body: document.body,
  sidebar: document.getElementById('sidebar'),
  recentList: document.getElementById('recentList'),
  recentHint: document.getElementById('recentHint'),
  rootsList: document.getElementById('rootsList'),
  crumbs: document.getElementById('crumbs'),
  addrView: document.getElementById('addrView'),
  addrDrop: document.getElementById('addrDrop'),
  addrInput: document.getElementById('addrInput'),
  backBtn: document.getElementById('backBtn'),
  fwdBtn: document.getElementById('fwdBtn'),
  upBtn: document.getElementById('upBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  searchInput: document.getElementById('searchInput'),
  listHead: document.getElementById('listHead'),
  listBody: document.getElementById('listBody'),
  emptyPane: document.getElementById('emptyPane'),
  filename: document.getElementById('filename'),
  filenameDrop: document.getElementById('filenameDrop'),
  filetype: document.getElementById('filetype'),
  okBtn: document.getElementById('okBtn'),
  cancelBtn: document.getElementById('cancelBtn'),
  dlgClose: document.getElementById('dlgClose'),
  configBtn: document.getElementById('configBtn'),
  organizeBtn: document.getElementById('organizeBtn'),
  newFolderBtn: document.getElementById('newFolderBtn'),
  viewBtn: document.getElementById('viewBtn'),
  helpBtn: document.getElementById('helpBtn'),
}

const PRESET_TYPES = [
  { label: '所有文件 (*.*)', value: '*' },
  { label: '图片 (*.jpg; *.png; *.gif; *.webp; *.bmp)', value: '*.jpg; *.png; *.gif; *.webp; *.bmp' },
  { label: '文本 (*.txt; *.md; *.json; *.log)', value: '*.txt; *.md; *.json; *.log' },
  { label: '压缩包 (*.zip; *.rar; *.7z)', value: '*.zip; *.rar; *.7z' },
]

let list = null
let nav = null
let actions = null

// API 基址按浏览器端真实页面路径拼接：/picker → /picker/api/…
// （不能写成相对 'api/...'：/picker 无尾斜杠时会被解析成 /api/...）
function apiPath(path) {
  return location.pathname.replace(/\/+$/, '') + '/api/' + path
}

// 根级 API（/api/fs）：页面在 /picker 或反代前缀 /xyz/picker 下都拼成 /[xyz/]api/fs
function rootApiPath(path) {
  const pagePath = location.pathname.replace(/\/+$/, '')
  return pagePath.slice(0, pagePath.lastIndexOf('/')) + '/api/' + path
}

function getJson(path) {
  return fetch(apiPath(path)).then(r => r.json())
}

function parentName(p) {
  const t = String(p || '').replace(/\/+$/, '')
  const segs = t.split('/')
  return segs[segs.length - 1] || t
}

function joinPath(base, name) {
  return String(base || '').replace(/\/+$/, '') + '/' + name
}

function normInput(v) {
  return String(v || '').trim().replace(/^["']|["']$/g, '').replace(/\\+/g, '/')
}

// ---------- 回传宿主 ----------
function hasHost() {
  return (window.parent && window.parent !== window) || window.opener
}

function buildFileUrl(p) {
  const segs = String(p).split('/')
  const enc = segs.map((s, i) => (i === 0 && /^[a-zA-Z]:$/.test(s) ? s : encodeURIComponent(s)))
  return new URL('file/' + enc.join('/'), location.href).href
}

function post(payload) {
  if (window.parent && window.parent !== window) window.parent.postMessage(payload, '*')
  if (window.opener) {
    window.opener.postMessage(payload, '*')
    window.close()
  }
}

function emitSelect(item, overwrite) {
  const payload = {
    source: 'u32-picker',
    action: 'select',
    mode: cfg.mode,
    selection: [{ name: item.name, type: item.type, path: item.path, url: buildFileUrl(item.path) }],
  }
  if (cfg.mode === 'save-file') payload.overwrite = overwrite === true
  if (!hasHost()) {
    showMessage('未检测到宿主窗口，选择结果：\n' + item.path, { icon: 'info' })
    return
  }
  post(payload)
}

function cancel() {
  if (hasHost()) {
    post({ source: 'u32-picker', action: 'cancel', mode: cfg.mode })
    return
  }
  // 独立打开（无宿主）：尽力关闭自身标签页，浏览器不允许时静默失败
  window.close()
}

// ---------- 模式相关的 UI 初始化 ----------
function setupModeUi() {
  if (cfg.dirOnly) {
    els.filetype.hidden = true
    els.filename.setAttribute('readonly', 'readonly')
    els.filenameDrop.hidden = true
  }
  setupFiletype()
}

function setupFiletype() {
  let options = PRESET_TYPES.slice()
  if (cfg.type) {
    options = [{ label: '指定类型 (' + cfg.type + ')', value: cfg.type }].concat(options)
    state.typeValue = cfg.type
  } else {
    state.typeValue = '*'
  }
  els.filetype.innerHTML = options.map(o =>
    '<option value="' + escapeHtml(o.value) + '">' + escapeHtml(o.label) + '</option>'
  ).join('')
  els.filetype.value = state.typeValue
}

// ---------- 列表回调 ----------
function onSelectionChange(sel) {
  if (cfg.dirOnly) {
    els.filename.value = sel ? sel.name : parentName(state.curPath)
    return
  }
  els.filename.value = sel ? sel.name : ''
}

function onLoaded() {
  if (!state.curPath) return
  els.searchInput.placeholder = '在 ' + parentName(state.curPath) + ' 中搜索'
  list.render()
  // 导航后清空文件名框；选择文件夹模式固定显示当前目录名
  els.filename.value = cfg.dirOnly ? parentName(state.curPath) : ''
}

// 完整路径直达命中文件（打开模式回传 / 另存为回填）
function onFilePath(st) {
  if (cfg.mode === 'open-dir') {
    return showMessage('当前模式只能选择文件夹。', { icon: 'warning' })
  }
  if (cfg.mode === 'save-file') {
    els.filename.value = parentName(st.path)
    return
  }
  emitSelect({ name: parentName(st.path), type: 'file', path: st.path })
}

// ---------- 提交 ----------
function currentOk() {
  if (cfg.mode === 'open-dir') {
    if (state.selected && state.selected.type === 'dir') return emitSelect(state.selected)
    if (!state.curPath) return
    return emitSelect({ name: parentName(state.curPath), type: 'dir', path: state.curPath })
  }
  const raw = normInput(els.filename.value)
  if (!raw) {
    if (cfg.allowEmpty && cfg.mode === 'open-file' && state.curPath) {
      return emitSelect({ name: parentName(state.curPath), type: 'dir', path: state.curPath })
    }
    return showMessage('请输入文件名。', { icon: 'warning' })
  }
  if (raw.indexOf('/') !== -1) {
    return nav.gotoPath(raw)
  }
  const name = cfg.mode === 'save-file' ? applyAutoExt(raw) : raw
  const entry = state.entries.find(e => e.name.toLowerCase() === name.toLowerCase())
  if (entry && entry.type === 'dir') {
    return nav.navigateTo(joinPath(state.curPath, entry.name))
  }
  if (entry) {
    const item = { name: entry.name, type: 'file', path: joinPath(state.curPath, entry.name) }
    if (cfg.mode === 'save-file') return saveAs(entry.name)
    return emitSelect(item)
  }
  if (cfg.mode === 'save-file') return saveAs(name)
  showMessage('当前文件夹中没有「' + raw + '」。\n输入完整路径可直接访问。', { icon: 'warning' })
}

function applyAutoExt(name) {
  if (name.indexOf('.') !== -1) return name
  const exts = typeFilterExts(state.typeValue)
  return exts && exts.length ? name + '.' + exts[0] : name
}

async function saveAs(name) {
  if (/[\\/:*?"<>|]/.test(name)) {
    return showMessage('文件名不能包含下列字符之一：\n\\ / : * ? " < > |', { icon: 'warning' })
  }
  const target = joinPath(state.curPath, name)
  const st = await getJson('stat?path=' + encodeURIComponent(target))
  if (!st.ok) {
    return showMessage(st.error || '无法检查目标文件', { icon: 'warning' })
  }
  let overwrite = false
  if (st.exists) {
    if (st.type === 'dir') {
      return showMessage('已存在同名文件夹「' + name + '」，请换一个文件名。', { icon: 'warning' })
    }
    const ok = await showConfirm('「' + name + '」已存在。\n要替换它吗？', { okLabel: '是', cancelLabel: '否' })
    if (!ok) return
    overwrite = true
  }
  rememberFilename(name)
  emitSelect({ name, type: 'file', path: target }, overwrite)
}

// ---------- 事件绑定 ----------
function bindEvents() {
  els.backBtn.addEventListener('click', () => nav.back())
  els.fwdBtn.addEventListener('click', () => nav.forward())
  els.upBtn.addEventListener('click', () => nav.up())
  els.refreshBtn.addEventListener('click', () => nav.refresh())

  els.listHead.addEventListener('click', ev => {
    const cell = ev.target.closest('.lh-cell[data-col]')
    if (cell) list.setSort(cell.dataset.col)
  })

  els.listBody.addEventListener('click', ev => {
    const group = ev.target.closest('.group-head')
    if (group) return list.toggleGroup(group.dataset.group)
    const row = ev.target.closest('.entry')
    if (!row || row.dataset.selectable === '0') return
    list.selectPath(row.dataset.path)
  })

  els.listBody.addEventListener('dblclick', ev => {
    const row = ev.target.closest('.entry')
    if (!row || row.dataset.selectable === '0') return
    const path = row.dataset.path
    const e = list.entryAt(path)
    if (!e) return
    if (e.type === 'dir') return nav.navigateTo(path)
    if (cfg.mode === 'open-file') {
      return emitSelect({ name: e.name, type: 'file', path })
    }
    if (cfg.mode === 'save-file') {
      els.filename.value = e.name
      return list.selectPath(path)
    }
  })

  els.listBody.addEventListener('contextmenu', ev => {
    const row = ev.target.closest('.entry')
    if (!row) return
    ev.preventDefault()
    list.selectPath(row.dataset.path)
    actions.listContextMenu(row.dataset.path, ev.clientX, ev.clientY)
  })

  els.searchInput.addEventListener('input', () => list.setFilter(els.searchInput.value))
  els.searchInput.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') {
      ev.stopPropagation()
      els.searchInput.value = ''
      list.setFilter('')
    }
  })

  els.filetype.addEventListener('change', () => {
    state.typeValue = els.filetype.value
    list.render()
  })

  els.viewBtn.addEventListener('click', () => actions.showViewMenu(els.viewBtn))
  els.organizeBtn.addEventListener('click', () => actions.showOrganizeMenu(els.organizeBtn))
  els.newFolderBtn.addEventListener('click', () => actions.newFolder())
  els.helpBtn.addEventListener('click', () => actions.showHelp())
  els.configBtn.addEventListener('click', () => {
    // 相对路径：/picker → /config；反代 /xyz/picker → /xyz/config
    window.open('config', '_blank', 'noopener')
  })

  els.filenameDrop.addEventListener('click', () => actions.showFilenameMenu(els.filenameDrop))
  els.filename.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') {
      ev.preventDefault()
      currentOk()
    }
  })

  els.okBtn.addEventListener('click', () => currentOk())
  els.cancelBtn.addEventListener('click', () => cancel())
  els.dlgClose.addEventListener('click', () => cancel())

  document.addEventListener('keydown', ev => {
    const tag = ev.target && ev.target.tagName
    const inInput = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
    if (ev.key === 'Escape') {
      if (inInput) return
      ev.preventDefault()
      cancel()
      return
    }
    if (ev.key === 'Enter' && !inInput) {
      ev.preventDefault()
      currentOk()
      return
    }
    if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
      if (inInput) return
      ev.preventDefault()
      list.moveSelection(ev.key === 'ArrowUp' ? -1 : 1)
      return
    }
    if (ev.key === 'Backspace' && !inInput) {
      ev.preventDefault()
      nav.up()
      return
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'l') {
      ev.preventDefault()
      nav.beginEditAddress()
      return
    }
    if (ev.key === 'F5') {
      ev.preventDefault()
      nav.refresh()
    }
  })
}

// ---------- 启动 ----------
async function boot() {
  const base = window.__PICKER_ASSET_BASE__ || (location.pathname.replace(/\/+$/, '') + '/')
  await loadIcons(base)
  mountIcons(document)

  setupModeUi()

  list = createList({ state, cfg, els, onSelectionChange })
  nav = createNav({ els, state, cfg, onLoaded, onFilePath })
  actions = createActions({
    state,
    cfg,
    els,
    list,
    nav,
    api: { getJson, apiPath, rootApiPath, joinPath, parentName },
    emitSelect,
  })

  bindEvents()
  nav.init()
}

boot()
