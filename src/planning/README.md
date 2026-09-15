# 规划与执行分工

`model.mjs` 定义策略；`selection.mjs` 从同一供应商的实时合格模型选择规划者和执行候选，不固定模型家族。复杂父任务仍要求 advanced，拆分后的执行任务默认 standard，优先经济性。首选模型失效时重新选择并明确显示。

`guidance.mjs` 生成精简任务包、少历史交接、实施修正次数和集中验收指导。Hook 不创建代理、不修改运行中模型，也不把执行候选计作已经启用。App Server 接受主模型和 SubagentStart 报告实际子模型是两种不同证据。

`commands.mjs` 配置 `router planning`；开启前验证显式首选来自当前合格目录。每个新的父轮次重新选择，政策可以热更新；角色/Hook 代码更新需要重新安装并由 Codex 重新审核信任。
