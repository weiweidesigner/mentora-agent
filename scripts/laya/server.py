"""Private CPU sidecar; start with uvicorn server:app --host 127.0.0.1 --port 8791.
No account writes, trade APIs, hosted inference or API credentials.
"""
import json
import os
from threading import Lock
from contextlib import asynccontextmanager
import torch
import laya
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

MODEL = os.getenv('LAYA_MODEL_PATH', 'convaiinnovations/laya-multilingual')
lock = Lock()
model = None

@asynccontextmanager
async def lifespan(app):
    global model
    torch.set_num_threads(int(os.getenv('LAYA_CPU_THREADS', '2')))
    model = laya.load(MODEL, device='cpu')
    model.predict('health check', {'check': {'type': 'choice', 'instructions': 'Choose health.', 'criteria': {'health': 'health', 'other': 'other'}}}, max_len=2048, head_max_len=512)
    yield

app = FastAPI(lifespan=lifespan)
class Input(BaseModel):
    state: dict
    questions: dict = Field(min_length=1, max_length=2)

@app.get('/health')
def health():
    return {'ready': model is not None, 'model': 'convaiinnovations/laya-multilingual'}

@app.post('/predict')
def predict(body: Input):
    state = json.dumps(body.state, ensure_ascii=False)
    if len(state) > 16000 or len(model.tok.encode(state)) > 2000:
        raise HTTPException(422, '单标的输入超过预算，拒绝截断')
    catalyst_labels={'score0','score25','score50','score75','score100','unavailable'}
    if any(q.get('type') != 'choice' or not (2 <= len(q.get('criteria', {})) <= 3 or (key=='catalyst' and set(q.get('criteria', {}))==catalyst_labels)) or len(json.dumps(q, ensure_ascii=False)) > 1200 for key,q in body.questions.items()):
        raise HTTPException(422, '问题超出本地决策契约')
    with lock:
        result = model.predict(state, body.questions, max_len=3072, head_max_len=1024)
    if result.get('usage', {}).get('truncated') or result.get('usage', {}).get('options'):
        raise HTTPException(422, '输入或选项未完整读取')
    return dict(result, model='convaiinnovations/laya-multilingual')
