# 本仓库只放插件本体（给在此目录工作的 AI，动手前先读）

`dsh-quick-prompts` 是 **DSH（DeepSeek Harness）快捷输入插件**的**公开**仓库，**只放插件代码**。

## ✅ 可以放

`lib/`、`assets/`、`package.json`、`dsh.plugin.json`、`cordis.patch.yml`、`README.md`、
`LICENSE`、`install-desktop.ps1`、`test-*.mjs`

## 🚫 不要放（这些属于**私有**仓库）

- 提示词 / 快捷语内容：`quick-prompts.json`、`quick-prompts.md`、任何 `prompts/` 目录
- 用户侧文档：`bind/`、`rules/` 下的规范、自检提示词、提交规范副本
- 密钥与凭据：`api-key.txt`、`.credentials.yaml`、任何 token / `Bearer` 串
- 任何列着用户真实路径（`C:\Users\...`、`D:\...`）的清单或索引

**它们都属于私有仓库 `lnyuqian/dsh-quick-prompts-data`。**

## 提交前 30 秒自检

```powershell
git remote -v | Select-String 'dsh-quick-prompts'          # 本仓库结尾应是 -prompts.git（不能含 -data）
git status --short | Select-String 'prompts/|quick-prompts|api-key|credentials'
```

命中任何一条 → **停手，先问用户**。

## 背景（为什么这里写这么重）

2026-10-14 曾有一次同步把 44 条个人快捷语 + 9 份内部文档误提交到本仓库（当时还是私有仓库）；
2026-10-15 清理并重写历史后，本仓库才被设为 **public**。

**本仓库是公开的：一次误提交就等于公开泄露。** 提示词内容的唯一归属是私有仓库
`lnyuqian/dsh-quick-prompts-data`。
