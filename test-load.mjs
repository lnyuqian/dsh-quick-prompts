/**
 * dsh-quick-prompts 载入自检（v0.7.6）。
 *
 * 为什么单独一个文件：2026-10-17 踩过一次 —— 删函数时漏删 `internals` 里的导出引用，
 * `lib/client.js` **一加载就抛 ReferenceError**，于是闪电笔按钮与折叠三角全都不渲染。
 * 语法检查（node --check）看不出来，只有「真的把它加载一遍」才炸。
 * 所以这里把「能加载 + 能物化 + 导出完整 + 无无结构日志」变成一条可复现的命令，
 * 放在 `npm test` 最前面快速失败，并作为 `.githooks/pre-commit` 的闸门内容。
 *
 * 运行：node test-load.mjs
 */
import assert from 'node:assert/strict'

console.log('dsh-quick-prompts 载入自检\n')

let passed = 0
const ok = (name) => { passed++; console.log('  \u2713 ' + name) }

/* 最小宿主替身：只给「模块加载期」真正会用到的东西 */
let factory = null
globalThis.window = {
  __ModuleLoader__: { load(m) { factory = m } },
  innerWidth: 1440,
  innerHeight: 900,
  matchMedia: () => ({ matches: false }),
  localStorage: { getItem: () => null, setItem() { } },
}
globalThis.document = {
  createElement: () => ({ setAttribute() { }, remove() { }, textContent: '' }),
  head: { appendChild() { } },
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() { },
  removeEventListener() { },
  addEventListenerCount: 0,
}

const React = {
  createElement(type, props, ...children) { return { type, props: props || {}, children } },
  Fragment: Symbol('Fragment'),
  useState(init) { return [init, () => { }] },
  useEffect() { },
  useRef(init) { return { current: init } },
}

/* 0. 载入：这一步就是本次事故的现场 —— 模块级引用错误会在这里抛出来 */
// 可选参数：指定要检查的 client 副本（用来验证「这道闸门真的能拦住坏代码」）
const arg = process.argv[2] || './lib/client.js'
const target = /^[./]/.test(arg) || /^[a-zA-Z]+:/.test(arg) ? arg : './' + arg
await import(target + '?load-check=1')
assert.ok(factory, '模块应在 window.__ModuleLoader__.load 注册 factory')
ok('加载：import lib/client.js 不抛（模块级引用完整）')

/* 1. 物化期不许打日志（D6：新代码禁止无结构日志行） */
const logs = []
const origLog = console.log
const origWarn = console.warn
const origErr = console.error
console.log = (...a) => { logs.push(['log', a.join(' ')]) }
console.warn = (...a) => { logs.push(['warn', a.join(' ')]) }
console.error = (...a) => { logs.push(['error', a.join(' ')]) }
let mod = null
try {
  mod = factory.factory((name) => {
    if (name === 'react') return React
    throw new Error('未预期的 require: ' + name)
  })
} finally {
  console.log = origLog
  console.warn = origWarn
  console.error = origErr
}
ok('物化：factory 能在最小替身下跑完（无未预期依赖）')

/* 2. 物化期打了无结构日志 → 直接失败（D6） */
assert.deepEqual(logs, [], '物化期不应向 console 打任何东西，实际：' + JSON.stringify(logs))
ok('物化期零日志（D6：结构化事件 / 派生，禁止无结构日志行）')

/* 3. 导出完整：每个 key 都必须有值 —— 删函数漏删导出的错，这一步能直接点名 */
assert.equal(typeof mod.apply, 'function', '应导出 apply')
assert.ok(Array.isArray(mod.inject) && mod.inject.indexOf('slots') >= 0, '应声明 inject: [\'slots\']')
assert.ok(mod.internals && typeof mod.internals === 'object', '应导出 internals')
const missing = Object.keys(mod.internals).filter((k) => mod.internals[k] === undefined)
assert.deepEqual(missing, [], 'internals 里有 undefined 导出：' + missing.join(', '))
assert.ok(Object.keys(mod.internals).length >= 10, 'internals 应包含纯函数与常量（供回归测试）')
ok('导出完整：apply / inject / internals（' + Object.keys(mod.internals).length + ' 项，无 undefined）')

/* 4. 注册两个槽位：按钮与弹层挂在哪，一眼看得见（D3：依赖显式） */
const slots = {}
mod.apply({
  get: (k) => (k === 'slots' ? {
    inject(_n, fn) { fn() },
    register(meta, comp) { slots[meta.name] = { meta: meta, comp: comp }; return () => { } },
  } : undefined),
  effect(fn) { if (typeof fn === 'function') { const c = fn(); void c } },
})
assert.ok(slots['conversation.input.dock'], '应注册「常驻快捷条」槽位 conversation.input.dock')
assert.ok(slots['conversation.input.left'], '应注册「闪电笔」槽位 conversation.input.left')
assert.equal(typeof slots['conversation.input.left'].comp, 'function', '槽位里应是组件函数')
ok('注册：conversation.input.dock（快捷条）+ conversation.input.left（闪电笔）都在')

/* 5. 组件能渲染成树（不抛）：这是「按钮与三角消失」那类问题的第一道防线 */
const seatTree = slots['conversation.input.left'].comp({ inputActions: { setDraft() { }, submit() { } }, input: { draft: '' } })
assert.ok(seatTree && typeof seatTree === 'object', '闪电笔组件应能返回元素树')
// 槽位里是「包一层」的组件：先求值一层，拿到真正的元素树
const resolved = typeof seatTree.type === 'function' ? seatTree.type(seatTree.props) : seatTree
assert.ok(resolved && typeof resolved === 'object', '闪电笔组件应能渲染出元素树（不抛）')
const walk = (node, out) => {
  if (!node || typeof node !== 'object') return out
  out.push(node)
  for (const c of node.children || []) (Array.isArray(c) ? c.forEach((x) => walk(x, out)) : walk(c, out))
  return out
}
const nodes = walk(resolved, [])
const hasClass = (cls) => nodes.some((n) => n.type === 'button' && String((n.props || {}).className || '').split(/\s+/).indexOf(cls) >= 0)
assert.ok(hasClass('qp-btn'), '应渲染闪电笔按钮 .qp-btn')
assert.ok(hasClass('qp-tri'), '应渲染折叠三角 .qp-tri')
ok('渲染：闪电笔按钮 .qp-btn 与折叠三角 .qp-tri 都在（面板关闭态也能渲染出按钮）')

console.log('\n全部通过：' + passed + ' 项')
