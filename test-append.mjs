/**
 * dsh-quick-prompts「点击短语 = 追加而非覆盖」行为回归测试。
 *
 * 做法：用最小宿主 stub（window.__ModuleLoader__ / document / React）加载浏览器半部
 * lib/client.js，取出注册到 conversation.input.dock 与 conversation.input.left 的组件，
 * 同步“渲染”出元素树后直接调用标题按钮的 onClick，断言 inputActions.setDraft
 * 实际收到的文本。
 *
 * 运行：node test-append.mjs
 */
import assert from 'node:assert/strict'

/* ---------------- 宿主 stub ---------------- */

let moduleFactory = null

/** 本设备存储替身：折叠状态只写这里，不写共享数据文件。 */
const deviceStore = new Map()
globalThis.window = {
  __ModuleLoader__: { load(m) { moduleFactory = m } },
  innerWidth: 1440,
  localStorage: {
    getItem: (k) => (deviceStore.has(k) ? deviceStore.get(k) : null),
    setItem: (k, v) => { deviceStore.set(k, String(v)) },
  },
}

/** client.js 注入样式时会用到 document；兜底读草稿时会用 querySelectorAll。 */
let domText = null
const injectedStyles = []
/** 极简选择器匹配：只支持 ensureStyles 用到的 style[data-plugin="..."]。 */
function matchInjected(sel) {
  const m = /^style\[data-plugin="(.+)"\]$/.exec(String(sel))
  if (!m) return []
  return injectedStyles.filter((el) => el.attrs['data-plugin'] === m[1])
}
globalThis.document = {
  createElement: (tag) => {
    const el = { tagName: tag, attrs: {}, textContent: '', setAttribute(k, v) { this.attrs[k] = v }, remove() {} }
    return el
  },
  head: { appendChild(el) { injectedStyles.push(el) } },
  querySelectorAll: (sel) => {
    if (String(sel).startsWith('style[')) return matchInjected(sel)
    return domText === null ? [] : [{ innerText: domText, closest: () => null }]
  },
}

/** React stub：createElement 返回普通对象；useState 依次消费 stateQueue。 */
let stateQueue = []
const React = {
  createElement(type, props, ...children) { return { type, props: props || {}, children } },
  useState(init) { return [stateQueue.length ? stateQueue.shift() : init, () => {}] },
  useEffect() {},
  useRef(init) { return { current: init } },
}

await import('./lib/client.js')
assert.ok(moduleFactory, 'client.js 应通过 window.__ModuleLoader__.load 注册 factory')

const mod = moduleFactory.factory((name) => {
  if (name === 'react') return React
  throw new Error('未预期的 require: ' + name)
})
assert.equal(typeof mod.apply, 'function', 'factory 应导出 apply')

/* ---------------- 样式注入（回归：桌面版曾因归属标记不当被宿主回收） ---------------- */

assert.equal(injectedStyles.length, 1, '物化期应注入恰好一个 <style>')
assert.equal(injectedStyles[0].attrs['data-plugin'], 'dsh-quick-prompts', '样式需按模块系统约定打 data-plugin 归属标记')
assert.ok(injectedStyles[0].textContent.includes('.qp-bar'), '样式内容应为插件 CSS')
console.log('  \u2713 物化期注入样式且带 data-plugin 归属标记')

/* ---------------- 捕获槽位注册 ---------------- */

const components = {}
const slots = {
  inject(_name, fn) { fn() },
  register(meta, comp) { components[meta.name] = comp; return () => {} },
}
mod.apply({
  get: (k) => (k === 'slots' ? slots : undefined),
  effect(fn) { fn() },
})
assert.ok(components['conversation.input.dock'], '应注册 dock 快捷条')
assert.ok(components['conversation.input.left'], '应注册闪电笔 seat')
assert.equal(injectedStyles.length, 1, 'apply 期间的样式兜底应幂等，不重复注入')

/* ---------------- 测试数据与渲染辅助 ---------------- */

const CATS = [{
  id: 'c1',
  name: '测试分类',
  prompts: [
    { id: 'p1', title: '普通', text: '【短语】', autoSend: false, order: 1 },
    { id: 'p2', title: '自动', text: '【自动短语】', autoSend: true, order: 2 },
  ],
}]

