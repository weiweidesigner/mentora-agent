import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import test from 'node:test';
import assert from 'node:assert/strict';

const html=readFileSync(new URL('../app/static/index.html',import.meta.url),'utf8');
const code=readFileSync(new URL('../app/static/widgets.js',import.meta.url),'utf8');
const library=JSON.parse(readFileSync(new URL('../app/static/widget-catalog.json',import.meta.url),'utf8'));
const generic={id:'generic-bar_chart',title:'柱状图',provider:'generic',skill:'generic-chart',script:'bar_chart.py',inputMode:'data',requiresDataSource:true,libraryVisible:false};
const streamviz={...generic,id:'streamviz',title:'StreamVis组件',provider:'streamviz',skill:'streamviz',script:'render_streamviz.py'};
const tick=()=>new Promise(resolve=>setTimeout(resolve,20));

test('artifact picker only shows and validates a board name when creating a new board',()=>{
  const s=setup({cards:[]}),style=s.d.createElement('style');
  const css=readFileSync(new URL('../app/static/widgets.css',import.meta.url),'utf8');
  style.textContent=css.slice(css.indexOf('.widgetAddArtifactDialog{'));s.d.head.append(style);
  s.w.dispatchEvent(new s.w.CustomEvent('mentora:add-artifact-to-widget',{detail:{url:'/generated/picker.html',title:'图表'}}));
  const select=s.d.querySelector('#widgetAddArtifactBoard'),field=s.d.querySelector('#widgetAddArtifactNewField'),input=s.d.querySelector('#widgetAddArtifactNewName');
  assert.equal(field.hidden,true);assert.equal(s.w.getComputedStyle(field).display,'none');
  assert.equal(input.required,false);assert.equal(input.disabled,true);
  assert.equal(select.querySelector('[value="__new__"]').textContent,'新建看板');
  select.value='__new__';select.dispatchEvent(new s.w.Event('change'));
  assert.equal(field.hidden,false);assert.equal(s.w.getComputedStyle(field).display,'grid');
  assert.equal(input.required,true);assert.equal(input.disabled,false);assert.equal(s.d.activeElement,input);
  s.d.querySelector('#widgetAddArtifactError').textContent='请输入新看板名称。';
  select.value='b';select.dispatchEvent(new s.w.Event('change'));
  assert.equal(s.w.getComputedStyle(field).display,'none');assert.equal(input.disabled,true);assert.equal(input.required,false);
  assert.equal(s.d.querySelector('#widgetAddArtifactError').textContent,'');s.dom.window.close();
});
const card=(component='generic-bar_chart',id='c')=>({id,title:'收入对比',component,status:'ready',url:'/generated/old.html',request:'用户提供的2026年Q1收入100、Q2收入150，单位万元',parameters:{},x:6,y:0,w:6,h:18,customTitle:true});

function setup({cards=[card()],boards,handler,plan,lastRefreshedAt=''}={}){
  const dom=new JSDOM(html,{url:'https://example.com/mentora/?tab=widgets',runScripts:'outside-only'}),w=dom.window;
  w.ResizeObserver=class{observe(){}};w.CSS={escape:x=>x};w.confirm=()=>true;
  w.HTMLDialogElement.prototype.show=w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.localStorage.setItem('mentora-widget-boards-v1',JSON.stringify({defaultsVersion:1,activeId:'b',openIds:['b'],boards:boards||[{id:'b',title:'季度看板',cards,messages:[],lastRefreshedAt}]}));
  const calls=[];
  w.fetch=async(url,options)=>{
    calls.push({url,options});
    if(handler){const custom=await handler(url,options);if(custom)return custom;}
    if(url==='/api/widgets/generation-catalog')return{ok:true,json:async()=>[...library,generic,streamviz]};
    if(url.includes('widget-catalog'))return{ok:true,json:async()=>[...library,generic]}; // Visibility must be enforced even with bad library metadata.
    if(url==='/api/widgets/plan')return{ok:true,json:async()=>plan};
    if(url==='/api/widgets/default-boards')return{ok:true,json:async()=>({})};
    if(url==='/api/widgets/tradingview')return{ok:true,json:async()=>({url:'/generated/new-tv.html',title:'行情'})};
    if(url==='/api/chat/stream')return{ok:true,body:{}};
    throw Error('unexpected '+url);
  };
  w.readEventStream=async(body,callback)=>{if(body.run)return body.run(callback);callback('final',{reportArtifacts:[{url:'/generated/unwanted-source.html',title:'上游中间图'},{url:'/generated/new-component.html',title:'新组件'}],interpretation:'[[AIME_CHART:/home/ubuntu/veya-agent/outputs/generated/new-component.html]]'});};
  w.eval(code);
  return{dom,w,d:w.document,calls,stored:()=>JSON.parse(w.localStorage.getItem('mentora-widget-boards-v1')),board:()=>JSON.parse(w.localStorage.getItem('mentora-widget-boards-v1')).boards.find(b=>b.id==='b')};
}
const submit=(s,text)=>{s.d.querySelector('#widgetPrompt').value=text;s.d.querySelector('#widgetForm').dispatchEvent(new s.w.Event('submit',{cancelable:true}));};

