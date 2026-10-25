"""Replay recorded public SSE events to check the thinking-to-answer transition."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser()
parser.add_argument('events',type=Path)
parser.add_argument('--live',action='store_true')
args=parser.parse_args()
recording=json.loads(args.events.read_text())
source=(Path(__file__).parents[1]/'app/static/app.js').read_text()
checks=[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        page=browser.new_page(viewport={'width':width,'height':900})
        if not args.live:
            page.route('**/static/app.js*',lambda route:route.fulfill(status=200,content_type='text/javascript',body=source))
        page.goto('https://weiweidesigner.com/mentora/',wait_until='domcontentloaded')
        page.wait_for_function("typeof handleStreamEvent==='function'")
        result=page.evaluate('''recording=>{
            const article=createAssistantMessage('录制事件回放',{target:document.body});
            article.taskContext={question:'录制事件回放'};
            let firstAnswerSeq=null, answerEvents=0;
            for(const event of recording.events){
                if(!firstAnswerSeq&&event.event==='answer_text'&&(event.data.delta||event.data.text)?.trim()){
                    setInlineActivityExpanded(article,true);
                    firstAnswerSeq=event.seq;
                }
                handleStreamEvent(article,event.event,event.data);
                if(event.event==='answer_text')answerEvents++;
                if(firstAnswerSeq&&!event.data.discard){
                    if(!article.querySelector('.thinkingFlow').hidden)throw Error('history reopened at event '+event.seq);
                    if(!article.querySelector('.thinkingCurrentTool').hidden)throw Error('compact thinking revived at event '+event.seq);
                    if(article.querySelector('.thinkingTrigger').classList.contains('is-thinking'))throw Error('thinking style revived at event '+event.seq);
                }
            }
            if(!firstAnswerSeq||!article.activityEnded||!article.querySelector('.finalAnswer').textContent.trim())throw Error('recorded answer did not complete');
            const finalText=article.querySelector('.finalAnswer').textContent;
            article.querySelector('.thinkingTrigger').click();
            if(innerWidth>760&&article.querySelector('.thinkingFlow').hidden)throw Error('completed history cannot be reopened');
            if(finalText!==article.querySelector('.finalAnswer').textContent)throw Error('history toggle modified answer');
            article.remove();
            return {width:innerWidth,runId:recording.runId,firstAnswerSeq,answerEvents,historyCollapsedDuringAnswer:true,completedHistoryAvailable:true};
        }''',recording)
        checks.append(result);page.close()
    browser.close()
print(json.dumps(checks))
