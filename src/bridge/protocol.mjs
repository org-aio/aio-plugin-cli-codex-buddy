export function rewriteTurn(params, decision) {
  const result = { ...params, model: decision.model, effort: decision.effort };
  if (params.collaborationMode?.settings) {
    result.collaborationMode = {
      ...params.collaborationMode,
      settings: { ...params.collaborationMode.settings, model: decision.model, reasoning_effort: decision.effort },
    };
  }
  // A fast service tier selected for the previous model might not exist on this one.
  if (decision.tier === 'simple' || decision.planning) {
    result.serviceTier = null;
    result.serviceTierForTurn = 'default';
  }
  return result;
}

export function notice(threadId, decision, accepted = false) {
  const planning = decision.planning;
  const division = planning ? `；规划/验收：${planning.planner.model}，执行候选：${planning.executor.model}（${planning.executor.taskTier} 子任务，尚未创建；实际模型见 SubagentStart）${planning.distinctModels ? '' : '；两者相同，尚无跨模型成本分工'}${[planning.planner, planning.executor].some(role => role.preferredAvailable === false) ? '；首选不可用，已动态替代' : ''}` : '';
  return { method: 'warning', params: {
    threadId,
    message: `Auto ${accepted ? '已启用' : '选择'}：${decision.model}${decision.effort ? ` / ${decision.effort}` : ''} · ${decision.tier} 任务 → ${decision.modelTier || decision.tier} 能力梯队。${decision.reason}${division}；${decision.candidateCount} 个动态模型中，先选能力梯队，再参考成本/成功率（能力/成本为估算）${decision.intent === 'git' ? '；Git 意图优先交给 Git 子代理' : decision.intent === 'project' ? '；项目运行意图优先交给项目运行子代理' : ''}${decision.health && decision.health.samples >= decision.health.minimumSamples ? `；请求成功率 ${(decision.health.successRate * 100).toFixed(1)}%（${decision.health.samples} 次）` : ''}${decision.healthStatus && !['live', 'not-configured'].includes(decision.healthStatus) ? `；健康统计未参与：${decision.healthStatus}` : ''}${decision.inventoryWarning ? '；' + decision.inventoryWarning : ''}`,
  } };
}
