from app.reasoning_frameworks import LocalAgentFrameworks
from app.jev_visualization_router import JevVisualizationDecision


def decision(script, strategy='no-mark'):
    return JevVisualizationDecision(selected_scripts=(script,),primary_script=script,supporting_script=None,
        primary_confidence=.95,supporting_confidence=0,provider_model='fixture',candidate_count=1,mark_strategy=strategy)


def test_ordinary_kline_guidance_has_current_auto_pool_even_without_preselected_marks():
    guidance=LocalAgentFrameworks._visualization_guidance(decision('kline.py'))
    assert 'native-v2-auto' in guidance
    assert '普通走势/技术分析无需用户点名标记类型' in guidance
    assert 'candidateTypes/selectedTypes' in guidance
    assert '已有 props.annotations 只作补充' in guidance
    assert '允许 no-mark' in guidance


def test_non_kline_routes_do_not_inject_native_kline_candidates():
    assert 'native-v2-auto' not in LocalAgentFrameworks._visualization_guidance(decision('income_statement.py'))
