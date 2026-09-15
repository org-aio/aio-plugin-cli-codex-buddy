# 动态模型路由

统一入口为 `codex-model-sync router`。每轮从当前 Codex 供应商读取全量 `/v1/models`，不按供应商或家族白名单过滤。
`inventory.mjs` 生成并缓存全部 ID 的估算能力、经济性、用途及工具支持；不完整评估回退通用名称估算，明确标注来源。
`intent.mjs` 区分 Git、项目运行意图与 simple/standard/advanced 任务难度；`operations.mjs` 根据项目预检入口识别启动、构建、测试和 CLI 命令。`assessment.mjs` 读取项目清单，仅对简单 Git 操作核验冲突及进行中状态。
`tiers.mjs` 将模型能力分梯队；`policy.mjs` 先匹配梯队（只允许向上回退），再在梯队内部评分。成功率不能提高模型能力等级，没有匹配梯队时拒绝启动本轮。
`health.mjs` 读取专用 Key 的分组成功率并按样本置信度降权。难度为本地规则判断，模型能力为可覆写的估算，未接入训练好的 RouterLLM 分类器。
`commands.mjs` 处理安装/状态/预览/开关及健康统计配置，`index.mjs` 组合以上功能。

策略与凭据每轮重新读取；模型 Key 仍来自 Codex，健康 Key 单独存在用户指定私密文件。
模型评估缓存只有模型元数据，不包含任务内容或凭据。旧原型的 GPT 家族白名单自动迁移移除。
