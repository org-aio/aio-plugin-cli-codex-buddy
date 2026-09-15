import { executionGuidance } from '../planning/guidance.mjs';

const label = value => JSON.stringify(String(value || 'unknown').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 160));
const context = (event, text, systemMessage) => ({
  ...(systemMessage ? { systemMessage } : {}),
  hookSpecificOutput: { hookEventName: event, additionalContext: text },
});

export function toolFailed(response) {
  // Bash can provide stdout alone, without exit status. Never interpret stdout
  // (including JSON printed by the command) as an authoritative result envelope.
  if (!response || typeof response !== 'object' || Array.isArray(response)) return false;
  return response.isError === true || (Number.isInteger(response.exit_code) && response.exit_code !== 0);
}

export function guidance(input, advice, state = {}) {
  const event = input.hook_event_name;
  const active = `Auto Hook：实际模型 ${label(input.model)}`;
  const selection = advice
    ? `当前供应商动态目录的缓存建议：简单任务 ${label(advice.simple || '无匹配')}，常规任务 ${label(advice.standard || '无匹配')}，复杂任务 ${label(advice.advanced || '无匹配')}。先按任务难度筛选能力梯队，再在梯队内部参考成本和成功率；成功率不等于能力。能力和成本是估算；创建前确认模型仍可用。`
    : '暂无新鲜的供应商模型建议；沿用当前模型，不猜测或编造模型 ID。';
  const boundary = '只有现有指令允许委派且存在独立子任务时才创建子代理；遵守工具对 model 和 fork_turns 的约束。已运行的代理不能通过这些 Hook 改模型，交接时才能由父代理选择受支持的模型参数。';
  const alternatives = (advice?.planning?.executorCandidates || []).slice(1).map(item => label(item.model)).join('、');
  if (event === 'SubagentStart') return context(event,
    `${active}。${selection}仅完成分配的任务。无冲突的提交、推送、状态查询，以及已确认入口的启动、构建、测试按简单操作处理；入口查找、初步环境排查和局部修改按常规任务处理；设计、冲突解决和复杂代码故障按复杂任务处理。Git 或项目运行专用子代理直接处理其子任务，不再转交同类子代理。` +
    `遇到超出能力的阻碍，汇报证据、已完成步骤和剩余工作，避免反复重试有副作用的操作。${executionGuidance(advice?.planning)}结束时简述结果、验证以及需要父代理接手的内容。${boundary}`, active);
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
    `${selection}${boundary}` + (advice?.planning ? `复杂父任务优先由 ${label(advice.planning.planner.model)} 规划和集中验收，把已拆清且可独立验收的局部实现交给 ${label(advice.planning.executor.model)} 候选执行；${alternatives ? `首选不受工具支持时依次核对同级备选 ${alternatives}。` : ''}按子任务难度选择模型，用精简任务包交接，避免全量历史和重复工具工作。候选未代表已启用；核对 SubagentStart 的实际模型。` : '') + (input.tool_name === 'Bash' && typeof input.tool_response === 'string'
      ? '此客户端的 Bash Hook 只提供标准输出，无法据此判断退出码。请结合你收到的原始工具结果检查退出码和真实执行状态；空输出不代表成功。' : '') + (failed
      ? '本次工具报告非零退出或结构化错误。先核实它是否表示预期结果（例如搜索无匹配），再区分权限、网络、环境与代码问题。确认是复杂度上升或反复失败时，向父代理交接证据并建议高级模型处理；更换模型不会修复权限或网络。先核实已有副作用，禁止盲目重放提交、推送、发布等操作。'
      : '执行后依据真实结果重新评估难度：入口查找、依赖或端口等初步环境排查按常规任务处理；业务冲突和复杂代码故障按复杂任务处理。核对真实退出码、服务就绪状态和测试结果，不要仅因调用了工具就升级模型。'),
    failed ? `${active}；工具异常信号，建议重新评估任务难度（未切换模型）。` : undefined);
}
