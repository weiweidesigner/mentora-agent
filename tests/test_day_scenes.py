import datetime as dt
from collections import Counter
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.day_tasks import DayTasks, create_router, market_state, next_occurrence, task_scene, result_preview
from app.day_presets import SCENE_OWNER, preset_payloads

UTC=dt.timezone.utc

def test_presets_seed_once_per_deployment_and_three_per_scene(tmp_path):
    service=DayTasks(tmp_path,lambda *_:{})
    service.seed_scene_presets();service.seed_scene_presets()
    tasks=service.scene_tasks()
    assert len(tasks)==12 and Counter(t['stage'] for t in tasks)=={'pre':3,'live':3,'post':3,'rest':3}
    assert all(t['enabled'] and t['nextAt'] and not t['browser'] and not t['serverchan'] for t in tasks)
    assert service.list('visitor-one')==service.list('visitor-two')==[]


def test_rest_schedules_skip_trading_days_and_recognize_exchange_holidays():
    config=next(payload.model_dump() for _,_,payload in preset_payloads() if payload.stage=='rest')
    # Thursday -> Saturday. National Day weekday is also a non-trading day.
    assert next_occurrence(config,dt.datetime(2026,10,15,0,tzinfo=UTC)).startswith('2026-10-17T01:00:00')
    assert next_occurrence(config,dt.datetime(2026,10,1,0,tzinfo=UTC)).startswith('2026-10-01T01:00:00')
    assert market_state('CN',dt.datetime(2026,10,1,2,tzinfo=UTC))['stage']=='rest'
    assert market_state('CN',dt.datetime(2026,10,15,4,tzinfo=UTC))['stage']=='live'


def test_scene_uses_execution_time_and_type_not_a_mismatched_label():
    cfg=next(payload.model_dump() for _,_,payload in preset_payloads())
    assert task_scene({**cfg,'stage':'live','time':'08:30'})=='pre'
    assert task_scene({**cfg,'time':'10:00'})=='live'
    assert task_scene({**cfg,'time':'15:15'})=='post'
    assert task_scene({**cfg,'stage':'rest'})=='rest'
    assert task_scene({**cfg,'timeMode':'close','offset':15})=='post'


def test_public_preset_reports_are_readable_but_mutations_stay_owner_only(tmp_path):
    service=DayTasks(tmp_path,lambda *_:{'interpretation':'## 收盘温和上涨\n\n上涨家数更多，成交额有所回升。','reportArtifacts':[]})
    service.seed_scene_presets()
    task=service.scene_tasks()[0]
    with service.db() as db:service.enqueue(db,service.owned(db,SCENE_OWNER,task['id']))
    service.execute(service.claim())
    app=FastAPI();app.include_router(create_router(service));client=TestClient(app)
    payload=client.get('/api/day/tasks').json()
    assert payload['tasks']==[] and len(payload['sceneTasks'])==12
    ready=next(t for t in payload['sceneTasks'] if t['id']==task['id'])
    assert ready['resultHeadline']=='收盘温和上涨' and ready['resultDescription']=='上涨家数更多，成交额有所回升。'
    assert ready['resultDate'] and ready['resultScene']=='pre'
    runs=client.get(f"/api/day/tasks/{task['id']}/runs").json()['runs']
    assert len(runs)==1
    assert client.get(f"/api/day/tasks/{task['id']}/runs/{runs[0]['id']}").status_code==200
    headers={'X-Veya-Day':'1'}
    for method,path in [('post','run'),('post','confirmation'),('delete','')]:
        url=f"/api/day/tasks/{task['id']}"+('/'+path if path else '')
        assert getattr(client,method)(url,headers=headers).status_code==404
    assert client.put(f"/api/day/tasks/{task['id']}",json={**task,'enabled':False},headers=headers).status_code==404


def test_preview_comes_from_execution_text_not_task_instructions():
    assert result_preview('## 核心结论\n\n**市场温和上涨。** 成交有所回升。\n[[AIME_CHART:/tmp/test.html]]')[0]=='市场温和上涨'
    assert result_preview('')==('','')


def test_preset_copy_updates_without_changing_schedule_or_user_tasks(tmp_path):
    service=DayTasks(tmp_path,lambda *_:{})
    service.seed_scene_presets()
    task=service.scene_tasks()[0]
    with service.db() as db:
        row=db.execute('SELECT * FROM tasks WHERE id=?',(task['id'],)).fetchone()
        config=service.unpack(row['config']);config['question']='旧的技术指令';config['time']='07:45'
        db.execute('UPDATE tasks SET config=? WHERE id=?',(service.pack(config),task['id']))
    service.seed_scene_presets()
    current=service.scene_tasks()[0]
    assert current['question'].startswith('帮我看看')
    assert current['time']=='07:45' and current['nextAt']==task['nextAt']
    assert all('项目已有金融研究技能' not in payload.question for _,_,payload in preset_payloads())
