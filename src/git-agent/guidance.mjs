const label = value => JSON.stringify(String(value).slice(0, 160));
export function gitGuidance(assessment, agent, advice) {
  const candidate = agent?.fixedModel || advice?.[assessment.tier];
  const role = agent ? `优先选择已发现的 Git 子代理 ${label(agent.name)}` : '当前未发现满足条件的 Git 子代理；先查运行时可用的 Git 专用角色';
  const selection = candidate ? `本任务建议模型 ${label(candidate)}，按 ${assessment.tier} 难度匹配能力梯队。`
    : '暂无满足该梯队的新鲜模型建议；刷新路由目录或保留父代理处理，不能自行降到弱模型。';
  return {
    systemMessage: `Auto 意图：Git；难度 ${assessment.tier}；${role}（创建前建议）。`,
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext:
      `快速意图检测发现 Git 相关字眼，${role}。${selection}${assessment.reason}。` +
      '先区分实际 Git 操作与讨论、示例、开发 Git 功能的需求；只把实际且已获授权的 Git 子任务交给该角色，混合任务的开发部分仍由开发代理处理。' +
      '若你已经承担 Git 专用子任务，直接执行并交接，不要再次转交 Git 子代理。创建前核对运行时可用角色与 model/fork_turns 参数；工具支持 agent_type 时使用发现的角色，否则在允许的子任务说明里指定 Git 职责。' +
      '普通提交、推送、无冲突合并可用 simple 梯队；代码冲突、复杂变基和业务语义判断必须用 advanced 梯队。成功率只用于匹配梯队内部排序，不能把弱模型升级为强模型。' +
      '先只读检查仓库状态；已有合并/变基或未解决冲突时按 advanced 处理。关键词命中不增加操作权限，不自动执行 push、force push 或丢弃修改。' },
  };
}