test('library lists domestic and AInvest components, never source-less renderers',async()=>{
  const s=setup();s.d.querySelector('#widgetSidebarLibrary').click();await tick();
  assert(s.d.querySelector('[data-add-preset="ashare-kline"]'));
  assert(s.d.querySelector('[data-add-preset="kline"]'));
  assert.equal(s.d.querySelector('[data-add-preset="generic-bar_chart"]'),null);
  assert.match(s.d.querySelector('#widgetLibraryList').textContent,/Fuyao/);
  assert.match(s.d.querySelector('#widgetLibraryList').textContent,/AInvest/);
  s.dom.window.close();
});

test('domestic library addition fetches real data through its skill, not a cached preset',async()=>{
  const s=setup({cards:[]});s.d.querySelector('#widgetSidebarLibrary').click();await tick();
  s.d.querySelector('[data-add-preset="ashare-kline"]').click();await tick();await tick();
  assert(!s.calls.some(c=>c.url.startsWith('/api/widgets/presets/')));
  const request=JSON.parse(s.calls.find(c=>c.url==='/api/chat/stream').options.body);
  assert.match(request.question,/a-share-data.*historical_kline.py/);
  assert.match(request.question,/600519.SH/);assert.equal(request.agent,'mentora');
  assert.equal(s.board().cards.length,1);assert.equal(s.board().cards[0].component,'ashare-kline');
  assert.deepEqual(s.board().cards[0].parameters.symbols,['600519.SH']);s.dom.window.close();
});

for(const meta of [generic,streamviz])test(`${meta.id} is generated only by dialogue with upstream evidence and component-only delivery`,async()=>{
  const request='使用提供的2026年季度收入100、150万元，比较增长';
  const s=setup({cards:[],plan:{reply:'生成组件',actions:[{type:'add',componentId:meta.id,parameters:{},request}],components:[meta]}});
  submit(s,request);await tick();await tick();
  const body=JSON.parse(s.calls.find(c=>c.url==='/api/chat/stream').options.body);
  assert.match(body.question,/先根据需求选择数据\/搜索技能或用户提供的数据/);
  assert.match(body.question,/数据源只作上游步骤/);assert.match(body.question,/最终只交付所选的一个组件/);
  assert(body.question.includes(request));assert(body.question.includes(meta.script));
  const cards=s.board().cards;assert.equal(cards.length,1);assert.equal(cards[0].request,request);
  assert.equal(cards[0].component,meta.id);assert.equal(cards[0].url,'/generated/new-component.html');s.dom.window.close();
});

