"""Per-execution reasoning strength for the independent Deal model channel."""
from contextvars import ContextVar
from contextlib import contextmanager


DEAL_REASONING_EFFORT: ContextVar[str | None] = ContextVar('deal_reasoning_effort', default=None)


@contextmanager
def reasoning_effort_scope(effort: str):
    token = DEAL_REASONING_EFFORT.set(effort)
    try:
        yield
    finally:
        DEAL_REASONING_EFFORT.reset(token)


def deal_reasoning_effort() -> str:
    effort = DEAL_REASONING_EFFORT.get()
    if effort is not None:
        return effort
    from app.presentation import DAY_TASKS
    return DAY_TASKS.execution_preferences()['reasoningEffort'] or 'low'
