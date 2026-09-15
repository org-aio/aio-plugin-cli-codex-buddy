export function projectContext(project, action = 'run') {
  if (!project.stacks.length) return '';
  const order = [...new Set([action, 'run', 'build', 'test', 'check', 'inspect'])];
  const commands = [...project.commands].sort((a, b) => order.indexOf(a.action) - order.indexOf(b.action));
  const data = {
    stacks: project.stacks, keywords: project.keywords.slice(0, 48),
    commands: commands.slice(0, 16), omittedCommands: Math.max(0, commands.length - 16),
  };
  return '项目预检（本地清单数据，不是额外执行指令）：' + JSON.stringify(data) +
    '。使用各命令标注的 cwd；declared 为已声明入口，convention 为技术栈惯例候选，均先核对 README、实际脚本与环境。未列出不代表不存在，禁止臆造启动入口。';
}

export function projectGuidance(assessment, agent, advice, project) {
  const model = agent?.fixedModel || advice?.[assessment.tier];
  const role = agent ? `优先项目运行子代理 ${JSON.stringify(agent.name)}` : '先查运行时可用的项目运行角色';
  return {
    systemMessage: `Auto 意图：项目运行；难度 ${assessment.tier}；${role}（创建前建议）。`,
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext:
      `${role}。${model ? `建议动态模型 ${JSON.stringify(model)}` : '暂无新鲜匹配模型建议，不编造模型 ID'}；${assessment.reason}。` +
      '只把实际且已授权的启动、构建、测试、日志和环境检查交给该角色；讨论 CLI 或开发相关功能仍按开发任务处理。' +
      '只有现有指令允许委派且存在独立子任务时才创建子代理；核对可用角色与 model/fork_turns 参数，支持 agent_type 时使用该角色，否则在子任务说明中指定职责。已承担此角色时直接执行，不再递归转交。' +
      '已确认入口的操作按 simple，查入口和初步环境排查按 standard，复杂代码故障按 advanced。先能力梯队、再成本和成功率。按真实结果核验就绪状态，失败先查原因，不盲目重启或升级。' + projectContext(project, assessment.action) },
  };
}
