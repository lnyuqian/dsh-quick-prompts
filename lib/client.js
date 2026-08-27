/**
 * dsh-quick-prompts 客户端半部：输入框工具行「权限切换」右侧的闪电笔按钮。
 * 点开弹层选一条预设提示词 -> setDraft + submit 直接发送；「管理」可增删改，落盘走 /api/quick-prompts。
 * 纯 JS（React.createElement），无需构建；React 由宿主模块系统提供。
 */
window.__ModuleLoader__.load({
  id: 'dsh-quick-prompts',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')

    var inject = ['slots']

    var CSS = [
      '.qp-wrap{position:relative;display:inline-flex;align-items:center}',
      '.qp-btn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#666);cursor:pointer;padding:0}',
      '.qp-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.07));color:var(--dsw-alias-label-primary,inherit)}',
      '.qp-btn:disabled{opacity:.45;cursor:not-allowed}',
      '.qp-scrim{position:fixed;inset:0;z-index:10000;background:transparent}',
      '.qp-pop{position:fixed;z-index:10001;width:300px;max-height:360px;display:flex;flex-direction:column;background:var(--dsw-specific-input-major,#fff);border:1px solid var(--dsw-alias-border-l2-darkmode-thin,#ddd);border-radius:12px;box-shadow:var(--dsw-shadow-lv2,0 8px 24px rgba(0,0,0,.15));color:var(--dsw-alias-label-primary,#222);font-size:13px;overflow:hidden}',
      '.qp-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l4,rgba(0,0,0,.08))}',
      '.qp-title{font-weight:600}',
      '.qp-head-actions{display:flex;align-items:center;gap:10px}',
      '.qp-link{border:none;background:transparent;padding:0;font-size:12px;color:var(--dsw-alias-label-secondary,#666);cursor:pointer}',
      '.qp-link:hover{color:var(--dsw-alias-label-primary,inherit)}',
      '.qp-link-primary{color:var(--dsw-alias-state-business-primary,#2563eb);font-weight:600}',
      '.qp-link:disabled{opacity:.5;cursor:not-allowed}',
      '.qp-error{padding:8px 12px;color:#d33;font-size:12px;border-bottom:1px solid var(--dsw-alias-border-l4,rgba(0,0,0,.08))}',
      '.qp-list{overflow-y:auto;padding:6px;display:flex;flex-direction:column;gap:4px}',
      '.qp-empty{padding:18px 10px;text-align:center;color:var(--dsw-alias-label-secondary,#888);font-size:12px}',
      '.qp-item{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;border:none;background:transparent;border-radius:8px;padding:8px 10px;cursor:pointer;width:100%}',
      '.qp-item:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}',
      '.qp-item-title{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary,inherit)}',
      '.qp-item-text{font-size:12px;color:var(--dsw-alias-label-secondary,#777);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}',
      '.qp-edit-row{display:flex;flex-direction:column;gap:6px;border:1px solid var(--dsw-alias-border-l4,rgba(0,0,0,.1));border-radius:8px;padding:8px}',
      '.qp-edit-title{font-size:13px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,#ccc);border-radius:6px;background:var(--dsw-specific-input-minor,#fff);color:inherit}',
      '.qp-edit-text{font-size:13px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,#ccc);border-radius:6px;background:var(--dsw-specific-input-minor,#fff);color:inherit;resize:vertical;font-family:inherit;line-height:1.5}',
      '.qp-del{align-self:flex-end;border:none;background:transparent;font-size:12px;color:#d33;cursor:pointer;padding:0}',
    ].join('')

    function LightningPen() {
      return React.createElement('svg', {
        width: 15, height: 15, viewBox: '0 0 1024 1024', fill: 'currentColor', 'aria-hidden': true
      }, React.createElement('path', {
        d: 'M746.666667 117.333333a160 160 0 0 1 159.786666 151.466667l0.213334 8.533333v170.666667a32 32 0 0 1-63.701334 4.352l-0.298666-4.352v-170.666667a96 96 0 0 0-89.429334-95.786666L746.666667 181.333333h-469.333334a96 96 0 0 0-95.786666 89.429334L181.333333 277.333333v469.333334a96 96 0 0 0 89.429334 95.786666l6.570666 0.213334H512a32 32 0 0 1 4.352 63.701333L512 906.666667H277.333333a160 160 0 0 1-159.786666-151.466667l-0.213334-8.533333v-469.333334A160 160 0 0 1 268.8 117.546667l8.533333-0.213334h469.333334z m14.293333 472.746667a32 32 0 0 1 16 38.869333l-1.706667 4.010667-40.832 81.706667H853.333333a32 32 0 0 1 30.293334 42.282666l-1.706667 4.010667-64 128a32 32 0 0 1-58.88-24.576l1.706667-4.010667 40.789333-81.706666H682.666667a32 32 0 0 1-30.293334-42.282667l1.706667-4.010667 64-128a32 32 0 0 1 42.88-14.336zM341.333333 309.333333a32 32 0 0 1 31.701334 27.648L373.333333 341.333333v128a32 32 0 0 1-63.701333 4.352L309.333333 469.333333V341.333333A32 32 0 0 1 341.333333 309.333333z'
      }))
    }

    function QuickPromptSeat(props) {
      var inputActions = props.inputActions
      var sessionId = props.sessionId
      var openState = React.useState(false)
      var open = openState[0]
      var setOpen = openState[1]
      var posState = React.useState({ x: 0, y: 0 })
      var pos = posState[0]
      var setPos = posState[1]
      var promptsState = React.useState(null)
      var prompts = promptsState[0]
      var setPrompts = promptsState[1]
      var errState = React.useState(null)
      var error = errState[0]
      var setError = errState[1]
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

      React.useEffect(function () {
        var alive = true
        if (sessionId === undefined) { setPrompts([]); return undefined }
        setError(null)
        fetch('/api/quick-prompts?sessionId=' + encodeURIComponent(sessionId))
          .then(function (r) { return r.json() })
          .then(function (data) {
            if (!alive) return
            if (data && data.ok) setPrompts(data.prompts || [])
            else setError((data && data.error) || '加载失败')
          })
          .catch(function (e) { if (alive) setError(String(e && e.message || e)) })
        return function () { alive = false }
      }, [sessionId])

      function close() { setOpen(false); setEditing(false) }

      function onToggle() {
        if (open) { close(); return }
        var el = btnRef.current
        var rect = el && typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null
        var vw = typeof window !== 'undefined' ? window.innerWidth : 9999
        var x = rect ? Math.max(8, Math.min(rect.left, vw - 308)) : 0
        var y = rect ? rect.top : 0
        setPos({ x: x, y: y })
        setError(null)
        setOpen(true)
      }

      function send(p) {
        if (!inputActions || !p || typeof p.text !== 'string' || p.text.length === 0) return
        inputActions.setDraft(p.text)
        inputActions.submit()
        close()
      }

      function startEdit() {
        setDraft((prompts || []).map(function (p) {
          return { id: p.id || '', title: p.title || '', text: p.text || '' }
        }))
        setEditing(true)
      }

      function cancelEdit() { setEditing(false); setDraft([]) }
      function newRow() { setDraft(draft.concat([{ id: '', title: '', text: '' }])) }

      function updateRow(i, field, value) {
        var next = draft.slice()
        next[i] = Object.assign({}, next[i])
        next[i][field] = value
        setDraft(next)
      }

      function removeRow(i) { setDraft(draft.filter(function (_, idx) { return idx !== i })) }

      function save() {
        setSaving(true)
        var clean = draft
          .map(function (p) { return { id: p.id || '', title: p.title || '', text: p.text || '' } })
          .filter(function (p) { return p.title || p.text })
        fetch('/api/quick-prompts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionId, prompts: clean }),
        })
          .then(function (r) { return r.json() })
          .then(function (data) {
            setSaving(false)
            if (data && data.ok) { setPrompts(data.prompts || clean); setEditing(false); setDraft([]) }
            else setError((data && data.error) || '保存失败')
          })
          .catch(function (e) { setSaving(false); setError(String(e && e.message || e)) })
      }

      var disabled = inputActions === undefined || sessionId === undefined

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
          React.createElement('div', { className: 'qp-pop', style: { top: (pos.y - 8), left: pos.x, transform: 'translateY(-100%)' } },
            React.createElement('div', { className: 'qp-head' },
              React.createElement('span', { className: 'qp-title' }, '快捷输入'),
              React.createElement('span', { className: 'qp-head-actions' },
                editing ? React.createElement(React.Fragment, null,
                  React.createElement('button', { type: 'button', className: 'qp-link', onClick: newRow, disabled: saving }, '新增'),
                  React.createElement('button', { type: 'button', className: 'qp-link', onClick: cancelEdit, disabled: saving }, '取消'),
                  React.createElement('button', { type: 'button', className: 'qp-link qp-link-primary', onClick: save, disabled: saving }, saving ? '保存中…' : '保存')
                ) : React.createElement('button', { type: 'button', className: 'qp-link', onClick: startEdit, disabled: disabled }, '管理')
              )
            ),
            error ? React.createElement('div', { className: 'qp-error' }, error) : null,
            editing ? (
              React.createElement('div', { className: 'qp-list' },
                draft.length === 0 ? React.createElement('div', { className: 'qp-empty' }, '暂无提示词，点「新增」添加') : null,
                draft.map(function (p, i) {
                  return React.createElement('div', { className: 'qp-edit-row', key: i },
                    React.createElement('input', { className: 'qp-edit-title', placeholder: '标题（选填）', value: p.title, onChange: function (e) { updateRow(i, 'title', e.target.value) } }),
                    React.createElement('textarea', { className: 'qp-edit-text', placeholder: '提示词内容', rows: 2, value: p.text, onChange: function (e) { updateRow(i, 'text', e.target.value) } }),
                    React.createElement('button', { type: 'button', className: 'qp-del', onClick: function () { removeRow(i) }, disabled: saving }, '删除')
                  )
                })
              )
            ) : (
              React.createElement('div', { className: 'qp-list' },
                prompts === null
                  ? React.createElement('div', { className: 'qp-empty' }, '加载中…')
                  : prompts.length === 0
                    ? React.createElement('div', { className: 'qp-empty' }, '暂无提示词，点「管理」录入')
                    : prompts.map(function (p, i) {
                        return React.createElement('button', { type: 'button', className: 'qp-item', key: i, title: p.text, onClick: function () { send(p) } },
                          React.createElement('span', { className: 'qp-item-title' }, p.title || '(无标题)'),
                          React.createElement('span', { className: 'qp-item-text' }, p.text)
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

      ctx.effect(function () {
        var style = document.createElement('style')
        style.setAttribute('data-dsh-plugin', 'dsh-quick-prompts')
        style.textContent = CSS
        document.head.appendChild(style)
        return function () { style.remove() }
      }, 'dsh-quick-prompts: styles')

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
