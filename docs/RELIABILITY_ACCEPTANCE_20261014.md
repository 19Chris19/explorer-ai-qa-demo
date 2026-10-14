# 网站可靠性候选验收（2026-10-14）

基线为知天下 v0.4.0（main 3a8593bd288098affb4d3280da4ddb0998d6d5db）。候选以私有 Unix IPC 按需读取排空计数，移除 250ms 同步快照/文件与目录 fsync 心跳；维护模式 CAS、私有 writer、全部工作计数和 fail-closed 保护保留。

Node 22.23.3 完整测试：332 通过、2 个既有跳过、0 失败；生产构建通过。覆盖实时 CLOSED/代际确认、旧快照不可信、失去 writer、权限、无响应 2 秒截止、单写入者、断流清理、暂停和过期待发项以及公网不暴露控制入口。macOS 策略与实际 spawn-type 检查有合成测试。

6 份本机 plist 已仅在私有目录生成候选副本，逐项比较确认除 ProcessType 外的配置完全相同，目录/文件权限为 0700/0600，未安装或 bootstrap。Provider、BFF、relay、gateway、tunnel 为 Interactive，monitor 保持 Background。配套控制脚本必须随 BFF 一起更新。

本候选未变更现有服务、登录态、网站签名、历史、隧道或 Vercel，也未发起真实 IMA 问答、扫码或操作 Air。Provider 的持久化性能对照由其配套 PR 提供，不能据此承诺真实 IMA 耗时。真实重建负载、上线实际调度、跨平台长期运行和正式真实问答仍需授权验收。

受控更新前须备份当前代码/私有覆盖层及最新一致数据；在旧 gate 下先关闭入口并证明排空，更新 Provider、BFF、控制工具及 plist，保持 CLOSED 验证版本和摘要后才恢复入口。回退保持最新数据及 JSONL v2，不能覆盖新历史。见 MAINTENANCE_DRAIN.md 和 MACOS_SERVICE_SCHEDULING.md。
