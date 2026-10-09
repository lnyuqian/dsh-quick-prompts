/**
 * dsh-quick-prompts「单行 + 按住拖动看后面内容」回归测试（v0.5.0）。
 *
 * 用户 2026-10-10 要求：一行放不下时不要换行撑高，改为可以拖动行内容，看到后面的部分。
 *
 * 这里守住的是这套拖动最容易翻车的几条边界（都是「看似能用、实际点不动」的来源）：
 *  - 内容没超宽 → 不接管指针，行为跟以前完全一样；
 *  - 位移小于阈值 → 仍是一次普通点击，快捷语照常追加；
 *  - 攒够位移才 setPointerCapture（pointerdown 就捕获会把 click 目标改写成整行，
 *    按钮自己的 onClick 再也不触发）；
 *  - 拖完那一下的 click 必须被吞掉，但紧接着的下一次点击必须正常；
 *  - 拖动划线经过分类行时不许顺手切换分类。
 *
 * 运行：node test-drag.mjs
 */
import assert from 'node:assert/strict'

console.log('dsh-quick-prompts 快捷条「单行 + 拖动查看」回归\n')

let passed = 0
const ok = (name) => { passed++; console.log('  \u2713 ' + name) }

const CATS = [
  { id: 'c1', name: '常用', prompts: [{ id: 'p1', title: '继续', text: '继续任务', order: 1 }] },
  { id: 'c2', name: '开发', prompts: [{ id: 'p2', title: '提交并推送', text: '改完直接提交并推送到github', order: 1 }] },
]

const SKIP = Symbol('use-init')
let stateQueue = []
let setterCalls = []

/** React 替身：够用即可（createElement / useState / useEffect / useRef）。 */
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

/** 一行快捷条的可拖动替身元素（记录 class 与指针捕获）。 */
function makeRowEl({ scrollWidth = 1200, clientWidth = 300 } = {}) {
  const el = {
    scrollWidth,
    clientWidth,
    scrollLeft: 0,
    captured: [],
    added: [],
    removed: [],
    classList: { add: (c) => el.added.push(c), remove: (c) => el.removed.push(c) },
    setPointerCapture: (id) => el.captured.push(id),
  }
  return el
}

/** 事件替身 */
function ptr(over = {}) {
  return Object.assign({ pointerType: 'mouse', button: 0, pointerId: 7, clientX: 0, cancelable: true, prevented: 0, stopped: 0, preventDefault() { this.prevented++ }, stopPropagation() { this.stopped++ } }, over)
}

/** 深度找组件树里某个 div.qp-*（取第一个匹配） */
function findEl(tree, className, out = []) {
  if (!tree || typeof tree !== 'object') return out
  if (Array.isArray(tree)) { tree.forEach((t) => findEl(t, className, out)); return out }
  if (tree.type === 'div' && tree.props && tree.props.className === className) out.push(tree)
  for (const c of tree.children || []) findEl(c, className, out)
  return out
}

/** 收集所有分类按钮（className 以 qp-cat 开头且不是 qp-cat-head / qp-cat-count） */
function findCatButtons(tree, out = []) {
  if (!tree || typeof tree !== 'object') return out
  if (Array.isArray(tree)) { tree.forEach((t) => findCatButtons(t, out)); return out }
  const cn = tree.props && tree.props.className
  if (tree.type === 'button' && typeof cn === 'string' && cn.split(' ').indexOf('qp-cat') >= 0) out.push(tree)
  for (const c of tree.children || []) findCatButtons(c, out)
  return out
}

