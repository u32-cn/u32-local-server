// Browser Bridge 基本流程测试
// 用法：先启动服务器（npm start），再 node test/bridge.test.js [baseUrl]
// 覆盖：① 注册→send→poll→reply 全链路  ② 回包 error 路径  ③ reply 幂等
//       ④ /send 回包超时 504  ⑤ 未知 id 404 / 参数非法 400  ⑥ upsert 重连
//       ⑦ /apps 聚合（空心跳用例需等 25s，整体约 100s）
'use strict'

const BASE = process.argv[2] || 'http://127.0.0.1:19527'

let passed = 0
let failed = 0

function check(name, cond, detail) {
  if (cond) {
    passed++
    console.log(`  PASS ${name}`)
  } else {
    failed++
    console.log(`  FAIL ${name}${detail ? ' — ' + JSON.stringify(detail) : ''}`)
  }
}

async function jfetch(path, options) {
  const res = await fetch(BASE + path, options)
  let data = null
  try { data = await res.json() } catch (e) {}
  return { res, data }
}

async function register(appId, help, appInstanceId, extra) {
  // 新协议：appInstanceId 页面侧生成、必传（缺省测试桩自动生成 UUID）；extra 可传 appInstanceId: null 显式测 400
  const id = appInstanceId === undefined ? crypto.randomUUID() : appInstanceId
  const { res, data } = await jfetch('/bridge/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appId, help, appInstanceId: id, url: 'http://example.com/page', title: appId, ...extra }),
  })
  return { res, id: data && data.appInstanceId }
}

async function poll(id) {
  const { res, data } = await jfetch(`/bridge/api/poll/${id}`)
  return { res, messages: (data && data.messages) || [] }
}

async function reply(msgId, body) {
  return jfetch('/bridge/api/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: msgId, ...body }),
  })
}

