import json
from app.stream_deltas import compact_visual_events
from app.public_stream import PublicStream


def test_received_deltas_compact_losslessly_without_repeated_prefixes():
    pieces=['<div title="',' spaced ', 'value">','中文\n']*500
    raw='';rows=[]
    for piece in pieces:
        raw+=piece;rows.append(('visualization',{'id':'v','argumentDelta':piece,'toolRawInput':raw,'final':False}))
    result=list(compact_visual_events(rows))
    assert ''.join(d['argumentDelta'] for _,d in result)==raw
    assert all('toolRawInput' not in d for _,d in result)
    assert len(result)<10
    assert sum(d['coalescedDeltas'] for _,d in result)==len(pieces)
    assert len(json.dumps(result,ensure_ascii=False))<len(json.dumps(rows,ensure_ascii=False))*.01


def test_final_reset_discard_and_widget_identity_remain_ordered():
    rows=[('visualization',{'id':'a','reset':True,'argumentDelta':'old'}),
          ('visualization',{'id':'a','reset':True,'argumentDelta':'new'}),
          ('visualization',{'id':'b','argumentDelta':'B'}),
          ('visualization',{'id':'b','discard':True,'final':True}),
          ('visualization',{'id':'a','toolRawInput':'complete','final':True}),
          ('_render_done','a')]
    result=list(compact_visual_events(rows))
    assert result==rows


def test_native_brief_metadata_emits_one_start_and_never_streams_private_brief_as_html():
    stream=PublicStream('root',visual_briefs=True);events=[]
    for piece in ['{"title":"Report","brief":"','verified data '*1000,'"}']:
        events+=stream.chunk({'type':'tool-call-delta','index':0,'id':'v','name':'visualize_show_widget','argumentsDelta':piece})
    assert len(events)==1 and events[0][1]['phase']=='preparing'
    assert 'argumentDelta' not in events[0][1]
    stream.begin('next')
    assert stream.chunk({'type':'tool-call-delta','index':0,'id':'next','name':'visualize_show_widget','argumentsDelta':'{'})[0][1]['reset']
