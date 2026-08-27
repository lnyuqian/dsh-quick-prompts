# dsh-quick-prompts

DeepSeek Harness (DSH) Web 客户端插件：**输入框快捷输入（闪电笔）**。

在输入框工具行「权限切换」右侧增加一个闪电笔按钮。点开弹层，选一条预设提示词即可**直接发送**（填入输入框并立即提交）。提示词支持「管理」模式**新增 / 修改 / 删除**，持久化到**项目根目录**，随项目走、可提交 git。

## 功能
- 入口：输入框工具行权限切换右侧的闪电笔按钮（图标见 `assets/快捷输入.svg`，内联进客户端，填充色跟随主题）。
- 点选即发：点一条提示词 = `setDraft` + `submit`，直接发送（以 `/` 开头的内容按命令路由，与手打一致）。
- 管理：弹层右上角「管理」→ 新增 / 改标题与内容 / 删除 →「保存」落盘。
- 持久化：数据存 `<项目根目录>/.dsh/quick-prompts.json`，结构 `{ "version": 1, "prompts": [{ "id", "title", "text" }] }`。

## 安装（本机）
```powershell
# 1. 把本目录注册进 web profile（dependencies 用 link:，bundles 加名字）
#    编辑 C:\Users\Administrator\.dsh\profiles\web\package.json：
#    dependencies 增加  "dsh-quick-prompts": "link:E:/dsh-web/插件技能安装/dsh-quick-prompts"
#    dsh.profile.bundles 增加  "dsh-quick-prompts"
# 2. 在 profile node_modules 建 junction：
New-Item -ItemType Junction -Path 'C:\Users\Administrator\.dsh\profiles\web\node_modules\dsh-quick-prompts' -Target 'E:\dsh-web\插件技能安装\dsh-quick-prompts'
# 3. 重启 dsh web 并刷新页面。
```

## 结构
```
dsh-quick-prompts/
├── package.json        # dsh.bundle.patch + dsh.client.platform: web
├── dsh.plugin.json     # 插件清单
├── cordis.patch.yml    # 宿主组合补丁（注册服务端插件行）
├── lib/index.js        # 服务端半部：/api/quick-prompts 读写
├── lib/client.js       # 客户端半部：按钮 + 弹层 + 管理（纯 JS，无构建）
└── assets/快捷输入.svg  # 图标源文件
```

## 服务端接口
- `GET  /api/quick-prompts?sessionId=...` → `{ ok, prompts }`
- `POST /api/quick-prompts` body `{ sessionId, prompts }` → `{ ok, prompts }`

## 协议
MIT
