/**
 * dsh-quick-prompts 折叠状态「默认值 / 每设备记忆」回归测试。
 *
 * 规则（用户 2026-10-05 确认）：
 *  - 窄屏（≤640px，手机 / 远程查看）且本设备没有记录 → 默认收起，让出高度；
 *  - 宽屏（电脑）且没有记录 → 默认展开；
 *  - 本设备记过就按记录走，与视口无关；
 *  - localStorage 不可用（隐私模式等）时安全回退到视口默认。
 *
 * 每个用例用带 query 的动态 import 取一份全新的模块实例，避免模块级状态互相污染。
 * 运行：node test-collapse.mjs
 */
import assert from 'node:assert/strict'

console.log('dsh-quick-prompts 折叠默认值 / 每设备记忆回归\n')

let passed = 0
const ok = (name) => { passed++; console.log('  \u2713 ' + name) }

const CATS = [{ id: 'c1', name: '常用', prompts: [{ id: 'p1', title: '继续', text: '继续', order: 1 }] }]

/** React 替身：stateQueue 里放 SKIP 表示「这一格用组件自己的初始值」。 */
const SKIP = Symbol('use-init')
let stateQueue = []
const React = {
  createElement(type, props, ...children) { return { type, props: props || {}, children } },
  useState(init) {
    const v = stateQueue.length ? stateQueue.shift() : SKIP
    return [v === SKIP ? init : v, () => { }]
  },
  useEffect() { },
  useRef(init) { return { current: init } },
}

let caseSeq = 0

/**
 * 用给定环境加载一份全新模块，渲染 dock 快捷条。
 * @returns { collapsed, barTree, triTitle } 收起状态、快捷条元素树（收起时为 null）、三角 title
 */
async function probe({ narrow, stored, storageWorks = true }) {
  const store = new Map()
  if (stored !== undefined) store.set('dsh-quick-prompts.collapsed', stored)

  let factory = null
  const injected = []
  globalThis.window = {
    __ModuleLoader__: { load(m) { factory = m } },
    innerWidth: narrow ? 390 : 1440,
    matchMedia: () => ({ matches: narrow }),
    localStorage: storageWorks
      ? { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) }
      : { getItem() { throw new Error('localStorage 不可用') }, setItem() { throw new Error('localStorage 不可用') } },
  }
  globalThis.document = {
    createElement: () => ({ attrs: {}, setAttribute(k, v) { this.attrs[k] = v }, remove() {}, textContent: '' }),
    head: { appendChild(el) { injected.push(el) } },
    querySelectorAll: (sel) => (/^style\[/.test(String(sel)) ? [] : []),
  }

  await import('./lib/client.js?collapse-case=' + String(++caseSeq))
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

  // 第一个 useState 是折叠状态：用 SKIP 让它取组件自己的初始值（即 collapseState 的默认值）
  stateQueue = [SKIP, CATS]
  const barEl = components['conversation.input.dock']({ inputActions: { setDraft() { }, submit() { } }, input: { draft: '' } })
  const barTree = barEl.type(barEl.props)

  stateQueue = [SKIP, CATS, false, { x: 0, y: 0 }, null, null, false, [], false]
  const seatEl = components['conversation.input.left']({ inputActions: { setDraft() { }, submit() { } }, input: { draft: '' } })
  const seatTree = seatEl.type(seatEl.props)
  let triTitle = null
  const walk = (n) => {
    if (!n || typeof n !== 'object') return
    if (n.type === 'button' && n.props.className === 'qp-tri') triTitle = n.props.title
    for (const c of n.children || []) (Array.isArray(c) ? c.forEach(walk) : walk(c))
  }
  walk(seatTree)

  return { collapsed: barTree === null, barTree, triTitle }
}

/* 1. 窄屏 + 无记录 → 默认收起 */
{
  const r = await probe({ narrow: true })
  assert.equal(r.collapsed, true, '窄屏且无记录时应默认收起')
  assert.equal(r.triTitle, '展开快捷语', '收起时三角提示应为「展开快捷语」')
  ok('窄屏（手机/远程）无记录：默认收起，快捷条 0 高度')
}

/* 2. 宽屏 + 无记录 → 默认展开 */
{
  const r = await probe({ narrow: false })
  assert.equal(r.collapsed, false, '宽屏且无记录时应默认展开')
  assert.ok(r.barTree, '展开时应渲染出快捷条')
  assert.equal(r.triTitle, '收起快捷语', '展开时三角提示应为「收起快捷语」')
  ok('宽屏（电脑）无记录：默认展开，与现状一致')
}

/* 3. 记录优先于视口：宽屏记过收藏 → 收起 */
{
  const r = await probe({ narrow: false, stored: '1' })
  assert.equal(r.collapsed, true, '本设备记过「收起」时，即使宽屏也应收起')
  ok('本设备记录优先：宽屏记过收起 → 仍收起')
}

/* 4. 记录优先于视口：窄屏记过展开 → 展开 */
{
  const r = await probe({ narrow: true, stored: '0' })
  assert.equal(r.collapsed, false, '本设备记过「展开」时，即使窄屏也应展开')
  ok('本设备记录优先：窄屏记过展开 → 仍展开')
}

/* 5. localStorage 不可用 → 回退到视口默认，不抛错 */
{
  const narrow = await probe({ narrow: true, storageWorks: false })
  assert.equal(narrow.collapsed, true, 'localStorage 不可用时，窄屏应回退为默认收起')
  const wide = await probe({ narrow: false, storageWorks: false })
  assert.equal(wide.collapsed, false, 'localStorage 不可用时，宽屏应回退为默认展开')
  ok('localStorage 不可用（隐私模式）：安全回退到视口默认')
}

console.log('\n全部通过：' + passed + ' 项')
