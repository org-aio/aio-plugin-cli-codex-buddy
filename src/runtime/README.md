# 本地运行工具

原子写文件、发现 Codex 可执行文件、执行已有凭据命令和 Codex 命令、进程锁。Windows 的 npm 包装器定位到官方 JS 入口，JS 文件由当前 Node 运行；命令不经过 shell，失败日志不包含子进程输出或认证信息。

一次性命令、stdio bridge 和透明转发共用 process.mjs 的参数与 Node 入口解析，统一处理 Windows 的 PATH 和 JS 启动。
