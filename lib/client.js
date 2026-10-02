/**
 * dsh-quick-prompts 客户端半部：
 * 1. 常驻横向快捷条（conversation.input.dock，输入框上方全宽）：
 *    第一行分类、第二行当前分类下的标题；悬停分类即切换下方标题；
 *    点击标题把内容**追加**到输入框原有内容之后（不发送，也不清空已输入的内容）。
 * 2. 闪电笔按钮（conversation.input.left，工具行「权限切换」右侧）：
 *    弹层内可管理快捷语（分类/标题/内容/自动发送 增删改）并从 MD 文档导入；
 *    弹层内点击条目与快捷条同样走「追加」语义。
 * 3. 自动发送：每条快捷语可单独开关 autoSend；开启的条目在快捷条与弹层中
 *    标题后带 ⏎ 小图标，点击后以该短语整体替换草稿并走官方 submit() 通道立即发送
 *    （替换而非追加，避免把尚未写完的草稿一并误发出去）；
 *    MD 导入/导出以标题尾部 ` ⏎` 标记同步该开关。
 * 4. 序号排序：每条可设置数字序号 order，展示与导出按序号从小到大、自左向右
 *    排列（稳定排序，无序号排最后）；编辑时按分类现有条数自动预填/建议序号。
 * MD 导入格式：`###` 三级标题 = 分类；顶层无序列表项 = 快捷语标题；向内缩进的列表项 = 内容（可多行）。
 * 数据落盘走 /api/quick-prompts（服务端写 ~/.dsh/quick-prompts.json，全局一份永不丢失）。
 * 纯 JS（React.createElement），无需构建；React 由宿主模块系统提供。
 *
 * web / 桌面双端：桌面客户端（DeepSeek Harness Desktop）渲染的是同一套 Web 前端，
 * 页面挂在 `dsh-app://app/` 下，相对路径的 fetch('/api/...') 由 Electron 主进程带
 * 认证 cookie 转发给本地 webserver，因此这里的槽位注册与 API 通道两端一致。
 * 桌面版差异处理：窗口通常更小，弹层改为按可视区自适应（上下翻转 + 夹紧 + 限高）；
 * 并额外提供「复制MD」按钮，作为桌面端下载通道异常时的兜底。
 */
