# Skill Agent Runtime 改造说明

AiChart 现在把「LLM 规划」和「Skill 脚本执行」之间抽出了一层 `AgentRuntime`。

这层不是为了马上强依赖 Docker，而是先把工程边界立住：Run 状态、Workspace、Sandbox Policy、资源请求、命令执行、事件日志。后续可以把本地 subprocess executor 替换成 Docker / Kubernetes / microVM executor，而不需要重写规划和图表链路。

## 当前链路

```text
User
  ↓
FastAPI / Agent Runtime
  ↓
LLM 生成 route + steps
  ↓
AgentRuntime.create_run()
  ├─ outputs/runs/run-*/work
  ├─ outputs/runs/run-*/output
  └─ outputs/runs/run-*/logs/events.jsonl
  ↓
SkillExecutionRequest
  ├─ command
  ├─ cwd
  ├─ env
  ├─ ResourceRequest
  └─ SandboxPolicy
  ↓
Local subprocess executor
  ↓
stdout / stderr / artifacts
  ↓
LLM 解读 + report
```

## 代码位置

- `app/agent_runtime.py`
  - `AgentRuntime`
  - `AgentRun`
  - `WorkspaceLayout`
  - `SkillExecutionRequest`
  - `SkillExecutionResult`
  - `ResourceRequest`
  - `SandboxPolicy`

- `app/main.py`
  - `create_agent_run()`
  - `execute_skill_command()`
  - `run_skill_script()` 统一通过 runtime 执行普通 Skill、搜索 Skill、URL reader 等脚本

## 现在已经具备的边界

### Run Store

每次 `/api/chat` 或 `/api/chat/stream` 都会创建一个 `AgentRun`：

```text
outputs/runs/run-<timestamp>/
├── work/
├── output/
└── logs/
    └── events.jsonl
```

`events.jsonl` 会记录：

- run created
- tool started
- tool finished
- command（已做基础脱敏）
- cwd
- resource request
- sandbox policy
- return code
- duration
- stdout/stderr 字符数

### Sandbox Contract

当前实现是：

```json
{
  "runtime": "local-subprocess",
  "network": "inherited",
  "filesystem": "workspace-scoped",
  "permissions": "unprivileged"
}
```

这只是本地开发实现。生产可以替换为：

```json
{
  "runtime": "docker",
  "network": "restricted-egress",
  "filesystem": "workspace-mounted",
  "permissions": "rootless"
}
```

或者：

```json
{
  "runtime": "k8s-pod",
  "network": "network-policy",
  "filesystem": "ephemeral-volume",
  "permissions": "restricted-pod-security"
}
```

## 后续 Docker Executor 接入点

只需要在 `app/agent_runtime.py` 里新增 executor，然后让 `AgentRuntime.execute()` 根据 `SandboxPolicy.runtime` 分发：

```python
if request.policy.runtime == "docker":
    return docker_executor.execute(run, request)
return local_executor.execute(run, request)
```

Docker executor 需要负责：

- 选择镜像
- 挂载 workspace
- 设置 CPU / memory / timeout
- 设置 network policy
- 限制用户权限
- 收集 stdout / stderr / artifacts
- 清理 container

推荐容器参数方向：

```text
--cpus=2
--memory=4g
--network=none 或受控 egress
--read-only
--tmpfs /tmp
--security-opt no-new-privileges
--cap-drop ALL
--user nonroot
```

## 注意

LLM 不直接申请 Docker / CPU / 内存 / 网络权限。

LLM 只表达“需要运行某个 Skill”。Runtime 根据策略决定：

- 是否需要 sandbox
- 使用哪个 runtime
- 允许哪些文件
- 是否联网
- 超时时间
- CPU / RAM 上限

这个边界是安全核心。
