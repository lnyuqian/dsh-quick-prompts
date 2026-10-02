/**
 * dsh-quick-prompts 桌面版（DeepSeek Harness Desktop）适配回归测试。
 *
 * 覆盖三件事：
 *  1. 弹层定位 computePopPos：上方空间足够时向上展开、按钮贴顶时向下展开、
 *     靠右时左边界夹紧、按可用空间限高 —— 桌面窗口通常比浏览器窗口小，这是主要适配点。
 *  2. 运行环境识别 isDesktopShell：`dsh-app://` 协议或 Electron UA 判定为桌面端。
 *  3. 端到端：桌面环境下闪电笔弹层额外渲染「复制MD」兜底按钮，且复制内容与
 *     「导出MD」的序列化结果完全一致；普通浏览器环境下不出现该按钮。
 *
 * 运行：node test-desktop.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const SRC = readFileSync(new URL('./lib/client.js', import.meta.url), 'utf8')

/* ---------------- 从源码中抽取纯函数（与 test-roundtrip.mjs 同一手法） ---------------- */

function extract(name) {
  const start = SRC.indexOf('function ' + name)
  assert.ok(start >= 0, '源码中应存在函数 ' + name)
  let depth = 0
  let i = SRC.indexOf('{', start)
  for (; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++
    else if (SRC[i] === '}') { depth--; if (depth === 0) break }
  }
  return SRC.slice(start, i + 1)
}

const popMod = new Function(
  'POP_WIDTH', 'POP_MAX_HEIGHT', 'POP_GAP', 'POP_MARGIN', 'POP_MIN_HEIGHT',
  extract('clamp') + '\n' + extract('computePopPos') + '\n; return { computePopPos, clamp }',
)(340, 400, 8, 8, 160)

const isDesktopShell = new Function('location', 'navigator', extract('isDesktopShell') + '\n; return isDesktopShell')(
  { protocol: 'dsh-app:' }, { userAgent: 'Mozilla/5.0 Electron/38.0.0' },
)

let passed = 0
const ok = (name) => { passed++; console.log('  \u2713 ' + name) }

console.log('dsh-quick-prompts 桌面版适配回归\n')

/* ---------------- 1. 弹层定位 ---------------- */

{
  // 工具行按钮位于窗口中下部：上方空间充裕 → 向上展开，不额外限高
  const p = popMod.computePopPos({ left: 200, top: 600, bottom: 626 }, { width: 1280, height: 800 })
  assert.equal(p.up, true, '上方空间充裕时应向上展开')
  assert.equal(p.y, 592, '向上展开时弹层底边贴在按钮上方 8px 处')
  assert.equal(p.x, 200, '位置充足时左边界不被改动')
  assert.equal(p.maxHeight, 400, '上方空间足够时不应压缩高度')
  ok('按钮在窗口中下部：向上展开且不限高')
}

{
  // 按钮贴近窗口顶部：上方放不下 → 翻到下方展开
  const p = popMod.computePopPos({ left: 40, top: 24, bottom: 50 }, { width: 900, height: 700 })
  assert.equal(p.up, false, '上方面积不足时应向下展开')
  assert.equal(p.y, 58, '向下展开时弹层顶边贴在按钮下方 8px 处')
  assert.ok(p.maxHeight >= 160 && p.maxHeight <= 400, '限高应落在 [160,400] 区间')
  ok('按钮贴近窗口顶部：自动翻转为向下展开')
}

{
  // 窄窗口 + 靠右按钮：左边界夹紧，弹层不越出右边缘
  const p = popMod.computePopPos({ left: 1200, top: 500, bottom: 526 }, { width: 1250, height: 800 })
  assert.equal(p.x, 1250 - 340 - 8, '靠右时应把左边界夹紧到视口内')
  ok('窄窗口靠右按钮：弹层左边界夹紧，不越出右边缘')
}

{
  // 上下都很挤：限高到可用空间，避免溢出成不可滚动的长条
  const p = popMod.computePopPos({ left: 10, top: 200, bottom: 226 }, { width: 1200, height: 300 })
  assert.ok(p.maxHeight <= 400, '受限方向的高度不应超过弹层上限')
  assert.ok(p.maxHeight >= 160, '限高不应低于最小可用高度')
  ok('上下空间紧张：按可用空间限高')
}

{
  // 拿不到按钮矩形（例如初始渲染）：退化到左上角且不抛错
  const p = popMod.computePopPos(null, { width: 0, height: 0 })
  assert.equal(p.x, 8)
  assert.equal(p.y, 8)
  assert.equal(p.up, false)
  ok('取不到按钮矩形：安全退化到左上角')
}

/* ---------------- 2. 运行环境识别 ---------------- */

