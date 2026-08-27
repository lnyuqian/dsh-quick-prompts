/**
 * dsh-quick-prompts 服务端半部：
 * 注册 /api/quick-prompts 路由，读写当前会话项目根目录下的 .dsh/quick-prompts.json。
 *   GET  /api/quick-prompts?sessionId=... -> { ok, prompts }
 *   POST /api/quick-prompts { sessionId, prompts } -> { ok, prompts }
 * 直接使用 Node fs（宿主插件全信任，无需沙箱策略参数）。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export const name = 'dsh-quick-prompts'
export const inject = ['webServer', 'sessions']

const FILE = '.dsh/quick-prompts.json'

/** 解析当前会话的项目根目录（会话 header.cwd，缺失时回退进程 cwd）。 */
function projectRoot(ctx, sessionId) {
  const session = ctx.sessions?.get?.(sessionId)
  const cwd = session?.header && typeof session.header.cwd === 'string' ? session.header.cwd : ''
  return cwd || process.cwd()
}

/** 读取并规范化提示词文件；文件不存在或解析失败返回空列表。 */
async function readJsonFile(file) {
  try {
    const raw = await readFile(file, 'utf8')
    const data = JSON.parse(raw)
    const list = Array.isArray(data) ? data : (data && Array.isArray(data.prompts) ? data.prompts : [])
    return (Array.isArray(list) ? list : [])
      .filter((p) => p && typeof p.title === 'string' && typeof p.text === 'string')
      .map((p) => ({ id: typeof p.id === 'string' ? p.id : '', title: p.title, text: p.text }))
  } catch {
    return []
  }
}

function readBody(req) {
  return new Promise((resolvePromise, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      try {
        resolvePromise(raw ? JSON.parse(raw) : {})
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data))
}

function sanitize(prompts) {
  return (Array.isArray(prompts) ? prompts : [])
    .filter((p) => p && (typeof p.title === 'string' || typeof p.text === 'string'))
    .map((p) => ({
      id: (typeof p.id === 'string' && p.id) ? p.id : ('p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)),
      title: String(p.title || '').slice(0, 200),
      text: String(p.text || ''),
    }))
}

export function apply(ctx) {
  const webServer = ctx.webServer
  if (!webServer || typeof webServer.register !== 'function') return

  webServer.register({
    kind: 'exact',
    path: '/api/quick-prompts',
    handler: async (req, res) => {
      try {
        if (req.method === 'POST' || req.method === 'PUT') {
          const body = await readBody(req)
          const sessionId = body && typeof body.sessionId === 'string' ? body.sessionId : undefined
          if (!sessionId) {
            json(res, 400, { ok: false, error: '缺少 sessionId' })
            return
          }
          const root = projectRoot(ctx, sessionId)
          const file = join(root, FILE)
          const clean = sanitize(body.prompts)
          await mkdir(dirname(file), { recursive: true })
          await writeFile(file, JSON.stringify({ version: 1, prompts: clean }, null, 2), 'utf8')
          json(res, 200, { ok: true, prompts: clean })
          return
        }
        const url = new URL(req.url || '/', 'http://local')
        const sessionId = url.searchParams.get('sessionId') || undefined
        if (!sessionId) {
          json(res, 400, { ok: false, error: '缺少 sessionId', prompts: [] })
          return
        }
        const root = projectRoot(ctx, sessionId)
        const prompts = await readJsonFile(join(root, FILE))
        json(res, 200, { ok: true, prompts })
      } catch (e) {
        json(res, 500, { ok: false, error: String(e && e.message || e), prompts: [] })
      }
    },
  })
}
