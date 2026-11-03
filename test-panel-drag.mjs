/**
 * dsh-quick-prompts 面板（闪电弹层）拖拽排序回归测试（v0.7.12）。
 *
 * <用户> 2026-11-03 报：在闪电面板里按住分类拖动时，浏览器把这一下当成「选中文本」，
 * 提示语没收起、列表也不跟着滚动。本测试守住修复后的四条边界：
 *  - pointerdown 必须 preventDefault（否则默认的文本选择会吃掉拖动）；
 *  - 按下当帧就要挂上 document 的 pointermove / pointerup 监听（不等 useEffect）；
 *  - 位移超过阈值后进入拖拽态 → 提示词收起，只剩分类行；松手后监听要卸干净；
 *  - 贴近列表上下边缘时自动滚动（否则屏幕外的分类拖不到）。
 * 另守住 <用户> 2026-11-03 的间距要求：相邻分类按钮之间少 4px（.qp-cat 左右内边距 10px → 8px）。
 *
 * 运行：node test-panel-drag.mjs
 */
import assert from 'node:assert/strict'

console.log('dsh-quick-prompts 面板拖拽排序回归\n')

let passed = 0
const ok = (name) => { passed++; console.log('  \u2713 ' + name) }

const CATS = [
  { id: 'c1', name: 'JEV', prompts: [{ id: 'p1', title: '继续', text: '继续任务', order: 1 }] },
  { id: 'c2', name: '常用', prompts: [{ id: 'p2', title: '提交', text: '提交并推送', order: 1 }] },
  { id: 'c3', name: '效率', prompts: [] },
]

const SKIP = Symbol('use-init')
let stateQueue = []
let setterCalls = []

/** React 替身：createElement / useState / useEffect / useRef 够用即可。 */
const React = {
  createElement(type, props, ...children) { return { type, props: props || {}, children } },
  useState(init) {
    const v = stateQueue.length ? stateQueue.shift() : SKIP
    const value = v === SKIP ? init : v
    return [value, (next) => { setterCalls.push(next) }]
  },
  useEffect() { },
  useRef(init) { return { current: init } },
}

let caseSeq = 0

function ptr(over = {}) {
  return Object.assign({
    pointerType: 'mouse', button: 0, pointerId: 7, clientX: 0, clientY: 0,
    cancelable: true, prevented: 0,
    preventDefault() { this.prevented++ },
    stopPropagation() { },
  }, over)
}

/** 深度找 className 里含某个独立类名的节点 */
function findByClass(tree, cls, out = []) {
  if (!tree || typeof tree !== 'object') return out
  if (Array.isArray(tree)) { tree.forEach((t) => findByClass(t, cls, out)); return out }
  const cn = tree.props && tree.props.className
  if (typeof cn === 'string' && cn.split(' ').indexOf(cls) >= 0) out.push(tree)
  for (const c of tree.children || []) findByClass(c, cls, out)
  return out
}

/** 收集树里的文本，用来断言提示行存在 */
function textOf(node, out = []) {
  if (node === null || node === undefined) return out
  if (Array.isArray(node)) { node.forEach((n) => textOf(n, out)); return out }
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out }
  if (typeof node !== 'object') return out
  for (const c of node.children || []) textOf(c, out)
  return out
}

/**
 * 渲染一次闪电面板。drag=null 是浏览态初始；drag 传对象即「正在拖」的渲染态。
 * listEl 用来模拟滚动容器（自动滚动测试）。
 */
async function renderPanel({ drag = null, listEl = null, tutorial = false } = {}) {
  let factory = null
  const injected = []
  const docListeners = {}

  globalThis.window = {
    __ModuleLoader__: { load(m) { factory = m } },
    innerWidth: 1440, innerHeight: 900,
    matchMedia: () => ({ matches: false }),
    localStorage: { getItem: () => '0', setItem() { } },
    addEventListener() { }, removeEventListener() { },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  }
  globalThis.document = {
    createElement: () => ({ attrs: {}, style: {}, setAttribute(k, v) { this.attrs[k] = v }, remove() { }, textContent: '' }),
    head: { appendChild(el) { injected.push(el) } },
    body: { appendChild() { } },
    documentElement: { style: {} },
    querySelectorAll: () => [],
    querySelector: (sel) => (listEl && sel === '.qp-pop .qp-list' ? listEl : null),
    addEventListener(type, fn) { (docListeners[type] = docListeners[type] || []).push(fn) },
    removeEventListener(type, fn) {
      const list = docListeners[type] || []
      const i = list.indexOf(fn)
      if (i >= 0) list.splice(i, 1)
    },
  }

  await import('./lib/client.js?panel-case=' + String(++caseSeq))
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

  // 状态队列顺序：useBarCollapsed(1) → useQuickCategories(1) → 座位自身 17 个
  // （open, pos, err, info, editing, draft, saving, extern, targetCat, conflict,
  //   query, catMenu, renaming, showAll, drag, armed, tutorial）
  stateQueue = [
    SKIP, CATS,
    true, { x: 0, y: 0, up: false, w: 340, minHeight: 0, maxHeight: 400 },
    null, null, false, [], false, false, '', null, '', false, null, false, drag, false,
    tutorial ? true : SKIP,
  ]
  setterCalls = []
  const seat = components['conversation.input.left']
  assert.ok(seat, '应注册 conversation.input.left（闪电笔 + 弹层）')
  const el = seat({ inputActions: { setDraft() { }, submit() { } }, sessionId: 's1' })
  const tree = el.type(el.props)
  setterCalls = []
  return { tree, css: injected[0] ? injected[0].textContent : '', docListeners }
}

