/**
 * dsh-quick-prompts 分类下拉回归测试（v0.4.1）。
 *
 * 修复的问题：管理弹层里「分类」原来是 `input + datalist` —— 浏览器按输入框的
 * 当前值过滤候选项，于是必须先删掉当前分类名才能看到别的分类。
 * 现在改为真正的 `<select>`（列出全部分类 + 「＋ 新建分类…」），本测试锁住该行为。
 *
 * 运行：node test-category.mjs
 */
import assert from 'node:assert/strict'

console.log('dsh-quick-prompts 分类下拉回归\n')

let passed = 0
const ok = (name) => { passed++; console.log('  \u2713 ' + name) }

const CATS = [
  { id: 'c0', name: '默认', prompts: [{ id: 'p0', title: '继续', text: '继续', order: 1 }] },
  { id: 'c1', name: '常用', prompts: [{ id: 'p1', title: '最优方案', text: '以最优方案处理', order: 1 }] },
  { id: 'c2', name: '工作', prompts: [{ id: 'p2', title: '周报', text: '写周报', order: 1 }] },
]

const SKIP = Symbol('use-init')
let stateQueue = []
const React = {
  createElement(type, props, ...children) { return { type, props: props || {}, children } },
  Fragment: Symbol('Fragment'),
  useState(init) {
    const v = stateQueue.length ? stateQueue.shift() : SKIP
    return [v === SKIP ? init : v, () => {}]
  },
  useEffect() { },
  useRef(init) { return { current: init } },
}

let caseSeq = 0

