// picker UI 原语：图标雪碧图加载、Win10 风格消息框/确认框/输入框、右键菜单
// 所有提示统一走本模块，不使用 alert/confirm/prompt

let spriteLoaded = null
let menuCleanup = null
let boxCleanup = null

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function escapeAttr(s) {
  return escapeHtml(s)
}

export function icon(name, cls) {
  return '<svg class="ico' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#i-' + name + '"></use></svg>'
}

// 拉取 icons.svg 注入文档（一次），供 <use href="#i-xxx"> 引用
export function loadIcons(base) {
  if (spriteLoaded) return spriteLoaded
  spriteLoaded = fetch(base + 'icons.svg')
    .then(r => (r.ok ? r.text() : Promise.reject(new Error('icons.svg ' + r.status))))
    .then(svg => {
      document.getElementById('iconSprite').innerHTML = svg
    })
    .catch(err => {
      console.warn('[picker] 图标加载失败:', err.message)
    })
  return spriteLoaded
}

// 把骨架里 data-icon 占位元素填充为 <use>
export function mountIcons(root) {
  root.querySelectorAll('[data-icon]').forEach(el => {
    if (el.dataset.iconMounted === '1') return
    const name = el.getAttribute('data-icon')
    if (!name) return
    el.innerHTML = '<use href="#i-' + name + '"></use>'
    el.dataset.iconMounted = '1'
  })
}

// 消息框：buttons = [{ label, value, primary }]
function openBox(opts) {
  const layer = document.getElementById('modalLayer')
  closeMenus()
  if (boxCleanup) boxCleanup()
  const buttons = opts.buttons || [{ label: '确定', value: true, primary: true }]
  const inputHtml = opts.input
    ? '<input class="filename-input msgbox-input" id="msgboxInput" data-u32-name="msgbox-input" type="text" spellcheck="false" value="' + escapeHtml(opts.inputValue || '') + '">'
    : ''
  const buttonsHtml = buttons.map((b, i) =>
    '<button class="dlg-btn' + (b.primary ? ' primary' : '') + '" data-idx="' + i + '" data-u32-name="msgbox-btn-' + i + '">' + escapeHtml(b.label) + '</button>'
  ).join('')
  layer.innerHTML = '<div class="msgbox" data-u32-name="msgbox">' +
    '<div class="msgbox-body" data-u32-name="msgbox-body">' +
    icon(opts.icon || 'info', 'msgbox-icon') +
    '<div class="msgbox-text" data-u32-name="msgbox-text">' + escapeHtml(opts.text || '').replace(/\n/g, '<br>') + '</div>' +
    '</div>' + inputHtml +
    '<div class="msgbox-btns" data-u32-name="msgbox-btns">' + buttonsHtml + '</div>' +
    '</div>'
  layer.hidden = false

  return new Promise(resolve => {
    const inputEl = layer.querySelector('.msgbox-input')
    const done = value => {
      layer.hidden = true
      layer.innerHTML = ''
      if (boxCleanup === finish) boxCleanup = null
      resolve(value)
    }
    const finish = () => done(null)
    const onClick = ev => {
      const btn = ev.target.closest('[data-idx]')
      if (!btn) return
      const b = buttons[Number(btn.dataset.idx)]
      done(inputEl ? (inputEl.value || '') : b.value)
    }
    const onKey = ev => {
      if (ev.key === 'Escape') {
        ev.preventDefault()
        ev.stopPropagation()
        const cancel = buttons.find(b => b.value === false || b.value === null)
        done(cancel ? cancel.value : null)
      } else if (ev.key === 'Enter' && (opts.input || buttons.length === 1)) {
        ev.preventDefault()
        const primary = buttons.find(b => b.primary) || buttons[0]
        done(inputEl ? (inputEl.value || '') : primary.value)
      }
    }
    layer.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey, true)
    boxCleanup = () => {
      layer.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey, true)
      layer.hidden = true
      layer.innerHTML = ''
    }
    if (inputEl) {
      inputEl.focus()
      inputEl.select()
    } else {
      const primaryBtn = layer.querySelector('.primary')
      if (primaryBtn) primaryBtn.focus()
    }
  })
}

export function showMessage(text, opts = {}) {
  return openBox({
    icon: opts.icon || 'info',
    text,
    buttons: opts.buttons || [{ label: opts.okLabel || '确定', value: true, primary: true }],
  })
}

export function showConfirm(text, opts = {}) {
  return openBox({
    icon: 'warning',
    text,
    buttons: [
      { label: opts.okLabel || '是', value: true, primary: true },
      { label: opts.cancelLabel || '否', value: false },
    ],
  }).then(v => v === true)
}

export function showPrompt(text, value, opts = {}) {
  return openBox({
    icon: 'info',
    text,
    input: true,
    inputValue: value || '',
    buttons: [
      { label: opts.okLabel || '确定', value: true, primary: true },
      { label: '取消', value: false },
    ],
  })
}

// 菜单：items = [{ label, action, disabled }, { separator: true }]
export function showMenu(x, y, items) {
  closeMenus()
  const layer = document.getElementById('menuLayer')
  const html = items.map((item, i) => {
    if (item.separator) return '<div class="menu-sep" data-u32-name="menu-sep"></div>'
    return '<button class="menu-item" data-idx="' + i + '" data-u32-name="menu-item-' + i + '"' +
      (item.disabled ? ' disabled' : '') + '>' + escapeHtml(item.label) + '</button>'
  }).join('')
  layer.innerHTML = '<div class="menu" data-u32-name="menu">' + html + '</div>'
  layer.hidden = false
  const menuEl = layer.firstElementChild
  const left = Math.min(x, window.innerWidth - menuEl.offsetWidth - 4)
  const top = Math.min(y, window.innerHeight - menuEl.offsetHeight - 4)
  menuEl.style.left = Math.max(0, left) + 'px'
  menuEl.style.top = Math.max(0, top) + 'px'

  const onClick = ev => {
    const itemEl = ev.target.closest('.menu-item')
    if (!itemEl) {
      if (!ev.target.closest('.menu')) closeMenus()
      return
    }
    if (itemEl.disabled) return
    const item = items[Number(itemEl.dataset.idx)]
    closeMenus()
    if (item && item.action) item.action()
  }
  // 打开菜单这次点击的 mousedown 可能晚于定时器投递（自动化/合成事件），用时间窗忽略它
  const openedAt = Date.now()
  const onDocDown = ev => {
    if (Date.now() - openedAt < 200) return
    if (!ev.target.closest('.menu')) closeMenus()
  }
  const onKey = ev => {
    if (ev.key === 'Escape') {
      ev.stopPropagation()
      closeMenus()
    }
  }
  const timer = setTimeout(() => {
    document.addEventListener('mousedown', onDocDown, true)
    document.addEventListener('keydown', onKey, true)
  }, 0)
  layer.addEventListener('click', onClick)
  menuCleanup = () => {
    clearTimeout(timer)
    document.removeEventListener('mousedown', onDocDown, true)
    document.removeEventListener('keydown', onKey, true)
    layer.removeEventListener('click', onClick)
    layer.hidden = true
    layer.innerHTML = ''
  }
}

export function closeMenus() {
  if (!menuCleanup) return
  const fn = menuCleanup
  menuCleanup = null
  fn()
}