/** 同步渲染 dock 快捷条，返回元素树；收起时组件返回 null。 */
function renderBar(props, collapsed = false) {
  stateQueue = [collapsed, CATS] // 先 useBarCollapsed，后 useQuickCategories
  const el = components['conversation.input.dock'](props) // { type: QuickPromptBar, props }
  return el.type(el.props)
}

/** 同步渲染闪电笔 seat，open=true 以展开弹层条目列表。 */
function renderSeat(props, collapsed = false) {
  stateQueue = [collapsed, CATS, true, { x: 0, y: 0 }, null, null, false, [], false]
  const el = components['conversation.input.left'](props)
  return el.type(el.props)
}

/** 深度遍历 createElement 结果收集节点（React 子节点可能嵌套成数组）。 */
function collect(node, pred, out = []) {
  if (!node || typeof node !== 'object') return out
  if (pred(node)) out.push(node)
  for (const child of node.children || []) {
    if (Array.isArray(child)) child.forEach((c) => collect(c, pred, out))
    else collect(child, pred, out)
  }
  return out
}

const isTitleChip = (n) => n.type === 'button' && String(n.props.className || '').includes('qp-tchip')
const isPopupItem = (n) => n.type === 'div' && n.props.className === 'qp-item'

/** 造一个记录调用的 inputActions。 */
function spyActions() {
  const calls = []
  return {
    calls,
    setDraft(t) { calls.push(t) },
    submit() { calls.push('SUBMIT') },
  }
}

let passed = 0
const ok = (name) => { passed++; console.log('  \u2713 ' + name) }

console.log('dsh-quick-prompts 追加行为回归\n')

/* 1. dock：dock owner 提供 InputState.draft → 追加 */
{
  domText = null
  const a = spyActions()
  const btns = collect(renderBar({ inputActions: a, input: { draft: '原有内容' } }), isTitleChip)
  assert.equal(btns.length, 2, '应渲染出 2 个快捷语按钮')
  btns[0].props.onClick()
  assert.deepEqual(a.calls, ['原有内容【短语】'], '普通条目应把短语追加到原有内容之后')
  ok('dock 普通条目：原有内容 + 短语（原有内容不清空）')
}

/* 2. dock：输入框为空 → 等价于只写入短语 */
{
  domText = null
  const a = spyActions()
  const btns = collect(renderBar({ inputActions: a, input: { draft: '' } }), isTitleChip)
  btns[0].props.onClick()
  assert.deepEqual(a.calls, ['【短语】'], '空输入框应只写入短语')
  ok('dock 空输入框：仅写入短语，无多余前缀')
}

/* 3. dock：优先走 session 标准 props 的 useInput 快照 */
{
  domText = null
  const a = spyActions()
  const props = {
    inputActions: a,
    useInput: (selector) => selector({ draft: '钩子里的草稿' }),
    input: { draft: '不应被采用' },
  }
  const btns = collect(renderBar(props), isTitleChip)
  btns[0].props.onClick()
  assert.deepEqual(a.calls, ['钩子里的草稿【短语】'], 'useInput 快照应优先于 owner props')
  ok('useInput 快照路径：追加到钩子读到的草稿之后')
}

/* 4. dock：autoSend 条目仍为“替换 + 立即发送”，不把旧草稿带出去 */
{
  domText = null
  const a = spyActions()
  const btns = collect(renderBar({ inputActions: a, input: { draft: '还没写完的草稿' } }), isTitleChip)
  btns[1].props.onClick()
  assert.deepEqual(a.calls, ['【自动短语】', 'SUBMIT'], '自动发送条目应整体替换草稿后立即 submit')
  ok('dock 自动发送条目：替换草稿并立即 submit（不追加旧草稿）')
}

/* 5. dock：两个来源都读不到时退化为 DOM，DOM 也空则只写入短语 */
{
  domText = null
  const a = spyActions()
  const btns = collect(renderBar({ inputActions: a }), isTitleChip)
  btns[0].props.onClick()
  assert.deepEqual(a.calls, ['【短语】'], '无草稿来源时应退化为仅写入短语')
  ok('无草稿来源：安全退化为仅写入短语')

  domText = 'DOM 兜底草稿'
  const b = spyActions()
  const btns2 = collect(renderBar({ inputActions: b }), isTitleChip)
  btns2[0].props.onClick()
  assert.deepEqual(b.calls, ['DOM 兜底草稿【短语】'], '其它来源缺失时应读 DOM 兜底')
  ok('无草稿来源：DOM 兜底读到的内容同样被追加')
  domText = null
}

