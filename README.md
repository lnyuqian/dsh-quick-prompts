# dsh-quick-prompts

DeepSeek Harness (DSH) Web 客户端插件：**输入框快捷输入（闪电笔）**。

在会话输入框工具行「权限切换」右侧增加一个闪电笔按钮，点开即可选一条预设提示词**直接发送**。提示词随时可增删改，数据持久化在**当前项目根目录**，随项目走、可提交 git。

## 功能特性

- **一键直达**：点闪电笔 → 选提示词 → 填入输入框并立即发送（等价于粘贴后直接回车；以 `/` 开头的内容按命令路由，与手打一致）。
- **提示词管理**：弹层右上角「管理」，可新增 / 修改标题与内容 / 删除，点「保存」即落盘。
- **随项目走**：数据存 `<项目根目录>/.dsh/quick-prompts.json`（`{ "version": 1, "prompts": [{ "id", "title", "text" }] }`），换项目各存各的，可提交版本库共享给团队。
- **图标随主题**：按钮图标见 `assets/快捷输入.svg`，以 `currentColor` 内联渲染，自动跟随明暗主题与悬停色。

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
1. 在输入框工具行找到闪电笔按钮（位于「权限切换」右侧）。
2. 点开弹层，点一条提示词 → **直接发送**。
3. 弹层右上角「管理」：新增 / 改标题与内容 / 删除，点「保存」落盘到当前项目根目录 `.dsh/quick-prompts.json`。

## 工作原理
| 半部 | 说明 |
|---|---|
| `lib/index.js`（服务端） | 注册 `GET/POST /api/quick-prompts`，按会话 `header.cwd` 解析项目根目录，读写 `.dsh/quick-prompts.json` |
| `lib/client.js`（浏览器） | 纯 JS（`React.createElement`，无构建），注入 `conversation.input.left` 槽位渲染按钮/弹层/管理面板，持久化走 `/api/quick-prompts` |

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
