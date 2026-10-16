# dsh-quick-prompts

**English**: A DeepSeek Harness (DSH) quick prompt input plugin that works in **both the Web profile and the Desktop app** — a persistent two-row shortcut bar (row 1: categories, row 2: titles) above the input field, plus a "lightning pen" popup whose top row holds an **"MD 管理" dropdown** (import / export / copy) and a **category dropdown + ‹ › / ⋯ / 新增 / 修改 / 撤销重做** (pick a category, add into it, edit only that category, rename or delete a whole category, bulk select/move/delete, undo-redo, cross-category search, and a server-side conflict check before saving); clicking a prompt **appends** its content after whatever is already in the input box (nothing is cleared, nothing is sent). Each prompt can optionally enable **auto-send** (⏎ icon; replaces the draft with that prompt and submits immediately via the official submit channel) and carry a numeric **order index** (prompts render left-to-right sorted by index ascending). Prompts are stored globally in `~/.dsh/quick-prompts.json`, so they survive environment restarts and project switches — and the same file is shared by the Web profile and the Desktop app. Both rows always stay a **single line**: when the content overflows, **press and drag the row sideways** to reveal the rest (no wrapping, no extra height).（中文说明见下）

DeepSeek Harness (DSH) 插件：**输入框快捷输入（分类快捷条 + 闪电笔）**，Web 版与桌面版通用。