test('widget loading card follows public streamed thought text and hides connection copy',async()=>{
  let release;const held=new Promise(resolve=>release=resolve),request='比较季度收入';
  const s=setup({cards:[],plan:{reply:'生成组件',actions:[{type:'add',componentId:generic.id,parameters:{},request}],components:[generic]},handler:async url=>url==='/api/chat/stream'?{ok:true,body:{run:async cb=>{cb('status',{key:'agent-connect',message:'正在连接 DeepSeek Harness · deepseek-flash'});cb('tool_step',{thoughtSummary:'确认季度收入数据范围',phase:'started'});await held;cb('final',{reportArtifacts:[{url:'/generated/done.html',title:'收入'}],interpretation:'[[AIME_CHART:/generated/done.html]]'});}}}:null});
  submit(s,request);await tick();await tick();
  assert.equal(s.d.querySelector('.widgetCardBody p').textContent,'确认季度收入数据范围');
  assert.equal(s.d.querySelector('#widgetStatus').textContent,'确认季度收入数据范围');
  assert.doesNotMatch(s.d.body.textContent,/正在连接 DeepSeek Harness/);
  release();await tick();await tick();s.dom.window.close();
});

test('refresh reruns all sources, keeps layout and records a persistent all-success timestamp',async()=>{
  const tv={...card('tv-advanced-chart','tv'),parameters:{symbols:['NASDAQ:AAPL'],interval:'D'},x:0,customTitle:false};
  const s=setup({cards:[tv,card()]});
  s.d.querySelector('#widgetRefresh').click();await tick();await tick();
  assert(s.calls.some(c=>c.url==='/api/widgets/tradingview'));
  const requests=s.calls.filter(c=>c.url==='/api/chat/stream');assert.equal(requests.length,1);
  assert.match(JSON.parse(requests[0].options.body).question,/用户提供的2026年Q1收入100/);
  assert.match(JSON.parse(requests[0].options.body).question,/使用原数据重渲染/);
  const board=s.board();assert.equal(board.cards.length,2);assert.equal(board.cards[1].id,'c');assert.equal(board.cards[1].title,'收入对比');assert.equal(board.cards[1].x,6);
  assert(board.lastRefreshedAt);assert.match(s.d.querySelector('#widgetLastRefresh').textContent,/最近刷新/);
  const stored=s.stored();s.dom.window.close();
  const next=setup({boards:stored.boards});assert.equal(next.board().lastRefreshedAt,board.lastRefreshedAt);assert.match(next.d.querySelector('#widgetLastRefresh').textContent,/最近刷新/);next.dom.window.close();
});

test('an unrefreshed board shows this visit time and generic charts suppress only their inner title',()=>{
  const s=setup({cards:[card(),card('streamviz','sv')]});
  assert.match(s.d.querySelector('#widgetLastRefresh').textContent,/^进入看板 \d{2}:\d{2}:\d{2}$/);
  const frames=[...s.d.querySelectorAll('.widgetCard iframe')];
  assert.equal(new URL(frames[0].src).searchParams.get('widgetTitle'),'0');
  assert.equal(new URL(frames[1].src).searchParams.has('widgetTitle'),false);
  s.dom.window.close();
});

