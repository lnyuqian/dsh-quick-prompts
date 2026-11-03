/**
 * dsh-quick-prompts 跨分类拖动 + 面板布局回归测试（v0.7.13）。
 *
 * <用户> 2026-11-03 的四条要求：
 *  ① 去掉闪电面板顶部那条绿色提示；
 *  ② 提示语可以跨分类拖进 / 拖出（搬到别的分类）；
 *  ③ 编辑行里「⏎ 自动发送」「删除」挪到提示短语右边，提示短语宽度减半；
 *  ④ 提示语展示高度最少一行，超出一行自适应撑高。
 *
 * 运行：node test-cross-drag.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

console.log('dsh-quick-prompts 跨分类拖动 + 布局回归\n')

let passed = 0
const ok = (name) => { passed++; console.log('  \u2713 ' + name) }

const SKIP = Symbol('use-init')
const React = {
  createElement(type, props, ...children) { return { type, props: props || {}, children } },
  useState(init) { return [typeof init === 'function' ? init() : init, () => { }] },
  useEffect() { },
  useRef(init) { return { current: init } },
}

let factory = null
globalThis.window = {
  __ModuleLoader__: { load(m) { factory = m } },
  innerWidth: 1440, innerHeight: 900,
  matchMedia: () => ({ matches: false }),
  localStorage: { getItem: () => '0', setItem() { } },
  addEventListener() { }, removeEventListener() { },
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
}
globalThis.document = {
  createElement: () => ({ attrs: {}, style: {}, setAttribute() { }, remove() { }, textContent: '' }),
  head: { appendChild() { } },
  body: { appendChild() { } },
  documentElement: { style: {} },
  querySelectorAll: () => [],
  querySelector: () => null,
  addEventListener() { }, removeEventListener() { },
}

await import('./lib/client.js?cross-case=1')
assert.ok(factory, '模块应在 window.__ModuleLoader__.load 注册 factory')
const mod = factory.factory((name) => {
  if (name === 'react') return React
  throw new Error('未预期的 require: ' + name)
})
const internals = mod.internals
assert.ok(internals && internals.movePromptToCategory, '应导出 movePromptToCategory')

const move = internals.movePromptToCategory

function makeCats() {
  return [
    { id: 'c1', name: 'JEV', prompts: [
      { id: 'a1', title: 'A1', text: 'a1', order: 1 },
      { id: 'a2', title: 'A2', text: 'a2', order: 2 },
    ] },
    { id: 'c2', name: '常用', prompts: [
      { id: 'b1', title: 'B1', text: 'b1', order: 1 },
    ] },
    { id: 'c3', name: '空分类', prompts: [] },
  ]
}
const names = (cats) => cats.map((c) => c.name)
const ids = (cat) => cat.prompts.slice().sort((a, b) => a.order - b.order).map((p) => p.id)
const orders = (cat) => cat.prompts.slice().sort((a, b) => a.order - b.order).map((p) => p.order)

/* 1. 跨分类：JEV 第 1 条 → 常用 第 2 位 */
{
  const base = makeCats()
  const next = move(base, 'JEV', 0, '常用', 1)
  assert.notEqual(next, base, '有变化时应返回新数组')
  assert.deepEqual(names(next), ['JEV', '常用', '空分类'], '分类先后顺序不能变')
  assert.deepEqual(ids(next[0]), ['a2'], '源分类应只剩一条')
  assert.deepEqual(ids(next[1]), ['b1', 'a1'], '目标分类应把搬来的条目插到第 2 位')
  assert.deepEqual(orders(next[1]), [1, 2], '目标分类 order 应重写 1..N')
  assert.deepEqual(orders(next[0]), [1], '源分类 order 应重写 1..N')
  ok('跨分类搬运：源/目标两侧都重写 order 1..N')
}

/* 2. 搬进空分类 */
{
  const base = makeCats()
  const next = move(base, '常用', 0, '空分类', 0)
  assert.deepEqual(ids(next[1]), [], '源分类应被搬空')
  assert.deepEqual(ids(next[2]), ['b1'], '空分类应收到条目')
  assert.deepEqual(orders(next[2]), [1])
  ok('搬进空分类：条目上场、order 从 1 开始')
}

