export function rewriteTurn(params, decision) {
  const result = { ...params, model: decision.model, effort: decision.effort };
  if (params.collaborationMode?.settings) {
    result.collaborationMode = {
      ...params.collaborationMode,
      settings: { ...params.collaborationMode.settings, model: decision.model, reasoning_effort: decision.effort },
    };
  }
  // A fast service tier selected for the previous model might not exist on this one.
  if (decision.tier === 'simple') {
    result.serviceTier = null;
    result.serviceTierForTurn = 'default';
  }
  return result;
}

export function notice(threadId, decision, accepted = false) {
  return { method: 'warning', params: {
    threadId,
    message: `Auto ${accepted ? '已启用' : '选择'}：${decision.model}${decision.effort ? ` / ${decision.effort}` : ''} · ${decision.tier === 'simple' ? '简单任务' : '高级任务'}。${decision.reason}；从 ${decision.candidateCount} 个动态模型中选择（能力/成本为估算）${decision.health && decision.health.samples >= decision.health.minimumSamples ? `；请求成功率 ${(decision.health.successRate * 100).toFixed(1)}%（${decision.health.samples} 次）` : ''}${decision.healthStatus && !['live', 'not-configured'].includes(decision.healthStatus) ? `；健康统计未参与：${decision.healthStatus}` : ''}${decision.inventoryWarning ? '；' + decision.inventoryWarning : ''}`,
  } };
}
