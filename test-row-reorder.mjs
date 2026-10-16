/**
 * dsh-quick-prompts 拖拽排序回归测试（v0.7.4）。
 *
 * 用户需求演进：
 *  - 2026-10-17 上午：编辑态加拖拽把手；
 *  - 2026-10-17 晚：**不要和「修改」放一起** —— 在**一条一行的展示态**就能拖，
 *    拖完立刻落盘（为了改一条顺序进编辑态、每行占三行不值当）。
 * 于是拖拽落在浏览态条目上，本测试锁住它的纯逻辑：分类内重排 + 序号重写 + 落点计算。
 *
 * 运行：node test-row-reorder.mjs
 */
import assert from 'node:assert/strict'

console.log('dsh-quick-prompts 拖拽排序回归\n')

let passed = 0
const ok = (name) => { passed++; console.log('  \u2713 ' + name) }

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
const React = {
  createElement(type, props, ...children) { return { type, props: props || {}, children } },
  Fragment: Symbol('Fragment'),
  useState(init) { return [init, () => { }] },
  useEffect() { },
  useRef(init) { return { current: init } },
}
await import('./lib/client.js?reorder-case=1')
assert.ok(factory, '模块应在 window.__ModuleLoader__.load 注册 factory')
const mod = factory.factory((name) => {
  if (name === 'react') return React
  throw new Error('未预期的 require: ' + name)
})
const { reorderPromptsInCategories, reorderCategories, dropIndexFromRects } = mod.internals
assert.ok(reorderPromptsInCategories && reorderCategories && dropIndexFromRects, '应导出重排与落点纯函数')

const CATS = () => [
  { id: 'c1', name: '常用', prompts: [
    { id: 'a', title: 'A', text: 'A', order: 1 },
    { id: 'b', title: 'B', text: 'B', order: 2 },
    { id: 'c', title: 'C', text: 'C', order: 3 },
  ] },
  { id: 'c2', name: '工作', prompts: [{ id: 'x', title: 'X', text: 'X', order: 1 }] },
]
const seqOf = (list, cat) => list.filter((c) => c.name === cat)[0].prompts.map((p) => p.id).join('')
const ordersOf = (list, cat) => list.filter((c) => c.name === cat)[0].prompts.map((p) => p.order).join(',')

/* 1. 往下拖：第一条拖到最后 */
{
  const out = reorderPromptsInCategories(CATS(), '常用', 0, 2)
  assert.equal(seqOf(out, '常用'), 'bca', 'A 应排到最后（B、C 依次前移）')
  assert.equal(ordersOf(out, '常用'), '1,2,3', '序号应重写为 1..N')
  assert.equal(seqOf(out, '工作'), 'x', '其他分类一个字节都不动')
  assert.equal(out.filter((c) => c.name === '工作')[0].prompts[0].order, 1, '其他分类的序号也不动')
  assert.equal(CATS().filter((c) => c.name === '常用')[0].prompts[0].id, 'a', '不应改到原对象上（纯函数）')
  ok('往下拖：A→最后，序号重写 1..N，其他分类原样且不改原对象')
}

/* 2. 往上拖：最后一条拖到最前 */
{
  const out = reorderPromptsInCategories(CATS(), '常用', 2, 0)
  assert.equal(seqOf(out, '常用'), 'cab', 'C 应排到最前')
  assert.equal(ordersOf(out, '常用'), '1,2,3')
  ok('往上拖：C→最前，序号重写 1..N')
}

/* 3. 边界：原地 / 越界 / 单条 / 不存在的分类 / 空数据 */
{
  const same = CATS()
  assert.equal(reorderPromptsInCategories(same, '常用', 1, 1), same, '原地松手应返回同一引用（不产生落盘）')
  assert.equal(seqOf(reorderPromptsInCategories(CATS(), '常用', 0, 99), '常用'), 'bca', '越界目标夹到末尾')
  assert.equal(seqOf(reorderPromptsInCategories(CATS(), '常用', -5, 0), '常用'), 'abc', '负位置夹到 0（= 原地）')
  const one = [{ name: '独苗', prompts: [{ id: 'a', title: 'A', text: 'A' }] }]
  assert.equal(reorderPromptsInCategories(one, '独苗', 0, 0), one, '只有一条时不动')
  const noCat = CATS()
  assert.equal(reorderPromptsInCategories(noCat, '不存在的分类', 0, 1), noCat, '分类不存在时原样返回')
  assert.deepEqual(reorderPromptsInCategories(null, '常用', 0, 1), [], '空数据安全返回空数组')
  assert.deepEqual(reorderPromptsInCategories([], '常用', 0, 1), [], '空数组原样返回')
  ok('边界：原地返回同一引用；越界夹紧；单条 / 不存在分类 / 空数据都安全')
}