/* 3. 同分类 = 普通换位（复用分类内重排） */
{
  const base = makeCats()
  const next = move(base, 'JEV', 0, 'JEV', 1)
  assert.deepEqual(ids(next[0]), ['a2', 'a1'], '同分类拖拽应按位次换序')
  assert.deepEqual(orders(next[0]), [1, 2])
  ok('同分类：退化为分类内换位')
}

/* 4. 分类名不存在 / 空数组 → 原样返回（同一引用，不落盘） */
{
  const base = makeCats()
  assert.equal(move(base, '不存在的分类', 0, '常用', 0), base, '源分类不存在应原样返回')
  assert.equal(move(base, 'JEV', 0, '不存在的分类', 0), base, '目标分类不存在应原样返回')
  assert.equal(move([], 'JEV', 0, '常用', 0).length, 0, '空分类数组应安全')
  ok('异常输入：原样返回、不落盘')
}

/* 5. 越界 toPos 夹紧到末尾 */
{
  const base = makeCats()
  const next = move(base, 'JEV', 0, '常用', 99)
  assert.deepEqual(ids(next[1]), ['b1', 'a1'], '越界应夹到末尾')
  ok('落点越界：夹到末尾')
}

/* 6. 不修改入参（原数据一个字节都不动） */
{
  const base = makeCats()
  const snapshot = JSON.stringify(base)
  move(base, 'JEV', 0, '常用', 0)
  assert.equal(JSON.stringify(base), snapshot, '入参不应被就地修改')
  ok('纯函数：不修改入参')
}

/* 7. 样式/布局：四条需求都落到源码里 */
{
  const src = readFileSync(new URL('./lib/client.js', import.meta.url), 'utf8')
  assert.ok(!/qp-info-inline/.test(src), '顶部绿色提示（qp-info-inline）应已删除')
  assert.match(src, /\.qp-item\{[^}]*min-height:var\(--qp-row-h,22px\)/, '条目高度应为「最少一行」')
  assert.match(src, /\.qp-item\{[^}]*overflow:visible/, '条目不应裁掉溢出内容')
  assert.match(src, /\.qp-item-text\{[^}]*white-space:normal/, '提示语应允许换行（超一行自适应）')
  assert.match(src, /\.qp-edit-meta\{[^}]*flex-wrap:nowrap/, '标题要与分类同一行、不换行（qp-edit-meta nowrap）')
  assert.match(src, /\.qp-edit-meta \.qp-edit-title\{[^}]*min-width:3em/, '标题（提示短语）应被压窄')
  assert.match(src, /\.qp-edit-text\{[^}]*width:100%/, '完整提示词（内容框）应整宽')
  assert.match(src, /className: 'qp-edit-actions'/, '自动发送/删除应在标题那一行（qp-edit-actions）')
  assert.ok(!/qp-edit-body/.test(src), '旧的 qp-edit-body 布局应已移除')
  assert.ok(!/qp-edit-titleline/.test(src), '旧的 qp-edit-titleline 单独一行布局应已移除')
  assert.match(src, /\.qp-cat-drop\{/, '跨分类落点分类头应有高亮样式')
  assert.match(src, /\.qp-toolbtn\{[^}]*height:24px/, '新增/修改/教程 应为按钮样式且高 24px（+2px）')
  assert.match(src, /\.qp-toolbtn\{[^}]*border:1px solid/, '按钮应有边框（做成按钮样式）')
  assert.match(src, /\.qp-tutorial\{/, '应有教程页样式')
  assert.match(src, /className: 'qp-toolbtn'/, '头部按钮应使用 qp-toolbtn 类')
  ok('样式：去绿提示 / 条目自适应 / 标题行放按钮 / 跨分类高亮 / 教程')
}

console.log(`\n结果: ${passed} passed, 0 failed`)