{
  assert.equal(isDesktopShell(), true, 'dsh-app:// 协议应判定为桌面客户端')
  const browser = new Function('location', 'navigator', extract('isDesktopShell') + '\n; return isDesktopShell')(
    { protocol: 'http:' }, { userAgent: 'Mozilla/5.0 Chrome/140.0.0.0' },
  )
  assert.equal(browser(), false, '普通浏览器不应被判定为桌面客户端')
  const electronOnly = new Function('location', 'navigator', extract('isDesktopShell') + '\n; return isDesktopShell')(
    { protocol: 'file:' }, { userAgent: 'Mozilla/5.0 Electron/38.0.0' },
  )
  assert.equal(electronOnly(), true, 'Electron UA 也应判定为桌面客户端')
  const noEnv = new Function('location', 'navigator', extract('isDesktopShell') + '\n; return isDesktopShell')(
    undefined, undefined,
  )
  assert.equal(noEnv(), false, '缺少环境对象时不应抛错，按普通浏览器处理')
  ok('环境识别：dsh-app 协议 / Electron UA 判定为桌面端，其余为浏览器')
}

/* ---------------- 3. 端到端：槽位注册与「复制MD」兜底 ---------------- */

let moduleFactory = null
globalThis.window = {
  __ModuleLoader__: { load(m) { moduleFactory = m } },
  innerWidth: 1280,
  innerHeight: 800,
}
globalThis.document = {
  createElement: () => ({ setAttribute() {}, remove() {}, textContent: '' }),
  head: { appendChild() {} },
  querySelectorAll: () => [],
}

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

const components = {}
mod.apply({
  get: (k) => (k === 'slots' ? {
    inject(_name, fn) { fn() },
    register(meta, comp) { components[meta.name] = comp; return () => {} },
  } : undefined),
  effect(fn) { fn() },
})
assert.ok(components['conversation.input.dock'], '应注册 dock 快捷条')
assert.ok(components['conversation.input.left'], '应注册闪电笔 seat')
ok('桌面端目标槽位注册：conversation.input.dock 与 conversation.input.left')

const CATS = [{
  id: 'c1',
  name: '测试分类',
  prompts: [
    { id: 'p1', title: '普通', text: '【短语】', autoSend: false, order: 1 },
    { id: 'p2', title: '自动', text: '【自动短语】', autoSend: true, order: 2 },
  ],
}]

function renderSeat() {
  stateQueue = [CATS, true, { x: 10, y: 100, up: true, maxHeight: 400 }, null, null, false, [], false]
  const el = components['conversation.input.left']({ inputActions: { setDraft() {}, submit() {} }, input: { draft: '' } })
  return el.type(el.props)
}

function collect(node, pred, out = []) {
  if (!node || typeof node !== 'object') return out
  if (pred(node)) out.push(node)
  for (const child of node.children || []) {
    if (Array.isArray(child)) child.forEach((c) => collect(c, pred, out))
    else collect(child, pred, out)
  }
  return out
}

const findButton = (tree, label) => collect(tree, (n) => n.type === 'button' && n.children[0] === label)[0]

{
  // 浏览器环境（无 location/navigator 覆盖）：不出现桌面专属的「复制MD」
  const tree = renderSeat()
  assert.equal(findButton(tree, '复制MD'), undefined, '浏览器环境不应渲染「复制MD」')
  assert.ok(findButton(tree, '导出MD'), '浏览器环境应渲染「导出MD」')
  ok('浏览器环境：只提供「导出MD」')
}

{
  // 桌面环境：出现「复制MD」，且复制内容与「导出MD」序列化结果一致
  let copied = null
  Object.defineProperty(globalThis, 'location', { value: { protocol: 'dsh-app:' }, configurable: true })
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'Mozilla/5.0 Electron/38.0.0', clipboard: { writeText: (t) => { copied = t; return Promise.resolve() } } },
    configurable: true,
  })
  try {
    const tree = renderSeat()
    const btn = findButton(tree, '复制MD')
    assert.ok(btn, '桌面环境应渲染「复制MD」兜底按钮')
    btn.props.onClick()
    await new Promise((r) => setTimeout(r, 0))
    assert.ok(typeof copied === 'string' && copied.length > 0, '复制内容应为非空文本')
    const lines = copied.split('\n')
    assert.ok(lines.includes('### 测试分类'), '复制内容应含分类标题')
    assert.ok(lines.some((l) => l.endsWith('自动 ⏎')), '自动发送条目应带 ⏎ 标记')
    assert.ok(copied.includes('    - 【短语】'), '内容行应缩进为 MD 列表')
    ok('桌面环境：出现「复制MD」，内容与「导出MD」的 MD 格式一致')
  } finally {
    delete globalThis.location
    delete globalThis.navigator
  }
}

console.log('\n全部通过：' + passed + ' 项')
