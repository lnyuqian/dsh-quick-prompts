// 临时测试脚本：从 client.js 源码中提取 parseQuickPromptsMd / mergeCategories 并测试
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../dsh-quick-prompts/lib/client.js', import.meta.url), 'utf8')

function extract(name) {
  const start = src.indexOf('function ' + name)
  if (start < 0) throw new Error('not found: ' + name)
  // 简单括号配平找函数结束
  let depth = 0, i = src.indexOf('{', start)
  const open = i
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') { depth--; if (depth === 0) break }
  }
  return src.slice(start, i + 1)
}

const genId = (p) => p + Math.random().toString(36).slice(2, 8)
const code = extract('parseQuickPromptsMd') + '\n' + extract('mergeCategories')
const parseQuickPromptsMd = new Function('genId', 'return function(){' + code + '; return { parseQuickPromptsMd: parseQuickPromptsMd, mergeCategories: mergeCategories } }')() === undefined
// 上面这行不靠谱，直接 eval 更简单
const fn = new Function('genId', code + '; return { parseQuickPromptsMd, mergeCategories }')(genId)
const { parseQuickPromptsMd: parse, mergeCategories: merge } = fn

let pass = 0, fail = 0
function assert(cond, msg) {
  if (cond) { pass++; console.log('  PASS', msg) }
  else { fail++; console.log('  FAIL', msg) }
}

// 用例 1：标准格式
const md1 = [
  '### 写作',
  '- 翻译成英文',
  '    - 请把下面这段话翻译成英文，保持语气自然：',
  '- 润色',
  '    - 请润色以下文字：',
  '    - 注意保持原意，不要改写风格。',
  '### 代码',
  '- 写单测',
  '    - 为下面的函数写单元测试，覆盖边界情况：',
].join('\n')
const c1 = parse(md1)
console.log(JSON.stringify(c1, null, 1))
assert(c1.length === 2, '用例1：解析出 2 个分类')
assert(c1[0].name === '写作' && c1[0].prompts.length === 2, '用例1：写作分类 2 条')
assert(c1[0].prompts[0].title === '翻译成英文', '用例1：标题正确')
assert(c1[0].prompts[0].text === '请把下面这段话翻译成英文，保持语气自然：', '用例1：单行内容正确')
assert(c1[0].prompts[1].text === '请润色以下文字：\n注意保持原意，不要改写风格。', '用例1：多行内容拼接正确')
assert(c1[1].name === '代码' && c1[1].prompts.length === 1, '用例1：代码分类 1 条')

// 用例 2：无 ### 直接列清单 -> 归入「默认」
const md2 = '- 问好\n    - 你好，请帮我打个招呼。'
const c2 = parse(md2)
assert(c2.length === 1 && c2[0].name === '默认', '用例2：无分类头归入默认')

// 用例 3：* 与 + 列表符号、tab 缩进
const md3 = '### A\n* 星号标题\n\t- 星号内容\n+ 加号标题\n  + 加号内容'
const c3 = parse(md3)
assert(c3[0].prompts.length === 2, '用例3：* 和 + 列表均识别')
assert(c3[0].prompts[0].text === '星号内容', '用例3：tab 缩进内容识别')

// 用例 4：合并去重
const existing = [
  { id: 'c1', name: '写作', prompts: [{ id: 'p1', title: '翻译成英文', text: '旧内容' }] },
  { id: 'c2', name: '旧分类', prompts: [{ id: 'p2', title: '旧标题', text: '旧' }] },
]
const imported = parse('### 写作\n- 翻译成英文\n    - 新内容\n- 新标题\n    - 新内容2')
const merged = merge(existing, imported)
console.log(JSON.stringify(merged.map(c => ({ name: c.name, titles: c.prompts.map(p => p.title) }))))
assert(merged.length === 2, '用例4：合并后仍 2 个分类')
assert(merged[0].prompts.length === 2, '用例4：写作分类 1 旧 + 1 新')
assert(merged[0].prompts[0].text === '旧内容', '用例4：同名标题跳过，旧内容保留')
assert(merged[0].prompts[1].title === '新标题', '用例4：新标题追加成功')

// 用例 5：导入空文件 / 无有效内容
assert(parse('').length === 0, '用例5：空文件解析为空')
assert(parse('### 空分类').length === 0, '用例5：空分类被丢弃')

// 用例 6：标题尾部 ` ⏎` 标记 = 自动发送
const c6 = parse('### 快捷\n- 一键问好 ⏎\n    - 你好，请汇报当前进度。\n- 普通条目\n    - 仅插入内容。')
assert(c6[0].prompts.length === 2, '用例6：⏎ 标记条目正常解析')
assert(c6[0].prompts[0].title === '一键问好' && c6[0].prompts[0].autoSend === true, '用例6：⏎ 标记剥离并置 autoSend=true')
assert(c6[0].prompts[1].title === '普通条目' && !c6[0].prompts[1].autoSend, '用例6：无标记条目 autoSend 缺省假')

// 用例 7：合并保留 autoSend
const existing7 = [{ id: 'c7', name: '快捷', prompts: [{ id: 'p7', title: '旧条目', text: '旧', autoSend: true }] }]
const imported7 = parse('### 快捷\n- 新条目 ⏎\n    - 新内容')
const merged7 = merge(existing7, imported7)
assert(merged7[0].prompts[0].autoSend === true, '用例7：合并保留已有条目 autoSend')
assert(merged7[0].prompts[1].autoSend === true && merged7[0].prompts[1].title === '新条目', '用例7：导入条目 autoSend 保留')

console.log('\n结果: ' + pass + ' passed, ' + fail + ' failed')
process.exit(fail > 0 ? 1 : 0)