/** 渲染一次快捷条，返回 { tree, css, titleRow, catRow, catBtns } */
async function renderBar(rowOpts = {}) {
  let factory = null
  const injected = []
  globalThis.window = {
    __ModuleLoader__: { load(m) { factory = m } },
    innerWidth: 1440,
    matchMedia: () => ({ matches: false }),
    localStorage: { getItem: () => '0', setItem() { } },
  }
  globalThis.document = {
    createElement: () => ({ attrs: {}, setAttribute(k, v) { this.attrs[k] = v }, remove() { }, textContent: '' }),
    head: { appendChild(el) { injected.push(el) } },
    querySelectorAll: () => [],
  }

  await import('./lib/client.js?drag-case=' + String(++caseSeq))
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

  stateQueue = [SKIP, CATS]
  setterCalls = []
  const barEl = components['conversation.input.dock']({ inputActions: { setDraft() { }, submit() { } }, input: { draft: '' } })
  const tree = barEl.type(barEl.props)

  const titleRow = findEl(tree, 'qp-titles')[0] || null
  const catRow = findEl(tree, 'qp-bar-row')[0] || null
  if (titleRow) titleRow.props.ref.current = makeRowEl(rowOpts)
  if (catRow) catRow.props.ref.current = makeRowEl(rowOpts)
  setterCalls = []

  return { tree, css: injected[0] ? injected[0].textContent : '', titleRow, catRow, catBtns: findCatButtons(tree) }
}

/** 走一遍「按下 → 拖 dx 像素 → 松开」，返回该行的替身元素 */
function drag(row, dx) {
  const el = row.props.ref.current
  row.props.onPointerDown(ptr({ clientX: 100 }))
  row.props.onPointerMove(ptr({ clientX: 100 + dx }))
  row.props.onPointerUp(ptr({ clientX: 100 + dx }))
  return el
}