/* 6. 闪电笔弹层条目与快捷条语义一致 */
{
  domText = null
  const a = spyActions()
  const items = collect(renderSeat({ inputActions: a, input: { draft: '弹层前的草稿' } }), isPopupItem)
  assert.ok(items.length >= 1, '弹层应渲染出快捷语条目')
  items[0].props.onClick()
  assert.deepEqual(a.calls, ['弹层前的草稿【短语】'], '弹层条目也应追加')
  ok('闪电笔弹层条目：同样追加到原有内容之后')
}

/* 7. 连续点击两条短语 = 依次追加，旧内容始终保留 */
{
  domText = null
  const a = spyActions()
  const btns = collect(renderBar({ inputActions: a, input: { draft: '起点' } }), isTitleChip)
  btns[0].props.onClick()
  btns[0].props.onClick()
  assert.deepEqual(a.calls, ['起点【短语】', '起点【短语】'], '每次点击都基于渲染期草稿快照追加')
  ok('连续点击：每次都保留原有内容')
}

/* 8. 折叠：收起时快捷条整块不渲染（0 高度） */
{
  const tree = renderBar({ inputActions: spyActions(), input: { draft: '' } }, true)
  assert.equal(tree, null, '收起时 dock 快捷条应返回 null，完全不占高度')
  assert.equal(collect(tree, isTitleChip).length, 0, '收起时不应渲染任何短语按钮')
  ok('收起：快捷条整块不渲染（手机端让出全部高度）')
}

/* 9. 折叠开关：三角紧贴闪电笔，朝向与 aria 状态跟随折叠态 */
{
  const isTri = (n) => n.type === 'button' && n.props.className === 'qp-tri'
  const pen = (n) => n.type === 'button' && n.props.className === 'qp-btn'

  const expanded = renderSeat({ inputActions: spyActions(), input: { draft: '' } }, false)
  const triOpen = collect(expanded, isTri)
  assert.equal(triOpen.length, 1, '闪电笔右侧应有且仅有一个折叠三角')
  assert.equal(triOpen[0].props.title, '收起快捷语', '展开态三角的 title 应为「收起快捷语」')
  assert.equal(triOpen[0].props['aria-expanded'], 'true', '展开态 aria-expanded 应为 true')
  assert.equal(collect(expanded, pen).length, 1, '同一组里仍应保留闪电笔按钮')
  ok('三角位置：与闪电笔同组、紧随其后（未新增独立控件）')

  // 三角内部的 svg path 决定朝向（函数组件在 stub 里需手动求值一次）
  const glyph = (tri) => { const node = tri.children[0]; return node.type(node.props).children[0].props.d }
  assert.equal(glyph(triOpen[0]), 'M2.2 4.1h7.6L6 8.4z', '展开态三角应朝下（点它收起）')

  const collapsed = renderSeat({ inputActions: spyActions(), input: { draft: '' } }, true)
  const triShut = collect(collapsed, isTri)[0]
  assert.equal(triShut.props.title, '展开快捷语', '收起态三角的 title 应为「展开快捷语」')
  assert.equal(triShut.props['aria-expanded'], 'false', '收起态 aria-expanded 应为 false')
  assert.equal(glyph(triShut), 'M2.2 7.9h7.6L6 3.6z', '收起态三角应朝上（点它展开）')
  ok('三角朝向：展开态朝下（收起）、收起态朝上（展开）')
}

/* 10. 折叠开关：点击后落盘到本设备（localStorage），不写共享数据文件 */
{
  const isTri = (n) => n.type === 'button' && n.props.className === 'qp-tri'
  const tri = collect(renderSeat({ inputActions: spyActions(), input: { draft: '' } }, false), isTri)[0]
  tri.props.onClick()
  assert.equal(window.localStorage.getItem('dsh-quick-prompts.collapsed'), '1', '收起后应在本设备记下收起状态')
  const tri2 = collect(renderSeat({ inputActions: spyActions(), input: { draft: '' } }, true), isTri)[0]
  tri2.props.onClick()
  assert.equal(window.localStorage.getItem('dsh-quick-prompts.collapsed'), '0', '再点一次应记回展开状态')
  ok('折叠状态按设备本地记忆（localStorage），不动三端共用的数据文件')
}

console.log('\n全部通过：' + passed + ' 项')
