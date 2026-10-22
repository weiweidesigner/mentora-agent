from app import presentation


def test_export_keeps_multiple_charts_between_their_original_paragraphs():
    page=presentation.standalone_share_html({'themeMode':'dark','answerHtml':
        '<p>first paragraph</p><iframe class="reportDocumentFrame" src="/generated/a.html"></iframe>'
        '<p>second paragraph</p><div class="streamvizArtifactHost" data-artifact-url="/generated/b.html"><div>live runtime</div></div>'
        '<p>final paragraph</p>',
        'reportArtifacts':[{'url':'/generated/a.html'},{'url':'/generated/b.html'},{'url':'/generated/unused.html'}]})
    assert page.index('first paragraph')<page.index('/share-artifact/a.html')<page.index('second paragraph')<page.index('/share-artifact/b.html')<page.index('final paragraph')
    assert page.count('src="/share-artifact/a.html')==1
    assert 'live runtime' not in page and 'unused.html' not in page


def test_legacy_host_fallback_consumes_already_rendered_frames_in_order():
    page=presentation.standalone_share_html({'answerHtml':
        '<iframe class="reportDocumentFrame" src="/generated/a.html"></iframe><p>middle</p>'
        '<div class="visualize-widget-block"><iframe src="about:blank"></iframe></div>',
        'reportArtifacts':[{'url':'/generated/a.html'},{'url':'/generated/b.html'}]})
    assert page.index('/share-artifact/a.html')<page.index('middle')<page.index('/share-artifact/b.html')
    assert 'about:blank' not in page


def test_text_only_answer_does_not_append_unused_intermediate_charts():
    page=presentation.standalone_share_html({'answerHtml':'<p>text answer</p>','reportArtifacts':[{'url':'/generated/intermediate.html'}]})
    assert 'intermediate.html' not in page


def test_share_width_and_typography_follow_captured_answer_geometry():
    session={'shareContentWidth':944,'shareViewportWidth':2048,'shareBodyFontSize':16,'shareBodyLineHeight':26.4,'answerHtml':'<div>answer</div>'}
    assert presentation.share_viewport_width(session)==1000
    page=presentation.standalone_share_html(session)
    assert '--share-body-font-size:16px' in page and '--share-body-line-height:26.4px' in page
    assert 'font-size:17px' not in page and 'font-size:24px' not in page
    assert presentation.share_viewport_width({'shareContentWidth':'bad'})==1320


def test_absolute_public_frame_with_reverse_proxy_prefix_is_exported_in_place(monkeypatch):
    monkeypatch.setenv('AICHART_BASE_PATH','/mentora')
    page=presentation.standalone_share_html({'answerHtml':'<p>before</p><iframe class="reportDocumentFrame" src="https://weiweidesigner.com/mentora/share-artifact/report.html?theme=dark&amp;v=123"></iframe><p>after</p>',
        'themeMode':'dark','reportArtifacts':[{'url':'/mentora/generated/report.html'}]})
    assert page.index('before')<page.index('src="/share-artifact/report.html?')<page.index('after')
    assert page.count('<iframe')==1


def test_unknown_absolute_frames_are_not_fetched():
    page=presentation.standalone_share_html({'answerHtml':'<iframe class="reportDocumentFrame" src="https://untrusted.example/generated/other.html"></iframe>',
        'reportArtifacts':[{'url':'/generated/report.html'}]})
    assert 'untrusted.example' not in page and '<iframe' not in page
