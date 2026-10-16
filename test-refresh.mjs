/**
 * dsh-quick-prompts「外部写入可见 + 编辑期不丢输入」回归测试。
 *
 * 修复的问题（2026-10-13）：客户端 store 原来只拉一次（`load()` 里
 * `if (categories !== null) return`），于是通过 `POST /api/quick-prompts`
 * 从外部写入的新分类/条目**只有整页重载才看得到**；更糟的是用户在面板里
 * 改了任意一条点「保存」时，`save()` 会把内存里那份旧列表**全量 POST** 回去，
 * 把外部写入直接抹掉。
 *
 * 本测试锁住四条不变量：
 *  1. `store.refresh()` 能把外部数据拉进内存并通知订阅者；
 *  2. 内容没变时不发通知（不产生多余渲染）；
 *  3. 请求在飞时不重复发；未强制时受 REFRESH_INTERVAL_MS 节流；
 *  4. **编辑锁**：编辑期间刷新只暂存（`pendingExternal`），绝不替换
 *     `categories`／覆盖编辑基线；退出编辑态后才落位。
 *
 * 运行：node test-refresh.mjs
 */
import assert from 'node:assert/strict'

console.log('dsh-quick-prompts 外部刷新 / 编辑锁回归\n')

let passed = 0
const ok = (name) => { passed++; console.log('  \u2713 ' + name) }

const CATS_A = [{ id: 'c1', name: '常用', prompts: [{ id: 'p1', title: '继续', text: '继续', order: 1 }] }]
const CATS_B = [
  { id: 'c1', name: '常用', prompts: [{ id: 'p1', title: '继续', text: '继续', order: 1 }] },
  { id: 'c2', name: '外部写入', prompts: [{ id: 'p2', title: '外部条目', text: '来自 API', order: 1 }] },
]

/* ---------------- 假 React：stateQueue 放 SKIP = 用组件自己的初始值 ---------------- */
const SKIP = Symbol('use-init')
let stateQueue = []
const React = {
  createElement(type, props, ...children) { return { type, props: props || {}, children } },
  Fragment: Symbol('Fragment'),
  useState(init) {
    const v = stateQueue.length ? stateQueue.shift() : SKIP
    return [v === SKIP ? init : v, () => { }]
  },
  useEffect() { },
  useRef(init) { return { current: init } },
}

let caseSeq = 0

/** 载入一份全新的客户端模块（每次用例一份实例，模块级状态不串味）。 */
async function loadModule() {
  let factory = null
  globalThis.window = {
    __ModuleLoader__: { load(m) { factory = m } },
    innerWidth: 1440,
    innerHeight: 800,
    matchMedia: () => ({ matches: false }),
    localStorage: { getItem: () => null, setItem() { } },
    addEventListener() { },
    removeEventListener() { },
  }
  globalThis.document = {
    createElement: () => ({ attrs: {}, setAttribute(k, v) { this.attrs[k] = v }, remove() { }, textContent: '' }),
    head: { appendChild() { } },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() { },
    removeEventListener() { },
    visibilityState: 'visible',
  }
  await import('./lib/client.js?refresh-case=' + String(++caseSeq))
  assert.ok(factory, '模块应在 window.__ModuleLoader__.load 注册 factory')

  const mod = factory.factory((name) => {
    if (name === 'react') return React
    throw new Error('未预期的 require: ' + name)
  })
  const components = {}
  mod.apply({
    get: (k) => (k === 'slots' ? {
      inject(_n, fn) { fn() },
      register(meta, comp) { components[meta.name] = comp; return () => { } },
    } : undefined),
    effect(fn) { if (typeof fn === 'function') fn() },
  })
  return { mod, components }
}

/**
 * 假 fetch：把「服务端状态」放在闭包里，GET 返回它、POST 用请求体替换它。
 * @returns { calls, server, fail: () => void } calls 记录请求；fail() 让下一次请求 reject。
 */