/* 4. 落点计算：假矩形（每行 22px，从 y=0 开始） */
{
  const rects = [{ top: 0, height: 22 }, { top: 22, height: 22 }, { top: 44, height: 22 }]
  assert.equal(dropIndexFromRects(rects, 5, 0), 0, '指针在第 1 行上半 → 保持第 0 位')
  assert.equal(dropIndexFromRects(rects, 40, 0), 1, '越过第 1 行中线但没到第 2 行 → 第 1 位')
  assert.equal(dropIndexFromRects(rects, 70, 0), 2, '指针在最下面 → 末位')
  assert.equal(dropIndexFromRects(rects, 70, 2), 2, '已在末位、继续往下 → 仍是末位')
  assert.equal(dropIndexFromRects(rects, 5, 2), 0, '从末位往上拖到最上面 → 第 0 位')
  assert.equal(dropIndexFromRects(rects, 33, 1), 1, '指针在自己的中线上 → 不换位')
  assert.equal(dropIndexFromRects([], 100, 0), 0, '没有行时安全返回 0')
  ok('落点计算：跨中线才算换位，首尾夹紧，空列表安全')
}

/* 5. 只动顺序与序号：autoSend / 其他字段一律保留 */
{
  const list = [{ name: '常用', prompts: [
    { id: 'a', title: 'A', text: 'A', order: 1, autoSend: true },
    { id: 'b', title: 'B', text: 'B', order: 2, custom: 'keep-me' },
    { id: 'c', title: 'C', text: 'C', order: 3 },
  ] }]
  const out = reorderPromptsInCategories(list, '常用', 2, 0)
  assert.equal(seqOf(out, '常用'), 'cab')
  const byId = {}
  out[0].prompts.forEach((p) => { byId[p.id] = p })
  assert.equal(byId.a.autoSend, true, 'autoSend 应保留')
  assert.equal(byId.b.custom, 'keep-me', '未知字段也应原样保留')
  assert.equal(byId.a.title, 'A', '标题 / 内容不动')
  ok('只改顺序与序号：autoSend 与未知字段原样保留')
}

/* 6. 分类重排（v0.7.5）：把某个分类移到另一个分类的位置，其余保持相对顺序 */
{
  const list = [
    { id: 'c1', name: '常用', prompts: [] },
    { id: 'c2', name: '工作', prompts: [] },
    { id: 'c3', name: '交付', prompts: [] },
  ]
  const names = (l) => l.map((c) => c.name).join('')
  assert.equal(names(reorderCategories(list, '常用', '交付')), '工作交付常用', '往后拖：常用 → 交付的位置')
  assert.equal(names(reorderCategories(list, '交付', '常用')), '交付常用工作', '往前拖：交付 → 最前')
  assert.equal(reorderCategories(list, '常用', '常用'), list, '原地松手返回同一引用（不落盘）')
  assert.equal(reorderCategories(list, '不存在', '工作'), list, '分类不存在时原样返回')
  assert.equal(names(list), '常用工作交付', '不应改到原数组（纯函数）')
  assert.deepEqual(reorderCategories(null, 'a', 'b'), [], '空数据安全')
  ok('分类重排：移到目标位置、其余相对顺序不变、原地返回同一引用、不改原数组')
}

/* 7. 分类重排的落点也走同一个 dropIndexFromRects（分类头与提示语行高一致） */
{
  const heads = [{ top: 0, height: 22 }, { top: 22, height: 22 }, { top: 44, height: 22 }]
  assert.equal(dropIndexFromRects(heads, 10, 0), 0)
  assert.equal(dropIndexFromRects(heads, 70, 0), 2, '拖到最下面 → 最后一个分类的位置')
  assert.equal(dropIndexFromRects(heads, 5, 2), 0, '从最后拖到最前 → 第 0 位')
  ok('分类拖拽落点：与提示语共用同一套落点计算（分类头一样高）')
}

console.log('\n全部通过：' + passed + ' 项')
