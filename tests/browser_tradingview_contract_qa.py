"""Live Widget config roundtrip in an isolated browser context, without an agent run."""
import json
from urllib.parse import urljoin
from playwright.sync_api import sync_playwright

BASE='https://weiweidesigner.com/mentora'
checks=[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        context=browser.new_context(viewport={'width':width,'height':1000})
        original={'symbol':'NASDAQ:AAPL','interval':'30','style':'1','studies':['STD;RSI'],'hide_volume':True}
        result=context.request.post(BASE+'/api/widgets/tradingview',data={'widget':'advanced-chart','config':original,'theme':'dark','language':'zh-CN'})
        assert result.ok,result.text()
        item=result.json()
        card={'id':'chart','title':'QA TradingView','component':'tv-advanced-chart','url':item['url'],'status':'ready','x':0,'y':0,'w':12,'h':22,'parameters':{'symbols':['NASDAQ:AAPL'],'config':item['config']}}
        board={'id':'qa-tv-contract','title':'参数一致性验证','cards':[card]}
        storage={'version':2,'defaultsVersion':1,'activeId':board['id'],'openIds':[board['id']],'boards':[board,*[{'id':'starter-'+key,'title':key,'cards':[]} for key in ('stocks','crypto','forex')]]}
        page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
        page.add_init_script('if(!localStorage.getItem("mentora-widget-boards-v1"))localStorage.setItem("mentora-widget-boards-v1",'+json.dumps(json.dumps(storage))+');')
        updated={**item['config'],'style':'2','studies':['STD;RSI','STD;EMA']}
        parameters={'symbols':['NASDAQ:AAPL'],'config':updated}
        def plan(route):
            route.fulfill(content_type='application/json',body=json.dumps({'reply':'已更新图表配置','actions':[{'type':'update','cardId':'chart','componentId':'tv-advanced-chart','parameters':parameters}]}))
        page.route('**/api/widgets/plan',plan)
        page.goto(BASE+'/?tab=widgets&board=qa-tv-contract',wait_until='domcontentloaded')
        page.wait_for_selector('[data-card="chart"] .widgetCardHeader')
        page.locator('#widgetPrompt').fill('改成折线，并添加 EMA；保留 RSI、30分钟周期和隐藏成交量')
        page.locator('#widgetPrompt').press('Enter')
        page.wait_for_function('''()=>{
            const saved=JSON.parse(localStorage.getItem('mentora-widget-boards-v1'));
            const c=saved.boards.find(b=>b.id==='qa-tv-contract').cards[0];
            return c.status==='ready'&&c.parameters.config?.style==='2';
        }''')
        saved=page.evaluate("JSON.parse(localStorage.getItem('mentora-widget-boards-v1')).boards.find(b=>b.id==='qa-tv-contract').cards[0]")
        config=saved['parameters']['config']
        assert config['style']=='2' and config['interval']=='30' and config['hide_volume'] is True,config
        assert config['studies']==['STD;RSI','STD;EMA'],config
        output=context.request.get(urljoin(BASE+'/',saved['url']).replace('/generated/','/share-artifact/'))
        assert output.ok
        assert 'STD;EMA' in output.text() and 'STD;RSI' in output.text()
        page.reload(wait_until='domcontentloaded')
        page.wait_for_selector('[data-card="chart"] iframe')
        persisted=page.evaluate("JSON.parse(localStorage.getItem('mentora-widget-boards-v1')).boards.find(b=>b.id==='qa-tv-contract').cards[0].parameters.config")
        assert persisted['style']=='2' and persisted['studies']==config['studies'],persisted
        page.locator('#widgetRefresh').click()
        page.wait_for_function("JSON.parse(localStorage.getItem('mentora-widget-boards-v1')).boards.find(b=>b.id==='qa-tv-contract').lastRefreshedAt")
        refreshed=page.evaluate("JSON.parse(localStorage.getItem('mentora-widget-boards-v1')).boards.find(b=>b.id==='qa-tv-contract').cards[0].parameters.config")
        assert refreshed['style']=='2' and refreshed['studies']==config['studies'] and refreshed['hide_volume'] is True,refreshed
        assert not errors,errors
        checks.append({'width':width,'configForwarded':True,'existingSettingsRetained':True,'reloadPreserved':True,'refreshPreserved':True})
        context.close()
    browser.close()
print(json.dumps(checks))
