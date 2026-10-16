/**
 * dsh-quick-prompts 编辑行拖拽排序回归测试（v0.7.2）。
 *
 * 用户需求（2026-10-17）：弹层编辑态里，用「按住上下拖动」代替手改「序 1..N」下拉 ——
 * 拖的是**一行＝一条快捷语**，拖完把该分类的序号重排成 1..N。
 *
 * 运行：node test-row-reorder.mjs
 */
import assert from 'node:assert/strict'

console.log('dsh-quick-prompts 拖拽排序回归\n')

let passed = 0
const ok = (name) => { passed++; console.log('  \u2713 ' + name) }

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
    innerWidth: 1440, innerHeight: 900,
    matchMedia: () => ({ matches: false }),
    localStorage: { getItem: () => null, setItem() { } },
  }
  globalThis.document = {
    createElement: () => ({ attrs: {}, setAttribute(k, v) { this.attrs[k] = v }, remove() { }, click() { }, textContent: '' }),
    head: { appendChild() { } },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() { }, removeEventListener() { },
  }
  await import('./lib/client.js?reorder-case=' + String(++caseSeq))
  assert.ok(factory, '模块应在 window.__ModuleLoader__.load 注册 factory')
  const mod = factory.factory((name) => {
    if (name === 'react') return React
    throw new Error('未预期的 require: ' + name)
  })
  return { mod }
}

const rows = () => [
  { id: 'a', cat: '常用', title: 'A', text: 'A', order: 1 },
  { id: 'b', cat: '常用', title: 'B', text: 'B', order: 2 },
  { id: 'c', cat: '常用', title: 'C', text: 'C', order: 3 },
  { id: 'x', cat: '工作', title: 'X', text: 'X', order: 1 },
]
const seqOf = (list, cat) => list.filter((r) => r.cat === cat).map((r) => r.id).join('')
const ordersOf = (list, cat) => list.filter((r) => r.cat === cat).map((r) => r.order).join(',')

/* 1. 往下拖：A 拖到 C 的位置 */
{
  const { mod } = await load()
  const { reorderInCategory } = mod.internals
  const out = reorderInCategory(rows(), '常用', 0, 2)
  assert.equal(seqOf(out, '常用'), 'bca', 'A 应排到最后（B、C 依次前移）')
  assert.equal(ordersOf(out, '常用'), '1,2,3', '序号应重排为 1..N')
  assert.equal(seqOf(out, '工作'), 'x', '其他分类一行都不动')
  assert.deepEqual(out.filter((r) => r.cat === '工作')[0].order, 1, '其他分类的序号也不动')
  ok('往下拖：A→最后，序号重排 1..N，其他分类原样')
}

/* 2. 往上拖：C 拖到最前 */
{
  const { mod } = await load()
  const { reorderInCategory } = mod.internals
  const out = reorderInCategory(rows(), '常用', 2, 0)
  assert.equal(seqOf(out, '常用'), 'cab', 'C 应排到最前')
  assert.equal(ordersOf(out, '常用'), '1,2,3')
  ok('往上拖：C→最前，序号重排 1..N')
}

/* 3. 原地不动 / 越界 / 单条：都不该出乱子 */
{
  const { mod } = await load()
  const { reorderInCategory } = mod.internals
  const same = rows()
  assert.equal(reorderInCategory(same, '常用', 1, 1), same, '原地松手应原样返回（同一个引用，不产生多余渲染）')
  assert.equal(seqOf(reorderInCategory(rows(), '常用', 0, 99), '常用'), 'bca', '越界目标应夹到末尾')
  assert.equal(seqOf(reorderInCategory(rows(), '常用', -5, 0), '常用'), 'abc', '负位置夹到 0（= 原地）')
  const one = [{ id: 'a', cat: '常用', title: 'A', text: 'A', order: 1 }]
  assert.equal(reorderInCategory(one, '常用', 0, 0), one, '只有一条时不动')
  const out = reorderInCategory(rows(), '不存在的分类', 0, 1)
  assert.equal(seqOf(out, '常用'), 'abc', '空分类不产生任何变化')
  ok('边界：原地不动返回同一引用；越界夹紧；单条 / 空分类安全')
}

/* 4. 拖拽落点：假矩形（每行 100px，从 y=0 开始） */
{
  const { mod } = await load()
  const { dropIndexFromRects } = mod.internals
  const rects = [{ top: 0, height: 100 }, { top: 100, height: 100 }, { top: 200, height: 100 }]
  assert.equal(dropIndexFromRects(rects, 10, 0), 0, '指针在第 1 行上半 → 保持第 0 位')
  assert.equal(dropIndexFromRects(rects, 160, 0), 1, '指针越过第 1 行中线但没到第 2 行 → 第 1 位（往下拖一格）')
  assert.equal(dropIndexFromRects(rects, 260, 0), 2, '指针在最下面 → 末位')
  assert.equal(dropIndexFromRects(rects, 260, 2), 2, '已在末位、继续往下 → 仍是末位')
  assert.equal(dropIndexFromRects(rects, 10, 2), 0, '从末位往上拖到最上面 → 第 0 位')
  assert.equal(dropIndexFromRects(rects, 150, 1), 1, '指针在自己的中线上 → 不换位')
  assert.equal(dropIndexFromRects([], 100, 0), 0, '没有行时安全返回 0')
  ok('落点计算：跨中线才算换位，首尾夹紧，空列表安全')
}

/* 5. 拖拽与「序号下拉 / 批量 / 删除标记」共存：序号重排不影响其他字段 */
{
  const { mod } = await load()
  const { reorderInCategory } = mod.internals
  const list = [
    { id: 'a', cat: '常用', title: 'A', text: 'A', order: 1, autoSend: true },
    { id: 'b', cat: '常用', title: 'B', text: 'B', order: 2, deleted: true },
    { id: 'c', cat: '常用', title: 'C', text: 'C', order: 3, picked: true },
  ]
  const out = reorderInCategory(list, '常用', 2, 0)
  assert.equal(out.filter((r) => r.cat === '常用').map((r) => r.id).join(''), 'cab', '被勾选 / 待删除的行一样参与排序')
  assert.equal(out[0].autoSend, undefined, 'A 的其他字段不被弄丢')
  assert.equal(out.filter((r) => r.id === 'a')[0].autoSend, true, 'A 的 autoSend 应保留')
  assert.equal(out.filter((r) => r.id === 'b')[0].deleted, true, '待删除标记应保留')
  assert.equal(out.filter((r) => r.id === 'c')[0].picked, true, '勾选状态应保留')
  assert.deepEqual(out.filter((r) => r.cat === '常用').map((r) => r.order), [1, 2, 3], '序号重排为 1..N')
  ok('共存：排序只改顺序与序号，autoSend / 勾选 / 待删除标记一律保留')
}

console.log('\n全部通过：' + passed + ' 项')
