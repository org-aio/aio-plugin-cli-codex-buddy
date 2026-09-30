# 验证

本地 HTTP 服务与独立 CLI 子进程验证配置、增删同步、鉴权、失败保护、卸载和打包入口；纯函数测试覆盖多行 TOML 安全编辑及跨平台调度参数转义。

`probe.test.mjs` 使用本地 Responses 服务验证真实请求、并发上限、超时、逐模型原子进度、凭据范围隔离、七天内成功和失败复用、到期边界、断点恢复、显式强制复测、部分复测保留时间戳、换模识别和非零退出码；函数工具仅验证返回契约，不执行工具。

卸载回归覆盖调度器失败继续回滚、缺失任务、部分安装、重复卸载、并发同步、旧运行时路径保护与重新安装。Windows CI 实际删除计划任务后再次执行卸载。

Project fixtures cover manifest discovery without script execution, inherited workspace CLIs, Kotlin application modules, prompt-submit hints, specialist ownership migration, and model selection through the packaged App Server bridge.

CLI integration tests isolate the OS scheduler and confirm that plain setup installs no background task, explicit `--service` uses the configurable weekly default, and synchronization never installs a router or changes an existing router policy.

Windows 回归验证命令执行和长驻子进程都能运行带空格的 JS 路径；bridge 清理识别已经退出的进程并限定等待时间，hook 安装测试遵循 POSIX 支持边界。

规划/执行回归覆盖强规划与经济执行分工、实时首选失效替换、未知模型隔离、子任务能力要求、角色固定模型冲突、精简交接、实际模型与候选区分、策略迁移及原简单任务路径。

确定性分发覆盖完整短句与否定/混合请求、多入口歧义、POSIX 参数引用、权限/环境/规划模式边界、原生轮次 ID 与真实失败结果。设置 `CODEX_TEST_BINARY` 后，`native-dispatch.test.mjs` 在隔离配置下使用真实 App Server 验证零供应商请求、历史持久化和中断后 npm 子进程清理。
