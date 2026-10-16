/**
 * dsh-quick-prompts 弹层顶部工具行回归测试（v0.6.0）。
 *
 * 用户需求（2026-10-16）：闪电笔弹层顶部的三个 MD 管理选项（导入MD / 导出MD / 复制MD）改成下拉；
 * 腾出来的位置加「新增」「修改」，旁边加「分类」下拉；选定分类后「新增」放进这个分类、
 * 「修改」也按这个分类走；「管理」入口去掉。
 *
 * 运行：node test-panel-header.mjs
 */
import assert from 'node:assert/strict'

console.log('dsh-quick-prompts 弹层顶部工具行回归\n')

let passed = 0
const ok = (name) => { passed++; console.log('  \u2713 ' + name) }

const CATS = [
  { id: 'c0', name: '默认', prompts: [{ id: 'p0', title: '继续', text: '继续', order: 1 }] },
  { id: 'c1', name: '常用', prompts: [
    { id: 'p1', title: '最优方案', text: '以最优方案处理', order: 1 },
    { id: 'p1b', title: '简洁', text: '简洁点', order: 2 },
  ] },
  { id: 'c2', name: '工作', prompts: [{ id: 'p2', title: '周报', text: '写周报', order: 1 }] },
]

/** 与 CATS 对应的全量编辑行（startEdit / buildRows 的产物）。 */
const ROWS = [
  { id: 'p0', cat: '默认', title: '继续', text: '继续', autoSend: false, order: 1 },
  { id: 'p1', cat: '常用', title: '最优方案', text: '以最优方案处理', autoSend: false, order: 1 },
  { id: 'p1b', cat: '常用', title: '简洁', text: '简洁点', autoSend: false, order: 2 },
  { id: 'p2', cat: '工作', title: '周报', text: '写周报', autoSend: false, order: 1 },
]

const SKIP = Symbol('use-init')
let stateQueue = []
/** 记录组件调用的每一个 setState 实参（stub React 不重渲染，只能这样观察状态更新）。 */
let setCalls = []
/** useRef 槽位：按真实 React 的语义**跨渲染复用同一个对象**（否则 baseFpRef 这类跨渲染状态会丢）。 */
let refSlots = []
let refCursor = 0
const React = {
  createElement(type, props, ...children) { return { type, props: props || {}, children } },
  Fragment: Symbol('Fragment'),
  useState(init) {
    const v = stateQueue.length ? stateQueue.shift() : SKIP
    return [v === SKIP ? init : v, (nv) => { setCalls.push(nv) }]
  },
  useEffect() { },
  useRef(init) {
    const i = refCursor++
    if (!(i in refSlots)) refSlots[i] = { current: init }
    return refSlots[i]
  },
}

let caseSeq = 0

