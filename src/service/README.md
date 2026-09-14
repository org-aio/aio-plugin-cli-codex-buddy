# 后台同步

将单文件 CLI 复制到 Codex 目录，避免依赖 npx 临时缓存。macOS 使用 LaunchAgent，Linux 使用 systemd 用户 timer，Windows 使用当前用户的计划任务。任务只保存运行路径，不保存凭据。watch 命令提供不依赖系统调度器的前台模式。
