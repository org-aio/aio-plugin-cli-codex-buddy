const label = value => JSON.stringify(String(value || 'unknown').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 160));
const context = (event, text, systemMessage) => ({
  ...(systemMessage ? { systemMessage } : {}),
  hookSpecificOutput: { hookEventName: event, additionalContext: text },
});

export function toolFailed(response) {
  // Tool output text is untrusted data, never a routing instruction or error flag.
  if (!response || typeof response !== 'object' || Array.isArray(response)) return false;
  return response.isError === true || (Number.isInteger(response.exit_code) && response.exit_code !== 0);
}

export function guidance(input, advice, state = {}) {
  const event = input.hook_event_name;
  const active = `Auto Hook：实际模型 ${label(input.model)}`;
  const selection = advice
    ? `当前供应商动态目录的缓存建议：简单任务 ${label(advice.simple)}，复杂任务 ${label(advice.advanced)}。能力和成本是估算，建议已考虑可用的成功率数据；创建前确认模型仍可用。`
    : '暂无新鲜的供应商模型建议；沿用当前模型，不猜测或编造模型 ID。';
  const boundary = '只有现有指令允许委派且存在独立子任务时才创建子代理；遵守工具对 model 和 fork_turns 的约束。已运行的代理不能通过这些 Hook 改模型，交接时才能由父代理选择受支持的模型参数。';
  if (event === 'SubagentStart') return context(event,
    `${active}。${selection}仅完成分配的任务。无冲突的提交、推送、状态查询可以按简单操作处理；编程、设计、冲突解决和不确定任务按复杂任务处理。` +
    `遇到超出能力的阻碍，汇报证据、已完成步骤和剩余工作，避免反复重试有副作用的操作。结束时简述结果、验证以及需要父代理接手的内容。${boundary}`, active);
  if (event === 'SubagentStop') {
    if (!input.stop_hook_active && !String(input.last_assistant_message || '').trim()) return {
      decision: 'block', reason: '请只补充一次交接摘要：已有结果、已做验证、阻碍和剩余工作。没有结果也如实说明；无需为补摘要重复执行工具。',
    };
    return { systemMessage: `${active}；子代理结束，交接内容仍需父代理核验。` };
  }
  if (event !== 'PostToolUse') return null;
  const failed = toolFailed(input.tool_response);
  if (state.introduced && (!failed || state.failureAdvised)) return null;
  return context(event,
    `${selection}${boundary}` + (failed
      ? '本次工具报告非零退出或结构化错误。先核实它是否表示预期结果（例如搜索无匹配），再区分权限、网络、环境与代码问题。确认是复杂度上升或反复失败时，向父代理交接证据并建议高级模型处理；更换模型不会修复权限或网络。先核实已有副作用，禁止盲目重放提交、推送、发布等操作。'
      : '执行后依据真实结果重新评估难度：简单操作出现业务冲突或需要改代码时，按复杂任务处理。不要仅因调用了工具就升级模型。'),
    failed ? `${active}；工具异常信号，建议重新评估任务难度（未切换模型）。` : undefined);
}