/** 加载一份全新的客户端模块（每次用例一份实例，避免模块级 store 串味）。 */
async function load() {
  resetRefs()
  let factory = null
  globalThis.window = {
    __ModuleLoader__: { load(m) { factory = m } },
    innerWidth: 1440,
    innerHeight: 800,
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
  return { mod, components }
}

/**
 * 渲染闪电笔弹层。stateQueue 顺序 = QuickPromptSeat 的 useState 顺序：
 * [useBarCollapsed(SKIP), useQuickCategories, open, pos, error, info, editing, draft, saving,
 *  pendingExtern, targetCat, conflict, query, catMenu, renaming, showAll]
 * 同一个用例内多次 renderSeat 视为**同一个组件实例**（useRef 槽位跨渲染复用）。
 */
function renderSeat(components, {
  editing = false, draft = [], targetCat = '', open = true, conflict = null,
  query = '', catMenu = false, renaming = null, showAll = false,
} = {}) {
  setCalls = []
  refCursor = 0
  stateQueue = [SKIP, CATS, open, { x: 0, y: 0 }, null, null, editing, draft, false, false, targetCat, conflict,
    query, catMenu, renaming, showAll]
  const el = components['conversation.input.left']({ inputActions: { setDraft() { }, submit() { } }, input: { draft: '' } })
  return el.type(el.props)
}

/** 新用例开始：清掉上一例的 ref 槽位（相当于重新挂载组件）。 */
function resetRefs() { refSlots = [] }

/** 造一个服务端替身：GET 返回当前那份，POST 记录并替换它。 */
function serverStub(initial) {
  const state = { categories: initial, posts: [], gets: 0 }
  globalThis.fetch = async (url, opts) => {
    const u = String(url)
    if (u.indexOf('/api/quick-prompts') < 0) throw new Error('unexpected fetch: ' + u)
    if (opts && opts.method === 'POST') {
      const cats = JSON.parse(opts.body).categories
      state.posts.push(cats)
      state.categories = cats
      return { ok: true, json: async () => ({ ok: true, categories: cats }) }
    }
    state.gets++
    return { ok: true, json: async () => ({ ok: true, categories: state.categories }) }
  }
  return state
}

const flat = (arr) => (arr || []).flatMap((c) => (Array.isArray(c) ? flat(c) : [c]))

function walk(node, visit) {
  if (!node || typeof node !== 'object') return
  visit(node)
  for (const c of node.children || []) (Array.isArray(c) ? c.forEach((x) => walk(x, visit)) : walk(c, visit))
}

function findAll(tree, pred) {
  const hits = []
  walk(tree, (n) => { if (pred(n)) hits.push(n) })
  return hits
}
const find = (tree, pred) => findAll(tree, pred)[0]

const hasClass = (n, cls) => String((n && n.props && n.props.className) || '').split(/\s+/).includes(cls)
const buttons = (tree) => findAll(tree, (n) => n.type === 'button')
const buttonByText = (tree, text) => find(tree, (n) => n.type === 'button' && flat(n.children)[0] === text)
const mdSelect = (tree) => find(tree, (n) => n.type === 'select' && hasClass(n, 'qp-md-select'))
const catPick = (tree) => find(tree, (n) => n.type === 'select' && hasClass(n, 'qp-cat-pick'))
const optionNodes = (sel) => flat(sel.children).filter((o) => o && o.type === 'option')
const optionValues = (sel) => optionNodes(sel).map((o) => o.props.value)
const optionLabels = (sel) => optionNodes(sel).map((o) => flat(o.children)[0])
const editRows = (tree) => findAll(tree, (n) => n.type === 'div' && hasClass(n, 'qp-edit-row'))
const arrays = () => setCalls.filter((v) => Array.isArray(v))
const lastArray = () => arrays()[arrays().length - 1]
const textOf = (node) => flat(node.children).join('')
/** 递归取子树里所有文本（冲突条这种多层结构用）。 */
const deepText = (node) => {
  const out = []
  walk(node, (n) => { for (const c of n.children || []) if (typeof c === 'string') out.push(c) })
  return out.join('')
}
const buttonIn = (node, text) => find(node, (n) => n.type === 'button' && flat(n.children)[0] === text)
const tick = () => new Promise((r) => setTimeout(r, 0))

/* 1. 浏览态：三个 MD 按钮收成下拉；腾出的位置是「分类」下拉 + 新增 / 修改；「管理」入口消失 */
{
  const { components } = await load()
  const tree = renderSeat(components, { targetCat: '常用' })

  const sel = mdSelect(tree)
  assert.ok(sel, '顶部应有「MD 管理」下拉')
  assert.deepEqual(optionLabels(sel), ['MD 管理', '导入MD', '导出MD'], '下拉项 = 导入MD / 导出MD（浏览器环境无复制MD）')
  assert.equal(sel.props.value, '', '下拉值恒为空，选完回到「MD 管理」')

  const pick = catPick(tree)
  assert.ok(pick, '「新增 / 修改」旁边应有「分类」下拉')
  assert.deepEqual(optionValues(pick), ['默认', '常用', '工作'], '分类下拉应列出全部分类')
  assert.equal(pick.props.value, '常用', '分类下拉当前值应为选中的分类')

  assert.ok(buttonByText(tree, '新增'), '应有「新增」按钮')
  assert.ok(buttonByText(tree, '修改'), '应有「修改」按钮')
  assert.equal(buttonByText(tree, '管理'), undefined, '旧「管理」入口应已移除')
  for (const label of ['导入MD', '导出MD', '复制MD']) {
    assert.equal(buttonByText(tree, label), undefined, '「' + label + '」不应再单独占一个按钮')
  }
  // v0.7.0：工具行长出 ‹ › ⋯ 这些分类操作控件，但模式按钮仍只有 新增 / 修改 两个
  const modeButtons = buttons(tree).filter((b) => ['新增', '修改'].includes(flat(b.children)[0]))
  assert.equal(modeButtons.length, 2, '模式按钮应只有「新增 / 修改」两个')
  assert.ok(find(tree, (n) => hasClass(n, 'qp-search-input')), '浏览态应有搜索框')
  ok('浏览态：MD 管理下拉 + 分类下拉 + 新增 / 修改，「管理」入口已去掉')
}

/* 2. 分类下拉的目标分类失效时回落到第一个分类（不会出现空值 / 不存在的分类） */
{
  const { components } = await load()
  const stale = catPick(renderSeat(components, { targetCat: '已删除的分类' }))
  assert.equal(stale.props.value, '默认', '目标分类失效时应回落到第一个分类')
  const empty = catPick(renderSeat(components, { targetCat: '' }))
  assert.equal(empty.props.value, '默认', '没选过时应落在第一个分类')
  ok('分类下拉：失效 / 未选时回落到第一个分类（新增永远有落点）')
}

/* 3. 「新增」：进编辑态，并在选中的分类末尾补一行空行（序号 = 该分类最大序号 + 1） */
{
  const { components } = await load()
  const tree = renderSeat(components, { targetCat: '工作' })
  buttonByText(tree, '新增').props.onClick()

  const rows = lastArray()
  assert.ok(Array.isArray(rows), '「新增」应把新的 draft 交给 setDraft')
  assert.equal(rows.length, ROWS.length + 1, '应在原有条目基础上新增一行（不是推倒重来）')
  assert.deepEqual(rows.slice(0, ROWS.length), ROWS, '原有条目应原样保留')
  assert.deepEqual(rows[rows.length - 1], { id: '', cat: '工作', title: '', text: '', autoSend: false, order: 2 },
    '新行应落在选中的分类「工作」，序号 = 该分类最大序号 + 1')
  assert.ok(setCalls.includes(true), '「新增」应同时进入编辑态')
  ok('「新增」：新行落在选中的分类（工作·序号 2），其余条目原样保留')
}

/* 4. 「修改」：进编辑态，draft 是全量快照（其他分类一个都不少） */
{
  const { components } = await load()
  const tree = renderSeat(components, { targetCat: '常用' })
  buttonByText(tree, '修改').props.onClick()

  const rows = lastArray()
  assert.deepEqual(rows, ROWS, '「修改」的 draft 应是全量条目（含其他分类），保存不会丢数据')
  assert.ok(setCalls.includes(true), '「修改」应进入编辑态')
  ok('「修改」：draft 为全量快照（默认 / 常用 / 工作 都在）')
}

/* 5. 编辑态只显示目标分类的行，并给出说明行 */
{
  const { components } = await load()
  const tree = renderSeat(components, { editing: true, draft: ROWS, targetCat: '常用' })
  const rows = editRows(tree)
  assert.equal(rows.length, 2, '编辑态应只渲染「常用」这个分类的 2 行')
  const scope = find(tree, (n) => hasClass(n, 'qp-scope'))
  assert.ok(scope, '编辑态应有一行说明「正在编辑哪个分类」')
  assert.ok(textOf(scope).includes('常用'), '说明行应点名当前分类')
  assert.ok(textOf(scope).includes('原样保留'), '说明行应说清其他分类不受影响')

  const other = renderSeat(components, { editing: true, draft: ROWS, targetCat: '工作' })
  assert.equal(editRows(other).length, 1, '切到「工作」后应只显示它的 1 行')
  ok('编辑态：列表只显示目标分类的行（切分类即换列表），并有说明行')
}

/* 6. 保存：POST 的 categories 含全部分类 —— 按分类「修改」不会误删别的分类 */
{
  const server = serverStub(CATS)
  try {
    const { components } = await load()
    // 真流程：浏览态点「修改」进编辑态（同时记下基线）→ 再点「保存」
    const browse = renderSeat(components, { targetCat: '常用' })
    buttonByText(browse, '修改').props.onClick()
    const draft = lastArray()
    assert.ok(Array.isArray(draft) && draft.length === ROWS.length, '「修改」应先产出全量编辑行')

    const editTree = renderSeat(components, { editing: true, draft, targetCat: '常用' })
    buttonByText(editTree, '保存').props.onClick()
    await tick()
    await tick()

    assert.equal(server.gets, 1, '保存前应先探一次服务端（冲突检测）')
    assert.equal(server.posts.length, 1, '服务端没变时应直接落盘，不需要用户确认')
    const names = server.posts[0].map((c) => c.name)
    assert.deepEqual(names, ['默认', '常用', '工作'], '保存应含全部分类（不只是当前编辑的那个）')
    assert.equal(server.posts[0][1].prompts.length, 2, '「常用」的 2 条应完整保留')
    assert.equal(server.posts[0][2].prompts[0].title, '周报', '未显示在编辑列表里的「工作」也要原样保存')
  } finally {
    delete globalThis.fetch
  }
  ok('保存：按分类编辑后落盘仍是全量数据，其他分类原样保留')
}

/* 7. 编辑态「新增」：新行落在当前分类（不再沿用上一行分类） */
{
  const { components } = await load()
  const tree = renderSeat(components, { editing: true, draft: ROWS, targetCat: '默认' })
  buttonByText(tree, '新增').props.onClick()
  const rows = lastArray()
  assert.deepEqual(rows[rows.length - 1], { id: '', cat: '默认', title: '', text: '', autoSend: false, order: 2 },
    '编辑态「新增」应落在当前选中的分类（这里最后一行是「工作」，但新行归属「默认」）')
  ok('编辑态「新增」：新行归属当前分类，且序号按该分类计算')
}

/* 8. 编辑态也可切换分类下拉（换编辑对象）；行内改分类时视图跟着切过去（那一行不会「消失」） */
{
  const { components } = await load()
  const tree = renderSeat(components, { editing: true, draft: ROWS, targetCat: '常用' })
  catPick(tree).props.onChange({ target: { value: '工作' } })
  assert.ok(setCalls.includes('工作'), '编辑态切换分类应更新目标分类')

  // 行内「分类」下拉改到别的分类：目标分类跟着走，于是那一行仍在新分类的列表里
  const rowCat = find(tree, (n) => n.type === 'select' && hasClass(n, 'qp-cat-select'))
  rowCat.props.onChange({ target: { value: '工作' } })
  const patched = lastArray()
  assert.equal(patched[1].cat, '工作', '改分类应落到 draft 上')
  assert.ok(setCalls.includes('工作'), '改分类后编辑对象应跟着切到新分类')
  assert.equal(patched[1].keep, undefined, '不再使用粘性 keep 标记（否则该行会在每个分类下都出现）')
  ok('编辑态：可切分类；行改到别的分类后视图跟着走，不会「看着像被删了」')
}

/* 9. 纯模型：collectCatNames / nextOrderFor / normCatName */
{
  const { mod } = await load()
  const { collectCatNames, nextOrderFor, normCatName } = mod.internals
  assert.equal(normCatName('  '), '默认', '空名归「默认」')
  assert.deepEqual(collectCatNames(['默认', '常用'], [{ cat: '临时' }, { cat: '  ' }]), ['默认', '常用', '临时'],
    '可选分类 = 已保存 ∪ 草稿（去重、按出现顺序、空名归默认）')
  assert.deepEqual(collectCatNames([], null), [], '没有分类也没有草稿时选项为空')
  assert.equal(nextOrderFor(ROWS, '常用'), 3, '「常用」最大序号 2 → 建议 3')
  assert.equal(nextOrderFor(ROWS, ''), 2, '空分类名按「默认」算 → 建议 2')
  assert.equal(nextOrderFor(ROWS, '不存在的分类'), 1, '新分类从 1 开始')
  ok('模型：分类名收集 / 建议序号 / 空名归一')
}

/* 10. 删除可撤销（v0.6.1）：有内容的行先标记、可「恢复」；空行直接移除；标记的行不会落盘 */
{
  const server = serverStub(CATS)
  try {
    const { components } = await load()
    const tree = renderSeat(components, { editing: true, draft: ROWS, targetCat: '常用' })
    const rows = editRows(tree)
    buttonIn(rows[0], '删除').props.onClick()               // 删「常用·最优方案」这一行
    const marked = lastArray()
    assert.ok(marked.some((r) => r && r.deleted === true), '有内容的行应被标记为待删除')
    assert.equal(marked.length, ROWS.length, '标记删除不改变 draft 长度（行还在，可恢复）')

    // 渲染标记后的状态：行变灰 + 出现「恢复」
    const marked2 = ROWS.map((r, i) => (i === 1 ? { ...r, deleted: true } : r))
    const tree2 = renderSeat(components, { editing: true, draft: marked2, targetCat: '常用' })
    const rowA = editRows(tree2)[0]
    assert.ok(hasClass(rowA, 'qp-row-deleted'), '待删除的行应带 qp-row-deleted（变灰）')
    assert.ok(buttonIn(rowA, '恢复'), '待删除的行应提供「恢复」按钮')
    assert.equal(buttonIn(rowA, '删除'), undefined, '待删除的行不再显示「删除」')
    buttonIn(rowA, '恢复').props.onClick()
    assert.equal(lastArray()[1].deleted, false, '「恢复」应撤掉删除标记')

    // 空行（刚新增没写东西）→ 直接移除，不必留个灰行
    const withBlank = ROWS.concat([{ id: '', cat: '常用', title: '', text: '', autoSend: false, order: 3 }])
    const tree3 = renderSeat(components, { editing: true, draft: withBlank, targetCat: '常用' })
    buttonIn(editRows(tree3)[2], '删除').props.onClick()
    assert.equal(lastArray().length, ROWS.length, '空行应被直接移除')

    // 标记删除的行在保存时真的消失
    const tree4 = renderSeat(components, { editing: true, draft: marked2, targetCat: '常用' })
    buttonByText(tree4, '保存').props.onClick()
    await tick()
    await tick()
    const savedPrompts = server.posts[0].find((c) => c.name === '常用').prompts
    assert.equal(savedPrompts.length, 1, '保存后「常用」应只剩 1 条（被标记的那条真的删掉了）')
    assert.equal(savedPrompts[0].title, '简洁', '被删的应是标记为 deleted 的那条')
  } finally {
    delete globalThis.fetch
  }
  ok('删除可撤销：有内容的行变灰可「恢复」，空行直接移除，标记的行保存时才消失')
}

/* 11. 保存前冲突检测（v0.6.1）：服务端被别处改过 → 不落盘，先让用户选 */
{
  const server = serverStub(CATS)
  try {
    const { components } = await load()
    const browse = renderSeat(components, { targetCat: '常用' })
    buttonByText(browse, '修改').props.onClick()
    const draft = lastArray()

    // 另一台设备在编辑期间写入了新分类
    const external = CATS.concat([{ id: 'c9', name: '另一台加的', prompts: [{ id: 'p9', title: 'x', text: 'x', order: 1 }] }])
    server.categories = external
    let tree = renderSeat(components, { editing: true, draft, targetCat: '常用' })
    buttonByText(tree, '保存').props.onClick()
    await tick()
    await tick()
    assert.equal(server.posts.length, 0, '检测到服务端已变时**不能**直接落盘')
    const conflictState = setCalls.filter((v) => v && typeof v === 'object' && v.reason).pop()
    assert.ok(conflictState, '应把冲突交给组件状态')
    assert.equal(conflictState.reason, 'changed', '冲突原因应为「服务端数据变了」')
    assert.equal(conflictState.latest.length, 4, '应把服务端最新那份一起带回来，供「载入最新」用')

    // 冲突条要给出两条出路
    tree = renderSeat(components, { editing: true, draft, targetCat: '常用', conflict: conflictState })
    const strip = find(tree, (n) => hasClass(n, 'qp-conflict'))
    assert.ok(strip, '应渲染冲突提示条')
    assert.ok(buttonIn(strip, '覆盖保存'), '冲突条应提供「覆盖保存」')
    assert.ok(buttonIn(strip, '放弃我的改动，载入最新'), '冲突条应提供「载入最新」')
    assert.ok(deepText(strip).includes('覆盖'), '冲突条应说清「直接保存会覆盖那边的改动」')

    // 覆盖保存 → 真的落盘
    buttonIn(strip, '覆盖保存').props.onClick()
    await tick()
    await tick()
    assert.equal(server.posts.length, 1, '「覆盖保存」应真的落盘')
    assert.deepEqual(server.posts[0].map((c) => c.name), ['默认', '常用', '工作'], '覆盖保存提交的是我这份')

    // 载入最新 → 编辑行换成服务端最新那份，并清掉冲突提示
    tree = renderSeat(components, { editing: true, draft, targetCat: '常用', conflict: { latest: external, reason: 'changed' } })
    const strip2 = find(tree, (n) => hasClass(n, 'qp-conflict'))
    buttonIn(strip2, '放弃我的改动，载入最新').props.onClick()
    const adopted = lastArray()
    assert.deepEqual(adopted.map((r) => r.cat), ['默认', '常用', '常用', '工作', '另一台加的'],
      '「载入最新」应把编辑行换成服务端最新那份（含另一台加的分类）')
    assert.ok(setCalls.includes(null), '「载入最新」后应清掉冲突提示')
  } finally {
    delete globalThis.fetch
  }
  ok('保存前冲突：先探服务端 → 覆盖保存 / 载入最新，绝不静默盖掉别处的改动')
}

/* 12. 浏览态搜索（v0.7.0）：跨分类过滤 + 无命中提示 */
{
  const { components } = await load()
  const all = renderSeat(components, { targetCat: '常用' })
  assert.equal(findAll(all, (n) => n.type === 'div' && n.props.className === 'qp-item').length, 4, '不搜索时应显示全部 4 条')

  const hit = renderSeat(components, { targetCat: '常用', query: '最优' })
  const items = findAll(hit, (n) => n.type === 'div' && n.props.className === 'qp-item')
  assert.equal(items.length, 1, '搜索「最优」只应命中 1 条')
  assert.ok(deepText(items[0]).includes('最优方案'), '命中的应是「最优方案」')
  const heads = findAll(hit, (n) => hasClass(n, 'qp-cat-head')).map(deepText)
  assert.deepEqual(heads, ['常用（1/2）'], '只保留有命中的分类，并显示「命中/总数」')

  const miss = renderSeat(components, { targetCat: '常用', query: '不存在的词' })
  assert.ok(deepText(find(miss, (n) => hasClass(n, 'qp-empty'))).includes('没有匹配'), '无命中应给出明确提示')
  ok('搜索：跨分类按标题/内容过滤，分类头显示「命中/总数」，无命中给提示')
}

/* 13. 分类下拉带条数 + ‹ › 一步换分类（v0.7.0） */
{
  const { components } = await load()
  const tree = renderSeat(components, { targetCat: '常用' })
  const labels = optionLabels(catPick(tree))
  assert.deepEqual(labels, ['默认（1）', '常用（2）', '工作（1）'], '分类下拉应带上每个分类的条数')

  const prev = find(tree, (n) => n.type === 'button' && n.props.title === '上一个分类')
  const next = find(tree, (n) => n.type === 'button' && n.props.title === '下一个分类')
  assert.ok(prev && next, '工具行应有 ‹ / › 换分类按钮')
  next.props.onClick()
  assert.ok(setCalls.includes('工作'), '「下一个分类」应切到后面的分类')
  prev.props.onClick()
  assert.ok(setCalls.includes('默认'), '「上一个分类」应切到前面的分类（这里从「常用」往前走一格）')

  const only = renderSeat(components, { targetCat: '' })   // 只有一个分类时不许瞎跳
  const oneCatPrev = find(only, (n) => n.type === 'button' && n.props.title === '上一个分类')
  assert.equal(oneCatPrev.props.disabled, false, '有 3 个分类时按钮应可用')
  ok('分类下拉带条数；‹ › 可一步换分类')
}

/* 14. 分类重命名 / 删除整个分类（v0.7.0）：都发生在草稿里，保存前可恢复 */
{
  const { components } = await load()
  // ⋯ 菜单
  const closed = renderSeat(components, { editing: true, draft: ROWS, targetCat: '常用' })
  assert.equal(find(closed, (n) => hasClass(n, 'qp-menu')), undefined, '未展开时不渲染菜单')
  find(closed, (n) => hasClass(n, 'qp-icon') && flat(n.children)[0] === '⋯').props.onClick({ stopPropagation() { } })
  assert.ok(setCalls.includes(true), '点 ⋯ 应展开分类操作菜单')

  const open = renderSeat(components, { editing: true, draft: ROWS, targetCat: '常用', catMenu: true })
  const items = findAll(open, (n) => hasClass(n, 'qp-menu-item'))
  assert.equal(items.length, 2, '菜单应有「重命名分类」「删除这个分类」两项')
  assert.ok(deepText(items[0]).includes('重命名分类「常用」'), '第一项点名当前分类')
  assert.ok(deepText(items[1]).includes('删除这个分类（2 条'), '第二项说明会删掉几条')

  // 重命名：整分类一起改，并且编辑对象跟着换
  items[0].props.onClick()
  assert.ok(setCalls.includes('常用'), '点「重命名」应把当前分类名填进输入框')
  const renamingTree = renderSeat(components, { editing: true, draft: ROWS, targetCat: '常用', renaming: '日常' })
  const renameInput = find(renamingTree, (n) => n.type === 'input' && hasClass(n, 'qp-cat-rename'))
  assert.ok(renameInput, '重命名时应显示输入框')
  assert.equal(find(renamingTree, (n) => n.type === 'select' && hasClass(n, 'qp-cat-pick')), undefined, '重命名时不再显示分类下拉')
  buttonByText(renamingTree, '改名').props.onClick()
  const renamed = lastArray()
  assert.deepEqual(renamed.map((r) => r.cat), ['默认', '日常', '日常', '工作'], '该分类的每一行都应改名')
  assert.ok(setCalls.includes('日常'), '改名后编辑对象应切到新分类名')

  // 删除整个分类：逐条标记待删除（不是直接抹掉）
  const open2 = renderSeat(components, { editing: true, draft: ROWS, targetCat: '常用', catMenu: true })
  findAll(open2, (n) => hasClass(n, 'qp-menu-item'))[1].props.onClick()
  const marked = lastArray()
  assert.deepEqual(marked.map((r) => r.deleted === true), [false, true, true, false], '只有该分类的两条被标记待删除')
  ok('分类操作：重命名整分类（行跟着改）/ 删除整分类（逐条标记，可恢复）')
}

/* 15. 批量操作（v0.7.0）：勾选 → 批量改分类 / 批量删除 */
{
  const { components } = await load()
  const tree = renderSeat(components, { editing: true, draft: ROWS, targetCat: '常用' })
  const picks = findAll(tree, (n) => n.type === 'input' && hasClass(n, 'qp-pick'))
  assert.equal(picks.length, 2, '「常用」的 2 行都应有勾选框')
  picks[0].props.onChange()
  const one = lastArray()
  assert.equal(one[1].picked, true, '勾选应落到 draft 上')

  // 勾上两条后出现批量条
  const pickedRows = ROWS.map((r, i) => (i === 1 || i === 2 ? { ...r, picked: true } : r))
  const bulkTree = renderSeat(components, { editing: true, draft: pickedRows, targetCat: '常用' })
  const bulk = find(bulkTree, (n) => hasClass(n, 'qp-bulk'))
  assert.ok(bulk, '有勾选时应出现批量条')
  assert.ok(deepText(bulk).includes('已选 2 条'), '批量条应显示已选条数')

  const bulkCat = find(bulkTree, (n) => n.type === 'select' && hasClass(n, 'qp-bulk-cat'))
  bulkCat.props.onChange({ target: { value: '工作' } })
  const moved = lastArray()
  assert.deepEqual(moved.map((r) => r.cat), ['默认', '工作', '工作', '工作'], '批量移动应把选中的行改到目标分类')
  assert.ok(moved.every((r) => r.picked !== true), '移动后应清掉勾选')
  assert.ok(setCalls.includes('工作'), '批量移动后编辑对象应切到目标分类')

  const bulkDeleteBtn = find(bulkTree, (n) => n.type === 'button' && flat(n.children)[0] === '批量删除')
  bulkDeleteBtn.props.onClick()
  const deleted = lastArray()
  assert.deepEqual(deleted.map((r) => r.deleted === true), [false, true, true, false], '批量删除应把选中的行标记为待删除')
  assert.ok(deleted.every((r) => r.picked !== true), '批量删除后应清掉勾选')
  ok('批量：勾选 → 批量移到其它分类 / 批量删除（都还是草稿态）')
}

/* 16. 撤销 / 重做（v0.7.0）：进编辑态打底，之后每次编辑一个快照 */
{
  const { components } = await load()
  const browse = renderSeat(components, { targetCat: '常用' })
  buttonByText(browse, '修改').props.onClick()          // 进编辑态：历史 = [ROWS]
  const draft = lastArray()

  // 第一帧：还没编辑过 → 撤销按钮应禁用
  let tree = renderSeat(components, { editing: true, draft, targetCat: '常用' })
  assert.equal(find(tree, (n) => n.type === 'button' && n.props.title === '撤销（Ctrl+Z）').props.disabled, true, '刚进编辑态没有可撤销的东西')

  // 标记删除一条 → 历史前进一格
  buttonIn(editRows(tree)[0], '删除').props.onClick()
  const afterDelete = lastArray()
  assert.equal(afterDelete[1].deleted, true, '删除动作应落到 draft')

  // 撤销 → 回到删除前那份；重做 → 再回到删除后
  tree = renderSeat(components, { editing: true, draft: afterDelete, targetCat: '常用' })
  const undoBtn = find(tree, (n) => n.type === 'button' && n.props.title === '撤销（Ctrl+Z）')
  assert.equal(undoBtn.props.disabled, false, '有编辑后撤销应可用')
  undoBtn.props.onClick()
  const undone = lastArray()
  assert.deepEqual(undone, ROWS, '撤销应回到上一份快照（删除前）')
  assert.ok(undone.every((r) => r.deleted !== true), '撤销后不该还有待删除标记')

  tree = renderSeat(components, { editing: true, draft: undone, targetCat: '常用' })
  const redoBtn = find(tree, (n) => n.type === 'button' && n.props.title === '重做（Ctrl+Shift+Z）')
  assert.equal(redoBtn.props.disabled, false, '撤销之后重做应可用')
  redoBtn.props.onClick()
  assert.equal(lastArray()[1].deleted, true, '重做应回到删除后那份')
  ok('撤销 / 重做：进编辑态打底、每次编辑一个快照，按钮可用态跟着变')
}

/* 17. 编辑范围显式切换（v0.7.0）：默认只看本分类，可切「显示全部」 */
{
  const { components } = await load()
  const scoped = renderSeat(components, { editing: true, draft: ROWS, targetCat: '常用' })
  assert.equal(editRows(scoped).length, 2, '默认只看当前分类')
  assert.ok(find(scoped, (n) => n.type === 'button' && flat(n.children)[0] === '显示全部'), '应有「显示全部」切换')

  const all = renderSeat(components, { editing: true, draft: ROWS, targetCat: '常用', showAll: true })
  assert.equal(editRows(all).length, 4, '切「显示全部」后 4 条都在')
  assert.ok(deepText(find(all, (n) => hasClass(n, 'qp-scope'))).includes('全部'), '说明行应写明正在显示全部')
  assert.ok(find(all, (n) => n.type === 'button' && flat(n.children)[0] === '只看本分类'), '应能切回只看本分类')
  ok('编辑范围：默认只看本分类，可显式切「显示全部 / 只看本分类」')
}

console.log('\n全部通过：' + passed + ' 项')
