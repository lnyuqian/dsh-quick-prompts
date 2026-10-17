/**
 * dsh-quick-prompts 客户端半部：
 * 1. 常驻横向快捷条（conversation.input.dock，输入框上方全宽）：
 *    第一行分类、第二行当前分类下的标题；悬停分类即切换下方标题；
 *    点击标题把内容**追加**到输入框原有内容之后（不发送，也不清空已输入的内容）。
 * 2. 闪电笔按钮（conversation.input.left，工具行「权限切换」右侧）：
 *    弹层顶部第一行是标题 + 「MD 管理」下拉（导入 / 导出 / 复制 三个动作收进一个下拉，
 *    选完即回到「MD 管理」，不再各占一个按钮）；第二行是「分类」下拉 + 新增 / 修改 ——
 *    选定分类后「新增」把新条目放进这个分类、「修改」只列出这个分类的条目（其他分类
 *    保存时原样保留），原先的「管理」入口已并入这两个按钮；弹层内点击条目与快捷条同样走「追加」语义。
 * 3. 自动发送：每条快捷语可单独开关 autoSend；开启的条目在快捷条与弹层中
 *    标题后带 ⏎ 小图标，点击后以该短语整体替换草稿并走官方 submit() 通道立即发送
 *    （替换而非追加，避免把尚未写完的草稿一并误发出去）；
 *    MD 导入/导出以标题尾部 ` ⏎` 标记同步该开关。
 * 4. 序号排序：每条可设置数字序号 order，展示与导出按序号从小到大、自左向右
 *    排列（稳定排序，无序号排最后）；编辑时按分类现有条数自动预填/建议序号。
 * 5. 自动同步（v0.7.11）：页面可见时每 2 秒探一次 /api/quick-prompts，**任何**写入者
 *    （另一个窗口 / 命令行 / 别处的 AI 直接改 quick-prompts.json）落盘后，最长 2 秒
 *    自己出现在快捷条与弹层里 —— 不用手动刷新、不用打开弹层、不用切走再切回来；
 *    内容没变时零通知零渲染；编辑期间只提示不覆盖（编辑锁）。
 *    「MD 管理」下拉里另有「重载界面」，用于插件代码更新后的整页刷新（DSH 菜单没有刷新入口）。
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

    /* ---------------- 布局常量（放在 CSS 之前：样式里要直接引用它们，保持单一来源） ---------------- */

    /* 弹层尺寸预算。宽度不再写死：优先与上方快捷条同宽（见 computePopPos）。 */
    var POP_WIDTH = 340          // 只作为「量不到快捷条」时的兜底宽度
    var POP_MAX_HEIGHT = 480
    var POP_GAP = 8
    var POP_MARGIN = 8
    var POP_MIN_HEIGHT = 160
    var POP_MIN_WIDTH = 280
    /**
     * composer 卡片的默认侧边留白（宿主没设变量时用）。
     * 只写这一份：CSS 的 var(..., X) 兜底值与 JS 的兜底值都从它来，避免两处各写一个数。
     */
    var DOCK_CLEARANCE = 16
    /** 宿主没设卡片上限时用这个宽度兜底（与旧版弹层宽度一致，不会突然变得很宽）。 */
    var DOCK_CARD_MAX = 900
    /**
     * 一行提示语的高度（px）。这一条是**唯一真相来源**：
     * 既决定 CSS 里 --qp-row-h，也参与「至少 10 行」的高度计算。
     */
    var ROW_H = 22
    /** <用户> 2026-10-17：浏览态列表**至少**能看满 10 行提示语。 */
    var MIN_VISIBLE_ROWS = 10
    /**
     * 分类头也要占行。只按 10 行留高度的话，「分类头 + 提示语」混排时实际能看到的提示语会少于 10 条，
     * 所以额外留 3 行的余量（够两三个小分类的头）。
     */
    var HEADER_ROWS_ALLOWANCE = 3
    /** 头部（现在只有一行：标题 + 工具组 + 搜索 + MD 管理）的高度估算，只用于「至少 10 行」那条下限。 */
    var POP_CHROME_EST = 45

    var CSS = [
      /* 闪电笔按钮 */
      '.qp-wrap{position:relative;display:inline-flex;align-items:center}',
      '.qp-btn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#666);cursor:pointer;padding:0}',
      '.qp-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.07));color:var(--dsw-alias-label-primary,inherit)}',
      '.qp-btn:disabled{opacity:.45;cursor:not-allowed}',
      /* 弹层 */
      '.qp-scrim{position:fixed;inset:0;z-index:10000;background:transparent}',
      /* 弹层：宽度与左边界在打开时按「上方快捷条」实测出来（内联 style 给），这里只兜底 340px。
         --qp-row-h 由 JS 的 ROW_H 注入（一行提示语的高度），保证「至少 10 行」只有一个真相来源。 */
      '.qp-pop{position:fixed;z-index:10001;width:340px;box-sizing:border-box;max-width:calc(100vw - 16px);max-height:400px;display:flex;flex-direction:column;background:var(--dsw-specific-input-major,#fff);border:1px solid var(--dsw-alias-border-l2-darkmode-thin,#ddd);border-radius:12px;box-shadow:var(--dsw-shadow-lv2,0 8px 24px rgba(0,0,0,.15));color:var(--dsw-alias-label-primary,#222);font-size:13px;overflow:hidden}',
      /* 顶部一行搞定：标题 + 分类下拉 + ‹ › + ⋯ + 模式按钮 + 搜索 + MD 管理
         <用户> 2026-10-17：原先 4 行（标题行 / 工具行 / 搜索行 / 信息行）压成一行，都跟「快捷输入」同行；
         去掉「分类」二字；分类下拉与搜索各 6 字宽。 */
      '.qp-head{display:flex;align-items:center;gap:6px;flex-wrap:nowrap;overflow:hidden;padding:6px 8px;border-bottom:1px solid var(--dsw-alias-border-l4,rgba(0,0,0,.08));flex:none}',
      /* 弹层是纵向 flex：只有列表可以伸缩并滚动，其余（头部 / 提示 / 冲突条 / 批量条）一律 flex:none，
         否则内容一多，头部会被压扁、控件被 overflow:hidden 裁掉（v0.7.9 实测抓到）。 */
      '.qp-tools,.qp-scope,.qp-info,.qp-error,.qp-conflict,.qp-bulk{flex:none}',
      '.qp-list{flex:1 1 auto;min-height:0}',
      '.qp-title{font-weight:600;flex:none}',
      '.qp-head-actions{display:flex;align-items:center;gap:6px;flex:none}',
      /* 工具组：分类下拉（6 字宽）+ ‹ › 换分类 + ⋯ 分类操作 + 新增 / 修改（编辑态：新增一行 / 取消 / 保存） */
      '.qp-tools{position:relative;display:flex;align-items:center;gap:6px;flex:none;min-width:0}',
      '.qp-tools-spacer{flex:1 1 0;min-width:0}',
      /* 瞬时成功提示就贴在这一行里（放不下就省略号），不再单独占一行 */
      '.qp-info-inline{display:inline-block;max-width:16em;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}',
      /* 行内的成功提示不带块级内边距 / 分隔线（块级那份仍留给「外部更新」这类提示） */
      '.qp-info.qp-info-inline{padding:0;border:none}',
      '.qp-md-select,.qp-cat-pick{font-size:12px;padding:3px 6px;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,#ccc);border-radius:6px;background:var(--dsw-specific-input-minor,#fff);color:inherit;cursor:pointer}',
      '.qp-md-select{flex:none;max-width:9em}',
      /* 6 字宽 + 10px / 搜索同样（<用户> 2026-10-17）；超出由浏览器省略（全名在 title 里） */
      '.qp-cat-pick{flex:none;width:calc(6em + 10px);max-width:calc(6em + 10px)}',
      '.qp-md-select:disabled,.qp-cat-pick:disabled{opacity:.5;cursor:not-allowed}',
      '.qp-scope{padding:4px 8px 2px;font-size:11px;color:var(--dsw-alias-label-secondary,#888);line-height:1.5}',
      /* 保存前冲突提示：服务端已被别处改动，等用户决定「覆盖」还是「载入最新」 */
      '.qp-conflict{padding:8px 12px;font-size:12px;line-height:1.6;color:#8a5300;background:rgba(255,183,0,.14);border-bottom:1px solid var(--dsw-alias-border-l4,rgba(0,0,0,.08))}',
      '.qp-conflict-actions{display:flex;gap:12px;margin-top:6px}',
      '.qp-conflict .qp-link{color:#8a5300;font-weight:600}',
      /* 删除可撤销：有内容的行先标记删除、留在原位，保存时才真正落盘 */
      '.qp-row-deleted{opacity:.55;border-style:dashed}',
      '.qp-undo{align-self:flex-end;border:none;background:transparent;font-size:12px;color:var(--dsw-alias-state-business-primary,#2563eb);cursor:pointer;padding:0}',
      '.qp-pop:focus{outline:none}',
      /* v0.7.0 起有搜索框；v0.7.9 起它只是一行里的一个 6 字宽输入框 */
      '.qp-search{display:flex;align-items:center;gap:4px;flex:none}',
      '.qp-search-input{width:calc(6em + 10px);min-width:0;font-size:12px;padding:3px 6px;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,#ccc);border-radius:6px;background:var(--dsw-specific-input-minor,#fff);color:inherit}',
      '.qp-step{flex:none;width:22px;height:22px;line-height:20px;text-align:center;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,#ccc);border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#666);cursor:pointer;padding:0;font-size:12px}',
      '.qp-step:hover:not(:disabled){color:var(--dsw-alias-label-primary,inherit);background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}',
      '.qp-step:disabled{opacity:.4;cursor:not-allowed}',
      '.qp-icon{flex:none;width:20px;height:20px;line-height:18px;text-align:center;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,#ccc);border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#666);cursor:pointer;padding:0;font-size:12px}',
      '.qp-icon:hover{color:var(--dsw-alias-label-primary,inherit);background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}',
      '.qp-tools-spacer{flex:1 1 0;min-width:0}',
      '.qp-menu{position:absolute;top:100%;left:0;z-index:3;min-width:11em;margin-top:2px;padding:4px;display:flex;flex-direction:column;gap:2px;background:var(--dsw-specific-input-major,#fff);border:1px solid var(--dsw-alias-border-l2-darkmode-thin,#ccc);border-radius:8px;box-shadow:var(--dsw-shadow-lv2,0 8px 24px rgba(0,0,0,.15))}',
      '.qp-menu-item{border:none;background:transparent;text-align:left;font-size:12px;color:var(--dsw-alias-label-primary,inherit);cursor:pointer;padding:5px 8px;border-radius:6px}',
      '.qp-menu-item:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}',
      '.qp-cat-rename{flex:1;min-width:0;font-size:12px;padding:3px 6px;border:1px solid var(--dsw-alias-state-business-primary,#2563eb);border-radius:6px;background:var(--dsw-specific-input-minor,#fff);color:inherit}',
      '.qp-bulk{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 12px;font-size:12px;background:rgba(37,99,235,.08);border-bottom:1px solid var(--dsw-alias-border-l4,rgba(0,0,0,.08))}',
      '.qp-bulk-count{flex:none;color:var(--dsw-alias-state-business-primary,#2563eb);font-weight:600}',
      '.qp-bulk-cat{font-size:12px;padding:2px 6px;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,#ccc);border-radius:6px;background:var(--dsw-specific-input-minor,#fff);color:inherit;cursor:pointer;max-width:9em}',
      '.qp-pick{flex:none;width:14px;height:14px;margin:0;cursor:pointer;accent-color:var(--dsw-alias-state-business-primary,#2563eb)}',
      '.qp-scope-toggle{border:none;background:transparent;font-size:11px;color:var(--dsw-alias-state-business-primary,#2563eb);cursor:pointer;padding:0 0 0 6px}',
      /* 拖拽排序（v0.7.4）：在浏览态「一条一行」上直接用，不再给编辑行加把手 */
      '.qp-item-dragging{opacity:.55}',
      '.qp-drop-over{box-shadow:0 -2px 0 0 var(--dsw-alias-state-business-primary,#2563eb)}',
      '.qp-drop-below{box-shadow:0 2px 0 0 var(--dsw-alias-state-business-primary,#2563eb)}',
      /* 自动发送条目（v0.7.1）：按住 300ms 才发 —— 长按时禁掉文本选择 / 系统菜单，短按只填入 */
      '.qp-tchip-send,.qp-item-send{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}',
      '.qp-tchip-send:active,.qp-item-send:active{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}',
      /* 条上「直接发送」的区分方式：用回车图标的那个蓝色落在文字上（面板里的「回车菜单」样式不动） */
      '.qp-tchip.qp-tchip-send{color:var(--dsw-alias-state-business-primary,#2563eb)}',
      /* 分类标题吸顶：长列表里始终看得见「我在哪个分类」 */
      '.qp-link{border:none;background:transparent;padding:0;font-size:12px;color:var(--dsw-alias-label-secondary,#666);cursor:pointer}',
      '.qp-link:hover{color:var(--dsw-alias-label-primary,inherit)}',
      '.qp-link-primary{color:var(--dsw-alias-state-business-primary,#2563eb);font-weight:600}',
      '.qp-link:disabled{opacity:.5;cursor:not-allowed}',
      '.qp-error{padding:8px 12px;color:#d33;font-size:12px;border-bottom:1px solid var(--dsw-alias-border-l4,rgba(0,0,0,.08))}',
      '.qp-info{padding:8px 12px;color:#2a8a3b;font-size:12px;border-bottom:1px solid var(--dsw-alias-border-l4,rgba(0,0,0,.08))}',
      '.qp-list{overflow-y:auto;padding:2px 4px;display:flex;flex-direction:column;gap:1px}',
      '.qp-empty{padding:14px 10px;text-align:center;color:var(--dsw-alias-label-secondary,#888);font-size:12px}',
      /* 分类名：最多 4 个字（JS 截断，title 里带全名），后面的条数不参与截断 */
      '.qp-cat-head{position:sticky;top:0;z-index:1;background:var(--dsw-specific-input-major,#fff)}',
      '.qp-cat-head{flex:none;display:flex;align-items:center;gap:2px;height:var(--qp-row-h,22px);box-sizing:border-box;font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary,#888);padding:0 6px;text-transform:none;letter-spacing:.02em}',
      '.qp-cat-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:4em}',
      '.qp-cat-num{flex:none;font-weight:400;opacity:.75}',
      /* 分类头可拖：抓手光标 + 按住即拖（拖的时候提示词会收起来） */
      '.qp-cat-grab{cursor:grab}',
      '.qp-cat-grab:active{cursor:grabbing}',
      '.qp-drag-hint{flex:none;padding:2px 6px;font-size:11px;color:var(--dsw-alias-state-business-primary,#2563eb)}',
      /* 一条短语 = 一行：整行不换行、超宽省略；标题最多 8 个字 */
      /* flex:none 很关键：列表是纵向 flex，不给 none 的话行会被压扁（几十条挤进一屏），滚动条也就永远不出现 */
      '.qp-item{flex:none;display:flex;flex-direction:row;align-items:center;gap:4px;text-align:left;border:none;background:transparent;border-radius:6px;padding:0 8px;height:var(--qp-row-h,22px);box-sizing:border-box;overflow:hidden;cursor:pointer;width:100%}',
      '.qp-item:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}',
      '.qp-item .qp-title-wrap{flex:none;max-width:8em}',
      '.qp-item-title{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary,inherit);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:none;max-width:8em}',
      '.qp-item-text{flex:1;font-size:12px;color:var(--dsw-alias-label-secondary,#777);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;text-align:left}',
      /* 管理编辑行 */
      '.qp-edit-row{display:flex;flex-direction:column;gap:6px;border:1px solid var(--dsw-alias-border-l4,rgba(0,0,0,.1));border-radius:8px;padding:8px}',
      '.qp-edit-meta{display:flex;gap:6px}',
      '.qp-edit-cat{font-size:13px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,#ccc);border-radius:6px;background:var(--dsw-specific-input-minor,#fff);color:inherit;width:calc(5em + 18px);flex:none}',
      '.qp-cat-select{cursor:pointer;width:calc(8em + 18px)}',
      '.qp-cat-back{align-self:center;border:none;background:transparent;font-size:11px;color:var(--dsw-alias-state-business-primary,#2563eb);cursor:pointer;padding:0;white-space:nowrap;flex:none}',
      '.qp-edit-order{font-size:13px;padding:6px 6px;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,#ccc);border-radius:6px;background:var(--dsw-specific-input-minor,#fff);color:inherit;width:calc(2em + 16px);flex:none;cursor:pointer}',
      '.qp-edit-title{flex:1;font-size:13px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,#ccc);border-radius:6px;background:var(--dsw-specific-input-minor,#fff);color:inherit;width:auto;min-width:0}',
      '.qp-edit-text{font-size:13px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,#ccc);border-radius:6px;background:var(--dsw-specific-input-minor,#fff);color:inherit;resize:vertical;font-family:inherit;line-height:1.5}',
      '.qp-del{align-self:flex-end;border:none;background:transparent;font-size:12px;color:#d33;cursor:pointer;padding:0}',
      '.qp-auto{align-self:flex-end;display:inline-flex;align-items:center;gap:3px;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,#ccc);background:transparent;border-radius:999px;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary,#666);cursor:pointer;padding:2px 10px}',
      '.qp-auto:hover{color:var(--dsw-alias-label-primary,inherit)}',
      '.qp-auto-on{border-color:var(--dsw-alias-state-business-primary,#2563eb);color:var(--dsw-alias-state-business-primary,#2563eb);font-weight:600}',
      '.qp-title-wrap{display:inline-flex;align-items:center;gap:3px;min-width:0}',
      '.qp-send-ico{display:inline-flex;align-items:center;flex:none;color:var(--dsw-alias-state-business-primary,#2563eb)}',
      /* 常驻横向快捷条（输入框上方）
         <用户> 2026-10-17：① 去掉条自身的左右内边距（那段空位让给分类与提示语）；
         ② 宽度要与输入框卡片一致 —— 原先多减了 dock-inset（每侧 8px，共 16px），就是「窄几像素」的来源。 */
      '.qp-bar{display:flex;flex-direction:column;gap:2px;box-sizing:border-box;flex:none;width:min(100% - var(--dsh-composer-side-clearance,' + DOCK_CLEARANCE + 'px)*2, var(--dsh-composer-card-max-width,' + DOCK_CARD_MAX + 'px));margin:0 auto;padding:4px 0 6px;border:1px solid var(--dsw-alias-border-l4,rgba(0,0,0,.08));border-radius:12px;background:var(--dsw-specific-input-major,transparent);font-size:12px;color:var(--dsw-alias-label-primary,inherit)}',
      /* 两行都保持「单行」：放不下时不换行、不撑高，改为横向按住拖动看后面内容（v0.5.0） */
      '.qp-bar-row{display:flex;flex-wrap:nowrap;gap:2px;align-items:center;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-ms-overflow-style:none;cursor:grab;-webkit-user-select:none;user-select:none}',
      '.qp-bar-row>*{flex:none}',
      '.qp-cat{border:none;background:transparent;border-radius:999px;padding:3px 10px;cursor:pointer;color:var(--dsw-alias-label-secondary,#666);font-size:12px;line-height:1.5}',
      '.qp-cat:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.07));color:var(--dsw-alias-label-primary,inherit)}',
      '.qp-cat-on{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.08));color:var(--dsw-alias-label-primary,inherit);font-weight:600}',
      '.qp-cat-count{font-weight:400;opacity:.65;margin-left:3px;font-size:11px}',
      '.qp-titles{display:flex;flex-wrap:nowrap;gap:2px;align-items:center;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-ms-overflow-style:none;cursor:grab;-webkit-user-select:none;user-select:none}',
      '.qp-titles>*{flex:none}',
      /* 滚动条隐藏：这两行靠「按住拖动」查看后面内容，不占高度、不破坏外观 */
      '.qp-bar-row::-webkit-scrollbar,.qp-titles::-webkit-scrollbar{display:none;width:0;height:0}',
      '.qp-bar-row.qp-dragging,.qp-bar-row.qp-dragging *,.qp-titles.qp-dragging,.qp-titles.qp-dragging *{cursor:grabbing!important}',
      '.qp-tchip{border:none;background:transparent;border-radius:8px;padding:2px 8px;cursor:pointer;color:var(--dsw-alias-label-primary,inherit);font-size:12px;line-height:1.6;max-width:320px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left}',
      '.qp-tchip:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.08))}',
      '.qp-tchip-empty{color:var(--dsw-alias-label-secondary,#999);cursor:default;font-size:12px;padding:2px 8px}',
      /* 闪电笔 + 折叠三角：同一组控件，共享左右圆角 */
      '.qp-wrap{gap:0}',
      '.qp-wrap .qp-btn{border-radius:8px 0 0 8px}',
      '.qp-tri{display:inline-flex;align-items:center;justify-content:center;width:18px;height:26px;border:none;background:transparent;border-radius:0 8px 8px 0;color:var(--dsw-alias-label-secondary,#666);cursor:pointer;padding:0}',
      '.qp-tri:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.07));color:var(--dsw-alias-label-primary,inherit)}',
      '.qp-tri:disabled{opacity:.45;cursor:not-allowed}',
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

    /* ---------------- 快捷条折叠状态（每台设备各记一份） ---------------- */

    var COLLAPSE_KEY = 'dsh-quick-prompts.collapsed'
    var NARROW_PX = 640

    /** 当前是否为窄屏（手机 / 窄窗口）：只用于「没有记录时」的默认值。 */
    function isNarrowViewport() {
      try {
        if (typeof window === 'undefined' || !window) return false
        if (window.matchMedia) return window.matchMedia('(max-width: ' + NARROW_PX + 'px)').matches
        return typeof window.innerWidth === 'number' ? window.innerWidth <= NARROW_PX : false
      } catch (e) {
        return false
      }
    }

    /**
     * 读取折叠状态。**每台设备各自记住**：localStorage 按 origin 隔离，桌面版、web 版、
     * 手机远程访问各有一份，互不影响。刻意不写进三端共用的 quick-prompts.json ——
     * 否则在手机上收起会连累电脑端也收起。
     * 没有记录时：窄屏默认收起（远程/手机查看不占高度），宽屏默认展开。
     */
    function readCollapsed() {
      try {
        var raw = window.localStorage.getItem(COLLAPSE_KEY)
        if (raw === '1') return true
        if (raw === '0') return false
      } catch (e) { /* 无 localStorage（隐私模式等）时走默认值 */ }
      return isNarrowViewport()
    }

    function writeCollapsed(v) {
      try { window.localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0') } catch (e) { /* 写不进就算了 */ }
    }

    /** 折叠状态仓：快捷条（决定是否渲染）与闪电笔三角（决定朝向）共用同一份状态。 */
    var collapseState = {
      value: null,
      subs: [],
      ensure: function () {
        if (this.value === null) this.value = readCollapsed()
        return this.value
      },
      notify: function () {
        var v = this.value
        this.subs.slice().forEach(function (f) { f(v) })
      },
      set: function (v) {
        this.value = v === true
        writeCollapsed(this.value)
        this.notify()
      },
      toggle: function () { this.set(!this.ensure()) },
    }

    /** React hook：订阅折叠状态（两个组件各自订阅，保持同步）。 */
    function useBarCollapsed() {
      collapseState.ensure()
      var s = React.useState(collapseState.value)
      var setValue = s[1]
      React.useEffect(function () {
        function listener(v) { setValue(v) }
        collapseState.subs.push(listener)
        listener(collapseState.value)
        return function () {
          collapseState.subs = collapseState.subs.filter(function (f) { return f !== listener })
        }
      }, [])
      return s[0]
    }

    /* ---------------- 快捷条两行：单行 + 按住拖动查看后面内容（v0.5.0） ---------------- */

    /**
     * 拖动期间置位。拖动会顺路划过分类按钮，此时不许切换分类、也不许把这一下当点击。
     * 模块级变量：两行共用一份「正在拖」的判断。
     */
    var dragging = false

    var DRAG_THRESHOLD_PX = 4

    /**
     * 给一行快捷条加「按住向左/右拖动 → 横向滚动」的能力。
     *
     * 只有鼠标走这套（触摸交给原生惯性滚动）。关键取舍有三条：
     * 1. **攒够位移才开始拖**（>4px）：否则普通点击也会被接管，点快捷语就没反应；
     * 2. **拖起来之后才 setPointerCapture**：pointerdown 就捕获会把 click 的目标改写成整行，
     *    按钮自己的 onClick 再也不会触发 —— 这正是「点击没反应」的经典坑；
     * 3. **行内容没超宽时不接管指针**：内容都看得见时它就是个普通行，行为不变。
     *
     * 拖完那一下的 click 由 onClickCapture 吞掉；状态在下次 pointerdown 重置，
     * 因此不依赖 click/pointerup 的先后顺序，也不怕中途松开到行外。
     */
    function createDragPan() {
      var ref = React.useRef(null)
      var st = React.useRef({ down: false, moved: false, x0: 0, left0: 0, pid: 0 })
      return {
        ref: ref,
        onPointerDown: function (e) {
          // 每次按下都是新交互：先把上一轮的状态清干净
          st.current.moved = false
          dragging = false
          var el = ref.current
          if (!el || e.pointerType !== 'mouse') return
          if (e.button !== undefined && e.button !== 0) return
          if (el.scrollWidth <= el.clientWidth + 1) return // 没超宽：不接管，保持原生行为
          st.current.down = true
          st.current.x0 = e.clientX
          st.current.left0 = el.scrollLeft
          st.current.pid = e.pointerId
        },
        onPointerMove: function (e) {
          var el = ref.current
          if (!el || !st.current.down) return
          var dx = e.clientX - st.current.x0
          if (!st.current.moved) {
            if (Math.abs(dx) < DRAG_THRESHOLD_PX) return
            st.current.moved = true
            dragging = true
            if (el.classList) el.classList.add('qp-dragging')
            try { el.setPointerCapture(st.current.pid) } catch (err) { /* 捕获失败也能靠行内事件继续拖 */ }
          }
          el.scrollLeft = st.current.left0 - dx
          if (e.cancelable) e.preventDefault()
        },
        onPointerEnd: function () {
          st.current.down = false
          var el = ref.current
          if (el && el.classList) el.classList.remove('qp-dragging')
        },
        onClickCapture: function (e) {
          if (!st.current.moved) return
          // 这一下是「拖动结束」，不是点击：吞掉，别去追加提示词
          e.preventDefault()
          e.stopPropagation()
          st.current.moved = false
        },
      }
    }

    /**
     * 折叠三角：朝下 = 快捷条展开中（点它收起）；朝上 = 已收起（点它展开）。
     * 快捷条在输入框上方，所以用「上下」而不是「左右」表达方向。
     */
    function CollapseTriangle(props) {
      var d = props && props.up ? 'M2.2 7.9h7.6L6 3.6z' : 'M2.2 4.1h7.6L6 8.4z'
      return React.createElement('svg', {
        width: 9, height: 9, viewBox: '0 0 12 12', fill: 'currentColor', 'aria-hidden': true
      }, React.createElement('path', { d: d }))
    }

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

    /* 布局常量已在 CSS 之前声明（上面）。 */

    function clamp(v, min, max) {
      if (!isFinite(v)) return min
      return Math.max(min, Math.min(v, max))
    }

    /**
     * 量「上方那条快捷条」的横向范围。
     *
     * <用户> 2026-10-17 要求：弹层宽度 = 上方两行快捷条的宽度。
     * 但**不把 900 / 16 / 8 这类数值抄进代码** —— 条宽由宿主 CSS 变量算出来，
     * 所以先直接量条元素；条被收起（不渲染）时，沿按钮的祖先链读出 composer 的
     * CSS 变量，按**同一条公式**把宽度算出来（于是收起状态下弹层仍然是宽的）。
     *
     * @param el 触发按钮元素（条不存在时用它往上找 composer 容器）
     */
    function measureBarRect(el) {
      try {
        if (typeof document === 'undefined' || !document || typeof document.querySelector !== 'function') return null
        var bar = document.querySelector('.qp-bar')
        if (bar && typeof bar.getBoundingClientRect === 'function') {
          var r = bar.getBoundingClientRect()
          if (r && r.width > 0) return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }
        }
        return measureComposerRect(el)
      } catch (e) { /* 量不到就当没有条，走兜底 */ }
      return null
    }

    /**
     * 条被收起时的兜底：沿祖先链找到定义 composer 尺寸变量的容器，按与 .qp-bar 相同的公式算宽度。
     * 公式：min(容器宽 - 侧边留白×2 - dock 内缩×2, 卡片上限 - dock 内缩×2)
     */
    function measureComposerRect(el) {
      if (!el || typeof el.getBoundingClientRect !== 'function') return null
      if (typeof getComputedStyle !== 'function') return null
      // 自定义属性会**继承**：往上找「带这个变量的祖先」时，最窄的那个（比如按钮外层的 .qp-wrap）
      // 也会命中 —— 所以取这些祖先里**最宽**的一个当作 composer 容器。
      var node = el
      var best = null
      for (var depth = 0; depth < 8 && node; depth++) {
        node = node.parentElement
        if (!node) break
        var cs = getComputedStyle(node)
        var cardMax = parseFloat(cs.getPropertyValue('--dsh-composer-card-max-width'))
        if (!(cardMax > 0)) continue
        var hostW = node.clientWidth || 0
        if (!best || hostW > best.hostW) {
          best = {
            hostW: hostW,
            cardMax: cardMax,
            clearance: parseNum(cs.getPropertyValue('--dsh-composer-side-clearance'), DOCK_CLEARANCE),
            box: node.getBoundingClientRect(),
          }
        }
      }
      if (!best || !(best.hostW > 0)) return null
      // 与 .qp-bar 的 CSS 同一条公式：min(容器宽 - 侧边留白×2, 卡片上限)
      var width = Math.min(best.hostW - best.clearance * 2, best.cardMax)
      if (!(width > 0)) return null
      var left = best.box.left + Math.max(0, (best.hostW - width) / 2)
      return { left: left, right: left + width, top: best.box.top, bottom: best.box.bottom, width: width, height: 0, synthetic: true }
    }

    /** 解析 CSS 变量里的像素数；空值 / NaN 时用兜底值。 */
    function parseNum(raw, fallback) {
      var n = parseFloat(raw)
      return isFinite(n) && n >= 0 ? n : fallback
    }

    /**
     * 计算弹层的固定定位坐标与尺寸。
     *
     * 定位口径（<用户> 2026-10-17 定稿）：
     * - **宽度与左边界对齐上方快捷条**（同宽同起点），于是弹层看起来就是「快捷条上方那一块」；
     * - 默认开在**条的上方**（贴条顶，配合 transform: translateY(-100%)）；上方空间不够就改到条的**下方**；
     * - 左右按视口夹紧、高度按可用空间限制，保证窄窗口 / 桌面小窗都不会被推出可视区；
     * - 量不到条（被收起或未渲染）时退回「按钮锚定 + 兜底宽度」，行为与旧版一致。
     *
     * @param rect 触发按钮的 getBoundingClientRect()
     * @param viewport { width, height }
     * @param barRect 上方快捷条的 getBoundingClientRect()（可为 null）
     * @returns { x, y, w, up, maxHeight, minHeight }
     */
    function computePopPos(rect, viewport, barRect) {
      var vw = viewport && isFinite(viewport.width) && viewport.width > 0 ? viewport.width : 1200
      var vh = viewport && isFinite(viewport.height) && viewport.height > 0 ? viewport.height : 800
      var anchor = barRect || rect
      if (!anchor) return { x: POP_MARGIN, y: POP_MARGIN, w: POP_WIDTH, up: false, maxHeight: POP_MAX_HEIGHT, minHeight: 0 }

      var avail = vw - POP_MARGIN * 2
      var w = clamp(barRect && barRect.width > 0 ? Math.round(barRect.width) : POP_WIDTH, Math.min(POP_MIN_WIDTH, avail), avail)
      var x = clamp(anchor.left, POP_MARGIN, Math.max(POP_MARGIN, vw - w - POP_MARGIN))

      var roomAbove = anchor.top - POP_GAP - POP_MARGIN
      var roomBelow = vh - anchor.bottom - POP_GAP - POP_MARGIN
      var up = roomAbove >= roomBelow
      var room = Math.max(up ? roomAbove : roomBelow, 0)
      var maxHeight = clamp(Math.min(POP_MAX_HEIGHT, room > 0 ? room : POP_MAX_HEIGHT), POP_MIN_HEIGHT, POP_MAX_HEIGHT)
      // 「至少 10 行提示语」：内容不够也要占够高度（再留几个分类头的余量），但绝不超过可用空间
      var wanted = (MIN_VISIBLE_ROWS + HEADER_ROWS_ALLOWANCE) * ROW_H + POP_CHROME_EST
      var minHeight = clamp(Math.min(wanted, maxHeight), 0, maxHeight)
      var y = up ? anchor.top - POP_GAP : anchor.bottom + POP_GAP
      return { x: x, y: clamp(y, POP_MARGIN, Math.max(POP_MARGIN, vh - POP_MARGIN)), w: w, up: up, maxHeight: maxHeight, minHeight: minHeight }
    }

    /**
     * 按「字」截断标签（中文一字一算，代理对整体保留），超出补省略号。
     * <用户> 2026-10-17：分类名最多 4 字。
     */
    function truncateLabel(text, max) {
      var s = String(text === null || text === undefined ? '' : text).trim()
      var chars = typeof Array.from === 'function' ? Array.from(s) : s.split('')
      if (chars.length <= max) return s
      return chars.slice(0, max).join('') + '…'
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

    /* ---------------- 全局数据仓：首拉 + 可重拉，多组件共享，保存后广播 ---------------- */

    /** 刷新到期判断：lastSyncAt + REFRESH_INTERVAL_MS 之前才值得发请求（只作用于事件触发的 refresh）。 */
    var REFRESH_INTERVAL_MS = 60000
    /**
     * 常驻自动同步间隔（v0.7.11）：页面可见时每 2 秒探一次服务端，内容真的变了才落位。
     *
     * 为什么敢这么勤：走的还是 /api/quick-prompts（本地 20KB 级 JSON，无网络成本），
     * 而内容没变时 applyExternal 第一行就返回 —— 零通知、零渲染、零状态变更。
     *
     * 为什么必须常驻：原来只有四个刷新时机 —— 打开弹层、窗口重新获得焦点、
     * 页面重新可见、弹层开着时的 60 秒兜底。用户**坐在窗口里不动**、而数据由别处的
     * AI / 命令行 / 另一个窗口写入时，这四个时机一个都不触发，
     * 快捷条就一直显示旧数据，只能整页重载（而 DSH 菜单里并没有刷新入口）。
     *
     * <用户> 2026-10-17：「DSH的菜单没有刷新可用，插件也没有。你看一下插件如何做到
     * 提示语新增和修改后，即时展示出来。」
     */
    var AUTO_SYNC_MS = 2000

    /**
     * 数据指纹：把分类列表压成一个字符串，用来判断「服务端那份和内存这份一模一样」。
     * 数据没变时刷新不发通知、不产生多余渲染（要求 3）；比较的是内容而非引用。
     */
    function fingerprintCategories(categories) {
      try {
        return JSON.stringify(categories || [])
      } catch (e) {
        return null
      }
    }

    var store = {
      categories: null,
      subs: [],
      /** 外部数据变化通知的订阅者（与 subs 分开：它不触发宿主渲染）。 */
      flagSubs: [],
      loading: false,
      /**
       * 自动同步（v0.7.11 的 2 秒轮询）在飞标志。
       * **刻意与 loading 分开**：loading 同时是「保存前冲突探测」的忙判据（见 probeConflict），
       * 轮询若共用它，用户点保存撞上在飞的轮询就会跳过冲突探测，白丢一道保护。
       */
      autoSyncing: false,
      /**
       * 编辑锁：弹层进入「管理」编辑态时置位。置位期间**绝不替换 categories**——
       * 编辑行的 draft 是从 categories 快照出来的，脚下换数据会连带把用户正在
       * 输入的内容按旧数据重算/覆盖（要求 4，硬要求）。
       * 此时把刚拿到的 external 暂存进 pendingExternal，等退出编辑态再落位。
       */
      editLock: false,
      pendingExternal: null,
      /** 上次成功同步（GET 或保存）的时刻；-1 表示从未同步过。 */
      lastSyncAt: -1,
      notify: function () {
        var list = this.categories
        this.subs.slice().forEach(function (f) { f(list) })
      },
      emit: function () {
        this.notify()
      },
      /** 通知「外部数据暂存/落位」的订阅者；不递增 state，避免宿主无谓重渲染。 */
      notifyFlags: function () {
        var pending = this.pendingExternal
        this.flagSubs.slice().forEach(function (f) { f(pending) })
      },
      /** 进入/退出编辑锁。退出时若暂存了外部数据，交给调用方决定何时落位（见 flushExternal）。 */
      setEditLock: function (on) {
        this.editLock = on === true
        if (!this.editLock) this.notifyFlags()
      },
      subscribePending: function (fn) {
        var self = this
        this.flagSubs.push(fn)
        fn(self.pendingExternal)
        return function () {
          self.flagSubs = self.flagSubs.filter(function (f) { return f !== fn })
        }
      },
      /**
       * 取回外部暂存的数据（编辑结束后落位）。没有暂存时返回 false。
       * 只在**非编辑态**调用：此时用服务端那份整体替换，避免用旧的编辑基线覆盖新数据。
       */
      flushExternal: function () {
        if (this.pendingExternal === null) return false
        var next = this.pendingExternal
        this.pendingExternal = null
        this.categories = next
        this.lastSyncAt = Date.now()
        this.emit()
        this.notifyFlags()
        return true
      },
      /**
       * 首次加载：只在内存里还没有数据时拉一次。
       */
      load: function () {
        if (this.categories !== null || this.loading) return
        this.refresh()
      },
      /**
       * 「服务端那份」进来之后的统一落点（refresh 与 autoSync 共用）。
       *
       * **顺序是关键：先比指纹，再看编辑锁。**（v0.7.11 修正）
       * 反过来写的后果：编辑期间任何一次刷新——哪怕服务端一个字节都没变——都会被
       * 当成「外部数据变了」写进 pendingExternal，面板随即挂出
       * 「数据已在别处更新；你正在编辑，保存会覆盖那边的改动」的**假警报**。
       * 以前只在弹层打开时每 60 秒拉一次，假警报偶尔闪一下不容易被当回事；
       * 现在自动同步 2 秒一次，先比指纹就是必须的。
       *
       * @returns 是否真的发生了外部变化（调用方据此决定要不要写 lastSyncAt）
       */
      applyExternal: function (next) {
        if (fingerprintCategories(next) === fingerprintCategories(this.categories)) return false
        if (this.editLock) {
          // 编辑中：只暂存，绝不换掉脚下这份数据
          this.pendingExternal = next
          this.notifyFlags()
          return true
        }
        this.categories = next
        this.emit()
        return true
      },
      /**
       * 重新拉取服务端数据（不整页重载就能看到外部写入）。
       *
       * - 已有请求在飞 → 直接返回，**不重复发**（要求 3 的防抖）；
       * - `force` 为假且距上次同步不足 REFRESH_INTERVAL_MS → 跳过，避免频繁触发时打爆接口；
       * - 拉回内容与内存一致 → 不发通知，不产生多余渲染；
       * - 处于编辑锁 → 只把数据暂存成 pendingExternal（**不替换 categories**），
       *   等退出编辑态再落位，保护用户正在编辑的内容；
       * - 失败（网络/非 ok/解析失败）→ **静默降级**，继续用内存里那份，不把面板弄成错误态。
       * @param force 忽略时间窗口强制拉取（弹层打开等明确时机用）
       */
      refresh: function (force) {
        if (this.loading) return
        var now = Date.now()
        if (force !== true && this.lastSyncAt >= 0 && now - this.lastSyncAt < REFRESH_INTERVAL_MS) return
        this.loading = true
        var self = this
        fetch('/api/quick-prompts', { cache: 'no-store' })
          .then(function (r) { return r.json() })
          .then(function (data) {
            // 服务端答了就算是同步了一轮（无论内容变没变），进入节流窗口
            self.lastSyncAt = Date.now()
            self.loading = false
            if (!data || !data.ok) return
            self.applyExternal(Array.isArray(data.categories) ? data.categories : [])
          })
          .catch(function () {
            // 失败静默降级：不更新 lastSyncAt（下次触发可以立刻重试），继续用内存里那份
            self.loading = false
          })
      },
      /**
       * 自动同步（v0.7.11）：轮询服务端，**任何**写入者（另一个窗口 / 命令行 / 别处的 AI
       * 直接改 quick-prompts.json）落盘后，最长 2 秒自己出现在快捷条与弹层里 ——
       * 不需要手动刷新、不需要打开弹层、也不需要窗口重新获得焦点。
       *
       * 为什么单开一个函数而不复用 refresh：
       *  1. refresh 用 loading 当在飞标志，而 loading 也是 probeConflict 的忙判据（见上），
       *     2 秒一次的轮询共用它会挤掉保存前的冲突探测 —— 所以这里用独立的 autoSyncing；
       *  2. 轮询是「无事件也要跑」的常驻动作，不该被 REFRESH_INTERVAL_MS 那套
       *     「事件触发去重」的节流管；节流该由轮询间隔（AUTO_SYNC_MS）本身承担；
       *  3. 统一走 applyExternal：内容没变时零通知、零渲染。
       */
      autoSync: function () {
        if (this.loading || this.autoSyncing) return
        this.autoSyncing = true
        var self = this
        fetch('/api/quick-prompts', { cache: 'no-store' })
          .then(function (r) { return r.json() })
          .then(function (data) {
            self.autoSyncing = false
            if (!data || !data.ok) return
            if (self.applyExternal(Array.isArray(data.categories) ? data.categories : [])) {
              self.lastSyncAt = Date.now()
            }
          })
          .catch(function () { self.autoSyncing = false })
      },
      /**
       * 保存前探测冲突（v0.6.1）：拉一次服务端，判断「服务端那份」是否已不同于本次编辑的基线。
       *
       * 为什么需要它：保存是**整体替换**（全量 POST），若另一台设备在你编辑期间改过数据，
       * 直接保存会静默盖掉对方的改动。这里在保存前拦一道，把决定权交给用户。
       *
       * cb(err, conflict, latest)：
       * - err 非空 = 探测不了（请求在飞 / 网络 / 响应异常）——**不拦保存**，由调用方按兜底策略处理；
       * - conflict 为真表示服务端已变（latest 是服务端最新分类，供「载入最新」用）。
       */
      probeConflict: function (baseFingerprint, cb) {
        var self = this
        if (this.loading) { cb && cb('busy', false, null); return }
        this.loading = true
        fetch('/api/quick-prompts')
          .then(function (r) { return r.json() })
          .then(function (data) {
            self.loading = false
            self.lastSyncAt = Date.now()
            if (!data || !data.ok) { cb && cb('bad-response', false, null); return }
            var next = Array.isArray(data.categories) ? data.categories : []
            cb && cb(null, fingerprintCategories(next) !== baseFingerprint, next)
          })
          .catch(function (e) { self.loading = false; cb && cb(String((e && e.message) || e), false, null) })
      },
      /**
       * 采纳一份外部数据（冲突时用户选「载入最新」）：直接换内存里那份并作废暂存版本。
       * 不碰 draft —— 编辑行由组件自己按这份数据重建。
       */
      adoptExternal: function (next) {
        this.categories = Array.isArray(next) ? next : []
        this.pendingExternal = null
        this.lastSyncAt = Date.now()
        this.emit()
        this.notifyFlags()
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
              // 保存成功即等于完成一次全量同步：更新时刻，避免紧接着又白拉一次
              store.lastSyncAt = Date.now()
              // 保存结果就是权威数据，此前暂存的外部版本已被本次覆盖，作废
              store.pendingExternal = null
              store.emit()
              store.notifyFlags()
              cb && cb(null, store.categories)
            } else {
              cb && cb((data && data.error) || '保存失败')
            }
          })
          .catch(function (e) { cb && cb(String(e && e.message || e)) })
      },
    }

    /**
     * React hook：订阅全局快捷语仓。
     * 本地 state 直接存分类列表：刷新（refresh / flushExternal）与保存后 store 都换成
     * **新引用**再广播，React 的状态更新必然被接住；数据没变时 store 不发通知，
     * 因此不会产生多余渲染（要求 3）。
     */
    function useQuickCategories() {
      var s = React.useState(store.categories)
      var setCats = s[1]
      React.useEffect(function () {
        function listener(list) { setCats(list) }
        store.subs.push(listener)
        if (store.categories === null) store.load()
        else setCats(store.categories)
        startAutoSync()
        return function () {
          store.subs = store.subs.filter(function (f) { return f !== listener })
          stopAutoSync()
        }
      }, [])
      return s[0]
    }

    /* ---------------- 常驻自动同步看门狗（v0.7.11） ----------------
     *
     * 挂在 useQuickCategories 上而不是模块顶层：这个 hook 由快捷条与闪电笔座位共同调用
     * （任一存在即工作），组件卸载时引用计数归零就停表 —— 既不漏刷新，也不在宿主
     * 拆掉输入框之后留一个空转的定时器。
     * 只调 store.autoSync()：它自带在飞去重、独立标志、内容不变就零渲染。
     */
    var autoSyncRefs = 0
    var autoSyncTimer = null
    var autoSyncBound = false

    /** 页面不可见时不轮询（省电、省请求）；回到可见时由 visibilitychange 立刻补一次。 */
    function autoSyncTick() {
      if (typeof document !== 'undefined' && document && document.visibilityState === 'hidden') return
      store.autoSync()
    }
    function autoSyncOnWake() { autoSyncTick() }

    function startAutoSync() {
      autoSyncRefs++
      if (autoSyncRefs > 1) return
      if (typeof setInterval === 'function') autoSyncTimer = setInterval(autoSyncTick, AUTO_SYNC_MS)
      if (typeof window !== 'undefined' && window && typeof window.addEventListener === 'function') {
        window.addEventListener('focus', autoSyncOnWake)
      }
      if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') {
        document.addEventListener('visibilitychange', autoSyncOnWake)
      }
      autoSyncBound = true
      // 页面切回前台 / 窗口重新获得焦点时立刻补一次，不等下一个 2 秒；此刻不该再等 load
      autoSyncTick()
    }

    function stopAutoSync() {
      if (autoSyncRefs > 0) autoSyncRefs--
      if (autoSyncRefs > 0 || !autoSyncBound) return
      if (autoSyncTimer !== null) { clearInterval(autoSyncTimer); autoSyncTimer = null }
      if (typeof window !== 'undefined' && window && typeof window.removeEventListener === 'function') {
        window.removeEventListener('focus', autoSyncOnWake)
      }
      if (typeof document !== 'undefined' && document && typeof document.removeEventListener === 'function') {
        document.removeEventListener('visibilitychange', autoSyncOnWake)
      }
      autoSyncBound = false
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
     * <用户> 2026-10-16 拍板：autoSend 条目「点一下即发」→「长按 300ms 松手才发」（短按只填入）。
     * 自动发送条目（autoSend）：以该短语整体替换草稿后立即走官方 submit() 通道发送——
     * 避免把用户尚未写完的草稿一并误发出去。发送失败时内容仍保留在输入框。
     */
    function applyPrompt(inputActions, p, existing, forceSend) {
      if (!p || typeof p.text !== 'string' || p.text.length === 0) return false
      var send = p.autoSend === true && forceSend !== false
      if (!insertIntoInput(inputActions, p.text, send ? '' : existing)) return false
      if (send && inputActions && typeof inputActions.submit === 'function') {
        try { inputActions.submit() } catch (e) { /* 保持插入结果，由用户手动发送 */ }
      }
      return true
    }

    /**
     * 分类内重排提示语（纯函数）：把某分类的 prompts 第 from 个移到第 to 个，order 重写 1..N。
     *
     * <用户> 2026-10-17：拖拽放在**浏览态「一条一行」**上（不在编辑态），拖完立刻落盘。
     * 只在同一个分类内换位 —— 序号本来就是分类内的排序键；其他分类一个字节都不动。
     *
     * @returns 新的分类数组；无变化时返回原数组（同一引用，避免多余渲染 / 落盘）
     */
    function reorderPromptsInCategories(categories, catName, from, to) {
      var list = categories || []
      var name = normCatName(catName)
      var out = null
      list.forEach(function (c, idx) {
        if (out || normCatName(c && c.name) !== name) return
        var prompts = sortPrompts(c.prompts || [])
        var n = prompts.length
        if (n < 2) return
        var f = Math.max(0, Math.min(from, n - 1))
        var t = Math.max(0, Math.min(to, n - 1))
        if (f === t) return
        var seq = prompts.slice()
        var moved = seq.splice(f, 1)[0]
        seq.splice(t, 0, moved)
        out = list.slice()
        out[idx] = Object.assign({}, c, {
          prompts: seq.map(function (p, i) { return Object.assign({}, p, { order: i + 1 }) }),
        })
      })
      return out || list
    }

    /**
     * 分类重排（纯函数）：把 fromName 这个分类移到 toName 所在的**位置**。
     * 分类数组的顺序就是展示顺序（弹层与快捷条都按它排）。
     *
     * <用户> 2026-10-17：分类也要能拖；拖的时候把提示词收起来 → 只剩分类行，高度就够。
     *
     * @returns 新的分类数组；无变化时返回原数组
     */
    function reorderCategories(categories, fromName, toName) {
      var list = categories || []
      var from = -1
      var to = -1
      var fName = normCatName(fromName)
      var tName = normCatName(toName)
      list.forEach(function (c, i) {
        var n = normCatName(c && c.name)
        if (n === fName) from = i
        if (n === tName) to = i
      })
      if (from < 0 || to < 0 || from === to) return list
      var next = list.slice()
      var moved = next.splice(from, 1)[0]
      next.splice(to, 0, moved)
      return next
    }

    /**
     * 拖拽落点：给定各行矩形与指针 Y，算出「松手后这一行应该排到第几位」。
     * 纯函数（只吃 rects），便于用假矩形做回归测试。
     *
     * @param rects 依序排列的行矩形 [{top, height}]
     * @param clientY 指针 Y
     * @param from 被拖的行在序列里的位置
     * @returns 目标位置（0 .. rects.length-1）
     */
    function dropIndexFromRects(rects, clientY, from) {
      var n = (rects || []).length
      if (n === 0) return 0
      var insertAt = 0
      for (var k = 0; k < n; k++) {
        var r = rects[k]
        if (!r) continue
        if (clientY > r.top + (r.height || 0) / 2) insertAt++
      }
      // 与「先抽走被拖那行、再插入」等价
      var target = insertAt > from ? insertAt - 1 : insertAt
      if (target < 0) target = 0
      if (target > n - 1) target = n - 1
      return target
    }

    /**
     * 浏览态拖拽状态（整页同一时刻只有一处拖拽，故与 `dragging` / `hold` 一样放模块级）。
     * kind：'item' = 拖一条提示语（分类内排序）；'cat' = 拖一个分类（分类之间排序）。
     * from / to 都是**当前展示序列里的位置**。
     */
    var browseDrag = { kind: '', active: false, cat: '', cati: -1, from: -1, to: -1, startY: 0, justDragged: false }

    /** 拖动超过这个像素才算「在拖」，否则当作普通点击（点条目仍然是插入）。 */
    var ROW_DRAG_THRESHOLD_PX = 4

    /* ---------------- 长按才发送（v0.7.1）：autoSend 条目的防误触 ---------------- */

    /** 按住多久算「明确要发送」。 */
    var HOLD_MS = 300

    /**
     * 长按状态。同一时刻只可能有一个指针在按，所以模块级一份就够
     * （和拖动那套 `dragging` 同样的思路，避免在列表里给每一条都挂 hook）。
     */
    var hold = { timer: null, fired: false, down: false, viaPointer: false }

    function holdClear() {
      if (hold.timer) { clearTimeout(hold.timer); hold.timer = null }
    }

    function holdStart(onLong) {
      hold.down = true
      hold.fired = false
      hold.viaPointer = true
      holdClear()
      hold.timer = setTimeout(function () {
        hold.timer = null
        hold.fired = true
        onLong()
      }, HOLD_MS)
    }

    /** 松手：没到 300ms 就是短按（onShort）；按住期间已经触发过的就不再触发。 */
    function holdEnd(onShort) {
      if (!hold.down) return
      hold.down = false
      var fired = hold.fired
      hold.fired = false
      holdClear()
      if (!fired && typeof onShort === 'function') onShort()
      // click 在 pointerup 之后同步派发，这里等一拍再清掉「这轮来自指针」的标记
      setTimeout(function () { hold.viaPointer = false }, 0)
    }

    /**
     * 给一条快捷语造交互属性（快捷条 chip 与弹层条目共用）。
     *
     * - 普通条目：点击 / Enter = 追加（行为与以前一致）；
     * - autoSend 条目：**按住 300ms 松手才发送**；短按只追加；
     *   键盘走 Enter / 空格 = 明确发送（长按在键盘上不可行）；
     *   `onClick` 保留给键盘与读屏等**非指针来源**的点击（指针产生的 click 会被忽略，避免重复动作）；
     * - `dragged` 由调用方给：拖动查看后面内容那一下不算点击。
     *
     * @param p - 快捷语条目
     * @param run - function (send: boolean) 真正执行
     * @param dragged - 可选：返回 true 表示这一下其实是拖动
     */
    function promptInteraction(p, run, dragged) {
      var isDrag = function () { return typeof dragged === 'function' && dragged() === true }
      if (p.autoSend !== true) {
        return {
          onClick: function () { if (isDrag()) return; run(false) },
          onKeyDown: function (e) {
            if (!e || (e.key !== 'Enter' && e.key !== ' ')) return
            e.preventDefault()
            run(false)
          },
        }
      }
      return {
        onPointerDown: function () { holdStart(function () { run(true) }) },
        onPointerUp: function () { holdEnd(function () { if (!isDrag()) run(false) }) },
        onPointerCancel: function () { holdEnd() },
        onPointerLeave: function () { holdEnd() },
        onClick: function () {
          // 指针产生的 click 已经由上面处理过；这里只接键盘 / 读屏的「点击」= 明确发送
          if (hold.viaPointer) { hold.viaPointer = false; return }
          if (isDrag()) return
          run(true)
        },
        onKeyDown: function (e) {
          if (!e || (e.key !== 'Enter' && e.key !== ' ')) return
          e.preventDefault()
          run(true)
        },
      }
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

    /** 「＋ 新建分类…」在下拉里的哨兵值（真实分类名不会用到它）。 */
    var NEW_CAT = '__qp_new_cat__'

    /** 分类名归一：空名一律算「默认」（下拉、分组、保存三处口径一致）。 */
    function normCatName(value) {
      return String(value === null || value === undefined ? '' : value).trim() || '默认'
    }

    /**
     * 收集可选分类名（去重、按出现顺序）：已保存的分类 ∪ 草稿里出现过的分类名。
     * 编辑态草稿里新造的分类也要能选回自己；空名归到「默认」。
     *
     * @param catNames - 已保存的分类名列表。
     * @param draft - 当前编辑中的行（浏览态传 null）。
     * @returns {string[]}
     */
    function collectCatNames(catNames, draft) {
      var names = []
      function push(value) {
        var v = normCatName(value)
        if (names.indexOf(v) === -1) names.push(v)
      }
      ;(catNames || []).forEach(push)
      ;(draft || []).forEach(function (r) { push(r && r.cat) })
      return names
    }

    /**
     * 「新增」行的建议序号 = 该分类在当前草稿里的最大序号 + 1。
     * @param rows - 当前草稿行。
     * @param cat - 目标分类名（空名按「默认」算）。
     */
    function nextOrderFor(rows, cat) {
      var target = normCatName(cat)
      var max = 0
      ;(rows || []).forEach(function (r) {
        if (normCatName(r && r.cat) !== target) return
        if (!r || r.order === '' || r.order === null || r.order === undefined) return
        var n = Number(r.order)
        if (isFinite(n) && n > max) max = n
      })
      return max + 1
    }

    /**
     * 分类选择器的数据模型（纯函数，便于回归测试）。
     *
     * 可选分类 = 已保存的分类 ∪ 当前草稿里出现过的分类名（草稿里新造的分类也要能选回自己），
     * 去重后按出现顺序排列；空名一律归到「默认」。
     *
     * `isNew` 为真时渲染输入框（用户正在写新分类名），否则渲染下拉框。
     * 之所以改成下拉框：旧实现是 `input + datalist`，浏览器会按输入框的当前值过滤候选项，
     * 于是必须先删掉当前分类名才能看到别的分类 —— 这正是用户报的问题。
     *
     * @param catNames - 已保存的分类名列表。
     * @param draft - 当前编辑中的全部行。
     * @param row - 这一行的草稿对象（cat / catNew）。
     * @returns {{names: string[], current: string, isNew: boolean, value: string}}
     */
    function catPickerModel(catNames, draft, row) {
      var names = collectCatNames(catNames, draft)
      var cur = String((row && row.cat) || '').trim()
      var isNew = !!(row && row.catNew === true) || cur === ''
      return {
        names: names,
        current: cur,
        isNew: isNew,
        value: isNew ? NEW_CAT : (names.indexOf(cur) === -1 ? names[0] : cur),
      }
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
      var collapsed = useBarCollapsed()
      var inputActions = props.inputActions
      var currentDraft = useCurrentDraft(props)
      var cats = useQuickCategories()
      var activeState = React.useState(0)
      var active = activeState[0]
      var setActive = activeState[1]
      // 两行各自一份拖动状态（分类行、标题行）
      var catPan = createDragPan()
      var titlePan = createDragPan()

      // 收起时整块不渲染：手机/远程查看时完全让出高度（折叠开关在闪电笔右侧的三角上）
      if (collapsed) return null

      // 数据未加载或输入框动作缺失时才隐藏；空数据也常驻显示（空态提示）
      if (!inputActions || cats === null) return null
      var hasCats = cats.length > 0
      var idx = hasCats ? Math.max(0, Math.min(active, cats.length - 1)) : 0
      var cur = hasCats ? cats[idx] : null

      return React.createElement('div', { className: 'qp-bar' },
        React.createElement('div', {
          className: 'qp-bar-row',
          ref: catPan.ref,
          onPointerDown: catPan.onPointerDown,
          onPointerMove: catPan.onPointerMove,
          onPointerUp: catPan.onPointerEnd,
          onPointerCancel: catPan.onPointerEnd,
          onClickCapture: catPan.onClickCapture,
        },
          // <用户> 2026-10-17：去掉最左边的「快捷语」标签与下面的竖线，把这段空位让给分类和提示语
          hasCats ? cats.map(function (c, i) {
            return React.createElement('button', {
              type: 'button',
              key: c.id || i,
              className: i === idx ? 'qp-cat qp-cat-on' : 'qp-cat',
              // 拖动划线经过时不要顺手把分类切走（切了也看不见，还闪）
              onMouseEnter: function () { if (dragging) return; setActive(i) },
              onClick: function () { setActive(i) },
            }, c.name || '默认',
            React.createElement('span', { className: 'qp-cat-count' }, String((c.prompts || []).length)))
          }) : null
        ),
        React.createElement('div', {
          className: 'qp-titles',
          ref: titlePan.ref,
          onPointerDown: titlePan.onPointerDown,
          onPointerMove: titlePan.onPointerMove,
          onPointerUp: titlePan.onPointerEnd,
          onPointerCancel: titlePan.onPointerEnd,
          onClickCapture: titlePan.onClickCapture,
        },
          !hasCats
            ? React.createElement('span', { className: 'qp-tchip-empty' }, '暂无快捷语：点输入框工具行的闪电笔图标可录入或导入 MD')
            : (cur.prompts || []).length === 0
              ? React.createElement('span', { className: 'qp-tchip-empty' }, '（该分类暂无快捷语）')
              : sortPrompts(cur.prompts).map(function (p, j) {
                return React.createElement('button', Object.assign({
                  type: 'button',
                  key: p.id || j,
                  className: 'qp-tchip' + (p.autoSend ? ' qp-tchip-send' : ''),
                  title: (p.autoSend ? '直接发送（按住 300ms 才发，短按只填入）：' : '') + (p.text || p.title || ''),
                }, promptInteraction(p, function (send) {
                  applyPrompt(inputActions, p, resolveDraft(props, currentDraft), send)
                }, function () { return dragging })),
                // <用户> 2026-10-17：条上不再画回车图标 —— 用「回车的那个蓝色」直接落在短语上表示「直接发送」，
                // 于是这一格把图标的宽度也让给了文字（面板里的 UI 不动）。
                React.createElement('span', { className: 'qp-title-wrap' }, p.title || '(无标题)'))
              })
        )
      )
    }

    /* ---------------- 闪电笔按钮 + 管理/导入弹层（conversation.input.left） ---------------- */

    function QuickPromptSeat(props) {
      var inputActions = props.inputActions
      var sessionId = props.sessionId
      var collapsed = useBarCollapsed()
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
      /** 编辑期间外部数据变过（已暂存在 store.pendingExternal）：编辑结束前只提示，不换数据。 */
      var externState = React.useState(false)
      var pendingExtern = externState[0]
      var setPendingExtern = externState[1]
      /**
       * 顶部「分类」下拉的目标分类（v0.6.0）：
       * 浏览态 = 「新增」把新条目放进哪个分类；编辑态 = 当前编辑的分类（列表只显示它的行）。
       * 失效（被删/改名）时不写 state，渲染期回落到第一个分类（见 scopeCat）。
       */
      var targetCatState = React.useState('')
      var targetCat = targetCatState[0]
      var setTargetCat = targetCatState[1]
      /**
       * 保存前冲突（v0.6.1）：{ latest: 分类数组|null, reason: 'changed'|'unknown' } 或 null。
       * 非空时**不落盘**，改成一屏提示，由用户选「覆盖保存」还是「载入最新」。
       */
      var conflictState = React.useState(null)
      var conflict = conflictState[0]
      var setConflict = conflictState[1]
      /** 浏览态搜索框（v0.7.0）：按标题 / 内容即时过滤，不看分类。 */
      var queryState = React.useState('')
      var query = queryState[0]
      var setQuery = queryState[1]
      /** 「⋯ 分类操作」菜单是否展开（重命名分类 / 删除整个分类）。 */
      var catMenuState = React.useState(false)
      var catMenu = catMenuState[0]
      var setCatMenu = catMenuState[1]
      /** 分类重命名：null = 不在改名；字符串 = 正在改名，内容是输入框里的草稿。 */
      var renameState = React.useState(null)
      var renaming = renameState[0]
      var setRenaming = renameState[1]
      /** 编辑范围显式开关：false = 只看当前分类（默认），true = 显示全部条目。 */
      var showAllState = React.useState(false)
      var showAll = showAllState[0]
      var setShowAll = showAllState[1]
      /**
       * 拖拽排序的渲染态（v0.7.4）：{ cati, from, to }；null = 没在拖。
       * 只在落点变化时才 setState，避免每次 pointermove 都重渲染。
       */
      var dragState = React.useState(null)
      var drag = dragState[0]
      var setDrag = dragState[1]
      /**
       * 「已按下、可能拖」：模块级 browseDrag 负责真相，这个布尔只为**在按下时就挂上 document 监听**。
       * 不能在第一次 pointermove 里再 setDrag —— 那时还没有监听器，等于自己把自己锁死。
       */
      var armedState = React.useState(false)
      var dragArmed = armedState[0]
      var setDragArmed = armedState[1]
      var btnRef = React.useRef(null)
      var fileRef = React.useRef(null)
      /** 弹层根节点：打开时接一次焦点（键盘可达性，Esc 也能被接住）。 */
      var popRef = React.useRef(null)
      /** 撤销 / 重做栈：栈底 = 进编辑态那份，之后每次编辑压一份 draft 快照。 */
      var historyRef = React.useRef({ stack: [], index: -1 })
      /** 本次编辑的基线指纹（进编辑态时的 categories）：保存前用它判断服务端有没有被别处改过。 */
      var baseFpRef = React.useRef(null)
      /** 刚「新增」的那一行在 draft 里的下标；渲染后滚进视野并聚焦标题（-1 = 不用处理）。 */
      var newlyAddedRef = React.useRef(-1)
      /** 弹层是否展开：供 focus/visibility 刷新回调判断「是否需要提示用户」。 */
      var openRef = React.useRef(false)
      /** 编辑态镜像：供回调（非渲染期）判断该刷新还是该只提示。 */
      var editingRef = React.useRef(false)

      /**
       * 顶部下拉里可选的分类：浏览态取已保存分类；编辑态再并上草稿里新造的分类名。
       * 目标分类失效（被删/改名）时回落到第一个分类，保证下拉永远有有效值、新增永远有落点。
       */
      var headCats = collectCatNames((cats || []).map(function (c) { return c.name }), editing ? draft : null)
      var scopeCat = headCats.indexOf(targetCat) !== -1 ? targetCat : (headCats[0] || '默认')
      /**
       * 编辑态可见的行：
       * - `showAll` 打开时 = 全部条目；
       * - 否则 = 目标分类的行 + 正在新建分类的行（catNew）+ 已勾选待批量的行。
       * 行被改到别的分类时**视图跟着切到那个分类**（见各行/批量的处理），所以这里不需要
       * 「把改走的行留在原分类视图里」这种粘性标记 —— 那会让它在每个分类下都出现，反倒更乱。
       * 只影响「看得见哪些行」；draft 始终是**全量**快照，保存不会丢别的分类。
       */
      var editRows = draft
        .map(function (r, i) { return { row: r, index: i } })
        .filter(function (x) {
          if (showAll) return true
          return normCatName(x.row.cat) === scopeCat || x.row.catNew === true || x.row.picked === true
        })
      /** 每个分类的条目数（编辑态按草稿算，已标记删除的不算），供下拉里显示「名称（N）」。 */
      var countByName = {}
      if (editing) {
        draft.forEach(function (r) {
          if (!r || r.deleted === true) return
          if (!String(r.title || '').trim() && !String(r.text || '').trim() && !r.id) return
          var n = normCatName(r.cat)
          countByName[n] = (countByName[n] || 0) + 1
        })
      } else {
        ;(cats || []).forEach(function (c) { countByName[normCatName(c.name)] = (c.prompts || []).length })
      }
      /** 勾选待批量的行（按 draft 下标）。 */
      var picked = []
      draft.forEach(function (r, i) { if (r && r.picked === true) picked.push(i) })
      var hist = historyRef.current
      var canUndo = hist.index > 0
      var canRedo = hist.index < hist.stack.length - 1
      /** 浏览态搜索关键词（大小写不敏感）。 */
      var q = String(query || '').trim().toLowerCase()
      function matchesQuery(p) {
        if (!q) return true
        return String((p && p.title) || '').toLowerCase().indexOf(q) >= 0 || String((p && p.text) || '').toLowerCase().indexOf(q) >= 0
      }
      /** 浏览态要展示的分类（搜索时只留有命中的）；渲染与拖拽落点都用这一份口径。 */
      function visibleCats() {
        return (cats || [])
          .map(function (c) {
            return { cat: c, list: sortPrompts(c.prompts || []).filter(matchesQuery) }
          })
          .filter(function (x) { return !q || x.list.length > 0 })
      }
      /* ---------------- 浏览态「一条一行」直接拖拽排序（v0.7.4） ---------------- */

      /**
       * <用户> 2026-10-17：拖拽要能**在一条一行的展示态**直接用 ——
       * 为改一条顺序进编辑态、每行占三行不值当。于是：
       * 浏览态按住条目上下拖 = 立刻改这个分类的序号并落盘；单击仍是「插入到输入框」。
       */
      function browseItemRects(cati) {
        if (typeof document === 'undefined' || !document || typeof document.querySelectorAll !== 'function') return []
        var els = document.querySelectorAll('.qp-item[data-cati="' + cati + '"]')
        var out = []
        for (var k = 0; k < els.length; k++) {
          var el = els[k]
          if (!el || typeof el.getBoundingClientRect !== 'function') continue
          var r = el.getBoundingClientRect()
          out.push({ top: r.top, height: r.height })
        }
        return out
      }

      /** 分类头的矩形（拖分类时用；拖分类会把提示词收起来，所以只有分类行参与落点计算）。 */
      function browseCatRects() {
        if (typeof document === 'undefined' || !document || typeof document.querySelectorAll !== 'function') return []
        var els = document.querySelectorAll('.qp-cat-head[data-cati]')
        var out = []
        for (var k = 0; k < els.length; k++) {
          var el = els[k]
          if (!el || typeof el.getBoundingClientRect !== 'function') continue
          var r = el.getBoundingClientRect()
          out.push({ top: r.top, height: r.height })
        }
        return out
      }

      function onItemDown(e, cati, catName, pos) {
        if (!e || (e.button !== undefined && e.button !== 0)) return
        browseDrag.kind = 'item'
        browseDrag.active = false
        browseDrag.cati = cati
        browseDrag.cat = catName
        browseDrag.from = pos
        browseDrag.to = pos
        browseDrag.startY = e.clientY
        setDragArmed(true)          // 按下即武装：这一帧就把 document 监听挂上
      }

      /** 分类头按下：拖分类（拖动中会把提示词收起来，只剩分类行）。 */
      function onCatDown(e, cati) {
        if (!e || (e.button !== undefined && e.button !== 0)) return
        browseDrag.kind = 'cat'
        browseDrag.active = false
        browseDrag.cati = cati
        browseDrag.cat = ''
        browseDrag.from = cati
        browseDrag.to = cati
        browseDrag.startY = e.clientY
        setDragArmed(true)
      }

      function onItemMove(e) {
        if (!e || browseDrag.from < 0 || !browseDrag.kind) return
        if (!browseDrag.active) {
          if (Math.abs(e.clientY - browseDrag.startY) < ROW_DRAG_THRESHOLD_PX) return
          browseDrag.active = true
          // 一旦开始拖，就不是「长按」了：撤掉长按计时，松手也不会变成发送 / 填入
          holdClear()
          hold.down = false
        }
        var isCat = browseDrag.kind === 'cat'
        var rects = isCat ? browseCatRects() : browseItemRects(browseDrag.cati)
        var to = rects.length ? dropIndexFromRects(rects, e.clientY, browseDrag.from) : browseDrag.from
        browseDrag.to = to
        if (!drag || drag.to !== to || drag.kind !== browseDrag.kind) {
          setDrag({ kind: browseDrag.kind, cati: browseDrag.cati, from: browseDrag.from, to: to })
        }
      }

      function onItemUp() {
        var moved = browseDrag.active
        var kind = browseDrag.kind
        var cat = browseDrag.cat
        var from = browseDrag.from
        var to = browseDrag.to
        var overCat = kind === 'cat' ? shownCatName(to) : ''
        browseDrag.active = false
        browseDrag.kind = ''
        browseDrag.from = -1
        browseDrag.to = -1
        browseDrag.cati = -1
        // 拖过的那一下，随后的 click 不算「点条目插入」（click 在 pointerup 之后同步派发，等一拍再复位）
        browseDrag.justDragged = moved
        if (moved) setTimeout(function () { browseDrag.justDragged = false }, 0)
        setDrag(null)
        setDragArmed(false)
        if (!moved || from < 0) return
        if (kind === 'cat') {
          if (overCat && overCat !== cat) commitCategoryReorder(overCat, from, to)
          return
        }
        if (from !== to) commitBrowseReorder(cat, from, to)
      }

      function onItemCancel() {
        browseDrag.active = false
        browseDrag.kind = ''
        browseDrag.from = -1
        browseDrag.to = -1
        browseDrag.cati = -1
        setDrag(null)
        setDragArmed(false)
      }

      /** 当前展示序列里第 pos 个分类的名字（落点 → 目标分类）。 */
      function shownCatName(pos) {
        var list = visibleCats()
        var item = list[Math.max(0, Math.min(pos, list.length - 1))]
        return item ? (item.cat.name || '默认') : ''
      }

      /**
       * 落盘新的分类顺序：先探一次冲突（别静默盖掉另一台设备的改动）→ 再保存。
       */
      function commitCategoryReorder(toName, from, to) {
        var base = cats || []
        var next = reorderCategories(base, shownCatName(from), toName)
        if (next === base) return
        setError(null)
        setInfo(null)
        store.probeConflict(fingerprintCategories(base), function (err, changed) {
          if (changed) {
            store.refresh(true)
            setInfo('数据已在别处更新，已为你刷新；请再拖一次')
            return
          }
          store.save(next, function (saveErr) {
            if (saveErr) { setError(String(saveErr)); return }
            setInfo('已保存分类新顺序：' + truncateLabel(shownCatName(from), 4) + ' → 第 ' + (to + 1) + ' 位')
          })
        })
      }

      /**
       * 落盘新顺序：先探一次冲突（别静默丢掉另一台设备的改动）→ 再保存。
       * 失败只提示，不改内存里那份（下次打开还能看到原样）。
       */
      function commitBrowseReorder(catName, from, to) {
        var base = cats || []
        var next = reorderPromptsInCategories(base, catName, from, to)
        if (next === base) return
        setError(null)
        setInfo(null)
        store.probeConflict(fingerprintCategories(base), function (err, changed) {
          if (changed) {
            store.refresh(true)
            setInfo('数据已在别处更新，已为你刷新；请再拖一次')
            return
          }
          store.save(next, function (saveErr) {
            if (saveErr) { setError(String(saveErr)); return }
            setInfo('已保存新顺序：' + truncateLabel(catName, 4) + ' 第 ' + (to + 1) + ' 条')
          })
        })
      }

      /** 拖拽期间的指针事件挂 document（不依赖被拖节点还在不在），按下即武装、松手即卸下。 */
      React.useEffect(function () {
        if (!dragArmed) return
        if (typeof document === 'undefined' || !document || typeof document.addEventListener !== 'function') return
        function onMove(e) { onItemMove(e) }
        function onUp() { onItemUp() }
        function onCancel() { onItemCancel() }
        document.addEventListener('pointermove', onMove)
        document.addEventListener('pointerup', onUp)
        document.addEventListener('pointercancel', onCancel)
        return function () {
          document.removeEventListener('pointermove', onMove)
          document.removeEventListener('pointerup', onUp)
          document.removeEventListener('pointercancel', onCancel)
        }
      }, [dragArmed])

      function close() {
        setOpen(false)
        openRef.current = false
        setEditing(false)
        editingRef.current = false
        store.setEditLock(false)
        setError(null)
        setInfo(null)
        setConflict(null)
        setCatMenu(false)
        setRenaming(null)
        setQuery('')
        resetHistory(null)
      }

      /* ---------------- 编辑历史：撤销 / 重做（v0.7.0） ---------------- */

      /** 撤销栈上限：够回退一段编辑，又不会把内存拖大。 */
      var HISTORY_MAX = 50

      /** 记录一次编辑（draft 快照入栈）；redo 分支在压栈时丢弃。 */
      function pushHistory(rows) {
        var h = historyRef.current
        h.stack = h.stack.slice(0, h.index + 1)
        h.stack.push(rows)
        if (h.stack.length > HISTORY_MAX) h.stack.shift()
        h.index = h.stack.length - 1
      }

      /** 重置历史：进编辑态时用当前 draft 打底，退出时清空。 */
      function resetHistory(rows) {
        historyRef.current = rows ? { stack: [rows], index: 0 } : { stack: [], index: -1 }
      }

      /** 所有「用户改动了编辑行」的入口都走这里：先入栈再落地。 */
      function setDraftTracked(rows) {
        pushHistory(rows)
        setDraft(rows)
      }

      /** 撤销 / 重做：只换 draft，本身不再入栈（否则撤销会把栈撑爆）。 */
      function undoEdit() {
        var h = historyRef.current
        if (h.index <= 0) return
        h.index -= 1
        setDraft(h.stack[h.index])
      }

      function redoEdit() {
        var h = historyRef.current
        if (h.index >= h.stack.length - 1) return
        h.index += 1
        setDraft(h.stack[h.index])
      }

      /** 上一个 / 下一个分类（顶部 ‹ › 用，循环）。 */
      function stepCat(delta) {
        if (headCats.length < 2) return
        var i = headCats.indexOf(scopeCat)
        if (i < 0) i = 0
        setTargetCat(headCats[(i + delta + headCats.length) % headCats.length])
      }

      /** 把当前分类整体改名（草稿里该分类的所有行一起改），改完成为新的编辑对象。 */
      function confirmRename() {
        var next = String(renaming || '').trim()
        setRenaming(null)
        if (!next || next === scopeCat) return
        var rows = draft.map(function (r) {
          if (normCatName(r.cat) !== scopeCat) return r
          return Object.assign({}, r, { cat: next, catNew: false })
        })
        setDraftTracked(rows)
        setTargetCat(next)
        setInfo('已把分类「' + scopeCat + '」改名为「' + next + '」，点「保存」生效')
      }

      /**
       * 删除整个分类：把该分类的行**逐条标记为待删除**（沿用「可撤销」的路子），
       * 而不是直接抹掉 —— 保存前每一条都能「恢复」。
       */
      function deleteScope() {
        var n = 0
        var rows = draft.map(function (r) {
          if (normCatName(r.cat) !== scopeCat) return r
          n++
          return Object.assign({}, r, { deleted: true })
        })
        if (n === 0) { setInfo('分类「' + scopeCat + '」里没有条目'); return }
        setDraftTracked(rows)
        setInfo('已把分类「' + scopeCat + '」的 ' + n + ' 条标记为待删除（保存前都能「恢复」）')
      }

      /* ---------------- 批量操作（v0.7.0）：勾选后统一改分类 / 删除 ---------------- */

      /** 勾选 / 取消勾选一行。 */
      function togglePick(i) { patchRow(i, { picked: !(draft[i] && draft[i].picked === true) }) }

      /** 全选当前可见的行（受「只看本分类 / 显示全部」影响）。 */
      function pickVisible() {
        var want = {}
        editRows.forEach(function (x) { want[x.index] = true })
        setDraftTracked(draft.map(function (r, i) { return want[i] ? Object.assign({}, r, { picked: true }) : r }))
      }

      /** 清空勾选。 */
      function clearPicks() {
        if (picked.length === 0) return
        setDraftTracked(draft.map(function (r) { return r.picked === true ? Object.assign({}, r, { picked: false }) : r }))
      }

      /** 把勾选的条目移到指定分类：视图跟着切过去（在那里继续编辑），保存前都可撤销。 */
      function bulkMove(to) {
        var target = String(to || '').trim()
        if (!target || picked.length === 0) return
        var set = {}
        picked.forEach(function (i) { set[i] = true })
        setDraftTracked(draft.map(function (r, i) {
          return set[i] ? Object.assign({}, r, { cat: target, catNew: false, picked: false }) : r
        }))
        setTargetCat(target)
        setInfo('已把 ' + picked.length + ' 条移到分类「' + target + '」，点「保存」生效')
      }

      /** 批量删除：与单条删除同口径 —— 先标记，保存时才真的删。 */
      function bulkDelete() {
        if (picked.length === 0) return
        var set = {}
        picked.forEach(function (i) { set[i] = true })
        var n = picked.length
        setDraftTracked(draft.map(function (r, i) {
          return set[i] ? Object.assign({}, r, { deleted: true, picked: false }) : r
        }))
        setInfo('已把选中的 ' + n + ' 条标记为待删除（保存前都能「恢复」）')
      }

      function onToggle() {
        if (open) { close(); return }
        var el = btnRef.current
        var rect = el && typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null
        setPos(computePopPos(rect, {
          width: typeof window !== 'undefined' ? window.innerWidth : 1200,
          height: typeof window !== 'undefined' ? window.innerHeight : 800,
        }, measureBarRect(el)))
        setError(null)
        setInfo(null)
        setOpen(true)
        openRef.current = true
        // 打开弹层时主动重拉一次：外部（API / 另一个窗口）刚写入的分类与条目立刻可见。
        // 关键：此时**还没有**编辑锁（startEdit 才上锁），所以这一步是真刷新。
        store.refresh(true)
      }

      function insertAndClose(p, send) {
        if (applyPrompt(inputActions, p, resolveDraft(props, currentDraft), send)) close()
      }

      /** 把分类结构拍平成编辑行（序号按当前展示顺序预填 1..N，用户可改）。 */
      function rowsOf(list) {
        var rows = []
        ;(list || []).forEach(function (c) {
          sortPrompts(c.prompts || []).forEach(function (p, i) {
            rows.push({ id: p.id || '', cat: c.name || '', title: p.title || '', text: p.text || '', autoSend: p.autoSend === true, order: i + 1 })
          })
        })
        return rows
      }

      function buildRows() { return rowsOf(cats) }

      /**
       * 进入编辑态。draft 是从此刻的 categories 快照出来的，这期间任何外部数据都只能暂存，
       * 绝不能在脚下替换数据或覆盖 draft（要求 4）。
       * 同时记下这份快照的指纹：保存前拿它和服务端比对，判断有没有被别处改过。
       */
      function beginEdit(rows) {
        setDraft(rows)
        resetHistory(rows)
        setError(null)
        setInfo(null)
        setConflict(null)
        setCatMenu(false)
        setRenaming(null)
        setShowAll(false)
        setQuery('')
        setEditing(true)
        editingRef.current = true
        baseFpRef.current = fingerprintCategories(cats || [])
        store.setEditLock(true)
      }

      /** 「修改」：编辑顶部选中的分类（列表只显示该分类的行；其他分类保存时原样保留）。 */
      function startEdit() { beginEdit(buildRows()) }

      /** 「新增」：进编辑态并在选中的分类末尾补一行空行（序号 = 该分类最大序号 + 1）。 */
      function startNew() {
        var rows = buildRows()
        rows.push({ id: '', cat: scopeCat, title: '', text: '', autoSend: false, order: nextOrderFor(rows, scopeCat) })
        newlyAddedRef.current = rows.length - 1
        beginEdit(rows)
      }

      function cancelEdit() {
        setEditing(false)
        editingRef.current = false
        setDraft([])
        resetHistory(null)
        setInfo(null)
        setConflict(null)
        setCatMenu(false)
        setRenaming(null)
        setShowAll(false)
        store.setEditLock(false)
        // 退出编辑态：把编辑期间暂存的外部数据落位，用户下次看到的就是最新数据
        var applied = store.flushExternal()
        if (applied) setPendingExtern(false)
      }

      /** 编辑态「新增」：在顶部选中的分类末尾再补一行（序号 = 该分类现有最大序号 + 1）。 */
      function newRow() {
        newlyAddedRef.current = draft.length
        setDraftTracked(draft.concat([{ id: '', cat: scopeCat, title: '', text: '', autoSend: false, order: nextOrderFor(draft, scopeCat) }]))
      }

      /**
       * 删除（v0.6.1 可撤销）：
       * <用户> 2026-10-16 拍板：点「删除」立即消失 → 先标记为待删除（变灰可「恢复」），点「保存」才真正落盘。
       * - 空行（没有标题/内容/ID）→ 直接移除，没什么可丢的；
       * - 有内容的行 → 只打 `deleted` 标记，行留在原位变灰，可点「恢复」，**保存时才真正落盘**。
       * 这样手滑点错不会连带丢掉别处的编辑（旧的「取消」是唯一退路，会一起丢）。
       */
      function removeRowOrMark(i) {
        var r = draft[i]
        var empty = !r || (!String(r.title || '').trim() && !String(r.text || '').trim() && !r.id)
        if (empty) removeRow(i)
        else patchRow(i, { deleted: true })
      }

      /**
       * 「重载界面」（v0.7.11）：DSH 的菜单里没有刷新入口，插件原来也没有 ——
       * 提示语数据的更新已经由自动同步接管（最长 2 秒自己出现，不用刷），
       * 但**插件代码本身**更新后仍必须整页重载才会生效，所以补一个入口，省得去找 Ctrl+R。
       * 编辑中/保存中不给点：重载会丢掉还没保存的编辑行。
       */
      function reloadUi() {
        if (typeof location !== 'undefined' && location && typeof location.reload === 'function') {
          location.reload()
        }
      }

      /**
       * 顶部「MD 管理」下拉：选哪项就执行哪个动作。
       * 下拉的值恒为空（停留在「MD 管理」这一项）—— 手动清一次 DOM 值，免得没触发重渲染时留在选中项上。
       */
      function onMdAction(e) {
        var v = e && e.target ? e.target.value : ''
        if (e && e.target) e.target.value = ''
        if (v === 'import') { if (fileRef.current) fileRef.current.click(); return }
        if (v === 'export') { exportMd(); return }
        if (v === 'copy') { copyMd(); return }
        if (v === 'reload') reloadUi()
      }

      function patchRow(i, patch) {
        var next = draft.slice()
        next[i] = Object.assign({}, next[i], patch)
        setDraftTracked(next)
      }

      function updateRow(i, field, value) {
        var patch = {}
        patch[field] = value
        patchRow(i, patch)
      }

      function removeRow(i) {
        setDraftTracked(draft.filter(function (_, idx) { return idx !== i }))
      }

      /**
       * 把编辑行按分类名重新归组为分类结构。
       * `deleted: true` 的行（v0.6.1 的「先标记、可恢复」）在这里被丢掉 —— 也只有到这一步才真的删掉。
       */
      function regroup(rows) {
        var order = []
        var byName = {}
        rows.forEach(function (r) {
          if (r.deleted === true) return
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

      /** 真正落盘（冲突已确认或无需确认时才会走到这里）。 */
      function doSave() {
        setSaving(true)
        store.save(regroup(draft), function (err) {
          setSaving(false)
          if (!err) {
            setEditing(false)
            editingRef.current = false
            setDraft([])
            resetHistory(null)
            setInfo(null)
            setConflict(null)
            setPendingExtern(false)
            setCatMenu(false)
            setRenaming(null)
            setShowAll(false)
            store.setEditLock(false)
          } else setError(err)
        })
      }

      /**
       * 「保存」（v0.6.1）：先探一次冲突，再落盘。
       * 保存是整体替换，若期间别处（另一台设备 / API）改过数据，直接保存会静默盖掉对方 —— 
       * 这里改成先弹一屏提示让用户选「覆盖保存」还是「载入最新」。
       * 探测本身失败（网络、请求在飞）**不拦保存**：能保存就让它保存，别把用户挡在门外；
       * 但若此前已经收到过「外部数据更新」的信号（pendingExtern），仍然拦一次更稳妥。
       */
      function save() {
        var base = baseFpRef.current
        setConflict(null)
        // 没有基线（理论上不会发生：beginEdit 一定会记）时不做比对，直接保存
        if (base === null || base === undefined) { doSave(); return }
        setSaving(true)
        store.probeConflict(base, function (err, changed, latest) {
          setSaving(false)
          if (changed) { setConflict({ latest: latest, reason: 'changed' }); return }
          if (err && pendingExtern) { setConflict({ latest: null, reason: 'unknown' }); return }
          doSave()
        })
      }

      /** 冲突提示里的「覆盖保存」：确认以本次编辑覆盖服务端那份。 */
      function saveOverride() {
        setConflict(null)
        doSave()
      }

      /**
       * 冲突提示里的「载入最新」：放弃本次编辑的改动，改为基于服务端最新那份重建编辑行
       * （停留在编辑态，用户可以直接在最新数据上继续改）。
       */
      function adoptLatest() {
        var latest = conflict && conflict.latest
        if (!latest) { setConflict(null); return }
        var rows = rowsOf(latest)
        setDraftTracked(rows)
        baseFpRef.current = fingerprintCategories(latest)
        store.adoptExternal(latest)
        setConflict(null)
        setPendingExtern(false)
        setInfo('已载入最新数据；你刚才的改动已放弃')
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
            setDraftTracked(rows)
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

      /**
       * v0.7.11：这里原来还挂着一套「窗口聚焦 / 页面可见 / 弹层开着时 60s 兜底」的刷新定时器。
       * 现在统一交给 useQuickCategories 里的常驻自动同步看门狗（AUTO_SYNC_MS=2s，页面可见时轮询，
       * 回到可见/重新聚焦时立刻补一次）—— 一处机制、一份定时器，避免同一件事被两处各拉一次。
       * 弹层打开时 onToggle 里仍会强制拉一次（那是「用户明确要求看最新」的时机）。
       */

      /**
       * 编辑中收到外部数据时只显示提示（要求 4）：数据由 store 暂存，draft 原样保留；
       * 提示文案明确告诉用户「保存会覆盖」的后果，把决定权交还给用户。
       */
      React.useEffect(function () {
        return store.subscribePending(function (pending) { setPendingExtern(pending !== null) })
      }, [])

      /**
       * 键盘可达性（v0.6.1）：弹层打开时接一次焦点（Tab 能进面板），Esc 关掉。
       * Esc 分三层，避免误丢数据：先撤冲突提示 → 编辑态等同「取消」（回浏览态，面板不关）→ 否则关面板。
       */
      React.useEffect(function () {
        if (!open) return
        var pop = popRef.current
        if (pop && typeof pop.focus === 'function') { try { pop.focus() } catch (e) { /* 聚焦失败不影响功能 */ } }
        function onKey(e) {
          if (!e) return
          var mod = e.ctrlKey === true || e.metaKey === true
          // Ctrl/⌘ + Z 撤销、+Shift 或 +Y 重做（只在编辑态）
          if (mod && editingRef.current && (e.key === 'z' || e.key === 'Z' || e.key === 'y' || e.key === 'Y')) {
            e.preventDefault()
            if (e.key === 'y' || e.key === 'Y' || e.shiftKey === true) redoEdit()
            else undoEdit()
            return
          }
          if (e.key !== 'Escape') return
          if (catMenu) { setCatMenu(false); return }
          if (renaming !== null) { setRenaming(null); return }
          if (conflict) { setConflict(null); return }
          if (editingRef.current) { cancelEdit(); return }
          close()
        }
        if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') {
          document.addEventListener('keydown', onKey)
          return function () { document.removeEventListener('keydown', onKey) }
        }
      }, [open, conflict, catMenu, renaming])

      /**
       * 「新增」之后：把新行滚进视野并聚焦它的标题输入框（只做一次）。
       * 用 data-new 标记定位，不必给每一行都挂 ref。
       * 注意：**先确认那一行真的在 DOM 里再消耗标记** —— 多次 setState 若被分批渲染
       * （先渲染出「还不是编辑态」的那一帧），提前清标记就会让聚焦/滚动静默失效。
       */
      React.useEffect(function () {
        if (newlyAddedRef.current < 0) return
        if (typeof document === 'undefined' || !document || typeof document.querySelector !== 'function') return
        var row = document.querySelector('.qp-edit-row[data-new="1"]')
        if (!row) return
        newlyAddedRef.current = -1
        try { if (typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' }) } catch (e) { /* 滚动失败不影响功能 */ }
        var input = typeof row.querySelector === 'function' ? row.querySelector('.qp-edit-title') : null
        if (input && typeof input.focus === 'function') { try { input.focus() } catch (e) { /* 同上 */ } }
      })

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
        // 折叠开关：紧贴闪电笔右侧的三角。点闪电笔仍是「选词/管理」，点三角只切换上方快捷条的显示。
        React.createElement('button', {
          type: 'button',
          className: 'qp-tri',
          title: collapsed ? '展开快捷语' : '收起快捷语',
          'aria-label': collapsed ? '展开快捷语' : '收起快捷语',
          'aria-expanded': collapsed ? 'false' : 'true',
          disabled: disabled,
          onClick: function () { collapseState.toggle() },
        }, React.createElement(CollapseTriangle, { up: collapsed })),
        open ? React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'qp-scrim', onClick: close }),
          React.createElement('div', { className: 'qp-pop', ref: popRef, tabIndex: -1, style: {
            top: pos.y,
            left: pos.x,
            width: pos.w ? pos.w : POP_WIDTH,
            // 一行提示语的高度：由 JS 的 ROW_H 单一来源注入（CSS 里 .qp-item / .qp-cat-head 消费它）
            '--qp-row-h': ROW_H + 'px',
            // 「至少 10 行」只在浏览态生效（编辑行本来就高，不需要撑）
            minHeight: !editing && pos.minHeight ? pos.minHeight : undefined,
            maxHeight: pos.maxHeight || POP_MAX_HEIGHT,
            transform: pos.up ? 'translateY(-100%)' : 'none',
          } },
            React.createElement('div', { className: 'qp-head' },
              React.createElement('span', { className: 'qp-title' }, '快捷输入'),
              // 整条工具组与标题同行：分类下拉（6 字宽，无「分类」二字）+ ‹ › + ⋯ + 模式按钮
              React.createElement('div', { className: 'qp-tools', onClick: function () { if (catMenu) setCatMenu(false) } },
                // ‹ 放在分类下拉**左边**、› 放在**右边**（<用户> 2026-10-17），夹住下拉
                renaming !== null ? null : React.createElement('button', {
                  type: 'button', className: 'qp-step', title: '上一个分类', 'aria-label': '上一个分类',
                  disabled: disabled || saving || headCats.length < 2,
                  onClick: function () { stepCat(-1) },
                }, '‹'),
                renaming !== null
                ? React.createElement('input', {
                  className: 'qp-cat-rename',
                  value: renaming,
                  placeholder: '新的分类名称',
                  autoFocus: true,
                  onChange: function (e) { setRenaming(e.target.value) },
                  onKeyDown: function (e) {
                    if (!e) return
                    if (e.key === 'Enter') { e.preventDefault(); confirmRename() }
                    if (e.key === 'Escape') { e.preventDefault(); setRenaming(null) }
                  },
                })
                : React.createElement('select', {
                  className: 'qp-cat-pick',
                  title: editing ? '列表只显示这个分类的条目；其他分类保存时原样保留' : '「新增」放进这个分类，「修改」编辑这个分类',
                  'aria-label': '分类',
                  value: scopeCat,
                  disabled: disabled || saving,
                  onChange: function (e) { setTargetCat(e.target.value) },
                },
                  headCats.length === 0
                    ? [React.createElement('option', { key: '默认', value: '默认' }, '默认')]
                    : headCats.map(function (n) {
                      // 下拉里也按 4 字显示（全名进 title），后面跟条数
                      return React.createElement('option', { key: n, value: n, title: n },
                        truncateLabel(n, 4) + '（' + (countByName[n] || 0) + '）')
                    })),
              // › 放在分类下拉右边（‹ 已在它左边），一步换分类；分类多时比展开下拉快
              renaming !== null ? null : React.createElement('button', {
                type: 'button', className: 'qp-step', title: '下一个分类', 'aria-label': '下一个分类',
                disabled: disabled || saving || headCats.length < 2,
                onClick: function () { stepCat(1) },
              }, '›'),
              renaming !== null
                ? React.createElement(React.Fragment, null,
                  React.createElement('button', { type: 'button', className: 'qp-link qp-link-primary', onClick: confirmRename, disabled: saving }, '改名'),
                  React.createElement('button', { type: 'button', className: 'qp-link', onClick: function () { setRenaming(null) }, disabled: saving }, '取消')
                )
                : (editing ? React.createElement('button', {
                  type: 'button', className: 'qp-icon', title: '分类操作：重命名 / 删除整个分类（都在草稿里，保存前可恢复）',
                  'aria-haspopup': 'menu', 'aria-expanded': catMenu ? 'true' : 'false',
                  disabled: disabled || saving,
                  onClick: function (e) { if (e && typeof e.stopPropagation === 'function') e.stopPropagation(); setCatMenu(!catMenu) },
                }, '⋯') : null),
              catMenu ? React.createElement('div', { className: 'qp-menu', role: 'menu' },
                React.createElement('button', { type: 'button', className: 'qp-menu-item', onClick: function () { setCatMenu(false); setRenaming(scopeCat) } },
                  '重命名分类「' + scopeCat + '」'),
                React.createElement('button', { type: 'button', className: 'qp-menu-item', onClick: function () { setCatMenu(false); deleteScope() } },
                  '删除这个分类（' + (countByName[scopeCat] || 0) + ' 条，可恢复）')
              ) : null,
              // 撤销 / 重做（只在编辑态出现）
              editing ? React.createElement(React.Fragment, null,
                React.createElement('button', {
                  type: 'button', className: 'qp-icon', title: '撤销（Ctrl+Z）', 'aria-label': '撤销',
                  disabled: !canUndo || saving, onClick: undoEdit,
                }, '↶'),
                React.createElement('button', {
                  type: 'button', className: 'qp-icon', title: '重做（Ctrl+Shift+Z）', 'aria-label': '重做',
                  disabled: !canRedo || saving, onClick: redoEdit,
                }, '↷')
              ) : null,
              editing
                ? React.createElement(React.Fragment, null,
                  React.createElement('button', { type: 'button', className: 'qp-link', onClick: newRow, disabled: saving }, '新增'),
                  React.createElement('button', { type: 'button', className: 'qp-link', onClick: cancelEdit, disabled: saving }, '取消'),
                  React.createElement('button', { type: 'button', className: 'qp-link qp-link-primary', onClick: save, disabled: saving }, saving ? '保存中…' : '保存')
                )
                : React.createElement(React.Fragment, null,
                  React.createElement('button', { type: 'button', className: 'qp-link', onClick: startNew, disabled: disabled || saving }, '新增'),
                  React.createElement('button', { type: 'button', className: 'qp-link', onClick: startEdit, disabled: disabled || saving || !cats || cats.length === 0 }, '修改')
                ),
              // 瞬时成功提示贴在这一行里（放不下就省略号），不再单独占一行
              info ? React.createElement('span', { className: 'qp-info qp-info-inline', title: info }, info) : null
            ),
            // 右侧：搜索（6 字宽，浏览态才有）+ MD 管理 —— 都在同一行
            React.createElement('span', { className: 'qp-tools-spacer' }),
            !editing ? React.createElement('span', { className: 'qp-search' },
              React.createElement('input', {
                className: 'qp-search-input',
                type: 'search',
                placeholder: '搜索',
                title: '搜索快捷语（标题 / 内容）',
                value: query,
                onChange: function (e) { setQuery(e.target.value) },
              }),
              query ? React.createElement('button', { type: 'button', className: 'qp-link', onClick: function () { setQuery('') } }, '清除') : null
            ) : null,
            React.createElement('span', { className: 'qp-head-actions' },
              // 三个 MD 管理动作（导入 / 导出 / 复制）收进一个下拉，值恒为空 —— 选完即回到「MD 管理」
              React.createElement('select', {
                className: 'qp-md-select',
                title: editing
                  ? 'MD 管理：导入 / 导出 / 复制。编辑中只能「导入MD」（合并到当前编辑内容）；导出、复制、重载界面用的是已保存的数据，需先保存'
                  : 'MD 管理：导入 / 导出 / 复制；「重载界面」= 整页刷新（提示语数据无需刷新，会自动同步）',
                'aria-label': 'MD 管理',
                value: '',
                disabled: disabled || saving,
                onChange: onMdAction,
              },
                React.createElement('option', { key: 'label', value: '' }, 'MD 管理'),
                React.createElement('option', { key: 'import', value: 'import' }, '导入MD'),
                React.createElement('option', { key: 'export', value: 'export', disabled: editing || !cats || cats.length === 0 }, '导出MD'),
                isDesktopShell() ? React.createElement('option', { key: 'copy', value: 'copy', disabled: editing || !cats || cats.length === 0 }, '复制MD') : null,
                React.createElement('option', { key: 'reload', value: 'reload', disabled: editing }, '重载界面')
              )
            )
            ),
            React.createElement('input', {
              ref: fileRef,
              type: 'file',
              accept: '.md,.markdown,.txt,text/markdown,text/plain',
              style: { display: 'none' },
              onChange: onImportFile,
            }),
            error ? React.createElement('div', { className: 'qp-error' }, error) : null,
            conflict ? React.createElement('div', { className: 'qp-conflict' },
              React.createElement('div', null, conflict.reason === 'changed'
                ? '服务端的数据已经变了（可能来自另一台设备）。直接保存会覆盖那边的改动。'
                : '检测到数据已在别处更新，但这次没能读到最新版本。直接保存可能覆盖那边的改动。'),
              React.createElement('div', { className: 'qp-conflict-actions' },
                React.createElement('button', { type: 'button', className: 'qp-link', onClick: saveOverride, disabled: saving }, '覆盖保存'),
                conflict.latest ? React.createElement('button', { type: 'button', className: 'qp-link', onClick: adoptLatest, disabled: saving }, '放弃我的改动，载入最新') : null,
                React.createElement('button', { type: 'button', className: 'qp-link', onClick: function () { setConflict(null) }, disabled: saving }, '取消')
              )
            ) : null,
            pendingExtern ? React.createElement('div', { className: 'qp-info' }, '数据已在别处更新；你正在编辑，保存会覆盖那边的改动') : null,
            editing ? (
              React.createElement('div', { className: 'qp-list' },
                // 编辑范围显式化：默认只看当前分类（draft 始终是全量，保存不会丢别的分类），可一键切「显示全部」
                React.createElement('div', { className: 'qp-scope' },
                  showAll
                    ? '正在显示**全部** ' + draft.length + ' 条：改哪个分类的条目都行，保存时按行内的分类落盘'
                    : '正在编辑分类「' + scopeCat + '」：列表只显示这个分类的条目，其他分类保存时原样保留',
                  React.createElement('button', {
                    type: 'button', className: 'qp-scope-toggle',
                    title: showAll ? '只看当前分类的条目' : '显示全部条目（跨分类改）',
                    onClick: function () { setShowAll(!showAll) },
                  }, showAll ? '只看本分类' : '显示全部')),
                picked.length > 0 ? React.createElement('div', { className: 'qp-bulk' },
                  React.createElement('span', { className: 'qp-bulk-count' }, '已选 ' + picked.length + ' 条'),
                  React.createElement('select', {
                    className: 'qp-bulk-cat', value: '', title: '把选中的条目移到某个分类',
                    onChange: function (e) { var v = e.target.value; e.target.value = ''; bulkMove(v) },
                  },
                    React.createElement('option', { key: 'label', value: '' }, '移到分类…'),
                    headCats.map(function (n) { return React.createElement('option', { key: n, value: n }, n) })),
                  React.createElement('button', { type: 'button', className: 'qp-link', onClick: bulkDelete, disabled: saving }, '批量删除'),
                  React.createElement('button', { type: 'button', className: 'qp-link', onClick: pickVisible, disabled: saving }, showAll ? '全选全部' : '全选本分类'),
                  React.createElement('button', { type: 'button', className: 'qp-link', onClick: clearPicks, disabled: saving }, '清空选择')
                ) : null,
                editRows.length === 0 ? React.createElement('div', { className: 'qp-empty' }, '「' + scopeCat + '」暂无条目，点上方「新增」添加一条') : null,
                editRows.map(function (x) {
                  var p = x.row
                  var i = x.index
                  return React.createElement('div', {
                    className: p.deleted === true ? 'qp-edit-row qp-row-deleted' : 'qp-edit-row',
                    key: i,
                    // 刚「新增」的那一行：渲染后由 effect 滚进视野并聚焦标题
                    'data-new': i === newlyAddedRef.current ? '1' : undefined,
                  },
                    React.createElement('div', { className: 'qp-edit-meta' },
                      // 勾选后可批量改分类 / 批量删除（见上方批量条）
                      React.createElement('input', {
                        type: 'checkbox',
                        className: 'qp-pick',
                        checked: p.picked === true,
                        title: '勾选后可批量改分类 / 批量删除',
                        'aria-label': '选中这一条',
                        onChange: function () { togglePick(i) },
                      }),
                      (function () {
                        // 分类：下拉直接换到任意已有分类；只有选「＋ 新建分类…」才切换成输入框。
                        // （旧实现 input+datalist 会按当前值过滤候选项，必须先清空才能选别的分类。）
                        var m = catPickerModel((cats || []).map(function (c) { return c.name }), draft, p)
                        if (m.isNew) {
                          return React.createElement(React.Fragment, null,
                            React.createElement('input', {
                              className: 'qp-edit-cat',
                              placeholder: '新分类名称',
                              value: p.cat,
                              onChange: function (e) { updateRow(i, 'cat', e.target.value) },
                            }),
                            React.createElement('button', {
                              type: 'button',
                              className: 'qp-cat-back',
                              title: '从已有分类中选择',
                              onClick: function () { patchRow(i, { cat: m.names[0] || '默认', catNew: false }) },
                            }, '选择已有')
                          )
                        }
                        var opts = m.names.map(function (n) {
                          return React.createElement('option', { key: n, value: n }, n)
                        })
                        opts.push(React.createElement('option', { key: NEW_CAT, value: NEW_CAT }, '＋ 新建分类…'))
                        return React.createElement('select', {
                          className: 'qp-edit-cat qp-cat-select',
                          title: '该快捷语所属分类（可直接切换，无需清空）',
                          value: m.value,
                          onChange: function (e) {
                            var v = e.target.value
                            if (v === NEW_CAT) patchRow(i, { cat: '', catNew: true })
                            // 改到别的分类：视图跟着切过去（那一行就一定看得见，不会「看着像被删了」）
                            else { patchRow(i, { cat: v, catNew: false }); setTargetCat(v) }
                          },
                        }, opts)
                      })(),
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
                      React.createElement('button', {
                        type: 'button',
                        className: p.deleted === true ? 'qp-undo' : 'qp-del',
                        style: { marginLeft: 'auto' },
                        title: p.deleted === true
                          ? '撤销删除，把这一条放回去（保存前都还来得及）'
                          : '删除这一条：先标记为待删除（可「恢复」），点「保存」才真正落盘',
                        onClick: function () { if (p.deleted === true) patchRow(i, { deleted: false }); else removeRowOrMark(i) },
                        disabled: saving,
                      }, p.deleted === true ? '恢复' : '删除')
                    )
                  )
                })
              )
            ) : (
              React.createElement('div', { className: 'qp-list' },
                cats === null
                  ? React.createElement('div', { className: 'qp-empty' }, '加载中…')
                  : !cats || cats.length === 0
                    ? React.createElement('div', { className: 'qp-empty' }, '暂无快捷语：点「新增」录入或从「MD 管理 → 导入MD」导入')
                    : (function () {
                      var shown = visibleCats()
                      if (q && shown.length === 0) {
                        return React.createElement('div', { className: 'qp-empty' }, '没有匹配「' + query + '」的快捷语')
                      }
                      // <用户> 2026-10-17：拖分类时把提示词收起来 —— 只剩分类行，高度就够，不用边滚边拖
                      var catDrag = drag && drag.kind === 'cat'
                      return [
                        catDrag ? React.createElement('div', { className: 'qp-drag-hint', key: 'drag-hint' },
                          '调整分类顺序：松开即保存（提示词已收起）') : null,
                      ].concat(shown.map(function (x, ci) {
                        var c = x.cat
                        var total = (c.prompts || []).length
                        var full = c.name || '默认'
                        var headCls = 'qp-cat-head qp-cat-grab'
                        if (catDrag) {
                          if (drag.from === ci) headCls += ' qp-item-dragging'
                          if (drag.to === ci && drag.to !== drag.from) {
                            headCls += drag.to > drag.from ? ' qp-drop-below' : ' qp-drop-over'
                          }
                        }
                        return React.createElement(React.Fragment, { key: c.id || ci },
                          // 分类头：可拖（调分类顺序）；分类名最多 4 字，全名在 title 里
                          React.createElement('div', {
                            className: headCls,
                            title: full + '（按住上下拖可调整分类顺序）',
                            'data-cati': String(ci),
                            onPointerDown: function (e) { onCatDown(e, ci) },
                          },
                            React.createElement('span', { className: 'qp-cat-name' }, truncateLabel(full, 4)),
                            React.createElement('span', { className: 'qp-cat-num' },
                              '（' + (q ? x.list.length + '/' + total : total) + '）')),
                          catDrag
                            ? null
                            : (total === 0
                              ? React.createElement('div', { className: 'qp-empty' }, '（空）')
                              : x.list.map(function (p, i) {
                                var rowCls = 'qp-item' + (p.autoSend ? ' qp-item-send' : '')
                                if (drag && drag.kind === 'item' && drag.cati === ci) {
                                  if (drag.from === i) rowCls += ' qp-item-dragging'
                                  if (drag.to === i && drag.to !== drag.from) {
                                    rowCls += drag.to > drag.from ? ' qp-drop-below' : ' qp-drop-over'
                                  }
                                }
                                // 同一份交互属性：点击 / 长按（autoSend）/ 拖拽 三者共用一套 hold 状态
                                var base = promptInteraction(p, function (send) { insertAndClose(p, send) },
                                  function () { return browseDrag.justDragged })
                                var props = Object.assign({
                                  className: rowCls,
                                  key: p.id || i,
                                  role: 'button',
                                  tabIndex: 0,
                                  // 拖拽落点要按「分类内位置」对齐，用两个 data 属性就够了
                                  'data-cati': String(ci),
                                  'data-pos': String(i),
                                  title: (p.autoSend ? '自动发送（按住 300ms 才发，短按只填入）：' : '') + (p.text || '') +
                                    '（按住上下拖可调顺序）',
                                }, base, {
                                  onPointerDown: function (e) {
                                    onItemDown(e, ci, c.name || '默认', i)
                                    if (base.onPointerDown) base.onPointerDown(e)   // autoSend：开始长按计时
                                  },
                                })
                                return React.createElement('div', props,
                                  React.createElement('span', { className: 'qp-title-wrap' },
                                    React.createElement('span', { className: 'qp-item-title' }, p.title || '(无标题)'),
                                    p.autoSend ? React.createElement(EnterIcon) : null),
                                  React.createElement('span', { className: 'qp-item-text' }, p.text)
                                )
                              }))
                        )
                      }))
                    })()
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

    module.exports = {
      inject: inject,
      apply: apply,
      internals: {
        NEW_CAT: NEW_CAT,
        catPickerModel: catPickerModel,
        /** v0.7.1「长按 300ms 才发」：入口与阈值（纯函数 / 常量，供回归测试）。 */
        applyPrompt: applyPrompt,
        promptInteraction: promptInteraction,
        HOLD_MS: HOLD_MS,
        /** v0.7.4 浏览态拖拽排序（纯函数，供回归测试）。 */
        reorderPromptsInCategories: reorderPromptsInCategories,
        reorderCategories: reorderCategories,
        dropIndexFromRects: dropIndexFromRects,
        ROW_DRAG_THRESHOLD_PX: ROW_DRAG_THRESHOLD_PX,
        /** v0.7.3 布局：按字截断 / 一行高 / 至少可见行数 / 弹层定位（纯函数与常量）。 */
        truncateLabel: truncateLabel,
        computePopPos: computePopPos,
        ROW_H: ROW_H,
        MIN_VISIBLE_ROWS: MIN_VISIBLE_ROWS,
        HEADER_ROWS_ALLOWANCE: HEADER_ROWS_ALLOWANCE,
        POP_CHROME_EST: POP_CHROME_EST,
        /** v0.6.0 顶部「分类」下拉 / 新增行建议序号（纯函数，供回归测试）。 */
        collectCatNames: collectCatNames,
        nextOrderFor: nextOrderFor,
        normCatName: normCatName,
        /** 以下各项供「外部变化刷新 + 编辑锁 + 自动同步」回归测试用（宿主不消费）。 */
        store: store,
        fingerprintCategories: fingerprintCategories,
        REFRESH_INTERVAL_MS: REFRESH_INTERVAL_MS,
        /** v0.7.11 常驻自动同步间隔（页面可见时轮询；改完最长这么久自己出现）。 */
        AUTO_SYNC_MS: AUTO_SYNC_MS,
      },
    }
    return module.exports
  }
})
