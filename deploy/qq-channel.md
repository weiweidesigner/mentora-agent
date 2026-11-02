# QQ 官方机器人渠道

支持 QQ 单聊和群聊 @ 机器人直接向 Mentora 提问、连续追问，并查询已完成的定时任务结果。
腾讯已停止单聊/群聊主动消息推送，因此此渠道不加入定时通知队列。
普通问题调用原有 Mentora Agent 研究流程；QQ 身份与网页用户隔离，限定只读研究。飞书推送保持原有行为。

## 服务器配置

在部署服务使用的私有环境文件中设置以下变量，然后重启 Mentora 服务：

```dotenv
QQ_BOT_APP_ID=填写机器人AppID
QQ_BOT_APP_SECRET=填写重置后的AppSecret
VEYA_PUBLIC_URL=https://weiweidesigner.com/mentora/
```

不要把真实密钥写进仓库或截图。未配置凭据时回调与连接指令接口返回 503。
密钥轮换后需重启服务，清除旧进程配置。

## QQ 后台配置

1. 在机器人开发设置中选择 Webhook / HTTP 回调接收消息。
2. 代码部署后将回调地址设为 `https://weiweidesigner.com/mentora/api/qq/webhook`。
3. 平台验证回调地址时，服务自动返回 Ed25519 签名。
4. 订阅 `C2C_MESSAGE_CREATE`（单聊）和 `GROUP_AT_MESSAGE_CREATE`（群聊 @）。
5. 在消息 URL 配置中添加 `weiweidesigner.com`，允许回复完整报告链接。
6. 按后台要求配置服务器出口 IP 白名单和测试/沙箱成员，添加机器人开始测试。

后台入口名称以实际界面为准；此实现使用正式 API `https://api.sgroup.qq.com`。
若你的应用仍限定在沙箱 API 环境，需先调整应用使用范围，不能声称已联通。
现有 Nginx `/mentora/` 代理会转发回调和签名请求头，无需额外开放端口。

## 使用

直接发送“今天 A 股市场表现”等问题，无需绑定任务。收到请求后先回复正在分析，
后台调用 Mentora，再回复文字和完整回答/图表链接。每个机器人、会话及用户独立维护上下文。
“新对话”重置上下文；“最新”或“结果”查看最近一次对话结果；“帮助”查看说明。
同一会话每次执行一个问题，其他会话可并行；重复平台回调不重复执行研究。
群内分析超过回复时限时保存结果，用户再次发“最新”即可获取。
服务重启时已在运行的分析标记中断，未执行的排队问题恢复，已完成回答保留。

定时任务结果仍可绑定：

1. 在自己的定时任务菜单选择“连接 QQ”，复制指令。
2. 私聊机器人发送指令；群内使用时先 @ 机器人再发送。
3. 机器人返回最新成功结果的摘要和完整链接，并记住该任务。
4. 以后发送“任务最新”查询绑定任务；发送“解绑”移除当前绑定。若没有普通对话，“最新”也可查询任务。

每个机器人、QQ 会话和发送者独立绑定一个任务。绑定保存在任务 SQLite 数据库，
服务重启后保留。删除任务会使绑定失效。任务尚未完成时返回等待提示。
分享链接授予读取该任务结果的权限；在群中发送指令和结果会公开给群成员。
定时任务摘要最长 700 字，对话摘要最长 1400 字，完整回答与图表通过网页查看。

回调签名使用原始请求体，拒绝缺失签名、篡改或超过五分钟的签名时间戳。
回调按机器人/会话/消息 ID 去重，任务查询回复使用 `msg_seq=1`；普通对话收到确认使用 1、最终回答使用 2。
失败回复返回 HTTP 503，允许平台重投；日志不输出密钥、消息内容或分享链接；问题、答案和上下文存储在私有任务数据库。
HTTP 成功但没有消息 ID 也视作失败。网络超时后的送达情况需要在 QQ 中核对。

## 验证

```sh
python3 -m pytest tests/test_qq_chat.py tests/test_qq_channel.py tests/test_day_tasks.py -q
node --test tests/task-workspace.test.mjs
```

这些测试隔离外部网络，不能替代真实 QQ 平台回调验证与收发联调。

协议依据：
- https://github.com/tencent-connect/bot-docs/blob/main/docs/develop/api-v2/dev-prepare/interface-framework/api-use.md
- https://github.com/tencent-connect/bot-docs/blob/main/docs/develop/api-v2/dev-prepare/interface-framework/event-emit.md
- https://github.com/tencent-connect/bot-docs/blob/main/docs/develop/api-v2/server-inter/message/send-receive/send.md

## 验证记录

自由对话、用户/群隔离、连续追问、上下文重置、异步回调、重复回调、失败恢复、
回复超时保存、原有任务推送等使用隔离测试验证。QQ 平台回调与鉴权此前已联通。
真实模型和平台收发在部署后分别验证，不能仅凭测试结果声称已收到 QQ 最终回复。