/** 加载一份全新的客户端模块，取回两个座位组件（每次用例一份实例，避免模块级状态串味）。 */
async function load() {
  let factory = null
  globalThis.window = {
    __ModuleLoader__: { load(m) { factory = m } },
    innerWidth: 1440,
    innerHeight: 800,
    matchMedia: () => ({ matches: false }),
    localStorage: { getItem: () => null, setItem() { } },
  }
  globalThis.document = {
    createElement: () => ({ attrs: {}, setAttribute(k, v) { this.attrs[k] = v }, remove() { }, textContent: '' }),
    head: { appendChild() { } },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() { },
    removeEventListener() { },
  }
  await import('./lib/client.js?category-case=' + String(++caseSeq))
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
 * 渲染闪电笔座位（弹层）。
 * stateQueue 顺序 = QuickPromptSeat 的 useState 顺序：
 * [useBarCollapsed(SKIP), useQuickCategories(CATS), open, pos, error, info, editing, draft, saving]
 */
function renderSeat(components, { editing, draft }) {
  stateQueue = [SKIP, CATS, true, { x: 0, y: 0 }, null, null, editing, draft, false]
  const el = components['conversation.input.left']({ inputActions: { setDraft() { }, submit() { } }, input: { draft: '' } })
  return el.type(el.props)
}

const flat = (arr) => (arr || []).flatMap((c) => (Array.isArray(c) ? flat(c) : [c]))

function walk(node, visit) {
  if (!node || typeof node !== 'object') return
  visit(node)
  for (const c of node.children || []) (Array.isArray(c) ? c.forEach((x) => walk(x, visit)) : walk(c, visit))
}

function find(tree, pred) {
  let hit = null
  walk(tree, (n) => { if (hit === null && pred(n)) hit = n })
  return hit
}

const isCatSelect = (n) => n.type === 'select' && String((n.props && n.props.className) || '').includes('qp-cat-select')
const isCatInput = (n) => n.type === 'input' && String((n.props && n.props.className) || '').includes('qp-edit-cat')

/* 1. 分类是下拉框，且当前分类之外还有别的分类可选 —— 无需先清空 */
{
  const { components } = await load()
  const draft = [{ id: '', cat: '常用', title: '最优方案', text: '以最优方案处理', autoSend: false, order: 1 }]
  const tree = renderSeat(components, { editing: true, draft })

  const sel = find(tree, isCatSelect)
  assert.ok(sel, '编辑行应渲染分类下拉框')
  const values = flat(sel.children).map((o) => o.props.value)
  assert.deepEqual(values, ['默认', '常用', '工作', '__qp_new_cat__'], '下拉应列出全部已有分类 + 新建项')
  assert.equal(sel.props.value, '常用', '下拉当前值应为该行的分类')
  assert.ok(values.filter((v) => v !== '常用' && v !== '__qp_new_cat__').length >= 2, '当前分类之外应仍有可选项')
  assert.equal(find(tree, (n) => n.type === 'input' && n.props.list), null, '不应再出现 datalist 输入框')
  assert.equal(find(tree, (n) => n.type === 'datalist'), null, '不应再渲染 datalist 元素')
  ok('当前是「常用」时，下拉里能直接看到并选中「默认」/「工作」')
}

/* 2. 草稿里新造的分类也要能选回自己，并能切回已有分类 */
{
  const { components } = await load()
  const draft = [{ id: '', cat: '临时', title: 'x', text: 'x', autoSend: false, order: 1 }]
  const tree = renderSeat(components, { editing: true, draft })
  const sel = find(tree, isCatSelect)
  const values = flat(sel.children).map((o) => o.props.value)
  assert.deepEqual(values, ['默认', '常用', '工作', '临时', '__qp_new_cat__'], '草稿内新分类也应出现在下拉里')
  assert.equal(sel.props.value, '临时', '下拉当前值应为草稿里的分类')
  ok('草稿里新造的分类名同样可选，且能直接切回已有分类')
}

/* 3. 选「＋ 新建分类…」后切换为输入框，并可一键回到下拉 */
{
  const { components } = await load()
  const draft = [{ id: '', cat: '', catNew: true, title: 'x', text: 'x', autoSend: false, order: 1 }]
  const tree = renderSeat(components, { editing: true, draft })
  assert.equal(find(tree, isCatSelect), null, '新建分类模式下不应再有下拉框')
  const input = find(tree, isCatInput)
  assert.ok(input, '新建分类模式应渲染分类输入框')
  assert.equal(input.props.placeholder, '新分类名称', '输入框应提示这是新分类名')
  const back = find(tree, (n) => n.type === 'button' && String((n.props && n.props.className) || '').includes('qp-cat-back'))
  assert.ok(back, '新建分类模式应提供「选择已有」按钮')
  assert.equal(back.children[0], '选择已有', '按钮文案应为「选择已有」')
  ok('「＋ 新建分类…」→ 输入框；「选择已有」→ 回到下拉')
}

/* 4. 纯模型：空分类视为新建模式；哨兵值不会混进真实分类名 */
{
  const { mod } = await load()
  const { catPickerModel, NEW_CAT } = mod.internals
  assert.ok(catPickerModel && NEW_CAT, '应导出 catPickerModel / NEW_CAT 供回归测试')

  const rows = [{ cat: '常用' }, { cat: '  ' }, { cat: '工作' }]
  const m = catPickerModel(CATS.map((c) => c.name), rows, { cat: '常用' })
  assert.equal(m.isNew, false, '分类非空且未标记新建时应为下拉模式')
  assert.equal(m.value, '常用', '下拉当前值应为该行分类')
  assert.ok(m.names.indexOf('默认') !== -1 && m.names.indexOf('工作') !== -1, '选项应含全部分类')
  assert.equal(m.names.indexOf(NEW_CAT), -1, '哨兵值不能出现在真实分类名里')

  const blank = catPickerModel(CATS.map((c) => c.name), rows, { cat: '' })
  assert.equal(blank.isNew, true, '分类为空时应进入输入模式')
  assert.equal(catPickerModel(CATS.map((c) => c.name), rows, { cat: '默认', catNew: true }).isNew, true, '显式标记新建时应进入输入模式')
  assert.deepEqual(catPickerModel([], [], { cat: '' }).names, [], '没有分类也没有草稿时选项为空')
  assert.deepEqual(catPickerModel([null, '  '], [], { cat: '默认' }).names, ['默认'], '空名归到「默认」且去重')
  ok('模型：空分类 → 输入模式；选项去重且不含哨兵值')
}

console.log('\n全部通过：' + passed + ' 项')
