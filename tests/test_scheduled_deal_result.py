from unittest.mock import patch

import pytest
from pydantic import ValidationError
from app import presentation as p
from app.day_tasks import DayTasks,TaskInput


def deal_final(charts=True):
    return dict(question='original research',interpretation='Completed research, no order.',
        selectedSkill={'key':'mentora-deal','label':'Mentora Deal'},agent='mentora-deal',
        portfolioResult={'entry':{'decisions':1}},
        reportArtifacts=[{'url':'/generated/verified.html','label':'Verified chart'}] if charts else [])


@pytest.mark.parametrize('charts',[False,True])
def test_deal_result_is_saved_and_restored_through_full_scheduled_lifecycle(tmp_path,charts):
    final=deal_final(charts)
    def stream(payload,owner):
        assert payload.agent=='mentora-deal'
        yield 'progress',{'detail':'Research completed'}
        yield 'final',final
    service=DayTasks(tmp_path,p.run_daily_research)
    config=TaskInput(title='Research',agent='mentora-deal',market='CN',stage='live',question='original research',enabled=False)
    task=service.save('fixture-owner',config)
    with service.db() as db:
        row=service.owned(db,'fixture-owner',task['id']);service.enqueue(db,row)
    run=service.claim()
    with patch.object(p,'durable_chat_events',stream):
        service.execute(run)
    with service.db() as db:
        stored=db.execute('SELECT status,answer,error FROM runs WHERE id=?',(run['id'],)).fetchone()
        import json
        answer=json.loads(stored['answer'])
        assert stored['status']=='success',stored['error']
        assert db.execute('SELECT success_run FROM tasks WHERE id=?',(task['id'],)).fetchone()[0]==run['id']
        assert db.execute("SELECT count(*) FROM run_events WHERE run_id=? AND event='error'",(run['id'],)).fetchone()[0]==0
    assert answer['interpretation']==final['interpretation']
    assert answer['reportArtifacts']==final['reportArtifacts']
    assert answer['htmlUrl']==('/generated/verified.html' if charts else '')
    assert answer['agent']=='mentora-deal' and answer['portfolioResult']==final['portfolioResult']
    assert service.list('fixture-owner')[0]['resultVersion']==run['id']


def test_result_adapter_does_not_accept_an_incomplete_answer():
    with pytest.raises(ValidationError):
        p.normalize_chat_result({'question':'not completed','agent':'mentora-deal'})


def test_existing_chat_fields_are_unchanged():
    data=deal_final();data.update(code='AAPL',htmlUrl='/generated/chart.html',reportUrl='/generated/report.html',status=['verified'])
    result=p.normalize_chat_result(data)
    for key,value in data.items():assert result[key]==value
