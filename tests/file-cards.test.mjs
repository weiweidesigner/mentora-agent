import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
const styles=readFileSync(new URL('../app/static/styles.css',import.meta.url),'utf8');
const start=source.indexOf('function fileDeliverables('),end=source.indexOf('async function renderMixedReportFlow',start);
function setup(){
 const dom=new JSDOM('<main class="shell"><aside class="appSidebar"></aside><section class="conversation"><article><div class="finalAnswer"><section class="mixedReport">Report</section></div></article></section></main>',{url:'https://example.com/mentora/',runScripts:'outside-only'}),w=dom.window;
 w.currentThemeMode=()=> 'dark';w.escapeHtml=s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
 w.fetch=async()=>({ok:true});w.closeActivityDrawer=()=>{};w.setSidebarCollapsed=value=>w.document.querySelector('.shell').classList.toggle('sidebar-collapsed',value);
 w.eval(source.slice(start,end));return {dom,w,article:w.document.querySelector('article')};
}
test('generated file cards use compact spacing and a slightly wider desktop row',()=>{
 assert.match(styles,/\.generatedFileList\{[^}]*margin:8px 0 8px;/);
 assert.match(styles,/\.generatedFileCard\{[^}]*width:min\(100%,420px\);max-width:100%;/);
 assert.match(styles,/\.generatedFileCard\{[^}]*border:1px solid var\(--line\);[^}]*background:var\(--soft\);/);
 assert.match(styles,/\.generatedFileDownload\{[^}]*background:transparent;[^}]*opacity:0;/);
 assert.match(styles,/\.generatedFileDownload:hover,\.generatedFileDownload:focus-visible\{background:var\(--soft-2\)\}/);
 assert.match(styles,/@media\(max-width:640px\)\{\.generatedFileCard\{width:100%;/);
});
test('activity file names underline only on hover and inline diffs keep their own card',()=>{
 assert.match(styles,/\.activityFileChangeName\{[^}]*text-decoration:none/);
 assert.match(styles,/\.activityFileChangeName:hover \.activityFileChangeNameText,\.activityFileChangeName:focus-visible \.activityFileChangeNameText\{[^}]*text-decoration-style:dashed/);
 assert.match(styles,/\.activityFileChangeName\[data-tooltip\]::after\{[^}]*content:attr\(data-tooltip\);[^}]*border-radius:12px/);
 assert.doesNotMatch(styles,/\.activityFileChange:hover[^\{]*\.activityFileChangeName/);
 assert.match(styles,/\.activityFileChangeExpand\{[^}]*margin-left:0;[^}]*opacity:0;[^}]*visibility:hidden/);
 assert.match(styles,/\.activityFileChange:hover \.activityFileChangeExpand,\.activityFileChange:focus-within \.activityFileChangeExpand\{[^}]*opacity:1;[^}]*visibility:visible/);
 assert.match(styles,/\.activityFileChangeChevron\{[^}]*transform:rotate\(-45deg\)/);
 assert.doesNotMatch(styles,/\.activityFileChangeExpand\[aria-expanded="true"\] \.activityFileChangeChevron/);
 assert.match(styles,/\.activityFileInline\{[^}]*border:1px solid var\(--line\)/);
});
test('activity file change counts share the row baseline',()=>{
 assert.match(styles,/\.activityFileChange\{[^}]*line-height:20px/);
 assert.match(styles,/\.activityFileChangeStats\{[^}]*display:inline-flex;[^}]*align-items:baseline;[^}]*align-self:center;[^}]*line-height:inherit/);
 assert.match(styles,/\.activityFileChangeStats>span\{line-height:inherit\}/);
});
test('cached case replays do not show a thinking summary control',()=>{
 assert.match(styles,/\.cachedCaseAnswer \.thinkingTrigger\{display:none!important\}/);
});
test('backend-approved StreamViz HTML gets an accessible preview/download card after the report in a prefixed deployment',async()=>{
 const s=setup();
 s.w.renderFileDeliverables(s.article,{selectedSkill:{key:'streamviz'},fileArtifacts:[{url:'/mentora/generated/报告.html'}]});
 const card=s.article.querySelector('.generatedFileCard');assert.ok(card);
 assert.equal(card.querySelector('.generatedFileName').textContent,'报告.html');
 assert.equal(card.querySelector('.generatedFileOpen').tagName,'BUTTON');
 card.querySelector('.generatedFileOpen').click();await new Promise(r=>setTimeout(r,0));
 const panel=s.w.document.querySelector('#generatedFilePreview');assert.equal(panel.hidden,false);
 assert.match(panel.querySelector('iframe').src,/\/mentora\/share-artifact\/.+theme=dark/);
 assert.match(card.querySelector('.generatedFileDownload').href,/\/mentora\/api\/artifacts\/.+\/download\?theme=dark/);
 assert.equal(card.parentElement.previousElementSibling.className,'mixedReport');
 assert.equal(s.article.querySelector('.mixedReport').textContent,'Report');s.dom.window.close();
});

