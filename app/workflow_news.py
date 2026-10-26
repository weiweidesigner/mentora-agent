"""Direct, typed AInvest Skill node. No Agent, enrichment, or report delivery."""
from __future__ import annotations
import datetime as dt
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
from typing import Literal
import uuid
from pydantic import BaseModel, ConfigDict, Field
from app.workflow_skill_results import SkillResults


class NewsInput(BaseModel):
    model_config=ConfigDict(extra='forbid')
    source: Literal['homepage','category']='homepage'
    categories: list[str]=Field(default_factory=lambda:['latest'],max_length=10)
    limit: int=Field(default=10,ge=1,le=100)
    maxDetails: int | None=Field(default=None,ge=1,le=100)
    categoryPages: int=Field(default=1,ge=1,le=10)
    categoryPageSize: int=Field(default=20,ge=1,le=100)
    workers: int=Field(default=4,ge=1,le=8)
    startDate: dt.date | None=None
    endDate: dt.date | None=None
    timeoutSeconds: int=Field(default=120,ge=1,le=300)


INSTRUCTIONS=('直接执行 AInvest 新闻 Skill，不调用 Agent、不做归纳或外部搜索。默认获取新闻首页，'
              '可设置 source=category 和 categories 获取分类。arguments 是唯一取数配置；'
              'instruction 仅是节点说明，不解释为额外搜索任务。缺失字段保持原样，stderr 保留来源警告。'
              '输出 items/count/text（原始 JSON），下游 text-opportunities 使用 {{节点ID.text}}。')


def _stop(process):
    if process.poll() is None:
        try:os.killpg(process.pid,signal.SIGTERM)
        except ProcessLookupError:pass
        try:process.communicate(timeout=2)
        except subprocess.TimeoutExpired:
            try:os.killpg(process.pid,signal.SIGKILL)
            except ProcessLookupError:pass
            process.communicate()


def execute(arguments,root:Path,*,cancelled=lambda:False):
    params=NewsInput.model_validate(arguments)
    if params.startDate and params.endDate and params.startDate>params.endDate:
        raise ValueError('开始日期不能晚于结束日期')
    if cancelled():raise InterruptedError('资讯检索已停止')
    output='outputs/data/workflow-news-'+uuid.uuid4().hex+'.json'
    cli=['--source',params.source,'--limit',str(params.limit),'--max-details',str(params.maxDetails or params.limit),'--workers',str(params.workers)]
    if params.source=='category':
        if not params.categories or any(not c.strip() for c in params.categories):raise ValueError('分类不能为空')
        for category in params.categories:cli.extend(['--category',category])
        cli.extend(['--category-pages',str(params.categoryPages),'--category-page-size',str(params.categoryPageSize)])
    for flag,value in [('--start-date',params.startDate),('--end-date',params.endDate)]:
        if value:cli.extend([flag,value.isoformat()])
    cli.extend(['--format','json','--output',output])
    command=[sys.executable,str(root/'app/skill_runner.py'),'execute','--script','ainvest_news_search.py','--timeout',str(params.timeoutSeconds),'--',*cli]
    observed=SkillResults(dict(id='internal-search',label='资讯搜索',script='app/skills/internal-search/',receiptScripts=['ainvest_news_search.py']),root)
    process=subprocess.Popen(command,cwd=root,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,start_new_session=True)
    deadline=time.monotonic()+params.timeoutSeconds+5
    try:
        while True:
            if cancelled():raise InterruptedError('资讯检索已停止')
            if time.monotonic()>deadline:raise TimeoutError('资讯检索超时，未自动重试或切换数据源')
            try:stdout,stderr=process.communicate(timeout=.25);break
            except subprocess.TimeoutExpired:continue
    finally:_stop(process)
    try:receipt=json.loads(stdout)
    except ValueError:raise RuntimeError('新闻 Skill 未返回有效回执：'+stderr[-500:])
    if not isinstance(receipt,dict):raise RuntimeError('新闻 Skill 未返回有效对象回执')
    if process.returncode or receipt.get('ok') is not True:
        raise RuntimeError('新闻 Skill 执行失败：'+str(receipt.get('stderr') or stderr or receipt.get('error') or receipt)[-1000:])
    observed.capture(dict(phase='completed',skillId='internal-search',observation=receipt))
    result=observed.result(dict(skillReceipt=receipt,source=params.source,scope='AInvest 新闻首页' if params.source=='homepage' else 'AInvest 指定分类',
                               stderr=receipt.get('stderr','')),structured=True)
    result['interpretation']=f'获取 {result["count"]} 条 AInvest 原始新闻；未做模型归纳或外部补查。'
    return result
