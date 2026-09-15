const label = value => JSON.stringify(String(value).slice(0, 160));

export function planningGuidance(plan, agent) {
  if (!plan) return '';
  const role = agent ? `已发现执行角色 ${label(agent.name)}；` : '优先查询运行时的 plan-executor 执行角色；';
  const alternatives = (plan.executorCandidates || []).slice(1).map(item => `${label(item.model)}${item.effort ? `/${item.effort}` : ''}`).join('、');
  return `复杂任务采用规划与执行分工：规划/验收候选 ${label(plan.planner.model)}，执行候选 ${label(plan.executor.model)}，执行子任务起点 ${plan.executor.taskTier}。` +
    '先由强模型厘清目标、必要证据、设计和依赖，拆成范围明确、可独立验收的任务；不要因总任务复杂就让每个子任务继承 advanced。' +
    `${role}父代理给执行者一份精简任务包：目标、工作目录和文件范围、必要上下文、已确定的接口与步骤、禁止改动的边界、验收命令及成功条件。` +
    '先重新评估拆分后的任务，仍需架构、鉴权或业务冲突判断的部分由规划者解决，不能把未解决的复杂决策直接交给弱模型。' +
    `对适合的任务显式选择执行候选${plan.executor.effort ? `及其 reasoning effort ${label(plan.executor.effort)}` : '及该模型支持的默认 reasoning effort'}；仅在现有指令允许委派、存在独立子任务且工具支持该模型时创建。` +
    (alternatives ? `若首选不被创建工具支持，按序核对同级经济备选：${alternatives}；仅使用该工具明确支持的 ID 与推理强度。` : '') +
    '使用工具支持的最少历史交接（支持 fork_turns 时优先 none），不要为复制全量历史而继承强模型。候选不是已启用模型；若运行时不接受该 ID 且没有受支持的备选，明确报告组合未生效，不编造别名、不绕过工具约束，也不把继承的强模型称作廉价执行者。' +
    '按依赖串行或按独立文件分工，避免重叠修改；规划者等待执行结果后集中检查差异和验收证据，不逐次重复执行者的工具工作。' +
    `同一任务包最多尝试 ${plan.maxAttempts} 次实施修正；反复的实现/验证失败、缺少关键设计或超出范围时带已改文件、真实错误和剩余问题交回规划者，重规划后再交接。` +
    '权限、网络、搜索无匹配不是能力失败；核对副作用后再决定下一步，不能盲目重放提交、推送和发布。执行者结束时返回改动、测试结果、未完成项；规划者负责最终验收，不能把计划或工具调用当成完成。' +
    (!plan.distinctModels ? '当前规划与执行选中了同一模型，尚未形成跨模型成本分工。' : '') +
    ([plan.planner, plan.executor].some(item => item.preferredAvailable === false) ? '有首选模型不在当前合格目录，以上为动态替代建议。' : '');
}

export function executionGuidance(plan) {
  return '如果你收到规划者的执行任务包，只完成其中的已确定步骤和验收，使用包内相关上下文，不扩展为整项架构设计或再次递归委派。' +
    `同一任务包的实施修正最多 ${plan?.maxAttempts || 2} 次；关键设计不明确、持续验证失败或超出范围时把证据和已完成工作交回规划者。`;
}
