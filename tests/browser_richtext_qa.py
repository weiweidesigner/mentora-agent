"""Exercise real Markdown, CSS, provenance and replay against the app runtime.

Default: inject only the candidate renderer functions into the current app.
--live: check the deployed functions without injection. Fixtures are DOM-only.
"""
import json
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright

base=Path(__file__).parent
source=base/'app.js'
if not source.exists():source=base.parent/'app/static/app.js'
js=source.read_text()
candidate=(js[js.index('function renderFinalAnswer('):js.index('function buildShareSessionForArticle(')]
           +js[js.index('async function renderMixedReportFlow('):js.index('function splitInsightAroundChart(')])

with sync_playwright() as p:
    browser=p.chromium.launch()
    checks=[]
    for width in (390,1280):
        for theme in ('light','dark'):
            page=browser.new_page(viewport={'width':width,'height':900})
            errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto('https://weiweidesigner.com/mentora/',wait_until='domcontentloaded')
            page.wait_for_function("typeof renderFinalAnswer==='function' && typeof formatInsight==='function'")
            if '--live' not in sys.argv:page.add_script_tag(content=candidate)
            result=page.evaluate('''async theme => {
              document.documentElement.dataset.theme=theme;
              const text='## 复盘样式验证\\n\\n**周四出现全周最大单日跌幅**，相关说明参见[交易所](https://www.sse.com.cn/)。\\n\\n| 指数 | 收盘 | 本周涨跌 |\\n| --- | ---: | ---: |\\n| 中证1000 | 6734.55 | **+0.79%** |\\n| 上证指数 | 3690.48 | -0.69% |\\n\\n- 第一项\\n- 第二项\\n\\n> 数据口径说明。';
              const sources=[{url:'https://www.sse.com.cn/',siteName:'上交所',title:'交易所数据',summary:'UI fixture'}];
              const article=createAssistantMessage('样式验证',{target:document.body});article.taskContext={question:'fixture'};
              renderStreamAnswerText(article,{blockId:'final',text,provisional:false,final:true});
              const table=article.querySelector('table'),strong=article.querySelector('strong');
              const before={padding:getComputedStyle(table.querySelector('td')).padding,emphasis:getComputedStyle(strong).backgroundImage};
              renderFinalAnswer(article,{interpretation:text,sources,reportArtifacts:[]});
              const rich=article.querySelector('.streamingAnswer.reportInterpretation');
              if(!rich||!rich.querySelector('.markdownTableWrap table'))throw Error('rich Markdown scope lost on completion');
              if(getComputedStyle(table.querySelector('td')).padding!==before.padding||before.padding==='0px')throw Error('table padding disappeared');
              if(getComputedStyle(strong).backgroundImage!==before.emphasis||!before.emphasis.includes('linear-gradient'))throw Error('emphasis underline disappeared');
              if(!rich.querySelector('.inline-answer-source')||rich.querySelector('a.answer-citation-link'))throw Error('inline citation chip not restored');
              if(!rich.querySelector('ul li')||!rich.querySelector('blockquote'))throw Error('other Markdown blocks lost');
              const chip=rich.querySelector('.inline-answer-source');
              if(!chip.dataset.sources.includes('https://www.sse.com.cn/'))throw Error('provenance URL lost');
              const restored=createAssistantMessage('历史回放验证',{target:document.body});restored.activityEnded=true;
              await renderMixedReportFlow(restored,{interpretation:text,sources,streamBlocks:[{kind:'text',id:'saved',text}],reportArtifacts:[]},restored.querySelector('.finalAnswer'),()=>{});
              if(!restored.querySelector('.streamingAnswer .inline-answer-source')||!restored.querySelector('.streamingAnswer .markdownTableWrap'))throw Error('saved replay bypassed rich text/provenance');
              const result={width:innerWidth,theme,tablePadding:before.padding,emphasis:true,citation:true,savedReplay:true};
              article.remove();restored.remove();return result;
            }''',theme)
            assert not errors,errors
            checks.append(result);page.close()
    browser.close();print(json.dumps(checks))
