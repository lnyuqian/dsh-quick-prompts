/**
 * dsh-quick-prompts 服务端半部回归测试。
 *
 * 覆盖两个真实踩过的坑：
 *  1. webServer.register() 返回的 disposer 必须挂进插件生命周期 —— 否则每次 HMR 重组/启停
 *     都会重复注册，第二次撞上「duplicate exact route」让整条插件行激活失败（桌面版必现）。
 *  2. 同进程里该路径已被占用时（旧版遗留 / 别的插件占用）不应让插件整体失败，而是复用并告警。
 *
 * 持久化往返使用隔离的临时 DSH_HOME，绝不触碰用户真实的 ~/.dsh/quick-prompts.json。
 *
 * 运行：node test-server.mjs
 */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mod = await import('./lib/index.js')
assert.deepEqual(mod.inject, ['webServer'], 'inject 应声明 webServer 依赖')
assert.equal(typeof mod.apply, 'function', '应导出 apply')

let passed = 0
const ok = (name) => { passed++; console.log('  \u2713 ' + name) }

console.log('dsh-quick-prompts 服务端半部回归\n')

/* ---------------- 测试替身 ---------------- */

function makeCtx(registerImpl, logger) {
  const effects = []
  return {
    effects,
    ctx: {
      webServer: { register: registerImpl },
      logger: logger || { warn() {} },
      effect(fn) { const disposer = fn(); effects.push(disposer); return () => { } },
    },
  }
}

function fakeReq(method, bodyObj) {
  const listeners = {}
  const req = { method, on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); return req } }
  queueMicrotask(() => {
    if (bodyObj !== undefined) (listeners.data || []).forEach((fn) => fn(Buffer.from(JSON.stringify(bodyObj), 'utf8')))
    ;(listeners.end || []).forEach((fn) => fn())
  })
  return req
}

function fakeRes() {
  return {
    code: null,
    body: '',
    writeHead(code) { this.code = code },
    end(text) { this.body = text },
    json() { return JSON.parse(this.body) },
  }
}

/* ---------------- 1. 路由注册与释放 ---------------- */

let route = null
let disposed = 0
{
  const { ctx, effects } = makeCtx((r) => { route = r; return () => { disposed++ } })
  mod.apply(ctx)
  assert.equal(route.kind, 'exact', '应注册 exact 路由')
  assert.equal(route.path, '/api/quick-prompts', '路由路径应为 /api/quick-prompts')
  assert.equal(typeof route.handler, 'function', '应提供 handler')
  assert.equal(typeof effects[0], 'function', 'register 返回的 disposer 必须挂进 ctx.effect')
  effects[0]()
  assert.equal(disposed, 1, '插件卸载时应释放路由注册')
  ok('路由挂进插件生命周期，卸载时释放（避免重组时 duplicate route）')
}

/* ---------------- 2. 重复注册容错 ---------------- */

{
  let warns = 0
  const { ctx, effects } = makeCtx(
    () => { throw new Error('webserver: duplicate exact route "/api/quick-prompts"') },
    { warn() { warns++ } },
  )
  mod.apply(ctx)
  assert.equal(warns, 1, '重复路由应告警一次')
  assert.equal(typeof effects[0], 'function', '容错路径仍应返回可调用的 disposer')
  ok('同进程重复注册：复用既有路由并告警，不让插件激活失败')
}

/* ---------------- 3. 其它错误照旧抛出 ---------------- */

{
  const { ctx } = makeCtx(() => { throw new Error('boom') })
  assert.throws(() => mod.apply(ctx), /boom/, '非重复类错误不应被吞掉')
  ok('非重复类注册错误照旧抛出（不掩盖真实故障）')
}

/* ---------------- 4. 缺少 webServer 时安全返回 ---------------- */

{
  assert.doesNotThrow(() => mod.apply({ get: () => undefined }))
  ok('缺少 webServer 服务时安全返回')
}

/* ---------------- 5. 隔离 DSH_HOME 下的读写往返 ---------------- */

{
  const dir = await mkdtemp(join(tmpdir(), 'qp-server-test-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = dir
  try {
    const { ctx } = makeCtx((r) => { route = r; return () => { } })
    mod.apply(ctx)

    // 空库
    let res = fakeRes()
    await route.handler(fakeReq('GET'), res)
    assert.equal(res.code, 200)
    assert.deepEqual(res.json(), { ok: true, categories: [] }, '空库应返回空分类')

    // 写入
    const categories = [
      { id: 'c1', name: '常用', prompts: [{ id: 'p1', title: '继续', text: '继续', autoSend: true, order: 1 }] },
      { id: 'c2', name: '讨论', prompts: [{ id: 'p2', title: '这是讨论', text: '这是讨论', order: 1 }] },
    ]
    res = fakeRes()
    await route.handler(fakeReq('POST', { categories }), res)
    assert.equal(res.code, 200)
    assert.equal(res.json().ok, true)

    // 落盘位置与结构
    const file = join(dir, 'quick-prompts.json')
    const onDisk = JSON.parse(await readFile(file, 'utf8'))
    assert.equal(onDisk.version, 2, '落盘应为 v2 结构')
    assert.equal(onDisk.categories.length, 2)
    assert.equal(onDisk.categories[0].prompts[0].autoSend, true, 'autoSend 应保留')

    // 读回一致
    res = fakeRes()
    await route.handler(fakeReq('GET'), res)
    const back = res.json()
    assert.equal(back.categories.length, 2)
    assert.equal(back.categories[1].prompts[0].title, '这是讨论')
    ok('隔离 DSH_HOME 下 GET/POST 往返一致，落盘为 v2 结构')

    // 旧 v1 平铺数据自动迁移为「默认」分类
    await writeFile(file, JSON.stringify({ prompts: [{ title: '旧条目', text: '旧内容' }] }), 'utf8')
    res = fakeRes()
    await route.handler(fakeReq('GET'), res)
    const migrated = res.json()
    assert.equal(migrated.categories.length, 1)
    assert.equal(migrated.categories[0].name, '默认', 'v1 平铺应迁移为「默认」分类')
    assert.equal(migrated.categories[0].prompts[0].text, '旧内容')
    ok('旧 v1 平铺数据自动迁移为「默认」分类')
  } finally {
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
    await rm(dir, { recursive: true, force: true })
  }
}

console.log('\n全部通过：' + passed + ' 项')
