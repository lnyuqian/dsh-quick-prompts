# dsh-quick-prompts

**English**: A DeepSeek Harness (DSH) quick prompt input plugin that works in **both the Web profile and the Desktop app** — a persistent two-row shortcut bar (row 1: categories, row 2: titles) above the input field, plus a "lightning pen" popup button for managing prompts and importing them from Markdown documents. Clicking a prompt **appends** its content after whatever is already in the input box (nothing is cleared, nothing is sent). Each prompt can optionally enable **auto-send** (⏎ icon; replaces the draft with that prompt and submits immediately via the official submit channel) and carry a numeric **order index** (prompts render left-to-right sorted by index ascending). Prompts are stored globally in `~/.dsh/quick-prompts.json`, so they survive environment restarts and project switches — and the same file is shared by the Web profile and the Desktop app.（中文说明见下）

DeepSeek Harness (DSH) 插件：**输入框快捷输入（分类快捷条 + 闪电笔）**，Web 版与桌面版通用。

输入框上方**常驻横向快捷条**：第一行显示分类、第二行显示当前分类下的标题；鼠标悬停分类即切换下方标题；点击标题把内容**追加到输入框原有内容之后**（不清空已输入的内容，也不自动发送）。工具行「权限切换」右侧另有闪电笔按钮，弹层内可管理快捷语并**从 MD 文档导入**。数据存全局 `~/.dsh/quick-prompts.json`，重启环境、换项目都不会丢，**Web 版与桌面版共用同一份数据**。

## 功能特性

- **常驻快捷条**：第一行分类、第二行标题；悬停分类切换下方标题，点击标题把内容**追加**到输入框原有内容之后——**不清空已输入的内容**（光标落在末尾，可再编辑后手动发送）。输入框为空时即等于写入该条短语。
- **自动发送（按条开关）**：开关位于「管理」编辑模式中每行的「⏎ 自动发送：开/关」按钮（点「保存」落盘）。开启的条目在快捷条与弹层中**标题后带 ⏎ 小图标**，点击后**以该短语整体替换草稿并立即发送**（走官方 submit 通道）——替换而非追加，避免把还没写完的草稿一并误发出去；未开启的条目保持「追加且不发送」。旧数据无该字段时一律按不发送处理。
- **序号排序**：每条快捷语可设置数字**序号**（管理弹层中每行的「序」**下拉框**，选项自动按该行所属分类的短语数量生成 1..N），快捷条与弹层按**序号从小到大、自左向右**排列（稳定排序，无序号的条目排在最后）。进入编辑时自动按当前展示顺序预填 1..N；「新增」行自动沿用上一行分类并给出**该分类现有最大序号 +1** 的建议值；导出 MD 也按序号升序输出。
- **分类管理**：弹层「管理」中每条快捷语的「分类」是**下拉框**，可直接切换到任意已有分类；需要新分类时选「＋ 新建分类…」切成输入框，写完点「保存」落盘。（v0.4.1 修复：旧版是 `input + datalist`，浏览器会按当前值过滤候选项，必须先删掉当前分类才能看到别的分类。）
- **MD 导入**：弹层「导入MD」选择 Markdown 文件，按 `###` 解析分类、无序列表解析标题、缩进列表解析内容；同名标题跳过、其余合并追加。
- **MD 导出 / 复制**：弹层「导出MD」下载 `quick-prompts.md`；**桌面版另提供「复制MD」**，把同一份 MD 文本写入剪贴板——桌面外壳的下载通道受宿主策略影响，剪贴板是可靠退路。
- **永不丢失**：数据存全局 `~/.dsh/quick-prompts.json`（`DSH_HOME` 目录下），与会话、项目无关，Web 版与桌面版共用；旧版按项目存放的数据可在新版里重新导入。
- **图标随主题**：按钮图标见 `assets/快捷输入.svg`，以 `currentColor` 内联渲染，自动跟随明暗主题与悬停色。
- **弹层自适应（桌面友好）**：弹层按可视区自动决定向上/向下展开、左右夹紧并按可用空间限高，小窗口下不会被推出可视区。
- **一键收起 / 展开（v0.4.0，为手机与远程访问而做）**：闪电笔**右侧**多了一个三角开关——▾ 表示快捷条展开中（点它收起）、▴ 表示已收起（点它展开）。收起后快捷条**整块不渲染（0 高度）**，手机端完全让出高度；此时仍可用闪电笔打开弹层选词，能力不丢。**窄屏（≤640px）默认收起，电脑默认展开**；手动切过之后**按设备各自记住**（存 `localStorage`，不写三端共用的数据文件，手机收起不会连累电脑）。

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

> 帮我把 `D:\dsh-web\插件技能安装\dsh-quick-prompts` 装进桌面版：用 plugin_manager 的 install_bundle，
> target 传 `link:D:\dsh-web\插件技能安装\dsh-quick-prompts`。

宿主会热重组配置并让页面按需加载新 bundle —— **不需要重启桌面版**。

**方式二：完全退出桌面版后用脚本安装**

```powershell
# 先完全退出 DeepSeek Harness（CLI 需要独占 profile/package.json）
cd D:\dsh-web\插件技能安装\dsh-quick-prompts
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
| MD 导出 | 另提供「**复制MD**」按钮（仅在桌面端出现），下载通道异常时可把同一份 MD 文本写入剪贴板 |

## 使用
1. 输入框上方常驻**横向快捷条**：第一行分类（悬停/点击切换）、第二行标题；点击标题 → 内容**追加到输入框原有内容之后**（不清空、不自动发送，可再编辑）。
2. 工具行闪电笔按钮（「权限切换」右侧）打开弹层：按分类分组浏览，点击同样**追加**到原有内容之后。
3. **闪电笔右侧的三角**：一键收起 / 展开快捷条。收起后不占任何高度（手机、远程查看时很实用），闪电笔仍是选词入口；状态按设备记住，窄屏首次进入默认收起。
4. 弹层「导入MD」：选择 Markdown 文件，按 `### 分类 / 列表标题 / 缩进内容` 解析导入（同名标题跳过）。
5. 弹层「导出MD / 复制MD」：导出当前全部快捷语（桌面端可用「复制MD」写入剪贴板）。
6. 弹层「管理」：每行可改「分类 / 标题 / 内容」、新增、删除，点「保存」落盘到 `~/.dsh/quick-prompts.json`。

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
node test-append.mjs     # 点击=追加而非覆盖（含 useInput / DOM 兜底 / 自动发送）+ 样式注入归属 + 折叠渲染
node test-parser.mjs     # MD 解析与合并（分类、⏎ 标记、序号稳定排序）
node test-roundtrip.mjs  # 导出 ↔ 导入 往返一致
node test-desktop.mjs    # 桌面适配：弹层定位、dsh-app 环境识别、复制MD 兜底
node test-server.mjs     # 服务端半部：路由生命周期/重复注册容错 + 隔离 DSH_HOME 下的读写往返
node test-collapse.mjs   # 折叠默认值与每设备记忆（窄屏默认收起、记录优先、localStorage 不可用时回退）
node test-category.mjs   # 分类下拉：选项来自全部分类（含草稿内新分类），切换无需先清空当前值
```

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