function installFetch(initial) {
  const calls = { gets: 0, posts: [] }
  const server = { cats: initial }
  let broken = false
  globalThis.fetch = function (url, opts) {
    if (broken) return Promise.reject(new Error('network down'))
    if (opts && opts.method === 'POST') {
      calls.posts.push(JSON.parse(opts.body))
      server.cats = JSON.parse(opts.body).categories
      return Promise.resolve({ json: () => Promise.resolve({ ok: true, categories: server.cats }) })
    }
    calls.gets++
    return Promise.resolve({ json: () => Promise.resolve({ ok: true, categories: server.cats }) })
  }
  return { calls, server, fail() { broken = true } }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

function walk(node, visit) {
  if (!node || typeof node !== 'object') return
  visit(node)
  for (const c of node.children || []) {
    if (Array.isArray(c)) c.forEach(function (x) { walk(x, visit) })
    else walk(c, visit)
  }
}
function find(tree, pred) {
  let hit = null
  walk(tree, (n) => { if (hit === null && pred(n)) hit = n })
  return hit
}

/* 1. refresh() 把外部写入拉进内存，并通知订阅者 */
{
  const { mod } = await loadModule()
  const { store } = mod.internals
  const { calls, server } = installFetch(CATS_A)
  const seen = []
  store.subs.push(() => seen.push(store.categories))

  store.load()
  await flush()
  assert.equal(store.categories.length, 1, '首次加载应拿到服务端那份')
  assert.equal(calls.gets, 1, '首次加载只发一次 GET')
  seen.length = 0

  // 外部写入（模拟另一个窗口 / API 直接 POST）：
  server.cats = CATS_B
  store.refresh(true)
  await flush()
  assert.equal(store.categories.length, 2, '刷新后内存里应看到外部新增的分类')
  assert.equal(store.categories[1].name, '外部写入', '外部新增分类名应正确')
  assert.equal(seen.length, 1, '有变化时应通知订阅者一次')
  ok('外部写入能被 refresh() 看到（不再需要整页重载）')
}

/* 2. 内容没变时不发通知 —— 不产生多余渲染 */
{
  const { mod } = await loadModule()
  const { store } = mod.internals
  installFetch(CATS_A)
  let notified = 0
  store.subs.push(() => notified++)

  store.load()
  await flush()
  notified = 0

  store.refresh(true)
  await flush()
  assert.equal(notified, 0, '服务端内容与内存一致时不应通知（无多余渲染）')
  ok('数据未变化：刷新不发通知，零多余渲染')
}

/* 3. 防抖与节流：请求在飞时不重复发；非强制时受时间窗口限制 */
{
  const { mod } = await loadModule()
  const { store } = mod.internals
  const { calls } = installFetch(CATS_A)
  store.load()
  // 不 await：手动触发时请求还在飞
  store.refresh(true)
  store.refresh(true)
  await flush()
  assert.equal(calls.gets, 1, '请求在飞时重复调用不应再发请求')

  store.refresh(true)
  await flush()
  assert.equal(calls.gets, 2, 'force=true 应忽略时间窗口')

  store.refresh()
  await flush()
  assert.equal(calls.gets, 2, '非强制且距上次同步不足窗口时应跳过')
  ok('请求在飞不重发；非强制刷新受 ' + mod.internals.REFRESH_INTERVAL_MS + 'ms 节流')
}

/* 4. 编辑锁：编辑期间刷新只暂存，绝不替换 categories（用户编辑基线不被覆盖） */
{
  const { mod } = await loadModule()
  const { store } = mod.internals
  const { server } = installFetch(CATS_A)
  store.load()
  await flush()
  const baseline = store.categories

  store.setEditLock(true)
  server.cats = CATS_B
  store.refresh(true)
  await flush()

  assert.equal(store.categories, baseline, '编辑锁期间 categories 必须保持原样（引用都不许换）')
  assert.deepEqual(store.categories, CATS_A, '内存里仍是编辑开始时的基线')
  assert.deepEqual(store.pendingExternal, CATS_B, '外部数据只应暂存进 pendingExternal')
  ok('编辑期间：只暂存外部数据，不换内存数据、不动编辑基线')

  // 编辑结束落位
  const applied = store.flushExternal()
  assert.equal(applied, true, '退出编辑态后应把暂存数据落位')
  assert.deepEqual(store.categories, CATS_B, '落位后内存即为服务端最新那份')
  assert.equal(store.pendingExternal, null, '落位后暂存应清空')
  ok('退出编辑态：暂存的外部数据落位，用户下次看到最新数据')
}

/* 5. 编辑期间用户「保存」：提交的是自己的编辑结果，且不会被外部版本回冲 */
{
  const { mod } = await loadModule()
  const { store } = mod.internals
  const { calls, server } = installFetch(CATS_A)
  store.load()
  await flush()

  store.setEditLock(true)
  server.cats = CATS_B
  store.refresh(true)
  await flush()
  assert.deepEqual(store.categories, CATS_A, '保存前内存基线仍未被外部数据替换，用户保存在自己的编辑结果之上')

  const myEdit = [{ id: 'c1', name: '常用', prompts: [{ id: 'p1', title: '我改的', text: '我改的', order: 1 }] }]
  await new Promise((resolve) => store.save(myEdit, () => resolve()))
  assert.equal(calls.posts.length, 1, '保存应发一次 POST')
  assert.deepEqual(calls.posts[0].categories, myEdit, 'POST 的应是用户编辑结果')
  assert.deepEqual(server.cats, myEdit, '服务端最终为用户编辑结果（语义未改：仍是全量替换）')
  assert.equal(store.pendingExternal, null, '保存成功后，此前暂存的外部版本即作废')
  store.setEditLock(false)
  store.flushExternal()
  assert.deepEqual(store.categories, myEdit, '保存后不应被旧的外部暂存回冲')
  ok('编辑期间保存：提交用户结果，暂存的外部版本作废，不回冲')
}

/* 6. 失败静默降级：拒绝的请求不抛错、不改数据、不污染 lastSyncAt */
{
  const { mod } = await loadModule()
  const { store } = mod.internals
  const env = installFetch(CATS_A)
  store.load()
  await flush()
  assert.deepEqual(store.categories, CATS_A, '先正常拿到数据')

  const before = store.lastSyncAt
  env.fail()
  store.refresh(true)
  await flush()
  assert.deepEqual(store.categories, CATS_A, '请求失败时继续用内存里那份（静默降级）')
  assert.equal(store.loading, false, '失败后应复位 loading，后续触发仍可重试')
  assert.equal(store.lastSyncAt, before, '失败不应写入 lastSyncAt（下次触发可立刻重试）')
  ok('刷新失败：静默降级，继续用内存数据且可立即重试')
}

/* 7. 订阅接口：pending 的出现与落位都能被组件侧感知（用于显示提示） */
{
  const { mod } = await loadModule()
  const { store } = mod.internals
  const { server } = installFetch(CATS_A)
  store.load()
  await flush()

  const seen = []
  const unsub = store.subscribePending((p) => seen.push(p === null ? null : p.length))
  store.setEditLock(true)
  server.cats = CATS_B
  store.refresh(true)
  await flush()
  store.setEditLock(false)
  store.flushExternal()
  unsub()

  assert.deepEqual(seen, [null, 2, 2, null], '订阅者应按「无 → 暂存 2 个分类 → 落位前 → 落位后清空」的顺序收到通知')
  ok('订阅接口：pending 出现/落位事件可被组件感知')
}

/* 8. 组件层：编辑态收到外部数据时只显示提示，不改 draft */
{
  const { mod, components } = await loadModule()
  const { store } = mod.internals
  installFetch(CATS_A)
  store.categories = CATS_A // 预置内存数据，避免渲染期触发 GET

  const draft = [{ id: 'p1', cat: '常用', title: '我正在写', text: '别动我', autoSend: false, order: 1 }]
  // stateQueue 顺序 = QuickPromptSeat 的 useState 顺序：
  // [useBarCollapsed(SKIP), useQuickCategories(分类数组), open, pos, error, info, editing, draft, saving, pendingExtern]
  stateQueue = [SKIP, CATS_A, true, { x: 0, y: 0 }, null, null, true, draft, false, true]
  const el = components['conversation.input.left']({ inputActions: { setDraft() { }, submit() { } }, input: { draft: '' } })
  const tree = el.type(el.props)

  const banner = find(tree, (n) => n.type === 'div' && String((n.props && n.props.className) || '') === 'qp-info' && String(n.children[0] || '').includes('数据已在别处更新'))
  assert.ok(banner, '编辑期间有外部数据时应显示「数据已在别处更新」提示')
  const titleInput = find(tree, (n) => n.type === 'input' && n.props.className === 'qp-edit-title')
  assert.equal(titleInput.props.value, '我正在写', '用户正在输入的标题必须原样保留（不被外部数据覆盖）')
  assert.equal(find(tree, (n) => n.type === 'input' && n.props.value === '外部条目'), null, '外部条目不得出现在编辑行里')
  ok('组件层：编辑中只提示，绝不覆盖 draft')
}

console.log('\n全部通过：' + passed + ' 项')
