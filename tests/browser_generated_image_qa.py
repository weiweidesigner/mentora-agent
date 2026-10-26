"""Verify an existing PNG loads through the deployed app's image renderer."""
import argparse
import json
from playwright.sync_api import sync_playwright


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url',default='https://weiweidesigner.com/mentora/')
    parser.add_argument('--artifact',required=True)
    args=parser.parse_args()
    with sync_playwright() as runtime:
        browser=runtime.chromium.launch(headless=True)
        page=browser.new_page(viewport=dict(width=1280,height=900))
        page.goto(args.url,wait_until='domcontentloaded')
        page.wait_for_function('typeof createGeneratedImageArtifact === "function"')
        page.evaluate('''path=>{
            const preview=createGeneratedImageArtifact({url:path.replace(/\\.png$/,".html"),imageUrl:path});
            preview.id='generated-image-qa';preview.style.cssText='position:fixed;inset:20px auto auto 20px;z-index:999999;background:white';
            preview.querySelector('img').loading='eager';document.body.append(preview);
        }''',args.artifact)
        page.wait_for_function('''()=>{const img=document.querySelector('#generated-image-qa img');return img.complete}''')
        metrics=page.locator('#generated-image-qa img').evaluate('''img=>({src:img.src,width:img.naturalWidth,height:img.naturalHeight,visibleHeight:img.getBoundingClientRect().height})''')
        assert metrics['width']>0 and metrics['height']>0 and metrics['visibleHeight']>0,metrics
        print(json.dumps(metrics))
        page.screenshot(path='/tmp/mentora-image-loaded.png')
        browser.close()


if __name__=='__main__':main()
