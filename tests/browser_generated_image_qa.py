"""Verify an existing PNG loads through the deployed app's image renderer."""
import argparse
import json
from urllib.parse import urljoin
from playwright.sync_api import sync_playwright


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url',default='https://weiweidesigner.com/mentora/')
    parser.add_argument('--artifact',required=True)
    parser.add_argument('--modes',default='direct,final,ordered,saved,live,native,fallback,share')
    args=parser.parse_args()
    with sync_playwright() as runtime:
        browser=runtime.chromium.launch(headless=True)
        page=browser.new_page(viewport=dict(width=1280,height=900))
        for mode in args.modes.split(','):
            if mode=='share':
                name=args.artifact.rsplit('/',1)[-1].replace('.png','.html')
                page.goto(urljoin(args.url,'share-artifact/'+name),wait_until='domcontentloaded')
                selector='main img'
            else:
                page.goto(args.url,wait_until='domcontentloaded')
                page.wait_for_function('typeof renderMixedReportFlow === "function"')
                page.evaluate('''async ({path,mode})=>{
                    const html=path.replace(/\\.png$/,".html");
                    const mounted=new URL('generated/'+html.split('/').at(-1),location.href).pathname;
                    const item={url:mounted,imageUrl:path,native:true};
                    const article=document.createElement('article');article.className='message assistant';article.id='generated-image-qa';
                    article.style.cssText='position:fixed;inset:20px auto auto 20px;z-index:999999;width:600px;max-width:90vw;background:var(--bg)';
                    article.innerHTML='<div class="finalAnswer"><section class="mixedReport"></section></div>';
                    document.body.append(article);
                    const marker='[[AIME_CHART:'+html+']]';
                    const data={reportArtifacts:[item],interpretation:marker,sources:[],videos:[]};
                    const blocks=[{id:'image',kind:'visualization',data:item},{id:'answer',kind:'text',text:marker}];
                    if(mode==='direct')article.append(createGeneratedImageArtifact(item));
                    else if(mode==='fallback')article.append(createArtifactFallbackFrame(item,0));
                    else if(mode==='live'){
                        article.streamVisualizationArtifacts=[item];
                        const preview=document.createElement('div');preview.streamText=marker;article.querySelector('.finalAnswer').append(preview);
                        syncStreamAnswerPlacement(article,preview);
                    }else if(mode==='saved')await renderSavedAssistantAnswer(article,{...data,streamBlocks:blocks},{thinkingLabel:'已处理 20秒',thinkingElapsed:20000});
                    else await renderMixedReportFlow(article,mode==='final'?data:{...data,streamBlocks:mode==='native'?blocks.slice(0,1):blocks},article.querySelector('.mixedReport'));
                    for(const img of article.querySelectorAll('img'))img.loading='eager';
                }''',dict(path=args.artifact,mode=mode))
                selector='#generated-image-qa .reportGeneratedImage'
            page.wait_for_function('selector=>{const img=document.querySelector(selector);return img?.complete}',arg=selector,timeout=10000)
            metrics=page.locator(selector).first.evaluate('''img=>({src:img.src,width:img.naturalWidth,height:img.naturalHeight,visibleHeight:img.getBoundingClientRect().height})''')
            assert metrics['width']>0 and metrics['height']>0 and metrics['visibleHeight']>0,dict(mode=mode,**metrics)
            print(json.dumps(dict(mode=mode,**metrics)),flush=True)
            if mode=='saved':page.screenshot(path='/tmp/mentora-image-loaded.png')
        browser.close()


if __name__=='__main__':main()
