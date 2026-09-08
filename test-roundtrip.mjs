// 往返测试：导出格式 serialize -> parse 应还原相同分类/标题/多行内容
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../dsh-quick-prompts/lib/client.js', import.meta.url), 'utf8')
function extract(name) {
  const start = src.indexOf('function ' + name)
  let depth = 0, i = src.indexOf('{', start)
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') { depth--; if (depth === 0) break }
  }
  return src.slice(start, i + 1)
}
const genId = (p) => p + 'x'
const { parseQuickPromptsMd: parse, sortPrompts } = new Function('genId', extract('parseQuickPromptsMd') + '\n' + extract('getOrder') + '\n' + extract('sortPrompts') + '; return { parseQuickPromptsMd, sortPrompts }')(genId)

// 与 client.js exportMd 相同的序列化逻辑（按序号升序导出）
function serialize(categories) {
  const lines = []
  for (const c of categories) {
    lines.push('### ' + (c.name || '默认'))
    for (const p of sortPrompts(c.prompts || [])) {
      lines.push('- ' + (p.title || '(无标题)') + (p.autoSend ? ' ⏎' : ''))
      String(p.text || '').split('\n').forEach((ln) => {
        const t = ln.trim()
        if (t) lines.push('    - ' + t)
      })
    }
    lines.push('')
  }
  return lines.join('\n')
}

const data = [
  { name: '写作', prompts: [
    { title: '翻译', text: '请翻译：\n保持语气自然。', order: 2 },
    { title: '无内容条目', text: '', order: 1 },
  ]},
  { name: '代码', prompts: [{ title: '写单测', text: '为下面的函数写单元测试：' }] },
  { name: '自动发送', prompts: [{ title: '一键问好', text: '你好，请汇报当前进度。', autoSend: true }] },
]
const md = serialize(data)
console.log('--- 导出的 MD ---')
console.log(md)
console.log('--- 重新解析 ---')
const back = parse(md)
console.log(JSON.stringify(back, null, 1))

let pass = 0, fail = 0
const assert = (c, m) => { if (c) { pass++; console.log('  PASS', m) } else { fail++; console.log('  FAIL', m) } }
assert(back.length === 3, '分类数还原')
assert(back[0].prompts[0].title === '无内容条目', '序号 1 的条目导出排序在前')
assert(back[0].prompts[1].title === '翻译' && back[0].prompts[1].text === '请翻译：\n保持语气自然。', '序号 2 的条目随后且多行内容一致')
assert(back[1].prompts[0].title === '写单测', '第二个分类往返一致')
assert(back[2].prompts[0].title === '一键问好' && back[2].prompts[0].autoSend === true, '自动发送条目往返一致')
assert(!back[0].prompts[0].autoSend, '非自动发送条目往返后保持缺省')
console.log('\n结果: ' + pass + ' passed, ' + fail + ' failed')
process.exit(fail > 0 ? 1 : 0)