test('preview closes, returns focus and clears the document; downloading does not open it',async()=>{
 const s=setup();s.article.dataset.question='写html报告';
 s.w.renderFileDeliverables(s.article,{selectedSkill:{key:'streamviz'},fileArtifacts:[{url:'/generated/report.html'}]});
 const button=s.article.querySelector('.generatedFileOpen');button.click();await new Promise(r=>setTimeout(r,0));
 const panel=s.w.document.querySelector('#generatedFilePreview');panel.querySelector('.filePreviewExpand').click();
 assert.equal(panel.classList.contains('is-expanded'),true);
 assert.equal(panel.querySelector('.filePreviewExpand').getAttribute('aria-label'),'退出全屏');
 assert.equal(panel.querySelector('.filePreviewExpand').querySelectorAll('svg').length,2);
 assert.ok(panel.querySelector('.filePreviewTab .filePreviewClose'));
 assert.equal(s.w.document.querySelector('.conversation').hasAttribute('inert'),true);
 assert.equal(s.w.document.querySelector('.appSidebar').hasAttribute('inert'),false);
 assert.equal(s.w.document.querySelector('.shell').classList.contains('sidebar-collapsed'),false);
 assert.equal(panel.hasAttribute('aria-modal'),false);
 panel.querySelector('.filePreviewClose').click();assert.equal(panel.hidden,true);
 assert.equal(panel.querySelector('iframe').hasAttribute('src'),false);
 assert.equal(panel.querySelector('.filePreviewExpand').getAttribute('aria-label'),'全屏');
 assert.equal(s.w.document.activeElement,button);assert.equal(s.w.document.querySelector('.conversation').hasAttribute('inert'),false);
 const download=s.article.querySelector('.generatedFileDownload');download.addEventListener('click',e=>e.preventDefault());download.click();
 assert.equal(panel.hidden,true);s.dom.window.close();
});

test('failed preview is retryable and navigation cancels stale loads',async()=>{
 const s=setup();let succeed=false,calls=0;
 s.w.fetch=async()=>{calls++;return {ok:succeed};};s.article.dataset.question='写html报告';
 s.w.renderFileDeliverables(s.article,{selectedSkill:{key:'streamviz'},fileArtifacts:[{url:'/generated/report.html'}]});
 s.article.querySelector('.generatedFileOpen').click();await new Promise(r=>setTimeout(r,0));
 const panel=s.w.document.querySelector('#generatedFilePreview');assert.equal(panel.querySelector('.filePreviewRetry').hidden,false);
 succeed=true;panel.querySelector('.filePreviewRetry').click();await new Promise(r=>setTimeout(r,0));
 assert.equal(calls,2);assert.match(panel.querySelector('iframe').src,/report.html/);
 s.w.dispatchEvent(new s.w.Event('veya:chat-navigate'));assert.equal(panel.hidden,true);assert.equal(panel.controller.signal.aborted,true);s.dom.window.close();
});
test('report artifacts never become file cards without backend approval and external URLs are rejected',()=>{
 const s=setup();s.w.renderFileDeliverables(s.article,{question:'看一下走势图',reportArtifacts:[{url:'/generated/chart.html'}]});
 assert.equal(s.article.querySelector('.generatedFileCard'),null);
 s.w.renderFileDeliverables(s.article,{question:'写一个html报告',reportArtifacts:[{url:'/generated/report.html'}]});
 assert.equal(s.article.querySelector('.generatedFileCard'),null);
 s.w.renderFileDeliverables(s.article,{selectedSkill:{key:'business-chart-recall'},fileArtifacts:[{url:'/generated/chart.html'}]});
 assert.equal(s.article.querySelector('.generatedFileCard'),null);
 assert.equal(s.w.fileDeliverables({fileArtifacts:[{url:'https://evil.example/generated/report.html'}]},'').length,0);s.dom.window.close();
});

