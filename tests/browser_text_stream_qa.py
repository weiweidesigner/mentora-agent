"""Progressive Markdown must keep original styling and live provenance."""
from pathlib import Path
import json
import sys
from playwright.sync_api import sync_playwright

root=Path(__file__).parents[1]
checks=[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        for theme in ('light','dark'):
            page=browser.new_page(viewport={'width':width,'height':900})
            errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            if '--live' not in sys.argv:
                page.route('**/static/app.js*',lambda route:route.fulfill(status=200,content_type='text/javascript',body=(root/'app/static/app.js').read_text()))
                page.route('**/static/styles.css*',lambda route:route.fulfill(status=200,content_type='text/css',body=(root/'app/static/styles.css').read_text()))
            page.goto('https://weiweidesigner.com/mentora/',wait_until='domcontentloaded')
            page.wait_for_function("typeof renderStreamAnswerText==='function'")
            result=page.evaluate('''async theme=>{
                document.documentElement.dataset.theme=theme;
                const a=createAssistantMessage('真实逐段样式验证',{target:document.body});a.id='text-stream-qa';
                a.taskContext={question:'fixture'};
                const sources=[{url:'https://www.sse.com.cn/',siteName:'上交所',title:'交易所数据'}];a.activitySources=[];
                const text='## 市场复盘\\n\\n**核心结论**：周五反弹，但不能据此确认趋势反转。参见[交易所](https://www.sse.com.cn/)。\\n\\n| 指数 | 本周涨跌 |\\n| --- | ---: |\\n| 上证指数 | **-0.69%** |\\n| 创业板指 | -3.18% |\\n\\n- 量能有所修复。\\n- 成长板块波动更大。\\n\\n> 数据口径以收盘为准。\\n\\n**核验范围说明： **保留真实数据与来源。';
                const lengths=[];let sawLiveCitation=false;
                for(let i=0;i<text.length;i+=7){
                    handleStreamEvent(a,'answer_text',{blockId:'answer',delta:text.slice(i,i+7)});
                    lengths.push(a.querySelector('.finalAnswer').textContent.length);
                    sawLiveCitation ||= !!a.querySelector('.inline-answer-source');
                    await new Promise(requestAnimationFrame);
                }
                if(new Set(lengths).size<8)throw Error('text was buffered');
                if(!sawLiveCitation)throw Error('citations wait for final');
                if(a.querySelectorAll('.streamingAnswer.is-streaming').length!==1)throw Error('live cursor scope missing or duplicated');
                const rich=a.querySelector('.streamingAnswer.reportInterpretation'),strong=rich.querySelector('strong'),table=rich.querySelector('table');
                if(!strong||!table||!rich.querySelector('blockquote')||!rich.querySelector('ul li'))throw Error('Markdown lost');
                const before={emphasis:getComputedStyle(strong).backgroundImage,padding:getComputedStyle(table.querySelector('td')).padding,font:getComputedStyle(rich).fontSize,table:table.outerHTML,chips:rich.querySelectorAll('.inline-answer-source').length};
                if(!before.emphasis.includes('linear-gradient')||before.padding==='0px'||before.chips!==1)throw Error('original rich style missing');
                renderFinalAnswer(a,{interpretation:text,sources,reportArtifacts:[]});
                if(a.querySelector('.streamingAnswer strong')!==strong||a.querySelector('table')!==table)throw Error('final remounted prose');
                if(a.querySelector('.is-streaming'))throw Error('cursor retained on completion');
                if(getComputedStyle(strong).backgroundImage!==before.emphasis||getComputedStyle(table.querySelector('td')).padding!==before.padding||table.outerHTML!==before.table)throw Error('format changed on settlement');
                if(rich.querySelectorAll('.inline-answer-source').length!==before.chips)throw Error('source chip duplicated');
                if(rich.querySelector('.source-card-title').textContent!=='交易所数据')throw Error('final source metadata not enriched');
                attachInlineAnswerSources(rich,sources);
                if(rich.querySelectorAll('.inline-answer-source').length!==1)throw Error('source attachment not idempotent');
                const replay=createAssistantMessage('历史样式验证',{target:document.body});replay.activityEnded=true;
                await renderMixedReportFlow(replay,{interpretation:text,sources,streamBlocks:[{kind:'text',id:'saved',text}],reportArtifacts:[]},replay.querySelector('.finalAnswer'),()=>{});
                if(!replay.querySelector('.streamingAnswer strong')||replay.querySelectorAll('.inline-answer-source').length!==1||!replay.querySelector('.markdownTableWrap table'))throw Error('history style differs');
                replay.remove();
                return {width:innerWidth,theme,incrementalFrames:new Set(lengths).size,emphasis:true,table:true,liveCitation:true,stableFinal:true,history:true};
            }''',theme)
            page.locator('#text-stream-qa .finalAnswer').screenshot(path=str(Path(__file__).parent/f'text-{width}-{theme}.png'))
            assert not errors,errors
            checks.append(result);page.close()
    browser.close()
print(json.dumps(checks))
