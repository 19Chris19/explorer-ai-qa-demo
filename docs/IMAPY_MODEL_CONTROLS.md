# IMApy 模型与模式选择（本地候选）

与 Provider 的 `imapy_chat_v1` 配套；不直接读取账号池或调用 IMA。
`GET /api/qa/chat-capabilities?conversationId=...` 经 BFF 使用内部凭据转发，校验本网站会话归属。
普通浏览器不接触服务凭证。网关与 Vercel 增加此只读路径和共享控件静态文件。

任务及待发队列增加可选 `modelSelection:{modelRef,mode}`；`sourceIntent=web` 沿原接口传递，
BFF 同时写入明确的 `webSearch` 选择。字段经过白名单校验，纳入请求指纹和队列保存。
编辑待发文字不会悄悄替换此前冻结的模型选择；同键换选择返回冲突。

一个紧凑按钮选择模型和快速／深度；默认由管理员指定。选择只用于下一次提交，
当前生成、旧回答和已有草稿不随按钮变化。联网不兼容时明确阻止提交。
新旧会话通过 Provider 能力响应区分；旧会话保留原行为，新能力提示新建会话使用。

Provider 默认页、嵌入页、网站使用相同的 model-picker.js/css。新增回答详情显示当轮请求，
上游未报告版本时明确标为未确认。历史与归档保留新增元数据，不改写旧数据。

Node 22 下运行全仓离线回归；已对接配套 Provider 的合成身份、调度和导出测试。
本地演示由 Provider 候选的 `scripts/preview-imapy-kernel.mjs --website /absolute/website/path`
启动，网站入口为 4591。仅合成数据，不连接当前线上服务。

真实账号、手机真机、原生软键盘、正式发布与 Vercel 部署另行验收。本候选未上线。