test('a conversation artifact can be added to an existing or newly named board without regeneration',()=>{
  const s=setup({cards:[]});
  const trigger=s.d.createElement('button');
  s.w.dispatchEvent(new s.w.CustomEvent('mentora:add-artifact-to-widget',{detail:{url:'/generated/shared.html',title:'共享图表',trigger}}));
  assert.equal(s.d.querySelector('#widgetAddArtifactDialog').open,true);
  s.d.querySelector('#widgetAddArtifactForm').dispatchEvent(new s.w.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(s.board().cards.length,1);assert.equal(s.board().cards[0].url,'/generated/shared.html');assert.equal(s.board().cards[0].importedFromConversation,true);assert(trigger.classList.contains('is-added'));
  s.w.dispatchEvent(new s.w.CustomEvent('mentora:add-artifact-to-widget',{detail:{url:'/generated/second.html',title:'第二张图'}}));
  const select=s.d.querySelector('#widgetAddArtifactBoard');select.value='__new__';select.dispatchEvent(new s.w.Event('change'));
  s.d.querySelector('#widgetAddArtifactNewName').value='新建研究看板';s.d.querySelector('#widgetAddArtifactForm').dispatchEvent(new s.w.Event('submit',{bubbles:true,cancelable:true}));
  const created=s.stored().boards.find(board=>board.title==='新建研究看板');assert(created);assert.equal(created.cards[0].url,'/generated/second.html');s.dom.window.close();
});

test('failed refresh retains last successful content and timestamp, and can retry',async()=>{
  const date='2026-10-22T12:00:00.000Z';
  const s=setup({lastRefreshedAt:date,handler:async url=>url==='/api/chat/stream'?{ok:true,body:{run:async cb=>cb('error',{detail:'数据源暂不可用'})}}:null});
  s.d.querySelector('#widgetRefresh').click();await tick();await tick();
  assert.equal(s.board().cards[0].url,'/generated/old.html');assert.equal(s.board().cards[0].status,'ready');assert.equal(s.board().lastRefreshedAt,date);
  assert.match(s.d.querySelector('#widgetStatus').textContent,/保留原内容/);assert.match(s.d.querySelector('#widgetStatus').textContent,/数据源暂不可用/);
  assert.equal(s.d.querySelector('#widgetRefresh').disabled,false);assert(s.d.querySelector('iframe'));s.dom.window.close();
});

test('partial plan metadata does not replace the full refresh capability catalogue',async()=>{
  const s=setup({cards:[card('streamviz')],plan:{reply:'添加',actions:[{type:'add',componentId:generic.id,parameters:{},request:'给定测试数据Q1=100、Q2=150'}],components:[generic]}});
  submit(s,'增加柱状图');await tick();await tick();
  s.d.querySelector('#widgetRefresh').click();await tick();await tick();
  assert(s.calls.some(c=>c.url==='/api/widgets/generation-catalog'));
  assert.equal(s.board().cards.length,2);assert(s.board().lastRefreshedAt);
  const refreshed=s.calls.filter(c=>c.url==='/api/chat/stream').map(c=>JSON.parse(c.options.body).question);
  assert(refreshed.some(text=>text.includes('render_streamviz.py')));s.dom.window.close();
});

test('a second refresh is blocked while pending and stop prevents the next card from running',async()=>{
  let release;const held=new Promise(resolve=>release=resolve);
  const s=setup({cards:[card(),card('generic-bar_chart','second')],handler:async url=>url==='/api/chat/stream'?{ok:true,body:{run:async cb=>{await held;cb('final',{reportArtifacts:[{url:'/generated/done.html'}]});}}}:null});
  s.d.querySelector('#widgetRefresh').click();await tick();
  assert.equal(s.d.querySelector('#widgetRefresh').disabled,true);assert.equal(s.d.querySelector('#widgetRefresh').getAttribute('aria-busy'),'true');
  s.d.querySelector('#widgetRefresh').click();s.d.querySelector('#widgetStop').click();release();await tick();await tick();
  assert.equal(s.calls.filter(c=>c.url==='/api/chat/stream').length,1);assert.equal(s.board().cards[0].url,'/generated/old.html');assert.equal(s.board().lastRefreshedAt,'');s.dom.window.close();
});

test('switching boards during refresh never attaches results or timestamp to the other board',async()=>{
  let release;const held=new Promise(resolve=>release=resolve);
  const s=setup({boards:[{id:'b',title:'季度看板',cards:[card()],messages:[]},{id:'other',title:'另一看板',cards:[],messages:[]}],handler:async url=>url==='/api/chat/stream'?{ok:true,body:{run:async cb=>{await held;cb('final',{reportArtifacts:[{url:'/generated/done.html'}]});}}}:null});
  s.d.querySelector('#widgetRefresh').click();await tick();
  s.d.querySelector('#widgetManageOpen').click();s.d.querySelector('[data-manage-open="other"]').click();release();await tick();await tick();
  assert.equal(s.stored().activeId,'other');assert.equal(s.stored().boards.find(b=>b.id==='other').cards.length,0);
  assert.match(s.d.querySelector('#widgetLastRefresh').textContent,/^进入看板 \d{2}:\d{2}:\d{2}$/);assert(s.board().lastRefreshedAt);s.dom.window.close();
});
