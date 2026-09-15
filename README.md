# dsh-quick-prompts

**English**: A DeepSeek Harness (DSH) Web client plugin that adds quick prompt input to the chat box — a persistent two-row shortcut bar (row 1: categories, row 2: titles) above the input field, plus a "lightning pen" popup button for managing prompts and importing them from Markdown documents. Clicking a prompt **appends** its content after whatever is already in the input box (nothing is cleared, nothing is sent). Each prompt can optionally enable **auto-send** (⏎ icon; replaces the draft with that prompt and submits immediately via the official submit channel) and carry a numeric **order index** (prompts render left-to-right sorted by index ascending). Prompts are stored globally in `~/.dsh/quick-prompts.json`, so they survive environment restarts and project switches.（中文说明见下）

DeepSeek Harness (DSH) Web 客户端插件：**输入框快捷输入（分类快捷条 + 闪电笔）**。

输入框上方**常驻横向快捷条**：第一行显示分类、第二行显示当前分类下的标题；鼠标悬停分类即切换下方标题；点击标题把内容**追加到输入框原有内容之后**（不清空已输入的内容，也不自动发送）。工具行「权限切换」右侧另有闪电笔按钮，弹层内可管理快捷语并**从 MD 文档导入**。数据存全局 `~/.dsh/quick-prompts.json`，重启环境、换项目都不会丢。

## 功能特性

- **常驻快捷条**：第一行分类、第二行标题；悬停分类切换下方标题，点击标题把内容**追加**到输入框原有内容之后——**不清空已输入的内容**（光标落在末尾，可再编辑后手动发送）。输入框为空时即等于写入该条短语。
- **自动发送（按条开关）**：开关位于「管理」编辑模式中每行的「⏎ 自动发送：开/关」按钮（点「保存」落盘）。开启的条目在快捷条与弹层中**标题后带 ⏎ 小图标**，点击后**以该短语整体替换草稿并立即发送**（走官方 submit 通道）——替换而非追加，避免把还没写完的草稿一并误发出去；未开启的条目保持「追加且不发送」。旧数据无该字段时一律按不发送处理。
- **序号排序**：每条快捷语可设置数字**序号**（管理弹层中每行的「序」**下拉框**，选项自动按该行所属分类的短语数量生成 1..N），快捷条与弹层按**序号从小到大、自左向右**排列（稳定排序，无序号的条目排在最后）。进入编辑时自动按当前展示顺序预填 1..N；「新增」行自动沿用上一行分类并给出**该分类现有最大序号 +1** 的建议值；导出 MD 也按序号升序输出。
- **分类管理**：弹层「管理」中每条快捷语带「分类」字段，可新增 / 修改 / 删除，点「保存」落盘。
- **MD 导入**：弹层「导入MD」选择 Markdown 文件，按 `###` 解析分类、无序列表解析标题、缩进列表解析内容；同名标题跳过、其余合并追加。
- **永不丢失**：数据存全局 `~/.dsh/quick-prompts.json`（`DSH_HOME` 目录下），与会话、项目无关；旧版按项目存放的数据可在新版里重新导入。
- **图标随主题**：按钮图标见 `assets/快捷输入.svg`，以 `currentColor` 内联渲染，自动跟随明暗主题与悬停色。

### MD 导入格式

```markdown
### 分类名
- 快捷语标题
    - 快捷语内容（可多行，多条缩进行自动拼接）
- 自动发送的标题 ⏎
    - 内容（该条开启自动发送：导出时标题尾部带 ⏎ 标记，导入时识别还原）
```


## 安装

### 方式一：一键安装（推荐）
通过 DSH 命令行从 GitHub Release 安装到你的 web profile：

```powershell
dsh plugin --profile web add "https://github.com/lnyuqian/dsh-quick-prompts/releases/latest/download/dsh-quick-prompts.tgz"
```

该命令会安装依赖并把本插件登记为 profile 的 bundle（自动识别 `dsh.bundle`），随后**重启 dsh web** 并刷新页面即可生效。

### 方式二：本地开发安装
```powershell
git clone https://github.com/lnyuqian/dsh-quick-prompts.git
cd dsh-quick-prompts
dsh plugin --profile web add "link:<本仓库的绝对路径>"
# 重启 dsh web 并刷新页面
```

### 升级
重新执行方式一的 `dsh plugin --profile web add ...` 命令即可升级到最新版，然后重启 dsh web 并刷新页面。

> 也可以直接把上面的命令发给你的 DSH 助手：“帮我升级 dsh-quick-prompts：执行 `dsh plugin --profile web add "https://github.com/lnyuqian/dsh-quick-prompts/releases/latest/download/dsh-quick-prompts.tgz"`，完成后提醒我重启 dsh web 并刷新页面。”

## 使用
1. 输入框上方常驻**横向快捷条**：第一行分类（悬停/点击切换）、第二行标题；点击标题 → 内容**追加到输入框原有内容之后**（不清空、不自动发送，可再编辑）。
2. 工具行闪电笔按钮（「权限切换」右侧）打开弹层：按分类分组浏览，点击同样**追加**到原有内容之后。
3. 弹层「导入MD」：选择 Markdown 文件，按 `### 分类 / 列表标题 / 缩进内容` 解析导入（同名标题跳过）。
4. 弹层「管理」：每行可改「分类 / 标题 / 内容」、新增、删除，点「保存」落盘到 `~/.dsh/quick-prompts.json`。

## 工作原理
| 半部 | 说明 |
|---|---|
| `lib/index.js`（服务端） | 注册 `GET/POST /api/quick-prompts`，读写全局 `~/.dsh/quick-prompts.json`（v2 分类结构，自动兼容旧 v1 平铺并迁移为「默认」分类） |
| `lib/client.js`（浏览器） | 纯 JS（`React.createElement`，无构建），注入 `conversation.input.dock`（常驻横向条）与 `conversation.input.left`（闪电笔弹层），持久化走 `/api/quick-prompts`。点击条目时经 `useInput` 快照（或 dock owner 的 `InputState`，再退化为 DOM）读取当前草稿，**追加**后交 `inputActions.setDraft` 写回 |

## 目录结构
```
dsh-quick-prompts/
├── package.json        # dsh.bundle.patch + dsh.client.platform: web
├── dsh.plugin.json     # 插件清单
├── cordis.patch.yml    # 宿主组合补丁（注册服务端插件行）
├── lib/index.js        # 服务端半部
├── lib/client.js       # 客户端半部
└── assets/快捷输入.svg  # 按钮图标源文件
```

## 协议
MIT