window.__ModuleLoader__.load({
  id: 'dsh-quick-prompts',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')

    var inject = ['slots']

    var CSS = [
      /* 闪电笔按钮 */
      '.qp-wrap{position:relative;display:inline-flex;align-items:center}',
      '.qp-btn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#666);cursor:pointer;padding:0}',
      '.qp-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.07));color:var(--dsw-alias-label-primary,inherit)}',
      '.qp-btn:disabled{opacity:.45;cursor:not-allowed}',
      /* 弹层 */
      '.qp-scrim{position:fixed;inset:0;z-index:10000;background:transparent}',
      '.qp-pop{position:fixed;z-index:10001;width:340px;max-height:400px;display:flex;flex-direction:column;background:var(--dsw-specific-input-major,#fff);border:1px solid var(--dsw-alias-border-l2-darkmode-thin,#ddd);border-radius:12px;box-shadow:var(--dsw-shadow-lv2,0 8px 24px rgba(0,0,0,.15));color:var(--dsw-alias-label-primary,#222);font-size:13px;overflow:hidden}',
      '.qp-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l4,rgba(0,0,0,.08))}',
      '.qp-title{font-weight:600}',
      '.qp-head-actions{display:flex;align-items:center;gap:10px}',
      '.qp-link{border:none;background:transparent;padding:0;font-size:12px;color:var(--dsw-alias-label-secondary,#666);cursor:pointer}',
      '.qp-link:hover{color:var(--dsw-alias-label-primary,inherit)}',
      '.qp-link-primary{color:var(--dsw-alias-state-business-primary,#2563eb);font-weight:600}',
      '.qp-link:disabled{opacity:.5;cursor:not-allowed}',
      '.qp-error{padding:8px 12px;color:#d33;font-size:12px;border-bottom:1px solid var(--dsw-alias-border-l4,rgba(0,0,0,.08))}',
      '.qp-info{padding:8px 12px;color:#2a8a3b;font-size:12px;border-bottom:1px solid var(--dsw-alias-border-l4,rgba(0,0,0,.08))}',
      '.qp-list{overflow-y:auto;padding:6px;display:flex;flex-direction:column;gap:2px}',
      '.qp-empty{padding:18px 10px;text-align:center;color:var(--dsw-alias-label-secondary,#888);font-size:12px}',
      '.qp-cat-head{font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary,#888);padding:6px 6px 2px;text-transform:none;letter-spacing:.02em}',
      '.qp-item{display:flex;flex-direction:row;align-items:center;gap:4px;text-align:left;border:none;background:transparent;border-radius:8px;padding:4px 10px;cursor:pointer;width:100%}',
      '.qp-item:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}',
      '.qp-item .qp-title-wrap{flex:none;max-width:6em}',
      '.qp-item-title{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary,inherit);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:none;max-width:4em}',
      '.qp-item-text{flex:1;font-size:12px;color:var(--dsw-alias-label-secondary,#777);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;text-align:left}',
      /* 管理编辑行 */
      '.qp-edit-row{display:flex;flex-direction:column;gap:6px;border:1px solid var(--dsw-alias-border-l4,rgba(0,0,0,.1));border-radius:8px;padding:8px}',
      '.qp-edit-meta{display:flex;gap:6px}',
      '.qp-edit-cat{font-size:13px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,#ccc);border-radius:6px;background:var(--dsw-specific-input-minor,#fff);color:inherit;width:calc(5em + 18px);flex:none}',
      '.qp-edit-order{font-size:13px;padding:6px 6px;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,#ccc);border-radius:6px;background:var(--dsw-specific-input-minor,#fff);color:inherit;width:calc(2em + 16px);flex:none;cursor:pointer}',
      '.qp-edit-title{flex:1;font-size:13px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,#ccc);border-radius:6px;background:var(--dsw-specific-input-minor,#fff);color:inherit;width:auto;min-width:0}',
      '.qp-edit-text{font-size:13px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,#ccc);border-radius:6px;background:var(--dsw-specific-input-minor,#fff);color:inherit;resize:vertical;font-family:inherit;line-height:1.5}',
      '.qp-del{align-self:flex-end;border:none;background:transparent;font-size:12px;color:#d33;cursor:pointer;padding:0}',
      '.qp-auto{align-self:flex-end;display:inline-flex;align-items:center;gap:3px;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,#ccc);background:transparent;border-radius:999px;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary,#666);cursor:pointer;padding:2px 10px}',
      '.qp-auto:hover{color:var(--dsw-alias-label-primary,inherit)}',
      '.qp-auto-on{border-color:var(--dsw-alias-state-business-primary,#2563eb);color:var(--dsw-alias-state-business-primary,#2563eb);font-weight:600}',
      '.qp-title-wrap{display:inline-flex;align-items:center;gap:3px;min-width:0}',
      '.qp-send-ico{display:inline-flex;align-items:center;flex:none;color:var(--dsw-alias-state-business-primary,#2563eb)}',
      /* 常驻横向快捷条（输入框上方） */
      '.qp-bar{display:flex;flex-direction:column;gap:2px;box-sizing:border-box;flex:none;width:calc(100% - var(--dsh-composer-side-clearance,16px)*2 - var(--dsh-composer-dock-inset,8px)*2);max-width:calc(var(--dsh-composer-card-max-width,900px) - var(--dsh-composer-dock-inset,8px)*2);margin:0 auto;padding:4px 10px 6px;border:1px solid var(--dsw-alias-border-l4,rgba(0,0,0,.08));border-radius:12px;background:var(--dsw-specific-input-major,transparent);font-size:12px;color:var(--dsw-alias-label-primary,inherit)}',
      '.qp-bar-row{display:flex;flex-wrap:wrap;gap:2px;align-items:center}',
      '.qp-cat{border:none;background:transparent;border-radius:999px;padding:3px 10px;cursor:pointer;color:var(--dsw-alias-label-secondary,#666);font-size:12px;line-height:1.5}',
      '.qp-cat:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.07));color:var(--dsw-alias-label-primary,inherit)}',
      '.qp-cat-on{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.08));color:var(--dsw-alias-label-primary,inherit);font-weight:600}',
      '.qp-cat-count{font-weight:400;opacity:.65;margin-left:3px;font-size:11px}',
      '.qp-titles{display:flex;flex-wrap:wrap;gap:2px;align-items:center;padding-left:8px}',
      '.qp-tchip{border:none;background:transparent;border-radius:8px;padding:2px 8px;cursor:pointer;color:var(--dsw-alias-label-primary,inherit);font-size:12px;line-height:1.6;max-width:320px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left}',
      '.qp-tchip:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.08))}',
      '.qp-tchip-empty{color:var(--dsw-alias-label-secondary,#999);cursor:default;font-size:12px;padding:2px 8px}',
      '.qp-bar-sep{width:1px;height:14px;background:var(--dsw-alias-border-l4,rgba(0,0,0,.12));margin:0 4px;flex:none}',
    ].join('')

    function genId(prefix) {
      return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    }

    /* ---------------- 样式注入（web / 桌面共用） ---------------- */

    /**
     * 确保插件样式表存在（幂等）。
     *
     * 客户端模块系统按 `data-plugin` 属性认领 bundle 的 <style>：物化后立即给未打标的
     * 样式打上归属标记，条目卸载/重载时再按该标记回收。因此这里显式打上同一个标记：
     * 既符合宿主的归属约定，也能在宿主回收之后由本函数重新注入。
     * 注入失败只影响外观、不影响功能，故整体吞掉异常。
     * @returns 注入后样式表是否存在
     */
    function ensureStyles() {
      try {
        if (typeof document === 'undefined' || !document || !document.head) return false
        var existing = document.querySelectorAll('style[data-plugin="dsh-quick-prompts"]')
        if (existing && existing.length > 0) return true
        var tag = document.createElement('style')
        tag.setAttribute('data-plugin', 'dsh-quick-prompts')
        tag.textContent = CSS
        document.head.appendChild(tag)
        return true
      } catch (e) {
        return false
      }
    }

    // 物化期注入：与模块系统的样式归属/回收时机对齐——宿主回收后本 factory 会再次物化并重新注入。
    ensureStyles()

    /* ---------------- 运行环境识别与弹层定位（web / 桌面共用） ---------------- */

    /**
     * 是否运行在 DSH 桌面客户端：Electron 外壳把页面挂在 `dsh-app://` 协议下，
     * 相对路径的 fetch 由主进程带认证 cookie 转发给本地 webserver。
     * 不依赖任何宿主私有对象：取不到环境信息时一律按普通浏览器处理。
     */
    function isDesktopShell() {
      try {
        if (typeof location !== 'undefined' && location && location.protocol === 'dsh-app:') return true
        var ua = typeof navigator !== 'undefined' && navigator ? String(navigator.userAgent || '') : ''
        return ua.indexOf('Electron') >= 0
      } catch (e) {
        return false
      }
    }

    /* 弹层尺寸预算，与 CSS 中 .qp-pop 的 width / max-height 保持一致。 */
    var POP_WIDTH = 340
    var POP_MAX_HEIGHT = 400
    var POP_GAP = 8
    var POP_MARGIN = 8
    var POP_MIN_HEIGHT = 160

    function clamp(v, min, max) {
      if (!isFinite(v)) return min
      return Math.max(min, Math.min(v, max))
    }

    /**
     * 计算弹层的固定定位坐标。
     * 默认向上展开（贴按钮上方，配合 transform: translateY(-100%)）；
     * 上方空间比下方更紧张时改为向下展开；左右按视口夹紧，避免窄窗口或靠右的
     * 工具行按钮把弹层推出可视区；并按可用空间限制高度，保证内容可滚动而非溢出。
     * 桌面版窗口通常比浏览器窗口小，这条路径由两端共用。
     * @param rect 触发按钮的 getBoundingClientRect()，缺失时退化为左上角
     * @param viewport { width, height }，缺失或非法时按 1200x800 估算
     * @returns { x, y, up, maxHeight }
     */
    function computePopPos(rect, viewport) {
      var vw = viewport && isFinite(viewport.width) && viewport.width > 0 ? viewport.width : 1200
      var vh = viewport && isFinite(viewport.height) && viewport.height > 0 ? viewport.height : 800
      if (!rect) return { x: POP_MARGIN, y: POP_MARGIN, up: false, maxHeight: POP_MAX_HEIGHT }
      var x = clamp(rect.left, POP_MARGIN, Math.max(POP_MARGIN, vw - POP_WIDTH - POP_MARGIN))
      var roomAbove = rect.top - POP_GAP - POP_MARGIN
      var roomBelow = vh - rect.bottom - POP_GAP - POP_MARGIN
      var up = roomAbove >= roomBelow
      var room = Math.max(up ? roomAbove : roomBelow, 0)
      var maxHeight = clamp(Math.min(POP_MAX_HEIGHT, room > 0 ? room : POP_MAX_HEIGHT), POP_MIN_HEIGHT, POP_MAX_HEIGHT)
      var y = up ? rect.top - POP_GAP : rect.bottom + POP_GAP
      return { x: x, y: clamp(y, POP_MARGIN, Math.max(POP_MARGIN, vh - POP_MARGIN)), up: up, maxHeight: maxHeight }
    }

    function LightningPen() {
      return React.createElement('svg', {
        width: 15, height: 15, viewBox: '0 0 1024 1024', fill: 'currentColor', 'aria-hidden': true
      }, React.createElement('path', {
        d: 'M746.666667 117.333333a160 160 0 0 1 159.786666 151.466667l0.213334 8.533333v170.666667a32 32 0 0 1-63.701334 4.352l-0.298666-4.352v-170.666667a96 96 0 0 0-89.429334-95.786666L746.666667 181.333333h-469.333334a96 96 0 0 0-95.786666 89.429334L181.333333 277.333333v469.333334a96 96 0 0 0 89.429334 95.786666l6.570666 0.213334H512a32 32 0 0 1 4.352 63.701333L512 906.666667H277.333333a160 160 0 0 1-159.786666-151.466667l-0.213334-8.533333v-469.333334A160 160 0 0 1 268.8 117.546667l8.533333-0.213334h469.333334z m14.293333 472.746667a32 32 0 0 1 16 38.869333l-1.706667 4.010667-40.832 81.706667H853.333333a32 32 0 0 1 30.293334 42.282666l-1.706667 4.010667-64 128a32 32 0 0 1-58.88-24.576l1.706667-4.010667 40.789333-81.706666H682.666667a32 32 0 0 1-30.293334-42.282667l1.706667-4.010667 64-128a32 32 0 0 1 42.88-14.336zM341.333333 309.333333a32 32 0 0 1 31.701334 27.648L373.333333 341.333333v128a32 32 0 0 1-63.701333 4.352L309.333333 469.333333V341.333333A32 32 0 0 1 341.333333 309.333333z'
      }))
    }

    /** 回车小图标：标记「点击后自动发送」的快捷语。 */
    function EnterIcon() {
      return React.createElement('svg', {
        className: 'qp-send-ico', width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true
      },
      React.createElement('path', { d: 'M20 5v6a3 3 0 0 1-3 3H5' }),
      React.createElement('polyline', { points: '9,10 5,14 9,18' }))
    }

    /* ---------------- 全局数据仓：一次拉取，多组件共享，保存后广播 ---------------- */

    var store = {
      categories: null,
      subs: [],
      loading: false,
      notify: function () {
        var list = this.categories
        this.subs.slice().forEach(function (f) { f(list) })
      },
      load: function () {
        if (this.categories !== null || this.loading) return
        this.loading = true
        var self = this
        fetch('/api/quick-prompts')
          .then(function (r) { return r.json() })
          .then(function (data) {
            self.loading = false
            if (data && data.ok) {
              self.categories = Array.isArray(data.categories) ? data.categories : []
              self.notify()
            }
          })
          .catch(function () { self.loading = false })
      },
      save: function (categories, cb) {
        fetch('/api/quick-prompts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categories: categories }),
        })
          .then(function (r) { return r.json() })
          .then(function (data) {
            if (data && data.ok) {
              store.categories = Array.isArray(data.categories) ? data.categories : []
              store.notify()
              cb && cb(null, store.categories)
            } else {
              cb && cb((data && data.error) || '保存失败')
            }
          })
          .catch(function (e) { cb && cb(String(e && e.message || e)) })
      },
    }

    /** React hook：订阅全局快捷语仓。 */
    function useQuickCategories() {
      var s = React.useState(store.categories)
      var setCats = s[1]
      React.useEffect(function () {
        function listener(list) { setCats(list) }
        store.subs.push(listener)
        if (store.categories === null) store.load()
        else setCats(store.categories)
        return function () { store.subs = store.subs.filter(function (f) { return f !== listener }) }
      }, [])
      return s[0]
    }

    /**
     * 读取当前输入框草稿文本，供「追加」语义使用。
     * 优先走 session 槽位标准 props 的 useInput 快照（与 setDraft 同一份剪贴板投影，
     * 多行与 / 引用都能原样保留）；退而取 props.input（dock owner 的 InputZone.input）。
     * 都拿不到时返回 null，由调用方在点击瞬间读 DOM 兜底。
     * 说明：useInput 是否提供由槽位定义决定、运行期恒定，因此这里的分支在多次渲染
     * 之间稳定，Hook 调用顺序不会漂移。
     */
    function useCurrentDraft(props) {
      if (props && typeof props.useInput === 'function') {
        var v = props.useInput(function (s) { return s && typeof s.draft === 'string' ? s.draft : null })
        if (typeof v === 'string') return v
      }
      if (props && props.input && typeof props.input.draft === 'string') return props.input.draft
      return null
    }

    /** DOM 兜底：读输入框 contenteditable 的当前文本（插件自身的弹层编辑区除外）。 */
    function readDraftFromDom() {
      try {
        var nodes = document.querySelectorAll('[contenteditable="true"]')
        for (var i = nodes.length - 1; i >= 0; i--) {
          var el = nodes[i]
          if (!el || typeof el.innerText !== 'string') continue
          if (el.closest && el.closest('.qp-bar,.qp-pop')) continue
          return el.innerText
        }
      } catch (e) { /* 无 DOM 环境 */ }
      return ''
    }

    /** 取当前草稿：优先渲染期快照，其次点击瞬间的实时 DOM。 */
    function resolveDraft(props, snapshot) {
      if (typeof snapshot === 'string') return snapshot
      return readDraftFromDom()
    }

    /**
     * 把内容插入输入框（不发送）：**追加**到原有内容之后，不清空已有内容。
     * @param existing 现有草稿；非字符串按空串处理（等价于只写入该条短语）。
     */
    function insertIntoInput(inputActions, text, existing) {
      if (!inputActions || typeof text !== 'string' || text.length === 0) return false
      inputActions.setDraft((typeof existing === 'string' ? existing : '') + text)
      return true
    }

    /**
     * 应用一条快捷语。
     * 普通条目（不发送）：把内容追加到输入框原有内容之后，不清空、不发送；
     * 自动发送条目（autoSend）：仍以该短语整体替换草稿后立即走官方 submit() 通道发送——
     * 避免把用户尚未写完的草稿一并误发出去。发送失败时内容仍保留在输入框。
     */
    function applyPrompt(inputActions, p, existing) {
      if (!p || typeof p.text !== 'string' || p.text.length === 0) return false
      var append = p.autoSend !== true
      if (!insertIntoInput(inputActions, p.text, append ? existing : '')) return false
      if (p.autoSend && inputActions && typeof inputActions.submit === 'function') {
        try { inputActions.submit() } catch (e) { /* 保持插入结果，由用户手动发送 */ }
      }
      return true
    }

    /** 读一条快捷语的排序键：有有效数字序号取序号，否则视为排最后（Infinity）。 */
    function getOrder(p) {
      return p && typeof p.order === 'number' && isFinite(p.order) ? p.order : Infinity
    }

    /** 按序号从小到大排序（稳定排序：同序号 / 无序号保持原有先后），用于展示与导出。 */
    function sortPrompts(prompts) {
      return (prompts || []).slice().sort(function (a, b) { return getOrder(a) - getOrder(b) })
    }

    /* ---------------- MD 解析与合并 ---------------- */

    /**
     * 解析 MD 文本 -> [{ name, prompts: [{ title, text, autoSend }] }]
     * 规则：`### xxx` = 分类；顶层无序列表项 = 标题（尾部带 ` ⏎` 标记 = 自动发送）；
     * 向内缩进的列表项 = 内容（多条拼接为多行）。
     */
    function parseQuickPromptsMd(text) {
      var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n')
      var categories = []
      var curCat = null
      var curPrompt = null
      function ensureCat(name) {
        curCat = { name: (name || '').trim() || '默认', prompts: [] }
        categories.push(curCat)
        curPrompt = null
      }
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i]
        var trimmed = line.trim()
        if (!trimmed) continue
        if (/^###\s+/.test(trimmed)) { ensureCat(trimmed.replace(/^###\s+/, '')); continue }
        if (/^#{1,6}\s+/.test(trimmed)) { curPrompt = null; continue } // 其他级别标题：仅打断当前条目
        var isItem = /^[-*+]\s+/.test(trimmed)
        if (!isItem) {
          // 非列表行：若是缩进续行则并入当前内容
          if (curPrompt && /^\s{2,}\S/.test(line)) {
            curPrompt.text = curPrompt.text ? curPrompt.text + '\n' + trimmed : trimmed
          }
          continue
        }
        var content = trimmed.replace(/^[-*+]\s+/, '').trim()
        var indent = line.match(/^\s*/)[0].length
        if (indent === 0) {
          if (!curCat) ensureCat('默认')
          // 标题尾部 ` ⏎` 标记 = 自动发送
          var autoSend = /\s*⏎$/.test(content)
          if (autoSend) content = content.replace(/\s*⏎$/, '')
          curPrompt = { title: content, text: '', autoSend: autoSend }
          curCat.prompts.push(curPrompt)
        } else {
          if (!curCat) ensureCat('默认')
          if (!curPrompt) {
            curPrompt = { title: '', text: '' }
            curCat.prompts.push(curPrompt)
          }
          curPrompt.text = curPrompt.text ? curPrompt.text + '\n' + content : content
        }
      }
      return categories
        .map(function (c) {
          return { name: c.name, prompts: c.prompts.filter(function (p) { return p.title || p.text }) }
        })
        .filter(function (c) { return c.prompts.length > 0 })
    }

    /** 把导入的分类合并进现有分类：同名分类合并、同名标题跳过，返回新数组（保留 autoSend / order）。 */
    function mergeCategories(existing, imported) {
      var result = (existing || []).map(function (c) {
        return {
          id: c.id,
          name: c.name,
          prompts: (c.prompts || []).map(function (p) {
            var np = { id: p.id, title: p.title, text: p.text, autoSend: p.autoSend === true }
            if (typeof p.order === 'number' && isFinite(p.order)) np.order = p.order
            return np
          }),
        }
      })
      ;(imported || []).forEach(function (ic) {
        var target = null
        for (var i = 0; i < result.length; i++) {
          if (result[i].name === ic.name) { target = result[i]; break }
        }
        if (!target) {
          target = { id: genId('c'), name: ic.name, prompts: [] }
          result.push(target)
        }
        ic.prompts.forEach(function (p) {
          var dup = target.prompts.some(function (q) { return (q.title || '') === (p.title || '') })
          if (!dup) {
            var np = { id: genId('p'), title: p.title, text: p.text, autoSend: p.autoSend === true }
            if (typeof p.order === 'number' && isFinite(p.order)) np.order = p.order
            target.prompts.push(np)
          }
        })
      })
      return result.filter(function (c) { return c.prompts.length > 0 })
    }

    /* ---------------- 常驻横向快捷条（conversation.input.dock） ---------------- */

    function QuickPromptBar(props) {
      var inputActions = props.inputActions
      var currentDraft = useCurrentDraft(props)
      var cats = useQuickCategories()
      var activeState = React.useState(0)
      var active = activeState[0]
      var setActive = activeState[1]

      // 数据未加载或输入框动作缺失时才隐藏；空数据也常驻显示（空态提示）
      if (!inputActions || cats === null) return null
      var hasCats = cats.length > 0
      var idx = hasCats ? Math.max(0, Math.min(active, cats.length - 1)) : 0
      var cur = hasCats ? cats[idx] : null

      return React.createElement('div', { className: 'qp-bar' },
        React.createElement('div', { className: 'qp-bar-row' },
          React.createElement('span', { className: 'qp-cat-head', style: { padding: '2px 8px 0 0' } }, '快捷语'),
          hasCats ? cats.map(function (c, i) {
            return React.createElement('button', {
              type: 'button',
              key: c.id || i,
              className: i === idx ? 'qp-cat qp-cat-on' : 'qp-cat',
              onMouseEnter: function () { setActive(i) },
              onClick: function () { setActive(i) },
            }, c.name || '默认',
            React.createElement('span', { className: 'qp-cat-count' }, String((c.prompts || []).length)))
          }) : null
        ),
        React.createElement('div', { className: 'qp-titles' },
          React.createElement('span', { className: 'qp-bar-sep' }),
          !hasCats
            ? React.createElement('span', { className: 'qp-tchip-empty' }, '暂无快捷语：点输入框工具行的闪电笔图标可录入或导入 MD')
            : (cur.prompts || []).length === 0
              ? React.createElement('span', { className: 'qp-tchip-empty' }, '（该分类暂无快捷语）')
              : sortPrompts(cur.prompts).map(function (p, j) {
                return React.createElement('button', {
                  type: 'button',
                  key: p.id || j,
                  className: 'qp-tchip',
                  title: (p.autoSend ? '自动发送：' : '') + (p.text || p.title || ''),
                  onClick: function () { applyPrompt(inputActions, p, resolveDraft(props, currentDraft)) },
                },
                React.createElement('span', { className: 'qp-title-wrap' },
                  p.title || '(无标题)',
                  p.autoSend ? React.createElement(EnterIcon) : null))
              })
        )
      )
    }

    /* ---------------- 闪电笔按钮 + 管理/导入弹层（conversation.input.left） ---------------- */

    function QuickPromptSeat(props) {
      var inputActions = props.inputActions
      var sessionId = props.sessionId
      var currentDraft = useCurrentDraft(props)
      var cats = useQuickCategories()
      var openState = React.useState(false)
      var open = openState[0]
      var setOpen = openState[1]
      var posState = React.useState({ x: 0, y: 0 })
      var pos = posState[0]
      var setPos = posState[1]
      var errState = React.useState(null)
      var error = errState[0]
      var setError = errState[1]
      var infoState = React.useState(null)
      var info = infoState[0]
      var setInfo = infoState[1]
      var editState = React.useState(false)
      var editing = editState[0]
      var setEditing = editState[1]
      var draftState = React.useState([])
      var draft = draftState[0]
      var setDraft = draftState[1]
      var savingState = React.useState(false)
      var saving = savingState[0]
      var setSaving = savingState[1]
      var btnRef = React.useRef(null)
      var fileRef = React.useRef(null)

      function close() { setOpen(false); setEditing(false); setError(null); setInfo(null) }

      function onToggle() {
        if (open) { close(); return }
        var el = btnRef.current
        var rect = el && typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null
        setPos(computePopPos(rect, {
          width: typeof window !== 'undefined' ? window.innerWidth : 1200,
          height: typeof window !== 'undefined' ? window.innerHeight : 800,
        }))
        setError(null)
        setInfo(null)
        setOpen(true)
      }

      function insertAndClose(p) {
        if (applyPrompt(inputActions, p, resolveDraft(props, currentDraft))) close()
      }

      function startEdit() {
        var rows = []
        ;(cats || []).forEach(function (c) {
          // 按当前展示顺序（序号从小到大）自动预填 1..N 序号，用户可改
          sortPrompts(c.prompts || []).forEach(function (p, i) {
            rows.push({ id: p.id || '', cat: c.name || '', title: p.title || '', text: p.text || '', autoSend: p.autoSend === true, order: i + 1 })
          })
        })
        setDraft(rows)
        setError(null)
        setInfo(null)
        setEditing(true)
      }

      function cancelEdit() { setEditing(false); setDraft([]); setInfo(null) }

      /** 新增一行：自动沿用上一行分类，并按该分类现有最大序号 +1 给出建议序号。 */
      function newRow() {
        var last = draft.length ? draft[draft.length - 1] : null
        var cat = last ? String(last.cat || '') : ''
        var max = 0
        draft.forEach(function (r) {
          if (String(r.cat || '') !== cat || r.order === '' || r.order === null || r.order === undefined) return
          var n = Number(r.order)
          if (isFinite(n) && n > max) max = n
        })
        setDraft(draft.concat([{ id: '', cat: cat, title: '', text: '', autoSend: false, order: max + 1 }]))
      }

      function updateRow(i, field, value) {
        var next = draft.slice()
        next[i] = Object.assign({}, next[i])
        next[i][field] = value
        setDraft(next)
      }

      function removeRow(i) { setDraft(draft.filter(function (_, idx) { return idx !== i })) }

      /** 把编辑行按分类名重新归组为分类结构。 */
      function regroup(rows) {
        var order = []
        var byName = {}
        rows.forEach(function (r) {
          var name = String(r.cat || '').trim() || '默认'
          var c = byName[name]
          if (!c) { c = { id: genId('c'), name: name, prompts: [] }; byName[name] = c; order.push(c) }
          var title = String(r.title || '').slice(0, 200)
          var text = String(r.text || '')
          if (title || text) {
            var np = { id: r.id || genId('p'), title: title, text: text, autoSend: r.autoSend === true }
            if (r.order !== '' && r.order !== null && r.order !== undefined) {
              var onum = Number(r.order)
              if (isFinite(onum)) np.order = Math.max(1, Math.round(onum))
            }
            c.prompts.push(np)
          }
        })
        return order.filter(function (c) { return c.prompts.length > 0 })
      }

      function save() {
        setSaving(true)
        store.save(regroup(draft), function (err, saved) {
          setSaving(false)
          if (!err) { setEditing(false); setDraft([]); setInfo(null) }
          else setError(err)
        })
      }

      /** 「导入MD」：解析文件、与当前内容合并（同名标题跳过），直接落盘。 */
      function onImportFile(e) {
        var file = e.target.files && e.target.files[0]
        e.target.value = ''
        if (!file) return
        setError(null)
        setInfo(null)
        file.text().then(function (text) {
          var imported = parseQuickPromptsMd(text)
          if (imported.length === 0) { setInfo('未从文件中解析到快捷语'); return }
          var base = editing ? regroup(draft) : (cats || [])
          var merged = mergeCategories(base, imported)
          var incoming = 0
          imported.forEach(function (ic) { incoming += ic.prompts.length })
          if (editing) {
            // 编辑模式：合并结果写回编辑行，用户检查后点「保存」
            var rows = []
            merged.forEach(function (c) {
              c.prompts.forEach(function (p) { rows.push({ id: p.id || '', cat: c.name, title: p.title, text: p.text, autoSend: p.autoSend === true, order: p.order }) })
            })
            setDraft(rows)
            setInfo('已导入 ' + incoming + ' 条，点「保存」生效')
          } else {
            // 浏览模式：合并后直接保存落盘
            store.save(merged, function (err) {
              if (err) { setError(err); return }
              setInfo('已导入 ' + incoming + ' 条快捷语')
            })
          }
        }).catch(function (err) { setError(String(err && err.message || err)) })
      }

      /** 把当前快捷语序列化为与「导入MD」互逆的 Markdown 文本（「导出MD」与「复制MD」共用）。 */
      function buildMd() {
        var lines = []
        ;(cats || []).forEach(function (c) {
          lines.push('### ' + (c.name || '默认'))
          sortPrompts(c.prompts || []).forEach(function (p) {
            lines.push('- ' + (p.title || '(无标题)') + (p.autoSend ? ' ⏎' : ''))
            String(p.text || '').split('\n').forEach(function (ln) {
              var t = ln.trim()
              if (t) lines.push('    - ' + t)
            })
          })
          lines.push('')
        })
        return lines.join('\n')
      }

      /** 「导出MD」：把当前快捷语序列化为标准 MD 格式并下载（与「导入MD」完全互逆）。 */
      function exportMd() {
        setError(null)
        setInfo(null)
        var text = buildMd()
        var blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
        var url = URL.createObjectURL(blob)
        var a = document.createElement('a')
        a.href = url
        a.download = 'quick-prompts.md'
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(function () { URL.revokeObjectURL(url) }, 1000)
        setInfo(isDesktopShell() ? '已导出 quick-prompts.md；若没有弹出保存对话框，可用「复制MD」' : '已导出 quick-prompts.md')
      }

      /**
       * 桌面端兜底：把与「导出MD」完全相同的文本写入剪贴板。
       * 桌面外壳的下载通道受宿主策略影响，剪贴板是它失效时的可靠退路。
       */
      function copyMd() {
        setError(null)
        setInfo(null)
        var text = buildMd()
        var clip = typeof navigator !== 'undefined' && navigator ? navigator.clipboard : null
        if (!clip || typeof clip.writeText !== 'function') {
          setError('当前环境不支持剪贴板复制，请改用「导出MD」')
          return
        }
        clip.writeText(text).then(function () {
          setInfo('已复制当前快捷语的 MD 到剪贴板')
        }).catch(function (e) {
          setError('复制失败：' + String(e && e.message || e) + '，请改用「导出MD」')
        })
      }

      var disabled = inputActions === undefined

      return React.createElement('div', { className: 'qp-wrap' },
        React.createElement('button', {
          ref: btnRef,
          type: 'button',
          className: 'qp-btn',
          title: '快捷输入',
          'aria-label': '快捷输入',
          'aria-haspopup': 'menu',
          'aria-expanded': open,
          disabled: disabled,
          onClick: onToggle,
        }, React.createElement(LightningPen)),
        open ? React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'qp-scrim', onClick: close }),
          React.createElement('div', { className: 'qp-pop', style: {
            top: pos.y,
            left: pos.x,
            maxHeight: pos.maxHeight || POP_MAX_HEIGHT,
            transform: pos.up ? 'translateY(-100%)' : 'none',
          } },
            React.createElement('div', { className: 'qp-head' },
              React.createElement('span', { className: 'qp-title' }, '快捷输入'),
              React.createElement('span', { className: 'qp-head-actions' },
                React.createElement('button', { type: 'button', className: 'qp-link', onClick: function () { if (fileRef.current) fileRef.current.click() }, disabled: disabled || saving }, '导入MD'),
                !editing ? React.createElement('button', { type: 'button', className: 'qp-link', onClick: exportMd, disabled: disabled || !cats || cats.length === 0 }, '导出MD') : null,
                !editing && isDesktopShell() ? React.createElement('button', { type: 'button', className: 'qp-link', onClick: copyMd, disabled: disabled || !cats || cats.length === 0 }, '复制MD') : null,
                editing ? React.createElement(React.Fragment, null,
                  React.createElement('button', { type: 'button', className: 'qp-link', onClick: newRow, disabled: saving }, '新增'),
                  React.createElement('button', { type: 'button', className: 'qp-link', onClick: cancelEdit, disabled: saving }, '取消'),
                  React.createElement('button', { type: 'button', className: 'qp-link qp-link-primary', onClick: save, disabled: saving }, saving ? '保存中…' : '保存')
                ) : React.createElement('button', { type: 'button', className: 'qp-link', onClick: startEdit, disabled: disabled }, '管理')
              )
            ),
            React.createElement('input', {
              ref: fileRef,
              type: 'file',
              accept: '.md,.markdown,.txt,text/markdown,text/plain',
              style: { display: 'none' },
              onChange: onImportFile,
            }),
            React.createElement('datalist', { id: 'qp-cat-options' },
              (cats || []).map(function (c, i) {
                return React.createElement('option', { key: c.id || i, value: c.name || '默认' })
              })
            ),
            error ? React.createElement('div', { className: 'qp-error' }, error) : null,
            info ? React.createElement('div', { className: 'qp-info' }, info) : null,
            editing ? (
              React.createElement('div', { className: 'qp-list' },
                draft.length === 0 ? React.createElement('div', { className: 'qp-empty' }, '暂无快捷语，点「新增」添加或「导入MD」') : null,
                draft.map(function (p, i) {
                  return React.createElement('div', { className: 'qp-edit-row', key: i },
                    React.createElement('div', { className: 'qp-edit-meta' },
                      React.createElement('input', { className: 'qp-edit-cat', list: 'qp-cat-options', placeholder: '分类', value: p.cat, onChange: function (e) { updateRow(i, 'cat', e.target.value) } }),
                      (function () {
                        // 自动检测该行所属分类在当前草稿中的短语数量，序号下拉选项 1..N
                        var catName = String(p.cat || '').trim() || '默认'
                        var cnt = 0
                        draft.forEach(function (r) { if ((String(r.cat || '').trim() || '默认') === catName) cnt++ })
                        var val = (typeof p.order === 'number' && p.order >= 1) ? Math.min(p.order, cnt) : ''
                        var options = []
                        for (var k = 1; k <= cnt; k++) options.push(React.createElement('option', { key: k, value: k }, String(k)))
                        return React.createElement('select', {
                          className: 'qp-edit-order',
                          title: '序号：同分类内按序号从小到大、自左向右排列（该分类现有 ' + cnt + ' 条，可选 1..' + cnt + '）',
                          value: val,
                          onChange: function (e) { updateRow(i, 'order', Number(e.target.value)) },
                        }, options)
                      })(),
                      React.createElement('input', { className: 'qp-edit-title', placeholder: '标题', value: p.title, onChange: function (e) { updateRow(i, 'title', e.target.value) } })
                    ),
                    React.createElement('textarea', { className: 'qp-edit-text', placeholder: '快捷语内容', rows: 2, value: p.text, onChange: function (e) { updateRow(i, 'text', e.target.value) } }),
                    React.createElement('div', { className: 'qp-edit-meta' },
                      React.createElement('button', {
                        type: 'button',
                        className: p.autoSend ? 'qp-auto qp-auto-on' : 'qp-auto',
                        title: '开启后：点击该快捷语会把内容插入输入框并立即发送（条目标题后带 ⏎ 图标）',
                        onClick: function () { updateRow(i, 'autoSend', !p.autoSend) },
                      }, '⏎ 自动发送：' + (p.autoSend ? '开' : '关')),
                      React.createElement('button', { type: 'button', className: 'qp-del', style: { marginLeft: 'auto' }, onClick: function () { removeRow(i) }, disabled: saving }, '删除')
                    )
                  )
                })
              )
            ) : (
              React.createElement('div', { className: 'qp-list' },
                cats === null
                  ? React.createElement('div', { className: 'qp-empty' }, '加载中…')
                  : !cats || cats.length === 0
                    ? React.createElement('div', { className: 'qp-empty' }, '暂无快捷语，点「管理」录入或「导入MD」')
                    : cats.map(function (c, ci) {
                      return React.createElement(React.Fragment, { key: c.id || ci },
                        React.createElement('div', { className: 'qp-cat-head' }, (c.name || '默认') + '（' + (c.prompts || []).length + '）'),
                        (c.prompts || []).length === 0
                          ? React.createElement('div', { className: 'qp-empty' }, '（空）')
                          : sortPrompts(c.prompts).map(function (p, i) {
                            return React.createElement('div', {
                              className: 'qp-item',
                              key: p.id || i,
                              role: 'button',
                              tabIndex: 0,
                              title: (p.autoSend ? '自动发送：' : '') + (p.text || ''),
                              onClick: function () { insertAndClose(p) },
                              onKeyDown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); insertAndClose(p) } },
                            },
                              React.createElement('span', { className: 'qp-title-wrap' },
                                React.createElement('span', { className: 'qp-item-title' }, p.title || '(无标题)'),
                                p.autoSend ? React.createElement(EnterIcon) : null),
                              React.createElement('span', { className: 'qp-item-text' }, p.text)
                            )
                          })
                      )
                    })
              )
            )
          )
        ) : null
      )
    }

    function apply(ctx) {
      var slots = ctx.get('slots')
      if (!slots) return

      // 样式兜底：宿主在条目失效/重载时可能回收本 bundle 的 <style>，而插件实例仍挂载着
      // （此时不会重新物化，也就不会再执行 factory 里的注入）。这里观察 head 变化并按需
      // 重新注入；卸载时断开观察，保证样式生命周期不超过插件本身。
      ctx.effect(function () {
        ensureStyles()
        if (typeof MutationObserver === 'undefined' || typeof document === 'undefined' || !document.head) {
          return function () { }
        }
        var observer = new MutationObserver(function () { ensureStyles() })
        observer.observe(document.head, { childList: true })
        return function () { observer.disconnect() }
      }, 'dsh-quick-prompts: styles')

      slots.inject('conversation.input.dock', function () {
        return slots.register(
          { name: 'conversation.input.dock', id: 'quick-prompts-bar', order: 10, label: '快捷输入条' },
          function (props) { return React.createElement(QuickPromptBar, props) }
        )
      }, 'dsh-quick-prompts: dock bar')

      slots.inject('conversation.input.left', function () {
        return slots.register(
          { name: 'conversation.input.left', id: 'quick-prompts', order: 100, label: '快捷输入' },
          function (props) { return React.createElement(QuickPromptSeat, props) }
        )
      }, 'dsh-quick-prompts: input seat')
    }

    module.exports = { inject: inject, apply: apply }
    return module.exports
  }
})
