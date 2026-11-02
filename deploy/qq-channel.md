# QQ 官方机器人渠道

支持 QQ 单聊和群聊 @ 机器人查询 Mentora 已完成的定时任务结果。
腾讯已停止单聊/群聊主动消息推送，因此此渠道不加入定时通知队列。
不触发新的研究、交易或任意账户数据读取。飞书推送保持原有行为。

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

1. 在自己的定时任务菜单选择“连接 QQ”，复制指令。
2. 私聊机器人发送指令；群内使用时先 @ 机器人再发送。
3. 机器人返回最新成功结果的摘要和完整链接，并记住该任务。
4. 以后发送“最新”查询；发送“解绑”移除当前绑定。

每个机器人、QQ 会话和发送者独立绑定一个任务。绑定保存在任务 SQLite 数据库，
服务重启后保留。删除任务会使绑定失效。任务尚未完成时返回等待提示。
分享链接授予读取该任务结果的权限；在群中发送指令和结果会公开给群成员。
摘要最长 700 字，图表通过完整网页查看。不是 QQ 中自由提问的聊天代理。

回调签名使用原始请求体，拒绝缺失签名、篡改或超过五分钟的签名时间戳。
回调按机器人/会话/消息 ID 去重，回复固定使用 `msg_seq=1` 防止重复发送。
失败回复返回 HTTP 503，允许平台重投；不记录原始密钥、消息内容或分享链接。
HTTP 成功但没有消息 ID 也视作失败。网络超时后的送达情况需要在 QQ 中核对。

## 验证

```sh
python3 -m pytest tests/test_qq_channel.py tests/test_day_tasks.py -q
node --test tests/task-workspace.test.mjs
```

这些测试隔离外部网络，不能替代真实 QQ 平台回调验证与收发联调。

协议依据：
- https://github.com/tencent-connect/bot-docs/blob/main/docs/develop/api-v2/dev-prepare/interface-framework/api-use.md
- https://github.com/tencent-connect/bot-docs/blob/main/docs/develop/api-v2/dev-prepare/interface-framework/event-emit.md
- https://github.com/tencent-connect/bot-docs/blob/main/docs/develop/api-v2/server-inter/message/send-receive/send.md

## 本次本地验证记录

Python 相关测试 84 项通过。页面测试 50 项中 27 项通过、23 项失败；
对照修改前提交，原有 49 项测试也有相同的 23 项失败，涉及历史渲染、侧栏和规划交互。
新增 QQ 测试及任务菜单、飞书设置等 7 项定向交互测试通过。
未进行线上部署，也未使用真实 AppSecret 验证腾讯平台收发。
