/**
 * dsh-quick-prompts 服务端半部：
 * 注册 /api/quick-prompts 路由，读写全局快捷语文件。
 *   GET  /api/quick-prompts                       -> { ok, categories }
 *   POST /api/quick-prompts { categories }        -> { ok, categories }
 *   POST /api/quick-prompts { prompts }(旧平铺)   -> { ok, categories }
 * 存储位置：$DSH_HOME/quick-prompts.json（默认 ~/.dsh/quick-prompts.json），
 * 与会话、项目、重启无关，保证快捷语永不丢失。
 * 数据格式 v2：{ version: 2, categories: [{ id, name, prompts: [{ id, title, text }] }] }
 * 自动兼容旧 v1（{ prompts: [...] } 平铺）并迁移为「默认」分类。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

export const name = 'dsh-quick-prompts'
export const inject = ['webServer']

const FILE_NAME = 'quick-prompts.json'

/** 全局存储文件：$DSH_HOME/quick-prompts.json，缺失 DSH_HOME 时回退 ~/.dsh。 */
function storeFile() {
  const home = process.env.DSH_HOME && process.env.DSH_HOME.trim()
    ? process.env.DSH_HOME.trim()
    : join(homedir(), '.dsh')
  return join(home, FILE_NAME)
}

function genId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/** 读取并规范化快捷语文件；兼容 v1 平铺结构并迁移为分类结构。 */
async function readStore(file) {
  try {
    const raw = await readFile(file, 'utf8')
    const data = JSON.parse(raw)
    if (data && Array.isArray(data.categories)) {
      return sanitizeCategories(data.categories)
    }
    // v1 平铺：{ prompts: [...] }（也可能直接是数组）
    const list = Array.isArray(data) ? data : (data && Array.isArray(data.prompts) ? data.prompts : [])
    const prompts = (Array.isArray(list) ? list : [])
      .filter((p) => p && typeof p.title === 'string' && typeof p.text === 'string')
      .map((p) => ({
        id: (typeof p.id === 'string' && p.id) ? p.id : genId('p'),
        title: String(p.title || '').slice(0, 200),
        text: String(p.text || ''),
      }))
      .filter((p) => p.title || p.text)
    if (prompts.length === 0) return []
    return [{ id: genId('c'), name: '默认', prompts }]
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

/** 规范化分类列表：过滤非法条目、补 id、截断超长字段。 */
function sanitizeCategories(input) {
  const arr = Array.isArray(input) ? input : []
  const out = []
  for (const c of arr) {
    if (!c || typeof c !== 'object') continue
    const name = String(c.name || '').trim().slice(0, 100) || '默认'
    const prompts = (Array.isArray(c.prompts) ? c.prompts : [])
      .filter((p) => p && (typeof p.title === 'string' || typeof p.text === 'string'))
      .map((p) => ({
        id: (typeof p.id === 'string' && p.id) ? p.id : genId('p'),
        title: String(p.title || '').slice(0, 200),
        text: String(p.text || ''),
      }))
      .filter((p) => p.title || p.text)
    if (prompts.length === 0) continue
    out.push({
      id: (typeof c.id === 'string' && c.id) ? c.id : genId('c'),
      name,
      prompts,
    })
  }
  return out
}

export function apply(ctx) {
  const webServer = ctx.webServer
  if (!webServer || typeof webServer.register !== 'function') return

  webServer.register({
    kind: 'exact',
    path: '/api/quick-prompts',
    handler: async (req, res) => {
      try {
        const file = storeFile()
        if (req.method === 'POST' || req.method === 'PUT') {
          const body = await readBody(req)
          let clean
          if (body && Array.isArray(body.categories)) {
            clean = sanitizeCategories(body.categories)
          } else {
            // 兼容旧客户端的平铺 prompts 提交
            clean = sanitizeCategories([{ name: '默认', prompts: body ? body.prompts : [] }])
          }
          await mkdir(dirname(file), { recursive: true })
          await writeFile(file, JSON.stringify({ version: 2, categories: clean }, null, 2), 'utf8')
          json(res, 200, { ok: true, categories: clean })
          return
        }
        const categories = await readStore(file)
        json(res, 200, { ok: true, categories })
      } catch (e) {
        json(res, 500, { ok: false, error: String(e && e.message || e), categories: [] })
      }
    },
  })
}