test('historical provider prefixes are hidden without changing stored artifact URLs',async()=>{
 const s=setup();s.article.dataset.question='写html报告';
 s.w.renderFileDeliverables(s.article,{selectedSkill:{key:'streamviz'},fileArtifacts:[{url:'/generated/deepseek-midterm-elections.html'}]});
 assert.equal(s.article.querySelector('.generatedFileName').textContent,'midterm-elections.html');
 assert.equal(s.article.querySelector('.generatedFileDownload').download,'midterm-elections.html');
 assert.match(s.article.querySelector('.generatedFileDownload').href,/deepseek-midterm-elections.html/);
 s.article.querySelector('.generatedFileOpen').click();await new Promise(r=>setTimeout(r,0));
 assert.equal(s.w.document.querySelector('.filePreviewTitle').textContent,'midterm-elections.html');s.dom.window.close();
});

test('file preview uses a tab header and breadcrumb navigation',async()=>{
 const s=setup();
 await s.w.openGeneratedFilePreview({name:'app.js',type:'JS',relativePath:'app/static/app.js',open:'/api/workspace-file/preview?path=outputs/app.js',download:'/api/workspace-file/download?path=outputs/app.js',workspaceFile:true},s.article);
 const panel=s.w.document.querySelector('#generatedFilePreview');
 assert.equal(panel.querySelector('.filePreviewTab').getAttribute('role'),'tab');
 assert.equal(panel.querySelector('.filePreviewTypeIcon').textContent,'JS');
 assert.equal(panel.querySelector('.filePreviewTitle').textContent,'app.js');
 assert.match(panel.querySelector('.filePreviewBreadcrumb').textContent,/工作mentora-agentappstaticapp\.js/);
 await s.w.openGeneratedFilePreview({name:'payload.json',type:'JSON',relativePath:'outputs/payload.json',open:'/api/workspace-file/preview?path=outputs/payload.json',download:'/api/workspace-file/download?path=outputs/payload.json',workspaceFile:true},s.article);
 assert.equal(panel.querySelector('.filePreviewTypeIcon').textContent,'JSON');
 s.dom.window.close();
});

