/**
 * dsh-quick-prompts 「长按 300ms 才发」回归测试（v0.7.1）。
 *
 * 用户需求（2026-10-16）：自动发送条目别再「点一下就发」——**按住 300ms 松手才发送**，
 * 短按只把内容填进输入框（不发送），防误触。键盘上长按不可行，所以 Enter / 空格 = 明确发送。
 *
 * 运行：node test-hold-to-send.mjs
 */
import assert from 'node:assert/strict'

console.log('dsh-quick-prompts 长按才发送回归\n')

let passed = 0
const ok = (name) => { passed++; console.log('  \u2713 ' + name) }

const CATS = [{
  id: 'c1',
  name: '测试分类',
  prompts: [
    { id: 'p1', title: '普通', text: '【短语】', autoSend: false, order: 1 },
    { id: 'p2', title: '自动', text: '【自动短语】', autoSend: true, order: 2 },
  ],
}]

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
async function load() {
  let factory = null
  globalThis.window = {
    __ModuleLoader__: { load(m) { factory = m } },
    innerWidth: 1440,
    innerHeight: 900,
    matchMedia: () => ({ matches: false }),
    localStorage: { getItem: () => null, setItem() { } },
  }
  globalThis.document = {
    createElement: () => ({ attrs: {}, setAttribute(k, v) { this.attrs[k] = v }, remove() { }, click() { }, textContent: '' }),
    head: { appendChild() { } },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() { },
    removeEventListener() { },
  }
  await import('./lib/client.js?hold-case=' + String(++caseSeq))
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

const collect = (node, pred, out = []) => {
  if (!node || typeof node !== 'object') return out
  if (pred(node)) out.push(node)
  for (const child of node.children || []) {
    if (Array.isArray(child)) child.forEach((c) => collect(c, pred, out))
    else collect(child, pred, out)
  }
  return out
}
const isChip = (n) => n.type === 'button' && String(n.props.className || '').includes('qp-tchip')
const isItem = (n) => n.type === 'div' && String(n.props.className || '').includes('qp-item') && !String(n.props.className || '').includes('qp-item-')

function renderBar(components, props) {
  stateQueue = [false, CATS]
  const el = components['conversation.input.dock'](props)
  return el.type(el.props)
}
function renderSeat(components, props) {
  stateQueue = [false, CATS, true, { x: 0, y: 0 }, null, null, false, [], false]
  const el = components['conversation.input.left'](props)
  return el.type(el.props)
}
function spyActions() {
  const calls = []
  return { calls, setDraft(t) { calls.push(t) }, submit() { calls.push('SUBMIT') } }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
/** 模拟一次鼠标：pointerdown → pointerup（括号里可选按住时长）。 */
const press = async (node, ms = 30) => {
  node.props.onPointerDown({ button: 0, pointerType: 'mouse' })
  await wait(ms)
  node.props.onPointerUp({})
}

/* 1. 短按 autoSend 条目：只填入、不发送（快捷条） */
{
  const { components } = await load()
  const a = spyActions()
  const chip = collect(renderBar(components, { inputActions: a, input: { draft: '原有' } }), isChip)[1]
  assert.ok(String(chip.props.className).includes('qp-tchip-send'), 'autoSend 条目应有专属类名')
  await press(chip, 30)
  assert.deepEqual(a.calls, ['原有【自动短语】'], '短按应把短语追加进输入框，且**不发送**')
  ok('快捷条：短按 autoSend 条目 = 只填入（append），不 submit')
}

/* 2. 长按（≥300ms）autoSend 条目：替换草稿 + 立即发送 */
{
  const { components } = await load()
  const a = spyActions()
  const chip = collect(renderBar(components, { inputActions: a, input: { draft: '还没写完的草稿' } }), isChip)[1]
  await press(chip, 380)
  assert.deepEqual(a.calls, ['【自动短语】', 'SUBMIT'], '长按应整体替换草稿后立即 submit（不带上旧草稿）')
  ok('快捷条：按住 300ms 松手 = 替换草稿并立即发送')
}

/* 3. 长按到一半松手（250ms）仍算短按：不许发出去 */
{
  const { components } = await load()
  const a = spyActions()
  const chip = collect(renderBar(components, { inputActions: a, input: { draft: '草稿' } }), isChip)[1]
  await press(chip, 250)
  assert.deepEqual(a.calls, ['草稿【自动短语】'], '不到 300ms 松手应只填入，绝不发送')
  ok('快捷条：250ms 松手仍是短按（阈值生效）')
}

/* 4. 普通条目行为一点没变：点击即追加 */
{
  const { components } = await load()
  const a = spyActions()
  const chip = collect(renderBar(components, { inputActions: a, input: { draft: '原有' } }), isChip)[0]
  chip.props.onClick()
  assert.deepEqual(a.calls, ['原有【短语】'], '普通条目点击应仍是追加')
  ok('快捷条：普通条目点击行为不变（追加、不发送）')
}

/* 5. 键盘 Enter = 明确发送（键盘上长按不可行） */
{
  const { components } = await load()
  const a = spyActions()
  const chip = collect(renderBar(components, { inputActions: a, input: { draft: '草稿' } }), isChip)[1]
  let prevented = false
  chip.props.onKeyDown({ key: 'Enter', preventDefault() { prevented = true } })
  assert.deepEqual(a.calls, ['【自动短语】', 'SUBMIT'], 'Enter 应发送')
  assert.equal(prevented, true, '应 preventDefault，避免回车又触发别的默认行为')
  const b = spyActions()
  const chip2 = collect(renderBar(components, { inputActions: b, input: { draft: '草稿' } }), isChip)[1]
  chip2.props.onKeyDown({ key: ' ', preventDefault() { } })
  assert.deepEqual(b.calls, ['【自动短语】', 'SUBMIT'], '空格同理')
  ok('快捷条：键盘 Enter / 空格 = 明确发送')
}

/* 6. 拖动查看后面内容那一下不许被当成点击（autoSend 条目也一样） */
{
  const { components, mod } = await load()
  const a = spyActions()
  // 走真实的拖动路径：让容器超宽并在行上按下 - 移动 - 抬起
  const tree = renderBar(components, { inputActions: a, input: { draft: '草稿' } })
  const row = collect(tree, (n) => n.type === 'div' && String(n.props.className).includes('qp-titles'))[0]
  const fakeEl = { scrollWidth: 500, clientWidth: 100, scrollLeft: 0, classList: { add() { }, remove() { } }, setPointerCapture() { } }
  row.props.ref.current = fakeEl
  row.props.onPointerDown({ pointerType: 'mouse', button: 0, clientX: 100, pointerId: 1 })
  row.props.onPointerMove({ clientX: 60, cancelable: true, preventDefault() { } })
  const chip = collect(tree, isChip)[1]
  chip.props.onPointerDown({ button: 0, pointerType: 'mouse' })
  chip.props.onPointerUp({})
  assert.deepEqual(a.calls, [], '拖动之后抬起不应触发追加 / 发送')
  ok('拖动：拖动划过的 autoSend 条目不会被误当成操作')
}

/* 7. 弹层条目与快捷条同口径 */
{
  const { components } = await load()
  const a = spyActions()
  const seat = renderSeat(components, { inputActions: a, input: { draft: '弹层草稿' } })
  const items = collect(seat, (n) => n.type === 'div' && String(n.props.className).includes('qp-item'))
  const sendItem = items.filter((n) => String(n.props.className).includes('qp-item-send'))[0]
  assert.ok(sendItem, '弹层里 autoSend 条目应有专属标记')
  await press(sendItem, 30)
  assert.deepEqual(a.calls, ['弹层草稿【自动短语】'], '弹层短按同样只填入')

  const b = spyActions()
  const seat2 = renderSeat(components, { inputActions: b, input: { draft: '弹层草稿' } })
  const sendItem2 = collect(seat2, (n) => n.type === 'div' && String(n.props.className).includes('qp-item-send'))[0]
  await press(sendItem2, 380)
  assert.deepEqual(b.calls, ['【自动短语】', 'SUBMIT'], '弹层长按同样发送')
  ok('弹层：短按只填入、长按才发送，与快捷条一致')
}

/* 8. 纯函数：applyPrompt 的 forceSend 语义 */
{
  const { mod } = await load()
  const { applyPrompt } = mod.internals
  assert.ok(applyPrompt, '应导出 applyPrompt 供回归测试')
  const mk = () => ({ calls: [], setDraft(t) { this.calls.push(t) }, submit() { this.calls.push('SUBMIT') } })
  const auto = { title: 'x', text: 'T', autoSend: true }
  const plain = { title: 'y', text: 'P', autoSend: false }

  const a1 = mk(); applyPrompt(a1, auto, '草稿');           // 不传 forceSend（老调用口径）→ 发送
  assert.deepEqual(a1.calls, ['T', 'SUBMIT'], '不传 forceSend 时保持旧语义（发送）')
  const a2 = mk(); applyPrompt(a2, auto, '草稿', false);     // 短按 → 只填入
  assert.deepEqual(a2.calls, ['草稿T'], 'forceSend=false 应只追加、不发送')
  const a3 = mk(); applyPrompt(a3, auto, '草稿', true);      // 长按 → 发送
  assert.deepEqual(a3.calls, ['T', 'SUBMIT'], 'forceSend=true 应替换草稿并发送')
  const a4 = mk(); applyPrompt(a4, plain, '草稿', false);
  assert.deepEqual(a4.calls, ['草稿P'], '普通条目仍是追加')
  const a5 = mk(); applyPrompt(a5, plain, '草稿', true);
  assert.deepEqual(a5.calls, ['草稿P'], '普通条目即使传 true 也不发送（autoSend 才有发送语义）')
  ok('applyPrompt：forceSend 语义正确，普通条目不受影响')
}

console.log('\n全部通过：' + passed + ' 项')
