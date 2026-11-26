// picker 动作层：工具条菜单、新建文件夹、帮助、右键菜单、复制路径
// 由 main.js 注入 { state, cfg, els, list, nav, api, emitSelect }，避免与状态机耦合

import { showMessage, showPrompt, showMenu } from './ui.js'
import { getShowHidden, setShowHidden } from './list.js'

const FILENAMES_KEY = 'u32picker.filenames'

// 文件名输入历史：最近使用置顶，最多 8 条
export function getFilenames() {
  try {
    const v = JSON.parse(localStorage.getItem(FILENAMES_KEY))
    return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function rememberFilename(name) {
  const list = getFilenames().filter(x => x !== name)
  list.unshift(name)
  try {
    localStorage.setItem(FILENAMES_KEY, JSON.stringify(list.slice(0, 8)))
  } catch {
    // 忽略配额/隐私模式错误
  }
}

export function createActions({ state, cfg, els, list, nav, api, emitSelect }) {
  function showViewMenu(anchor) {
    const rect = anchor.getBoundingClientRect()
    showMenu(rect.left, rect.bottom + 2, [
      { label: '详细信息', action: () => list.setView('details') },
      { label: '大图标', action: () => list.setView('icons') },
    ])
  }

  function showOrganizeMenu(anchor) {
    const rect = anchor.getBoundingClientRect()
    showMenu(rect.left, rect.bottom + 2, [
      { label: '刷新', action: () => nav.refresh() },
      { separator: true },
      { label: '按名称排序', action: () => list.setSort('name') },
      { label: '按修改日期排序', action: () => list.setSort('mtime') },
      { label: '按类型排序', action: () => list.setSort('type') },
      { label: '按大小排序', action: () => list.setSort('size') },
      { separator: true },
      { label: (getShowHidden() ? '✓ ' : '') + '显示隐藏的项目', action: () => { setShowHidden(!getShowHidden()); list.render() } },
      { separator: true },
      { label: '新建文件夹', action: newFolder, disabled: !state.write },
    ])
  }

  function showFilenameMenu(anchor) {
    const rect = anchor.getBoundingClientRect()
    const names = getFilenames()
    if (!names.length) {
      return showMenu(rect.left, rect.bottom + 2, [{ label: '暂无最近使用的文件名', disabled: true }])
    }
    showMenu(rect.left, rect.bottom + 2, names.map(n => ({
      label: n,
      action: () => { els.filename.value = n },
    })))
  }

  async function newFolder() {
    if (!state.curPath) return
    if (!state.write) {
      return showMessage('当前目录为只读，不能新建文件夹。\n请在配置页把该允许条目的权限改为「读写」。', { icon: 'warning' })
    }
    const input = await showPrompt('新建文件夹', '', { okLabel: '创建' })
    if (input === null) return
    const name = String(input).trim()
    if (!name) return
    if (/[\\/:*?"<>|]/.test(name)) {
      return showMessage('文件夹名不能包含下列字符之一：\n\\ / : * ? " < > |', { icon: 'warning' })
    }
    const target = api.joinPath(state.curPath, name)
    const res = await fetch(api.rootApiPath('fs'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mkdir', path: target, recursive: false }),
    })
    let data
    try {
      data = await res.json()
    } catch {
      data = { ok: false, error: '服务返回非 JSON：HTTP ' + res.status }
    }
    if (!data.ok) {
      return showMessage(data.error || '新建文件夹失败', { icon: 'warning' })
    }
    await nav.refresh()
    list.selectPath(target)
    els.filename.value = name
  }

  function showHelp() {
    showMessage(
      'u32-picker 文件选择器\n\n' +
      '· 浏览范围受「允许的目录」限制，可在配置页调整\n' +
      '· 双击文件夹进入；' + (cfg.dirOnly ? '当前为选择文件夹模式' : '双击文件即选中') + '\n' +
      '· 快捷键：Esc 取消，Enter ' + (cfg.mode === 'save-file' ? '保存' : '确认') + '，Backspace 向上一级\n' +
      '· Ctrl+L 编辑地址栏，F5 刷新，右键可复制完整路径、新建文件夹',
      { icon: 'info' }
    )
  }

  async function copyPath(path) {
    try {
      await navigator.clipboard.writeText(path)
      return
    } catch {
      // 非安全上下文/权限被拒 → 回退到临时 textarea
      const ta = document.createElement('textarea')
      ta.value = path
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
      } catch {
        showMessage('复制失败，请手动复制：\n' + path, { icon: 'warning' })
      }
      ta.remove()
    }
  }

  function listContextMenu(path, x, y) {
    const e = list.entryAt(path)
    const items = []
    if (e) {
      items.push({
        label: e.type === 'dir' ? '打开' : (cfg.mode === 'save-file' ? '使用此文件名' : '选择'),
        action: () => {
          if (e.type === 'dir') return nav.navigateTo(path)
          if (cfg.mode === 'save-file') {
            els.filename.value = e.name
            return list.selectPath(path)
          }
          emitSelect({ name: e.name, type: 'file', path })
        },
        disabled: cfg.dirOnly && e.type !== 'dir',
      })
    }
    items.push({ label: '复制完整路径', action: () => copyPath(path) })
    items.push({ separator: true })
    items.push({ label: '刷新', action: () => nav.refresh() })
    items.push({ label: '新建文件夹', action: newFolder, disabled: !state.write })
    showMenu(x, y, items)
  }

  return {
    showViewMenu,
    showOrganizeMenu,
    showFilenameMenu,
    newFolder,
    showHelp,
    copyPath,
    listContextMenu,
  }
}
