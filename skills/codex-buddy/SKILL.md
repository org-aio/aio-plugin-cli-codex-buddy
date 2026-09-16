---
name: codex-buddy
description: 配置和诊断 Codex Buddy 的供应商模型同步、Auto Router、规划执行分工与无模型工具分发。用户要求同步模型、设置自动选模、查看实际选模、安装或卸载 Codex Buddy 时使用；不为普通编程任务启用。
---

# Codex Buddy

使用 `codex-buddy`；未全局安装时使用 `npx -y codex-buddy`。先查 `--help`、`status --json` 或对应 router 状态，结合真实结果操作。普通无参数命令是模型同步和后台任务安装，不会隐式开启桌面路由。

- 同步：`sync`；默认安装：`setup`；前台跟随：`watch`；恢复配置并卸载后台集成：`uninstall`。
- 路由安装：`router setup`；查看：`router status`；切换：`router enable` / `router disable`；卸载：`router uninstall`。桥接或 hooks 更新后需要重启桌面端，修改过的 hooks 由用户在 `/hooks` 复核。
- 模型目录：`router models --json`。真实模型 ID 从当前 Codex 供应商 `/v1/models` 获取；不根据这份技能或模型名字编造实时可用性、价格、能力和成功率。
- 规划执行：`router planning --planner-model ID --executor-model ID`，也支持 `auto` / `off` / `status`。父模型负责规划和验收，执行模型只是候选；以实际子代理启动模型为准，并遵守当前委派权限和工具支持范围。
- 项目入口：在目标项目执行 `router project --json`。`router preview "任务"` 会读取供应商并预览模型选择，不执行任务。
- 零模型预览：`router match "跑起来看看" --json`。它只读本地上下文，返回 tool / clarify / llm；不执行命令，不访问供应商。`router dispatch on|off|status` 控制工具直达。

规则直达只处理完整短句或已发现的精确命令，要求入口唯一和受支持的本地权限上下文。Git 写操作、冲突、带修复要求的复合任务、附件和不兼容环境交回模型。命中时必须显示模型为无并保留真实退出码；启动进程不代表网页就绪，不把未执行的候选或预览当成完成。

`--home PATH` 选择 Codex 配置目录。供应商凭据与 npm 发布凭据用途不同；诊断时不输出 API key。项目从 codex-model-sync 改名后继续沿用原状态目录与服务身份；迁移 npm 名称不需要先恢复或删除已有 Codex 配置。