/* 1. 样式：两行都单行 + 横向可滚 + 子项不收缩 + 滚动条隐藏 */
{
  const r = await renderBar()
  assert.match(r.css, /\.qp-bar-row\{[^}]*flex-wrap:nowrap/, '.qp-bar-row 应为 nowrap')
  assert.match(r.css, /\.qp-titles\{[^}]*flex-wrap:nowrap/, '.qp-titles 应为 nowrap')
  assert.match(r.css, /\.qp-bar-row\{[^}]*overflow-x:auto/, '.qp-bar-row 应可横向滚动')
  assert.match(r.css, /\.qp-titles\{[^}]*overflow-x:auto/, '.qp-titles 应可横向滚动')
  assert.match(r.css, /\.qp-bar-row>\*\{flex:none\}/, '分类行子项应 flex:none（否则会被压扁而不是溢出）')
  assert.match(r.css, /\.qp-titles>\*\{flex:none\}/, '标题行子项应 flex:none')
  assert.match(r.css, /scrollbar-width:none/, '应隐藏滚动条（不占高度）')
  assert.match(r.css, /qp-dragging[^{]*\{cursor:grabbing/, '拖动时应显示抓取光标')
  ok('样式：两行单行（nowrap）+ 横向滚动 + 子项不收缩 + 隐藏滚动条')
}

/* 2. 两行都挂上拖动处理器 */
{
  const r = await renderBar()
  for (const [name, row] of [['分类行', r.catRow], ['标题行', r.titleRow]]) {
    assert.ok(row, name + '应存在')
    assert.equal(typeof row.props.onPointerDown, 'function', name + '缺 onPointerDown')
    assert.equal(typeof row.props.onPointerMove, 'function', name + '缺 onPointerMove')
    assert.equal(typeof row.props.onPointerUp, 'function', name + '缺 onPointerUp')
    assert.equal(typeof row.props.onPointerCancel, 'function', name + '缺 onPointerCancel')
    assert.equal(typeof row.props.onClickCapture, 'function', name + '缺 onClickCapture')
  }
  ok('分类行与标题行都注册了拖动处理器')
}

/* 3. 内容没超宽 → 不接管指针（保持原生行为） */
{
  const r = await renderBar({ scrollWidth: 300, clientWidth: 300 })
  const el = drag(r.titleRow, -60)
  assert.equal(el.scrollLeft, 0, '没超宽时不应被拖动')
  assert.equal(el.added.length, 0, '没超宽时不应加 qp-dragging')
  assert.equal(el.captured.length, 0, '没超宽时不应捕获指针')
  ok('内容没超宽：不接管指针，拖动无效、不加样式')
}

/* 4. 位移小于阈值（4px）→ 仍按点击处理 */
{
  const r = await renderBar()
  const el = drag(r.titleRow, -3)
  assert.equal(el.scrollLeft, 0, '位移不足阈值时不应滚动')
  const ev = ptr()
  r.titleRow.props.onClickCapture(ev)
  assert.equal(ev.stopped, 0, '位移不足阈值时不应吞掉点击（否则点快捷语会失灵）')
  ok('位移 <4px：仍算点击，不滚动、不吞点击')
}

/* 5. 拖动：scrollLeft 反向跟随 + qp-dragging + setPointerCapture */
{
  const r = await renderBar()
  const el = drag(r.titleRow, -80)
  assert.equal(el.scrollLeft, 80, '向左拖 80px 应让内容右移 80px（看后面的内容）')
  assert.ok(el.added.indexOf('qp-dragging') >= 0, '拖动中应加 qp-dragging')
  assert.ok(el.removed.indexOf('qp-dragging') >= 0, '松开后应移除 qp-dragging')
  assert.deepEqual(el.captured, [7], '拖起来后应捕获该指针（阈值之后才捕获）')
  ok('拖动生效：scrollLeft 反向跟随、加/移除 qp-dragging、阈值后捕获指针')
}

/* 6. 拖完那一下的 click 必须被吞掉（不能顺手把提示词追加进输入框） */
{
  const r = await renderBar()
  r.titleRow.props.onPointerDown(ptr({ clientX: 100 }))
  r.titleRow.props.onPointerMove(ptr({ clientX: 40 }))
  const ev = ptr()
  r.titleRow.props.onClickCapture(ev)
  assert.equal(ev.prevented, 1, '拖动结束的 click 应 preventDefault')
  assert.equal(ev.stopped, 1, '拖动结束的 click 应 stopPropagation')
  ok('拖动结束那一下 click 被吞掉');
  r.titleRow.props.onPointerUp(ptr())
}

/* 7. 拖动后的下一次点击必须正常（pointerdown 重置状态，不依赖事件先后顺序） */
{
  const r = await renderBar()
  r.titleRow.props.onPointerDown(ptr({ clientX: 100 }))
  r.titleRow.props.onPointerMove(ptr({ clientX: 40 }))
  r.titleRow.props.onPointerUp(ptr())
  r.titleRow.props.onClickCapture(ptr())          // 拖完那一下：吞掉
  r.titleRow.props.onPointerDown(ptr({ clientX: 100 })) // 新的一次按下
  const ev = ptr()
  r.titleRow.props.onClickCapture(ev)
  assert.equal(ev.stopped, 0, '拖动之后的下一次点击必须正常穿透')
  ok('拖动结束后再点：点击正常穿透（状态在新按下时重置）')
}

/* 8. 拖动划线经过分类行：不许切换分类 */
{
  const r = await renderBar()
  assert.ok(r.catBtns.length >= 2, '应渲染出分类按钮')
  const hoverBefore = setterCalls.length
  r.catBtns[1].props.onMouseEnter()
  assert.ok(setterCalls.length > hoverBefore, '未拖动时悬停应切换分类')

  r.catRow.props.onPointerDown(ptr({ clientX: 100 }))
  r.catRow.props.onPointerMove(ptr({ clientX: 40 }))
  const afterDragStart = setterCalls.length
  r.catBtns[1].props.onMouseEnter()
  assert.equal(setterCalls.length, afterDragStart, '拖动中划过分类不应切换分类')
  ok('拖动中划过分类行：不切换当前分类')
}

console.log('\n全部通过：' + passed + ' 项')
