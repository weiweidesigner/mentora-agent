"""Check icon-only motion against real tool lifecycle events and reduced motion."""
from pathlib import Path
import json
import sys
from playwright.sync_api import sync_playwright

base=Path(__file__).parent
assets=base if (base/'app.js').exists() else base.parent/'app/static'
source=(assets/'app.js').read_text()
candidate=source[source.index('function activityToolMarkup('):source.index('function syncInlineActivity(')]
with sync_playwright() as p:
    browser=p.chromium.launch();checks=[]
    for width in (390,1280):
        for theme in ('light','dark'):
            page=browser.new_page(viewport={'width':width,'height':900})
            errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto('https://weiweidesigner.com/mentora/',wait_until='domcontentloaded')
            page.wait_for_function("typeof appendToolStep==='function'")
            if '--live' not in sys.argv:
                page.add_script_tag(content=candidate)
                page.add_style_tag(content=(assets/'styles.css').read_text())
            result=page.evaluate('''theme=>{
                document.documentElement.dataset.theme=theme;
                const article=createAssistantMessage('图标状态验证',{target:document.body});article.dataset.activityInlineExpanded='true';window.iconArticle=article;
                const step=(id,phase,title)=>appendToolStep(article,{callId:id,tool:'read',params:[JSON.stringify({file_path:'/outputs/fixture.json'})],thoughtSummary:title,phase});
                step('old','started','读取组件契约');step('old','completed','读取组件契约');
                step('active','started','读取最新数据');
                const view=article.querySelector('.thinkingFlow');
                const current=view.querySelector('.is-current-tool .activityActionIcon');
                if(!current||getComputedStyle(current).animationName!=='activityIconPulse')throw Error('active icon has no pulse');
                const old=view.querySelector('[data-activity-key="tool:old"] .activityActionIcon');
                if(!old||getComputedStyle(old).animationName!=='none')throw Error('expired icon still animates');
                if(getComputedStyle(view.querySelector('.is-current-tool .activityActionText')).animationName!=='none')throw Error('tool text should remain steady');
                step('active','completed','读取最新数据');
                if(view.querySelector('.is-current-tool'))throw Error('completed tool retained active icon state');
                step('reduced','started','核对渲染状态');
                return {width:innerWidth,theme,currentAnimated:true,completedStatic:true,textSteady:true};
            }''',theme)
            page.emulate_media(reduced_motion='reduce')
            assert page.evaluate("getComputedStyle(iconArticle.querySelector('.thinkingFlow .is-current-tool .activityActionIcon')).animationName==='none'")
            page.evaluate("iconArticle.activityEnded=true;syncInlineActivity(iconArticle);if(iconArticle.querySelector('.thinkingFlow .is-current-tool'))throw Error('saved/ended activity animates');iconArticle.remove()")
            assert not errors,errors
            result['reducedMotion']=True;checks.append(result);page.close()
    browser.close();print(json.dumps(checks))