> 📦 **本仓库只放插件本体**（公开）。提示词 / 快捷语 / 用户侧文档 / 密钥属于**私有**仓库
> [lnyuqian/dsh-quick-prompts-data](https://github.com/lnyuqian/dsh-quick-prompts-data)；
> 在本目录做提交前请先读 [AGENTS.md](AGENTS.md)。

输入框上方**常驻横向快捷条**：第一行显示分类、第二行显示当前分类下的标题；鼠标悬停分类即切换下方标题；点击标题把内容**追加到输入框原有内容之后**（不清空已输入的内容，也不自动发送）。工具行「权限切换」右侧另有闪电笔按钮，弹层顶部是「MD 管理」下拉（**导入 / 导出 / 复制**三个动作收在一个下拉里）与「分类」下拉 + **新增 / 修改**：选定分类后「新增」把新条目放进这个分类、「修改」只列出这个分类的条目，保存前还会先查一次冲突。数据存全局 `~/.dsh/quick-prompts.json`，重启环境、换项目都不会丢，**Web 版与桌面版共用同一份数据**。

## 功能特性

- **常驻快捷条**：第一行分类、第二行标题；悬停分类切换下方标题，点击标题把内容**追加**到输入框原有内容之后——**不清空已输入的内容**（光标落在末尾，可再编辑后手动发送）。输入框为空时即等于写入该条短语。
- **自动发送（按条开关）**：开关位于编辑态每行的「⏎ 自动发送：开/关」按钮（点「保存」落盘）。开启的条目在快捷条与弹层中**标题后带 ⏎ 小图标**，**按住约 300ms 松手才发送**（走官方 submit 通道，**以该短语整体替换草稿**——替换而非追加，避免把还没写完的草稿一并误发出去）；**短按只填入不发送**，键盘 Enter / 空格 = 明确发送。未开启的条目保持「追加且不发送」。旧数据无该字段时一律按不发送处理。
- **序号排序**：每条快捷语可设置数字**序号**（编辑弹层中每行的「序」**下拉框**，选项自动按该行所属分类的短语数量生成 1..N），快捷条与弹层按**序号从小到大、自左向右**排列（稳定排序，无序号的条目排在最后）。进入编辑时自动按当前展示顺序预填 1..N；「新增」行落在**当前选中的分类**末尾并给出**该分类现有最大序号 +1** 的建议值；导出 MD 也按序号升序输出。
- **分类管理**：编辑弹层中每条快捷语的「分类」是**下拉框**，可直接切换到任意已有分类；需要新分类时选「＋ 新建分类…」切成输入框，写完点「保存」落盘。（v0.4.1 修复：旧版是 `input + datalist`，浏览器会按当前值过滤候选项，必须先删掉当前分类才能看到别的分类。）
- **MD 导入 / 导出 / 复制收进一个下拉（v0.6.0）**：弹层顶部原来是「导入MD / 导出MD / 复制MD」三个平铺按钮，现在合并成**一个「MD 管理」下拉**（选完自动回到「MD 管理」）。腾出来的位置改成 **「分类」下拉 + 新增 / 修改**：先选分类，再点「新增」就把新条目放进这个分类（序号接着排）；点「修改」只列出这个分类的条目来改，**其他分类保存时原样保留**。原来的「管理」入口已去掉 —— 它做的事分别由「新增」和「修改」承担。
- **保存前先查冲突（v0.6.1）**：保存是整体替换，若期间另一台设备（或 API）改过数据，直接保存会**静默盖掉**那边的改动。现在点「保存」会先拉一次服务端比对基线：变了就**不落盘**，改弹一条提示，让你选「**覆盖保存**」还是「**放弃我的改动，载入最新**」（载入最新会就地重建编辑行，可直接在最新数据上继续改）。探测本身失败（网络不通等）不拦你保存 —— 能存就让它存。
- **删除可撤销（v0.6.1）**：有内容的行点「删除」先变成**灰色待删除**、按钮换成「恢复」，**点「保存」才真正落盘**；刚新增的空行点删除则直接移除。手滑点错不必再用「取消」把整轮编辑一起丢掉。
- **新增后自动到位（v0.6.1）**：点「新增」后新行会被**滚进视野**并**自动聚焦「标题」输入框**，接着打字就行。
- **键盘与细节（v0.6.1）**：弹层打开时接一次焦点；`Esc` 分三层 —— 先撤冲突提示 → 编辑态等于「取消」（回浏览态、面板不关）→ 再按才关面板。「MD 管理」下拉在编辑态会说明为什么导出/复制暂时不可用。
- **分类下拉带条数 + ‹ › 一步换分类（v0.7.0）**：下拉里每项写成 `常用（8）`，旁边一对 `‹ ›` 按钮直接跳上/下一个分类（分类多了比展开下拉快）。
- **跨分类搜索（v0.7.0）**：浏览态顶部一个搜索框，按**标题或内容**即时过滤**全部分类**；分类头显示「命中/总数」（如 `常用（1/2）`），留空即恢复原样。
- **分类操作：重命名 / 删除整个分类（v0.7.0）**：编辑态点 `⋯` 打开菜单 —— 「重命名分类」把该分类的**所有行**一起改名（每行分别去改太费事）；「删除这个分类」把它的条目**逐条标记为待删除**，保存前都能「恢复」。
- **批量编辑（v0.7.0）**：每行左侧有勾选框，勾上任意一条就出现批量条 —— 可把选中的条目**一次性移到别的分类**、或**批量删除**（同样是「标记 → 保存才落盘」），另有「全选本分类 / 清空选择」。
- **撤销 / 重做（v0.7.0）**：编辑态标题行有 `↶ ↷`，也支持 `Ctrl/⌘ + Z` 撤销、`Ctrl/⌘ + Shift + Z`（或 `Ctrl + Y`）重做；从进入编辑态那一刻打底，之后每个动作一个快照（上限 50 步）。
- **编辑范围可见（v0.7.0）**：说明行右侧可一键切「只看本分类 / 显示全部」——默认只看当前分类（其他分类原样保留），要跨分类改就走「显示全部」。
- **分类标题吸顶 + 窄屏适配（v0.7.0）**：长列表里分类标题吸在列表顶部；弹层宽度加了 `max-width:calc(100vw - 16px)`，手机窄屏不会被撑出屏幕。
- **★ 自动发送改成「长按 300ms 才发」（v0.7.1）**：带 ⏎ 的条目**不再是点一下就发** —— **按住约 300ms 松手才发送**；**短按只把内容填进输入框（不发送）**，防手滑误发。键盘上长按不可行，所以 **Enter / 空格 = 明确发送**（读屏等非指针来源的点击同样按「明确发送」处理）。普通条目行为完全没变（点击=追加）。
- **★ 拖拽排序就在「一条一行」的浏览态（v0.7.4 / v0.7.5）**：**不用进编辑态** ——
  · 按住**一条提示语**上下拖 = 改它在本分类内的顺序（松手即按 1..N 重写序号并落盘）；
  · 按住**分类名**上下拖 = 改分类之间的顺序；**拖动分类时提示词会自动收起**，只剩分类行，一屏够用、不用边滚边拖；
  · 拖动中显示落点线，位移超过 4px 才算拖（**点一下仍然是插入到输入框**）；松手前会先探一次冲突，**不静默覆盖别的设备**的改动。
  编辑态里那个「序 1..N」下拉**保留**（键盘 / 触屏不习惯拖拽时用它）。
- **★ 面板改为「与快捷条同宽 + 一条短语一行」（v0.7.3 / v0.7.5）**：弹层宽度与左边界**实测上方快捷条的几何**（同宽同起点，就在条的上方展开；上方不够就翻到条下方），条被收起时沿祖先链按**同一条公式**（读宿主 CSS 变量）算出同宽 —— 不会退回窄条。列表**一条短语占一行**：标题最多 **8 个字**、后面的内容单行省略号铺满；**分类名最多 4 个字**（全名在悬停提示里）。浏览态列表**至少留出 10 行提示语**的高度（再留 3 行分类头的余量），内容少也不塌成小条、内容多就内部滚动；一行高 22px 与 composer 留白都是**同一份常量**（`ROW_H` / `DOCK_CLEARANCE` …），CSS 与定位算法不会两边各写一个数。
- **MD 导入**：弹层「MD 管理 → 导入MD」选择 Markdown 文件，按 `###` 解析分类、无序列表解析标题、缩进列表解析内容；同名标题跳过、其余合并追加。
- **MD 导出 / 复制**：弹层「MD 管理 → 导出MD」下载 `quick-prompts.md`；**桌面版另有「MD 管理 → 复制MD」**，把同一份 MD 文本写入剪贴板——桌面外壳的下载通道受宿主策略影响，剪贴板是可靠退路。
- **永不丢失**：数据存全局 `~/.dsh/quick-prompts.json`（`DSH_HOME` 目录下），与会话、项目无关，Web 版与桌面版共用；旧版按项目存放的数据可在新版里重新导入。
- **图标随主题**：按钮图标见 `assets/快捷输入.svg`，以 `currentColor` 内联渲染，自动跟随明暗主题与悬停色。
- **弹层自适应（桌面友好）**：弹层按可视区自动决定向上/向下展开、左右夹紧并按可用空间限高，小窗口下不会被推出可视区。
- **一键收起 / 展开（v0.4.0，为手机与远程访问而做）**：闪电笔**右侧**多了一个三角开关——▾ 表示快捷条展开中（点它收起）、▴ 表示已收起（点它展开）。收起后快捷条**整块不渲染（0 高度）**，手机端完全让出高度；此时仍可用闪电笔打开弹层选词，能力不丢。**窄屏（≤640px）默认收起，电脑默认展开**；手动切过之后**按设备各自记住**（存 `localStorage`，不写三端共用的数据文件，手机收起不会连累电脑）。
- **管理弹层的分类改为下拉框（v0.4.1）**：下拉选项来自**全部分类**（含草稿里刚新建的分类名），所以**切换分类不需要先清空当前值**（旧的 `input + datalist` 会按当前值过滤候选项，必须先删干净才能选别的）。选「＋ 新建分类…」进入输入模式，选「选择已有…」回到下拉。
- **单行 + 按住拖动查看后面内容（v0.5.0）**：分类行与标题行**都保持单行**——一行放不下时**不再换行把快捷条撑高**，改为**按住行内容左右拖动**即可看到后面的部分（鼠标拖动；触摸屏走原生惯性滑动）。拖动时显示抓取光标、**滚动条隐藏**（不占高度、不破坏外观）。两条边界守得很死：拖动中**划过分类不会误切分类**，松开那一下**不会被当成点击**去追加提示词；而**普通点击完全照旧**。内容没超出一行时根本不接管指针，行为与以前一模一样。

### MD 导入格式

```markdown
### 分类名
- 快捷语标题
    - 快捷语内容（可多行，多条缩进行自动拼接）
- 自动发送的标题 ⏎
    - 内容（该条开启自动发送：导出时标题尾部带 ⏎ 标记，导入时识别还原）
```


## 安装

### Web 版（`dsh web` / web profile）

**方式一：一键安装（推荐）**
通过 DSH 命令行从 GitHub Release 安装到你的 web profile：

```powershell
dsh plugin --profile web add "https://github.com/lnyuqian/dsh-quick-prompts/releases/latest/download/dsh-quick-prompts.tgz"
```

该命令会安装依赖并把本插件登记为 profile 的 bundle（自动识别 `dsh.bundle`），随后**重启 dsh web** 并刷新页面即可生效。

**方式二：本地开发安装**
```powershell
git clone https://github.com/lnyuqian/dsh-quick-prompts.git
cd dsh-quick-prompts
dsh plugin --profile web add "link:<本仓库的绝对路径>"
# 重启 dsh web 并刷新页面
```

### 桌面版（DeepSeek Harness Desktop）

桌面版跑的是 `desktop` profile，**这个 profile 由 Electron 独占管理**：全局 `dsh` CLI 会直接拒绝它
（`error: profile "desktop" is managed exclusively by the Electron application`）。所以有两条路：

**方式一：应用内插件管理（推荐，无需重启）**

桌面版运行时打开 **设置 → 插件** 安装，或直接让 DSH 助手用内置的 plugin_manager 安装：

> 帮我把 `<本仓库的绝对路径>` 装进桌面版：用 plugin_manager 的 install_bundle，
> target 传 `link:<本仓库的绝对路径>`。

宿主会热重组配置并让页面按需加载新 bundle —— **不需要重启桌面版**。

**方式二：完全退出桌面版后用脚本安装**

```powershell
# 先完全退出 DeepSeek Harness（CLI 需要独占 profile/package.json）
cd <克隆下来的插件目录>
powershell -ExecutionPolicy Bypass -File .\install-desktop.ps1              # link 安装（默认）
powershell -ExecutionPolicy Bypass -File .\install-desktop.ps1 -Mode Tarball # 从 tgz 安装
powershell -ExecutionPolicy Bypass -File .\install-desktop.ps1 -Uninstall    # 卸载
```

脚本调用的是**桌面安装自带的 CLI 载体**（`app.asar` 内的 `dsh-desktop-host/lib/cli.js`，带
`manageDesktopProfile` 权限），因此能合法管理 desktop profile。

### 升级
Web 版：重新执行上面的 `dsh plugin --profile web add ...`，然后重启 dsh web 并刷新页面。
桌面版：link 安装时改代码即生效（重启或等宿主热重组）；tgz 安装时重新执行安装命令。

> 也可以直接把上面的命令发给你的 DSH 助手：“帮我升级 dsh-quick-prompts”。

## 桌面版说明（与 Web 版的差异）

桌面客户端（Electron）渲染的是**同一套 Web 前端**，页面挂在自定义协议 `dsh-app://app/` 下，因此：

| 关注点 | 桌面版行为 |
|---|---|
| 槽位 | `conversation.input.dock` / `conversation.input.left` 与 Web 版完全相同，快捷条与闪电笔直接复用 |
| `/api/quick-prompts` | 页面里相对路径的 `fetch` 由 Electron 主进程 `forwardWebRequest` **带上认证 cookie 转发**到本地 webserver（方法、请求体原样转发），因此服务端半部不用改 |
| 数据文件 | 同一个 `~/.dsh/quick-prompts.json` —— Web 版与桌面版**共享同一份快捷语** |
| `dsh.client.platform` | 仍然是 `"web"`：桌面端复用的就是 web 客户端载体（`dsh-client-modules` 只认 `platform === 'web'`），改成别的值反而会导致客户端半部不被加载 |
| 弹层定位 | 桌面窗口通常更小，弹层改为按可视区自适应（向上/向下展开、左右夹紧、按可用空间限高） |
| MD 导出 | 「MD 管理」下拉里另提供「**复制MD**」（仅在桌面端出现），下载通道异常时可把同一份 MD 文本写入剪贴板 |

## 使用
1. 输入框上方常驻**横向快捷条**：第一行分类（悬停/点击切换）、第二行标题；点击标题 → 内容**追加到输入框原有内容之后**（不清空、不自动发送，可再编辑）。两行都**只占一行**：放不下时**按住行内容左右拖动**即可看到后面的部分（鼠标拖动；触摸屏直接滑动）。
2. 工具行闪电笔按钮（「权限切换」右侧）打开弹层：按分类分组浏览，点击同样**追加**到原有内容之后。
3. **闪电笔右侧的三角**：一键收起 / 展开快捷条。收起后不占任何高度（手机、远程查看时很实用），闪电笔仍是选词入口；状态按设备记住，窄屏首次进入默认收起。
4. 弹层「MD 管理 → 导入MD」：选择 Markdown 文件，按 `### 分类 / 列表标题 / 缩进内容` 解析导入（同名标题跳过）。
5. 弹层「MD 管理 → 导出MD / 复制MD」：导出当前全部快捷语（桌面端可用「复制MD」写入剪贴板）。
6. 弹层顶部的**「分类」下拉 + 新增 / 修改**：先在下拉里选好分类，点「新增」→ 进编辑态并在这个分类末尾补一行（新行会自动滚进视野、标题框已聚焦），填标题 / 内容后点「保存」；点「修改」→ 进编辑态，**列表只显示这个分类的条目**，改完保存时**其他分类原样保留**。编辑态里仍可随时切上方的分类下拉换编辑对象，也可以选「＋ 新建分类…」现场造一个新分类。
7. 编辑态里**删除是两段的**：点「删除」→ 行变灰、按钮变「恢复」（还没落盘）；点「保存」才真的删掉。保存前如果服务端已被别处改过，会先弹一条提示让你选「覆盖保存 / 载入最新」。`Esc` 依次用来撤提示、退出编辑态、关面板。
8. **v0.7.0 的编辑台**：分类下拉旁 `‹ ›` 换分类、`⋯` 里重命名/删除整个分类；每行左侧勾选框 → 批量移到别的分类或批量删除；标题行 `↶ ↷`（或 `Ctrl+Z` / `Ctrl+Shift+Z`）撤销重做；说明行右侧切「只看本分类 / 显示全部」。浏览态顶部的搜索框按标题/内容跨分类过滤。
9. **带 ⏎ 的自动发送条目（v0.7.1）**：**按住约 300ms 松手才发送**；**短按只填入不发送**；键盘 Enter / 空格 = 发送。
10. **给条目排序（v0.7.2）**：编辑态**按住每行左侧的 `⠿` 把手上下拖**，松手即重排该分类的序号；不习惯拖拽就用每行的「序」下拉，两者等价。拖错了 `Ctrl+Z` 退回。

> 两类状态刻意分开存：**快捷语内容**存共享的 `~/.dsh/quick-prompts.json`（三端一致、永不丢），**快捷条是否收起**存本设备 `localStorage`（各设备独立）。

## 工作原理
| 半部 | 说明 |
|---|---|
| `lib/index.js`（服务端） | 注册 `GET/POST /api/quick-prompts`，读写全局 `~/.dsh/quick-prompts.json`（v2 分类结构，自动兼容旧 v1 平铺并迁移为「默认」分类）。Web 版由 webserver 直接处理；桌面版由 Electron 主进程把 `dsh-app://app/api/...` 带认证 cookie 转发到同一张路由表 |
| `lib/client.js`（浏览器） | 纯 JS（`React.createElement`，无构建），通过 `window.__ModuleLoader__.load` 注册，注入 `conversation.input.dock`（常驻横向条）与 `conversation.input.left`（闪电笔弹层），持久化走 `/api/quick-prompts`。点击条目时经 `useInput` 快照（或 dock owner 的 `InputState`，再退化为 DOM）读取当前草稿，**追加**后交 `inputActions.setDraft` 写回 |

### 两个必须遵守的宿主约定（v0.3.1 修复）

这两条都是桌面版实测踩出来的坑，写成约定以免回归：

| 约定 | 不遵守的后果 | 正确做法 |
|---|---|---|
| `webServer.register()` 返回的 disposer **必须挂进 `ctx.effect`** | 每次 HMR 重组 / 插件启停都会重复注册同一路径，第二次直接 `webserver: duplicate exact route` → 整条插件行激活失败（桌面版安装会连续组合多次，必现） | `ctx.effect(() => webServer.register({ ... }))`；并对同进程重复注册做**窄容错**：只吞 `duplicate` 并告警，其余错误照抛 |
| 注入的 `<style>` 必须带 `data-plugin="<包名>"` 归属标记，且要在 **factory 物化期**注入 | 客户端模块系统按 `data-plugin` 认领/回收 bundle 样式；标记或时机不对时，宿主图更新会把 `<style>` 收走，而插件实例还挂着 → 界面退化成浏览器默认样式、布局整体塌陷（「UI 易位、改变形态」） | 物化期 `ensureStyles()` 注入并显式打 `data-plugin`；`apply` 里再用 MutationObserver 观察 `document.head`，被回收时自动重注入 |

## 测试

```powershell
node test-load.mjs       # 载入自检：客户端 bundle 能加载 / 能物化 / 导出完整 / 零日志 / 按钮与三角真的渲染出来
node test-append.mjs     # 点击=追加而非覆盖（含 useInput / DOM 兜底 / 自动发送）+ 样式注入归属 + 折叠渲染
node test-parser.mjs     # MD 解析与合并（分类、⏎ 标记、序号稳定排序）
node test-roundtrip.mjs  # 导出 ↔ 导入 往返一致
node test-desktop.mjs    # 桌面适配：弹层定位、dsh-app 环境识别、复制MD 兜底
node test-server.mjs     # 服务端半部：路由生命周期/重复注册容错 + 隔离 DSH_HOME 下的读写往返
node test-collapse.mjs   # 折叠默认值与每设备记忆（窄屏默认收起、记录优先、localStorage 不可用时回退）
node test-category.mjs   # 分类下拉：选项来自全部分类（含草稿内新分类），切换无需先清空当前值
node test-drag.mjs       # 单行 + 按住拖动（没超宽不接管、位移不足仍算点击、拖动中不误切分类、拖完不吃下次点击）
node test-panel-header.mjs # 弹层工具行（MD 管理下拉 / 分类下拉 / 新增 / 修改）+ 删除可撤销 + 保存前冲突 + 搜索 / 批量 / 撤销重做 / 分类操作（17 项）
node test-hold-to-send.mjs # 长按 300ms 才发：短按只填入、长按才发送、普通条目不变、拖动不算点击（8 项）
node test-row-reorder.mjs # 拖拽排序：分类内换位 + 序号重排 1..N、落点计算、边界与其他字段保留（5 项）
node test-refresh.mjs    # 外部变化刷新 + 编辑锁：首拉/重拉/节流/编辑期间只暂存
```

> `npm test` 把它们按顺序串起来跑（约 3 秒）。**其中 `test-load.mjs` 排在第一位**：
> 它真的把 `lib/client.js` 加载并物化一遍 —— 2026-10-17 出过一次「删函数漏删 `internals` 导出引用 →
> 模块一加载就抛 `ReferenceError` → 闪电笔按钮与折叠三角全都不显示」，`node --check` 查不出来，这一条能立刻拦住。
>
> **可选：提交闸门**（把这个仓库当 link 安装用时尤其值）：
> ```powershell
> git config core.hooksPath .githooks   # 之后 git commit 会先跑 test-load.mjs
> ```

## 目录结构
```
dsh-quick-prompts/
├── package.json          # dsh.bundle.patch + dsh.client.platform: web（web/desktop 共用）
├── dsh.plugin.json       # 插件清单
├── cordis.patch.yml      # 宿主组合补丁（注册服务端插件行）
├── install-desktop.ps1   # 桌面版安装/卸载脚本（走桌面自带的 CLI 载体）
├── lib/index.js          # 服务端半部
├── lib/client.js         # 客户端半部
├── test-*.mjs            # 回归测试
└── assets/快捷输入.svg    # 按钮图标源文件
```

## 协议
MIT