test('file HTML keeps its inline document and compact file card together',async()=>{
 const s=setup();s.article.dataset.question='分析完写一个html报告';
 s.w.sanitizeUserFacingInsight=v=>v;s.w.stripSourceInventoryFromInsight=v=>v;s.w.prepareInsightForVideos=text=>({text,hadMarker:false});
 s.w.buildVideoLane=()=>null;s.w.attachInlineAnswerSources=()=>{};s.w.formatInsight=v=>v;s.w.isGeneratedImageArtifact=()=>false;
 s.w.createStreamVisualizationArtifact=item=>{const frame=s.w.document.createElement('iframe');frame.className='reportDocumentFrame';frame.src=item.url;return frame;};
 s.w.resizeReportDocumentFrame=()=>{};
 s.w.eval(source.slice(source.indexOf('async function renderMixedReportFlow('),source.indexOf('\nfunction sanitizeUserFacingInsight(')));
 const report=s.article.querySelector('.mixedReport');
 await s.w.renderMixedReportFlow(s.article,{selectedSkill:{key:'streamviz'},interpretation:'摘要\n[[AIME_CHART:/generated/report.html]]\n风险',reportArtifacts:[{url:'/generated/report.html'}],fileArtifacts:[{url:'/generated/report.html'}]},report);
 assert.ok(report.querySelector('.reportDocumentFrame'));assert.equal(report.querySelector('.fileReportReference'),null);
 assert.equal(report.children[0].textContent,'摘要');assert.equal(report.children[1].tagName,'IFRAME');assert.equal(report.children[2].textContent,'风险');
 assert.equal(s.article.querySelectorAll('.generatedFileCard').length,1);
 const shareStart=source.indexOf('function shareAnswerMarkup('),shareEnd=source.indexOf('\nfunction buildShareAnswerDocument',shareStart);
 s.w.eval(source.slice(shareStart,shareEnd));
 const shared=s.w.shareAnswerMarkup({answerHtml:report.innerHTML,reportArtifacts:[{url:'/generated/report.html'}]});
 assert.match(shared,/<iframe/);assert.match(shared,/share-artifact\/report.html/);s.dom.window.close();
});
test('artifact theme switch is removed while non-theme interactions survive and host theme wins',async()=>{
 const script=readFileSync(new URL('../app/static/artifact-presentation.js',import.meta.url),'utf8');
 const dom=new JSDOM('<html data-theme="light"><body><button id="mtr-theme-toggle" aria-label="切换明暗主题">浅色</button><button id="filter">筛选</button><script data-artifact-host-theme="dark">'+script+'</script></body></html>',{runScripts:'dangerously'});
 await new Promise(r=>setTimeout(r,10));assert.equal(dom.window.document.querySelector('#mtr-theme-toggle'),null);
 assert.ok(dom.window.document.querySelector('#filter'));assert.equal(dom.window.document.documentElement.dataset.theme,'dark');
 dom.window.document.documentElement.dataset.theme='light';await new Promise(r=>setTimeout(r,0));
 assert.equal(dom.window.document.documentElement.dataset.theme,'dark');dom.window.close();
});

test('embedded HTML reports align their nested reader with chat text without changing standalone files',()=>{
 const script=readFileSync(new URL('../app/static/artifact-presentation.js',import.meta.url),'utf8');
 const embedded=new JSDOM('<html><head><style>body{margin:8px}.report>.read{padding:0 32px}</style></head><body><main data-aime-streamviz-root="true"><div class="wrapper"><div class="report"><div class="read">Report</div></div></div></main></body></html>',{runScripts:'outside-only'});
 Object.defineProperty(embedded.window,'frameElement',{value:{classList:{contains:name=>name==='reportDocumentFrame'}}});
 embedded.window.eval(script);
 assert.equal(embedded.window.document.documentElement.dataset.mentoraEmbed,'chat');
 const chatLayout=embedded.window.document.querySelector('[data-artifact-chat-layout]').textContent;
 assert.match(chatLayout,/html\[data-mentora-embed="chat"\] body/);
 assert.match(chatLayout,/\[data-aime-streamviz-root\].*\.report > \.read/s);
 assert.match(chatLayout,/padding-inline:0!important/);
 assert.equal(embedded.window.getComputedStyle(embedded.window.document.body).marginLeft,'0px');
 assert.equal(embedded.window.getComputedStyle(embedded.window.document.querySelector('.read')).paddingLeft,'0px');
 const standalone=new JSDOM('<html><head></head><body></body></html>',{runScripts:'outside-only'});
 standalone.window.eval(script);
 assert.equal(standalone.window.document.documentElement.hasAttribute('data-mentora-embed'),false);
 assert.equal(standalone.window.document.querySelector('[data-artifact-chat-layout]'),null);
 embedded.window.close();standalone.window.close();
});
