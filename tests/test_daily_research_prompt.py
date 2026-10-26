import pytest

from app import presentation


def test_workflow_skill_node_uses_framework_not_deal_and_preserves_task_agent(monkeypatch):
    seen=[]
    def framework(payload):
        seen.append(payload)
        yield 'final',{'question':'测试','selectedSkill':{},'interpretation':'软件路由测试','reportArtifacts':[]}
    monkeypatch.setattr(presentation,'framework_events',framework)
    monkeypatch.setattr(presentation,'durable_chat_events',lambda *_:pytest.fail('Skill 节点不应进入 Deal 自动路由'))
    config={'market':'US','symbols':'','question':'检索资讯，不下单','agent':'mentora-deal','_owner':'fixture','_workflowSkillOnly':True}
    result=presentation.run_daily_research(config,'offline-skill-routing')
    assert config['agent']=='mentora-deal' and seen[0].agent=='mentora'
    assert '只进行信息查询与分析' in seen[0].question and '这是 Mentora Deal 定时任务' not in seen[0].question
    assert result['interpretation']=='软件路由测试'


@pytest.mark.parametrize('market', ['CN', 'US', 'HK'])
def test_scheduler_metadata_does_not_override_research_question(monkeypatch, market):
    seen = []

    def stream(payload, owner):
        seen.append(payload)
        yield 'final', {'question': 'context', 'interpretation': '研究结果', 'selectedSkill': {}}

    monkeypatch.setattr(presentation, 'durable_chat_events', stream)
    question = '结合最新美股盘前行情，对美股全市场进行盘前机会扫描。'
    result = presentation.run_daily_research({
        'market': market, 'stage': 'post', 'assetType': 'index',
        'symbols': '600000.SH', 'question': question, '_owner': 'test-owner',
        'time': '19:30', 'timezone': 'Asia/Shanghai',
    }, 'prompt-test')
    prompt = seen[0].question
    assert prompt.endswith(question)
    for injected in ['当前市场：', '市场当地时间：', '任务阶段：', '标的类型：',
                     '用户指定标的：', '600000.SH', '19:30', 'Asia/Shanghai']:
        assert injected not in prompt
    assert '注明数据截至时间' in prompt
    assert result['question'] == question


def test_explicit_question_placeholders_remain_supported(monkeypatch):
    seen = []

    def stream(payload, owner):
        seen.append(payload.question)
        yield 'final', {'question': '', 'interpretation': '研究结果', 'selectedSkill': {}}

    monkeypatch.setattr(presentation, 'durable_chat_events', stream)
    result = presentation.run_daily_research({
        'market': 'US', 'symbols': 'AAPL', '_owner': 'test-owner',
        'question': '分析{{date}}的{{market}} {{symbols}}',
    }, 'placeholder-test')
    assert '{{' not in seen[0]
    assert result['question'].endswith('的美股 AAPL')


def test_deal_schedule_honors_explicit_order_intent_and_requires_markdown(monkeypatch):
    seen=[]
    def stream(payload,owner):
        seen.append(payload)
        yield 'final', {'question':payload.question,'interpretation':'## 结果\n\n未成交。','selectedSkill':{}}
    monkeypatch.setattr(presentation,'durable_chat_events',stream)
    for agent in ('mentora-deal','mentora'):
        presentation.run_daily_research({'agent':agent,'market':'CN','symbols':'','_owner':'fixture','question':'筛选并下单'},'orders-'+agent)
    assert '通过 portfolio-order 提交符合条件的订单' in seen[0].question
    assert '模拟' not in seen[0].question
    assert '任务明确仅研究或不下单' in seen[0].question
    assert '只进行信息查询与分析；不得交易' not in seen[0].question
    assert '只进行信息查询与分析；不得交易' in seen[1].question
    assert all('标准 Markdown' in item.question for item in seen)


def test_scheduler_surfaces_the_original_stream_failure(monkeypatch):
    def stream(payload, owner):
        yield 'error', {'detail': '研究工具轮次达到上限'}
    monkeypatch.setattr(presentation, 'durable_chat_events', stream)
    with pytest.raises(RuntimeError, match='研究工具轮次达到上限'):
        presentation.run_daily_research({'market':'CN','symbols':'','_owner':'fixture','question':'研究'}, 'failed')