async function send(id, body) {
  return jfetch(`/bridge/api/send/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function testFullFlow() {
  console.log('[1] 全链路：register → send → poll → reply → AI 收到结果')
  const { res, id } = await register('demo-app', '测试App。指令: echo → 回显')
  check('register 返回 appInstanceId', res.status === 200 && typeof id === 'string' && id.length > 0, { res: res.status, id })

  const pagesRes = await jfetch('/bridge/api/pages')
  const entry = pagesRes.data.find(p => p.appInstanceId === id)
  check('pages 条目含 appId/url/title/help', !!entry && entry.appId === 'demo-app' && entry.help.startsWith('测试App') && entry.url === 'http://example.com/page', entry)

  // 指定 appInstanceId 注册
  const { id: fixed } = await register('demo-app', '固定 id 实例', 'my-fixed-instance')
  check('指定 appInstanceId 注册生效', fixed === 'my-fixed-instance', fixed)

  // 先挂起 poll，再 send，验证挂起 poll 被即时兑现
  const pollPromise = poll(id)
  const sendPromise = send(id, { type: 'eval', payload: { expr: '1+1' }, timeoutMs: 5000 })
  const pollRes = await pollPromise
  check('挂起 poll 被即时兑现且带消息', pollRes.messages.length === 1 && pollRes.messages[0].type === 'eval' && pollRes.messages[0].payload.expr === '1+1', pollRes)
  const msg = pollRes.messages[0]

  const repRes = await reply(msg.id, { payload: { answer: 2 } })
  check('reply 返回 ok', repRes.res.status === 200 && repRes.data.ok === true, repRes.data)

  const sendRes = await sendPromise
  check('send 收到回包 payload', sendRes.res.status === 200 && sendRes.data.id === msg.id && sendRes.data.payload.answer === 2, sendRes.data)
}

async function testErrorReplyAndIdempotent() {
  console.log('[2] 页面回包 error 路径 + reply 幂等')
  const { id } = await register('err-app', '错误路径测试')
  const pollPromise = poll(id)
  const sendPromise = send(id, { type: 'boom', timeoutMs: 5000 })
  const { messages } = await pollPromise
  await reply(messages[0].id, { error: '页面业务失败' })
  const sendRes = await sendPromise
  check('error 回包传给 AI', sendRes.res.status === 200 && sendRes.data.error === '页面业务失败', sendRes.data)

  const repRes = await reply(messages[0].id, { payload: 'late' })
  check('已兑现 id 重复 reply 幂等返回 ok', repRes.res.status === 200 && repRes.data.ok === true, repRes.data)
}

async function testBacklogAndUpsert() {
  console.log('[3] 消息积压一次带走 + upsert 重连')
  const { id } = await register('backlog-app', '积压测试')
  // 先 send 两条（无挂起 poll → 积压 outbox）；send 是同步等回包的，不能 await（会挂到 504 且消息被移除），
  // 发起后稍候片刻确保两条都已入 outbox 再 poll（防竞态：poll 插在两条 send 之间只带走一条）
  const sendP1 = send(id, { type: 'm1', timeoutMs: 5000 })
  const sendP2 = send(id, { type: 'm2', timeoutMs: 5000 })
  await new Promise(r => setTimeout(r, 100))
  const { messages } = await poll(id)
  check('一次 poll 带走全部积压消息', messages.length === 2 && messages[0].type === 'm1' && messages[1].type === 'm2', messages)

  // upsert：同 appInstanceId 重连，清旧状态
  const { id: again } = await register('backlog-app', '重连后的 help', id)
  check('同 id 重连返回相同 appInstanceId', again === id, again)
  send(id, { type: 'stale', timeoutMs: 5000 })
  const upsertPages = await jfetch('/bridge/api/pages')
  const entry = upsertPages.data.find(p => p.appInstanceId === id)
  check('upsert 后 help 已更新', entry && entry.help === '重连后的 help', entry)
  const { messages: stale } = await poll(id)
  check('upsert 后 poll 正常取到新消息', stale.length === 1 && stale[0].type === 'stale', stale)

  // 无消息 poll 返回 200（空心跳要等 25s，完整等待由 testTimeout504 后的用例覆盖耗时）
  const { res, messages: empty } = await poll(id)
  check('无消息 poll 返回 200', res.status === 200, res.status)
  void empty
}

async function test404And400() {
  console.log('[4] 未知 id 404 / 参数非法 400 / /apps 聚合')
  const pollRes = await poll('no-such-id')
  check('poll 未知 id → 404', pollRes.res.status === 404, pollRes.res.status)
  const sendRes = await send('no-such-id', { type: 'x' })
  check('send 未知 id → 404', sendRes.res.status === 404, sendRes.res.status)

  const { id } = await register('bad-app', '参数校验测试')
  const badSend = await send(id, { timeoutMs: 1000 })
  check('send 缺 type → 400', badSend.res.status === 400, badSend.res.status)
  const noHelp = await register('no-help-app', undefined)
  check('register 缺 help → 400', noHelp.res.status === 400, noHelp.res.status)
  const noAppId = await register(undefined, '有 help 没 appId')
  check('register 缺 appId → 400', noAppId.res.status === 400, noAppId.res.status)
  const noInstance = await register('no-instance-app', '有 help 没 appInstanceId', null)
  check('register 缺 appInstanceId → 400（页面侧必传）', noInstance.res.status === 400, noInstance.res.status)
  const badReg = await jfetch('/bridge/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not json',
  })
  check('register 非法 JSON → 400', badReg.res.status === 400, badReg.res.status)

  const appsRes = await jfetch('/bridge/api/apps')
  const app = appsRes.data.find(a => a.appId === 'bad-app')
  check('apps 聚合含 help 与实例数', !!app && app.help === '参数校验测试' && app.instances >= 1, app)
}

async function testTimeout504() {
  console.log('[5] 回包超时 504')
  const { id } = await register('timeout-app', '超时测试')
  const t0 = Date.now()
  const sendRes = await send(id, { type: 'never-reply', timeoutMs: 1000 })
  const elapsed = Date.now() - t0
  check('send 无回包 → 504', sendRes.res.status === 504 && /timeout/.test(sendRes.data.error || ''), sendRes.data)
  check('504 按 timeoutMs 到点返回（~1s）', elapsed >= 900 && elapsed < 2000, elapsed + 'ms')
  // 此后 poll 不得再收到该消息
  const { messages } = await poll(id)
  check('超时消息已从 outbox 移除，poll 不再收到', messages.length === 0, messages)
}

async function testSameAppMultiInstance() {
  console.log('[6] 同 appId 多实例各自独立')
  const a = await register('multi-app', '多实例测试 A', 'multi-A')
  const b = await register('multi-app', '多实例测试 B', 'multi-B')
  check('同 appId 两个实例 id 互不相同', a.id !== b.id, [a.id, b.id])
  const pollPromise = poll(a.id)
  await send(b.id, { type: 'to-b', timeoutMs: 100 })
  const { messages } = await pollPromise
  check('发给 B 的消息不会送到 A', messages.length === 0, messages)
  const appsRes = await jfetch('/bridge/api/apps')
  const app = appsRes.data.find(x => x.appId === 'multi-app')
  check('apps 实例数聚合正确', app && app.instances === 2, app)
}

async function main() {
  const t0 = Date.now()
  await testFullFlow()
  await testErrorReplyAndIdempotent()
  await testBacklogAndUpsert()
  await test404And400()
  await testTimeout504()
  await testSameAppMultiInstance()
  console.log(`\n结果: ${passed} 通过, ${failed} 失败, 耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => { console.error('测试异常:', e); process.exit(1) })