/* 1. 样式：面板禁选中（不然拖动变选中文本）+ 输入框放开；分类按钮间距 -4px */
{
  const r = await renderPanel()
  assert.match(r.css, /\.qp-pop\{[^}]*user-select:none/, '面板应禁止文本选中（否则拖动会被默认行为吃掉）')
  assert.match(r.css, /\.qp-pop input[^{]*\{[^}]*user-select:text/, '输入框要放开选中（能正常选字）')
  assert.match(r.css, /\.qp-cat\{[^}]*padding:3px 8px/, '相邻分类按钮之间应比原先少 4px（10px → 8px）')
  ok('样式：面板禁选中 + 分类按钮内边距 8px')
}

/* 2. 浏览态：分类行与提示行都在 */
{
  const r = await renderPanel()
  const heads = findByClass(r.tree, 'qp-cat-head')
  const items = findByClass(r.tree, 'qp-item')
  assert.equal(heads.length, 3, '应渲染 3 个分类头')
  assert.equal(items.length, 2, '应渲染 2 条提示语')
  assert.ok(heads[0].props.onPointerDown, '分类头必须接 pointerdown（拖拽入口）')
  ok('浏览态：分类行 / 提示行渲染正常，分类头有拖拽入口')
}

/* 3. 分类头按下：preventDefault + 当帧挂上 document 监听 */
{
  const r = await renderPanel()
  const heads = findByClass(r.tree, 'qp-cat-head')
  const ev = ptr({ clientY: 100 })
  heads[0].props.onPointerDown(ev)
  assert.equal(ev.prevented, 1, '分类头 pointerdown 必须 preventDefault（否则变成选中文本）')
  assert.equal((r.docListeners.pointermove || []).length, 1, '按下当帧就应挂上 pointermove')
  assert.equal((r.docListeners.pointerup || []).length, 1, '按下当帧就应挂上 pointerup')
  ok('按下分类头：preventDefault + 监听同步挂上')
}

/* 4. 位移过阈值 → 进入拖拽态（渲染层据此收起提示词） */
{
  const r = await renderPanel()
  const heads = findByClass(r.tree, 'qp-cat-head')
  heads[0].props.onPointerDown(ptr({ clientY: 100 }))
  const move = (r.docListeners.pointermove || [])[0]
  assert.ok(move, '应先有 pointermove 监听')
  move(ptr({ clientY: 140 }))
  const dragCall = setterCalls.filter((v) => v && typeof v === 'object' && v.kind === 'cat')[0]
  assert.ok(dragCall, '位移超过阈值后应 setDrag({kind:"cat"})')
  assert.equal(dragCall.from, 0, 'from 应是被拖分类的位置')
  ok('拖动超过 4px：进入分类拖拽态')
}

/* 5. 拖拽态渲染：提示词收起，只留分类行 + 顶部提示 */
{
  const r = await renderPanel({ drag: { kind: 'cat', cati: 0, from: 0, to: 1 } })
  const heads = findByClass(r.tree, 'qp-cat-head')
  const items = findByClass(r.tree, 'qp-item')
  const text = textOf(r.tree).join('')
  assert.equal(heads.length, 3, '拖拽时分类行仍应全部可见')
  assert.equal(items.length, 0, '拖拽时提示词必须收起')
  assert.match(text, /提示词已收起/, '应有「提示词已收起」提示')
  ok('拖拽渲染：提示词收起、分类行保留')
}

/* 6. 贴近列表下边缘 → 自动滚动 */
{
  const listEl = {
    scrollTop: 50,
    getBoundingClientRect: () => ({ top: 0, bottom: 200, left: 0, right: 340, width: 340, height: 200 }),
  }
  const r = await renderPanel({ listEl })
  const heads = findByClass(r.tree, 'qp-cat-head')
  heads[0].props.onPointerDown(ptr({ clientY: 100 }))
  const move = (r.docListeners.pointermove || [])[0]
  move(ptr({ clientY: 190 }))
  assert.equal(listEl.scrollTop, 60, '贴近下边缘时应向下自动滚 10px')
  move(ptr({ clientY: 5 }))
  assert.equal(listEl.scrollTop, 50, '贴近上边缘时应向上自动滚 10px')
  ok('拖动到列表边缘：自动滚动')
}

/* 7. 松手后监听卸干净（否则下次点击会被残留监听干扰） */
{
  const r = await renderPanel()
  const heads = findByClass(r.tree, 'qp-cat-head')
  heads[0].props.onPointerDown(ptr({ clientY: 100 }))
  const up = (r.docListeners.pointerup || [])[0]
  assert.ok(up, '应有 pointerup 监听')
  up()
  assert.equal((r.docListeners.pointermove || []).length, 0, '松手后 pointermove 应卸掉')
  assert.equal((r.docListeners.pointerup || []).length, 0, '松手后 pointerup 应卸掉')
  ok('松手：document 监听卸干净')
}

/* 8. 教程页：点「教程」后列表区域换成教程内容（v0.7.14） */
{
  const r = await renderPanel({ tutorial: true })
  const tut = findByClass(r.tree, 'qp-tutorial')
  const items = findByClass(r.tree, 'qp-item')
  const text = textOf(r.tree).join('')
  assert.equal(tut.length, 1, '教程态应渲染 qp-tutorial')
  assert.equal(items.length, 0, '教程态不应再显示提示语列表')
  assert.match(text, /拖动排序/, '教程应讲拖动排序')
  assert.match(text, /拖到别的分类|搬过去/, '教程应讲跨分类搬运')
  assert.match(text, /小三角/, '教程应讲闪电笔旁的三角收起')
  assert.match(text, /同步仓库|私有仓库/, '教程应讲多台电脑同步')
  ok('教程页：拖动排序 / 跨分类 / 三角收起 / 同步仓库 都在')
}

console.log(`\n结果: ${passed} passed, 0 failed`)
