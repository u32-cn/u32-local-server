// U32Bridge 客户端：register → 循环 poll 蹲守 → onMessage 处理 → POST reply 回包
// 身份模型：appId（必传，一种 App 一个）+ appInstanceId（一个页面实例一个，客户端生成，可传固定值）
// poll 失败时指数退避重试（100ms 起，上限 5s）；404（服务器丢名册）自动重注册并沿用同一 appInstanceId
(function (global) {
  'use strict'

  const BASE = (function () {
    // 脚本从 u32-local-server 加载时用同源；否则默认本机服务地址
    try {
      if (global.location && /127\.0\.0\.1|localhost|::1|\[::1\]/.test(global.location.host)) return ''
    } catch (e) {}
    return 'http://127.0.0.1:19527'
  })()

  // crypto.randomUUID 需要 secure context；http 页面用 v4 随机数兜底
  function uuid() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID()
    const b = new Uint8Array(16)
    if (global.crypto && global.crypto.getRandomValues) global.crypto.getRandomValues(b)
    else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256)
    b[6] = (b[6] & 0x0f) | 0x40
    b[8] = (b[8] & 0x3f) | 0x80
    const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('')
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
  }

  const state = {
    appId: null,
    appInstanceId: null,
    connected: false,
    backoff: 100,
  }

  async function jfetch(url, options) {
    const res = await fetch(url, options)
    const data = await res.json()
    return { res, data }
  }

  // appInstanceId 必须由页面侧生成（服务器不代生成）：首次随机 UUID，重连沿用同一 id
  function newInstanceId() {
    return (global.crypto && typeof global.crypto.randomUUID === 'function')
      ? global.crypto.randomUUID()
      : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2)
  }

  async function register(handlers) {
    if (!state.appInstanceId) state.appInstanceId = newInstanceId()
    const { res, data } = await jfetch(BASE + '/bridge/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appId: state.appId,
        appInstanceId: state.appInstanceId, // 重连沿用同一实例 id；首次为客户端生成的 UUID
        url: handlers.url || (global.location ? global.location.href : ''),
        title: handlers.title || (global.document ? global.document.title : ''),
        help: handlers.help || '',
      }),
    })
    if (!res.ok || !data || !data.appInstanceId) {
      throw new Error('register failed: ' + (data && data.error ? data.error : JSON.stringify(data)))
    }
    state.appInstanceId = data.appInstanceId
    return data.appInstanceId
  }

  async function reply(msgId, result) {
    const body = result && result.error !== undefined
      ? { id: msgId, error: result.error }
      : { id: msgId, payload: result && result.payload !== undefined ? result.payload : result }
    // 回包失败重试 1~2 次；服务器按 id 幂等
    for (let i = 0; i < 3; i++) {
      try {
        await jfetch(BASE + '/bridge/api/reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        return
      } catch (e) {
        if (i === 2) throw e
        await new Promise(r => setTimeout(r, 300))
      }
    }
  }

  async function pollLoop(handlers) {
    while (state.connected) {
      let data
      try {
        const { res, data: d } = await jfetch(BASE + '/bridge/api/poll/' + state.appInstanceId)
        if (res.status === 404) {
          // 名册已移除（服务器重启/判定离线）→ 用同一 appInstanceId 重新注册
          await new Promise(r => setTimeout(r, state.backoff))
          await register(handlers)
          continue
        }
        if (!res.ok) throw new Error('poll http ' + res.status)
        data = d
        state.backoff = 100 // 成功后重置退避
      } catch (e) {
        // 网络失败：指数退避重试
        await new Promise(r => setTimeout(r, state.backoff))
        state.backoff = Math.min(state.backoff * 2, 5000)
        continue
      }
      const messages = (data && data.messages) || []
      for (const msg of messages) {
        let result
        try {
          if (handlers.onMessage) {
            result = await handlers.onMessage(msg)
          }
        } catch (e) {
          result = { error: (e && e.message) || String(e) }
        }
        try {
          await reply(msg.id, result)
        } catch (e) { /* 回包彻底失败：服务器 /send 会超时 504 */ }
      }
    }
  }

  const U32Bridge = {
    /**
     * 连接到 u32-local-server 浏览器桥
     * @param {object} options
     * @param {string}   options.appId        必传：App 种类标识，一种 App 一个
     * @param {string}   options.help         必传：本 App 功能、可调用指令、通信协议的说明（供 AI 阅读）
     * @param {string}   [options.appInstanceId] 实例标识；缺省自动生成 UUID（同页面多实例各自不同）
     * @param {string}   [options.url]        注册时上报的页面 URL（默认取 location.href）
     * @param {string}   [options.title]      注册时上报的标题（默认取 document.title）
     * @param {function} options.onMessage    收到消息回调，可 async；返回值/抛错自动作为回包
     * @returns {Promise<{appInstanceId: string, disconnect: function}>}
     */
    async connect(options) {
      const handlers = options || {}
      if (!handlers.appId) throw new Error('U32Bridge.connect: appId is required')
      if (!handlers.help) throw new Error('U32Bridge.connect: help is required')
      if (state.connected) throw new Error('U32Bridge already connected')
      state.appId = handlers.appId
      state.appInstanceId = handlers.appInstanceId || uuid()
      state.connected = true
      const appInstanceId = await register(handlers)
      pollLoop(handlers) // 后台死循环，不 await
      return {
        appInstanceId,
        disconnect() { state.connected = false },
      }
    },
    get appInstanceId() { return state.appInstanceId },
    get appId() { return state.appId },
  }

  global.U32Bridge = U32Bridge
})(typeof window !== 'undefined' ? window : globalThis)

/*
<!-- 页面接入示例 -->
<script src="http://127.0.0.1:19527/public/bridge-client.js"></script>
<script>
  U32Bridge.connect({
    appId: 'my-tool',
    help: '图片压缩工具。指令: compress { url, quality } → { base64 }',
    onMessage: async (msg) => {
      // 页面自定义业务：解析 msg.type / msg.payload
      return { payload: { done: true } }  // 返回值自动作为回包
    }
  }).then(h => console.log('bridge connected', h.appInstanceId))
</script>
*/
