"""Request-scoped delivery preferences, independent of the research plan."""
from contextlib import contextmanager
from contextvars import ContextVar

plain_text_requested = ContextVar('plain_text_requested', default=False)


@contextmanager
def plain_text_delivery():
    token = plain_text_requested.set(True)
    try:
        yield
    finally:
        plain_text_requested.reset(token)
