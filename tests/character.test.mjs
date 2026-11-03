import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const html=readFileSync(new URL('../app/static/index.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../app/static/memory-sphere.js',import.meta.url),'utf8')+'\n'+readFileSync(new URL('../app/static/character.js',import.meta.url),'utf8');
const navigation=readFileSync(new URL('../app/static/navigation-url.js',import.meta.url),'utf8');
const defaults={relationship:'none',proactivity:50,stickerPacks:['companion'],stickerIds:null,name:'Mentora',age:24,gender:'female',personality:'温柔知性',role:'陪伴助手',agentPrompt:'',responseMode:'auto',paragraph:'normal',stickerProbability:50};
const tick=()=>new Promise(r=>setTimeout(r,25));
function selectMemory(h,ids){for(const input of h.d.querySelectorAll('#chRecipient input')){const next=ids.includes(input.value);if(input.checked!==next){input.checked=next;input.dispatchEvent(new h.w.Event('change',{bubbles:true}));}}}
const selectedMemory=h=>[...h.d.querySelectorAll('#chRecipient input:checked')].map(x=>x.value);
function setup(qqMetadata={},companion={recipients:[]},targets={groups:[],connected:true,syncing:false}){
 const dom=new JSDOM(html,{url:'https://example.com/?tab=character',runScripts:'outside-only'}),w=dom.window,requests=[];
 let profile={...defaults,stickerPacks:[...defaults.stickerPacks]},stickers=[],qq={},savedSecret='';
 const members=[{id:'shy',label:'害羞',file:'shy.jpg',description:'害羞脸红',url:'/static/assets/qq-fish/shy.jpg',packId:'companion'},{id:'surprise',label:'震惊',url:'/static/assets/qq-stickers/surprise.jpg',packId:'reactions'}];
 const packs=[{id:'companion',name:'大肥鱼陪伴',description:'可爱日常',tags:['日常','可爱'],source:'community',count:1,previews:[members[0].url]},{id:'reactions',name:'大肥鱼情绪',description:'震惊无语',tags:['情绪'],source:'community',count:1,previews:[members[1].url]}];
 const currentPacks=()=>packs.map(p=>({...p,installed:profile.stickerPacks.includes(p.id)}));
 w.setSidebarCollapsed=()=>{};
 w.fetch=async(path,options={})=>{
  const body=options.body?JSON.parse(options.body):undefined;requests.push({path,method:options.method||'GET',body});let result;
  if(path.endsWith('/proactive-targets/sync'))result={ok:true};else if(path.endsWith('/proactive-targets'))result=targets;else if(path.endsWith('/companion'))result=companion;else if(path.endsWith('/qq/secret'))result={appSecret:savedSecret};else if(path.includes('/sticker-packs/')){const id=path.split('/').at(-1);if(options.method==='POST'){if(!profile.stickerPacks.includes(id))profile.stickerPacks.push(id);result={ok:true};}else if(options.method==='DELETE'){profile.stickerPacks=profile.stickerPacks.filter(p=>p!==id);result={ok:true};}else result={...currentPacks().find(p=>p.id===id),items:members.filter(x=>x.packId===id)};}
  else if(path.endsWith('/qq')){savedSecret=body.appSecret||savedSecret;profile={...(body.profile||profile),...(qqMetadata.botName?{name:qqMetadata.botName}:{})};result=qq={...qqMetadata,configured:true,appId:body.appId,hasSecret:true,ready:true,requiresWebhookSetup:false,profile,webhookUrl:'https://example.com/api/qq/webhook/demo'};}
  else if(options.method==='PUT'){profile={...body};result=profile;}
  else if(options.method==='POST'&&path.endsWith('/stickers')){stickers.push({id:'sample',label:body.label,description:body.description,url:'/api/character/stickers/sample.png'});result={id:'sample'};}
  else if(options.method==='DELETE'){stickers=[];result={ok:true};}
  else result={qq,profile:{...profile},packs:currentPacks(),builtins:members.filter(x=>profile.stickerPacks.includes(x.packId)),stickers,linkedCount:0};
  return{ok:true,json:async()=>result};
 };w.eval(navigation);w.eval(source);return{dom,w,d:w.document,requests};
}
test('library icon tab opens a complete owner-scoped character page',async()=>{const h=setup();await tick();assert.equal(h.d.querySelector('#characterWorkspace').hidden,false);assert.match(h.d.querySelector('#railCharacter').innerHTML,/characterWhaleIcon/);assert.equal(h.d.querySelector('[name=name]').value,'Mentora');assert.ok(h.d.querySelector('[name=agentPrompt]'));assert.equal(h.d.querySelectorAll('#chGallery .chPack').length,1);assert.match(h.d.querySelector('#chGallery .chPack').textContent,/陪伴/);assert.equal(h.d.querySelector('[name=gender]').type,'hidden');assert.match(h.d.querySelector('#chPickerClose').innerHTML,/character-x.svg/);assert.doesNotMatch(h.d.querySelector('#chPickerClose').textContent,/×/);assert.doesNotMatch(h.d.querySelector('#chPreviewMeta').textContent,/女性|男性/);h.dom.window.close();});
test('personality and preferences save real structured settings',async()=>{const h=setup();await tick();const f=h.d.querySelector('#characterForm');f.elements.name.value='小蓝';f.elements.gender.value='male';f.elements.gender.dispatchEvent(new h.w.Event('change'));assert.match(h.d.querySelector('#chPresetRow').textContent,/温柔绅士/);h.d.querySelector('[data-ch-personality="温柔绅士"]').click();h.d.querySelector('[data-ch-personality="甜妹"]').click();h.d.querySelector('[data-ch-personality="温柔知性"]').click();assert.equal(h.d.querySelector('[data-ch-personality="甜妹"]').getAttribute('aria-pressed'),'true');assert.equal(h.d.querySelector('[data-ch-personality="温柔知性"]').getAttribute('aria-pressed'),'false');assert.equal(h.d.querySelector('[data-value=random]'),null);h.d.querySelector('[data-field=responseMode] [data-value=voice]').click();h.d.querySelector('[data-field=paragraph] [data-value=minimal]').click();f.elements.stickerProbability.value='85';f.elements.stickerProbability.dispatchEvent(new h.w.Event('input'));f.dispatchEvent(new h.w.Event('submit',{cancelable:true}));await tick();const saved=h.requests.find(r=>r.method==='PUT').body;assert.equal(saved.name,'小蓝');assert.equal(saved.personality,'温柔绅士、甜妹');assert.equal(saved.responseMode,'voice');assert.equal(saved.paragraph,'minimal');assert.equal(saved.stickerProbability,85);assert.match(h.d.querySelector('#chStatus').textContent,/下一条/);h.dom.window.close();});
test('one confirmation saves current persona and connects without extra setup',async()=>{const h=setup();await tick();const f=h.d.querySelector('#chQQForm');h.d.querySelector('[name=name]').value='直接生效';h.d.querySelector('[data-value=text]').click();f.elements.appId.value='123456789';f.elements.appSecret.value='test-private';f.dispatchEvent(new h.w.Event('submit',{cancelable:true}));await tick();assert.ok(h.requests.some(r=>r.path.endsWith('/qq')&&r.body.appSecret==='test-private'));assert.equal(f.elements.appSecret.value,'test-private');assert.equal(f.elements.appSecret.type,'text');h.d.querySelector('#chSecretToggle').click();assert.equal(f.elements.appSecret.type,'password');h.d.querySelector('#chSecretToggle').click();assert.equal(f.elements.appSecret.type,'text');assert.equal(h.d.querySelector('#chQQCallback').hidden,true);assert.equal(h.requests.find(r=>r.path.endsWith('/qq')).body.profile.name,'直接生效');assert.equal(h.requests.find(r=>r.path.endsWith('/qq')).body.profile.responseMode,'text');assert.equal(h.requests.filter(r=>r.method==='PUT').length,1);assert.match(h.d.querySelector('#chQQStatus').textContent,/无需其他操作/);assert.match(h.d.querySelector('#chWebhook').value,/webhook/);assert.equal(h.d.querySelector('#chBind'),null);h.dom.window.close();});
test('square browses whole packs, filters and installs without losing unsaved identity',async()=>{
 const h=setup();await tick();h.d.querySelector('[name=name]').value='未保存的名字';h.d.querySelector('#chAddSticker').click();
 assert.equal(h.d.querySelector('#chStickerPicker').open,true);assert.match(h.d.querySelector('#chPickerTitle').textContent,/表情包广场/);assert.equal(h.d.querySelectorAll('#chSquareGrid .chPack').length,2);
 h.d.querySelector('[data-ch-category="情绪"]').click();assert.equal(h.d.querySelectorAll('#chSquareGrid .chPack').length,1);
 const input=h.d.querySelector('#chSquareSearch');input.value='找不到';input.dispatchEvent(new h.w.Event('input'));assert.match(h.d.querySelector('#chSquareGrid').textContent,/没有找到/);input.value='';input.dispatchEvent(new h.w.Event('input'));
 h.d.querySelector('#chSquareGrid [data-ch-preview="reactions"]').click();await tick();assert.equal(h.d.querySelector('#chSquareDetail').hidden,false);assert.match(h.d.querySelector('#chSquareDetail').textContent,/震惊/);
 h.d.querySelector('#chSquareDetail [data-ch-install="reactions"]').click();await tick();await tick();assert.ok(h.requests.some(r=>r.method==='POST'&&r.path.endsWith('/sticker-packs/reactions')));assert.equal(h.d.querySelectorAll('#chGallery .chPack').length,2);assert.equal(h.d.querySelector('[name=name]').value,'未保存的名字');
 h.d.querySelector('#chPickerClose').click();h.d.querySelector('#chGallery [data-ch-uninstall="reactions"]').click();await tick();await tick();assert.equal(h.d.querySelectorAll('#chGallery .chPack').length,1);h.dom.window.close();
});
test('custom upload includes semantic description and switches gallery',async()=>{const h=setup();await tick();h.d.querySelector('#chAddSticker').click();h.d.querySelector('#chPickerUpload').click();const f=h.d.querySelector('#chUploadForm');assert.equal(f.hidden,false);f.elements.label.value='好耶';f.elements.description.value='开心庆祝';Object.defineProperty(h.d.querySelector('#chStickerFile'),'files',{value:[new h.w.File(['image'],'test.png',{type:'image/png'})]});f.dispatchEvent(new h.w.Event('submit',{cancelable:true}));await tick();await tick();assert.ok(h.requests.some(r=>r.method==='POST'&&r.body.description==='开心庆祝'&&r.body.data));assert.match(h.d.querySelector('#chGallery').textContent,/好耶/);h.dom.window.close();});
test('other workspace navigation hides character settings',async()=>{const h=setup();await tick();h.w.dispatchEvent(new h.w.CustomEvent('veya:chat-navigate',{detail:{workspace:'portfolio'}}));assert.equal(h.d.querySelector('#characterWorkspace').hidden,true);assert.equal(h.d.querySelector('.shell').classList.contains('character-view'),false);h.dom.window.close();});

test('QQ identity replaces preview image and name automatically on confirmation',async()=>{const h=setup({botName:'QQ 角色名',avatarUrl:'https://q.qlogo.cn/bot.png'});await tick();const f=h.d.querySelector('#chQQForm');f.elements.appId.value='123456';f.elements.appSecret.value='test';f.dispatchEvent(new h.w.Event('submit',{cancelable:true}));await tick();assert.equal(h.d.querySelector('#chAvatar').src,'https://q.qlogo.cn/bot.png');assert.equal(h.d.querySelector('#chPreviewName').textContent,'QQ 角色名');assert.equal(h.d.querySelector('[name=name]').value,'QQ 角色名');assert.equal(h.d.querySelector('[name=name]').readOnly,true);assert.match(h.d.querySelector('#chIdentityHint').textContent,/与 QQ/);h.dom.window.close();});

test('relationship and proactivity persist with the rest of the persona',async()=>{const h=setup();await tick();const f=h.d.querySelector('#characterForm');f.elements.relationship.value='wife';f.elements.proactivity.value='85';f.elements.proactivity.dispatchEvent(new h.w.Event('input'));f.dispatchEvent(new h.w.Event('submit',{cancelable:true}));await tick();const saved=h.requests.find(r=>r.method==='PUT').body;assert.equal(saved.relationship,'wife');assert.equal(saved.proactivity,85);assert.equal(h.d.querySelector('#chProactivityValue').value,'85%');assert.match(h.d.querySelector('#chPreviewTags').textContent,/老婆/);assert.ok(h.d.querySelector('.chMemorySphere svg'));assert.equal(h.d.querySelector('#chClearMemory'),null);h.dom.window.close();});

test('memory cloud separates recipients and escapes user-derived labels',async()=>{const h=setup({}, {recipients:[{id:'alice',label:'QQ 私聊 1',intimacy:{score:65,days:8,turns:30},sentToday:1,planState:'planned',facts:[{label:'咖啡',text:'喜欢咖啡',quote:'我喜欢喝咖啡',weight:4}]},{id:'bob',label:'QQ 私聊 2',intimacy:{score:10,days:1,turns:2},sentToday:0,planState:'waiting',facts:[{label:'<img src=x>',text:'literal',quote:'literal',weight:2}]}]});await tick();await tick();assert.match(h.d.querySelector('#chMemoryStats').textContent,/65/);assert.equal(h.d.querySelector('#chWordCloud').textContent,'咖啡');selectMemory(h,['bob']);assert.equal(h.d.querySelector('#chWordCloud img'),null);assert.equal(h.d.querySelector('#chWordCloud').textContent,'<img src=x>');assert.doesNotMatch(h.d.querySelector('#chWordCloud').textContent,/咖啡/);h.dom.window.close();});

test('proactive plans show Beijing times, prepared questions, actual delivery and recipient-specific state',async()=>{
 const due=Date.parse('2026-11-03T11:30:00+08:00')/1000;
 const h=setup({}, {recipients:[{id:'one',label:'私聊 1',intimacy:{score:11,days:1,turns:2},facts:[],sentToday:1,planState:'planned',today:[{due,state:'planned',topic:'午间休息',question:'午间准备怎么放松？<img src=x>'},{due:due+10800,state:'sent',topic:'下午问候',question:'原计划问题',message:'下午过得怎么样？'}]},{id:'two',label:'私聊 2',intimacy:{score:0,days:0,turns:0},facts:[],sentToday:0,planState:'planned',today:[]}]});
 await tick();const block=h.d.querySelector('#chProactivePlan');assert.equal(block.hidden,false);
 assert.deepEqual([...block.querySelectorAll('time')].map(x=>x.textContent),['11:30','14:30']);
 assert.match(block.textContent,/午间准备怎么放松/);assert.equal(block.querySelector('img'),null);
 assert.match(block.textContent,/已发送/);assert.match(block.textContent,/下午过得怎么样/);assert.doesNotMatch(block.textContent,/原计划问题/);
 selectMemory(h,['two']);assert.match(block.textContent,/今天未安排主动联系/);assert.doesNotMatch(block.textContent,/午间休息/);
 h.dom.window.close();
});


test('memory sphere rotates with keyboard and refresh only reads memory',async()=>{
 const h=setup({}, {recipients:[{id:'one',label:'私聊',intimacy:{score:5,days:1,turns:3},facts:[{label:'咖啡',text:'喜欢咖啡',quote:'我喜欢咖啡',weight:4},{label:'旅行',text:'喜欢旅行',weight:2}]}]});await tick();
 const d=h.d,scene=d.querySelector('.chMemorySphere'),word=d.querySelector('.chMemoryWord');
 assert.equal(d.querySelectorAll('.chMemoryWord').length,2);assert.ok(d.querySelector('.chSphereGrid'));
 const before=word.style.transform;scene.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));assert.notEqual(word.style.transform,before);
 assert.match(d.querySelector('#chMemoryRefreshAt').textContent,/最近刷新 \d{2}\/\d{2} \d{2}:\d{2}/);
 assert.equal(d.querySelector('#chMemoryStatus').textContent,'');assert.equal(d.querySelector('#chClearMemory'),null);
 assert.doesNotMatch(d.querySelector('.chCompanion').textContent,/亲密度按|词云来自|计划提问是提前|慢慢认识你/);
 d.querySelector('#chRefreshMemory').click();await tick();assert.equal(h.requests.filter(r=>r.path.endsWith('/companion')).length,2);assert.equal(h.requests.some(r=>r.method==='DELETE'),false);
 h.dom.window.close();
});

test('a sparse profile explains its single sourced fact without inventing nodes',async()=>{
 const h=setup({}, {recipients:[{id:'one',label:'私聊',intimacy:{score:11,days:1,turns:2},facts:[{id:'name',label:'称呼',text:'用户称呼角色大肥鱼',weight:1}]}]});await tick();
 assert.equal(h.d.querySelectorAll('.chMemoryWord').length,1);
 assert.match(h.d.querySelector('#chMemoryStatus').textContent,/1 条信息/);
 assert.equal(h.d.querySelector('.chMemoryWordText').textContent,'称呼');
 h.dom.window.close();
});


test('group memory defaults to the most active speaker and hides private proactive plans',async()=>{
 const h=setup({}, {recipients:[{id:'private',kind:'users',label:'QQ 私聊 1',intimacy:{score:1,days:1,turns:2},facts:[{label:'称呼',text:'昵称',weight:1}]},{id:'group',kind:'groups',label:'QQ 群聊 1 · 成员 1',intimacy:{score:20,days:3,turns:20},facts:[{label:'雨爱',text:'多次点唱过雨爱',weight:2}],today:[],planState:'waiting'}]});
 await tick();assert.deepEqual(selectedMemory(h),['group']);assert.equal(h.d.querySelector('#chWordCloud').textContent,'雨爱');assert.equal(h.d.querySelector('#chProactivePlan').hidden,true);
 selectMemory(h,['private']);assert.equal(h.d.querySelector('#chWordCloud').textContent,'称呼');
 h.d.querySelector('#chRefreshMemory').click();await tick();assert.deepEqual(selectedMemory(h),['private']);h.dom.window.close();
});

test('group participation preference can be switched and saved',async()=>{
 const h=setup();await tick();const form=h.d.querySelector('#characterForm');
 assert.equal(form.elements.groupReplyMode.value,'natural');
 h.d.querySelector('[data-field="groupReplyMode"] [data-value="mentions"]').click();
 form.dispatchEvent(new h.w.Event('submit',{cancelable:true}));await tick();
 assert.equal(h.requests.find(r=>r.method==='PUT').body.groupReplyMode,'mentions');
 assert.match(h.d.querySelector('[data-field="groupReplyMode"]').parentElement.textContent,/获取群内全部消息/);
 h.dom.window.close();
});


test('memory picker names sources clearly and shows multiple memories and plans separately',async()=>{
 const h=setup({}, {recipients:[
  {id:'private',kind:'users',label:'QQ 私聊 1',intimacy:{score:10,days:1,turns:2},facts:[{id:'same',label:'咖啡',text:'喜欢咖啡',weight:1}],today:[],planState:'waiting'},
  {id:'member',kind:'groups',proactiveTarget:false,label:'QQ 群聊 1 · 成员 1',intimacy:{score:20,days:2,turns:8},facts:[{id:'same',label:'旅行',text:'喜欢旅行',weight:1}],today:[]},
  {id:'room',kind:'groups',proactiveTarget:true,label:'QQ 群聊 1 · 主动消息（需群主开启权限）',intimacy:{score:0},facts:[],today:[],planState:'planned'}
 ]});await tick();
 const d=h.d;assert.match(d.querySelector('#chRecipient').textContent,/私聊 1 · 对方的记忆/);assert.match(d.querySelector('#chRecipient').textContent,/群聊 1 · 成员 1 的记忆/);assert.match(d.querySelector('#chRecipient').textContent,/全群主动联系计划/);
 d.querySelector('#chMemorySelectAll').click();assert.equal(selectedMemory(h).length,3);assert.equal(d.querySelectorAll('.chMemoryWord').length,2);assert.equal(d.querySelectorAll('#chMemoryStats meter').length,2);
 assert.match(d.querySelector('#chMemoryStats').textContent,/10/);assert.match(d.querySelector('#chMemoryStats').textContent,/20/);assert.equal(d.querySelectorAll('.chMemoryPlanSource').length,2);
 assert.match(d.querySelector('.chMemoryWord').title,/私聊 1/);assert.match(d.querySelectorAll('.chMemoryWord')[1].title,/成员 1/);
 d.querySelector('#chRefreshMemory').click();await tick();assert.equal(selectedMemory(h).length,3);
 d.querySelector('#chMemorySelectNone').click();assert.equal(selectedMemory(h).length,0);assert.match(d.querySelector('#chMemoryStatus').textContent,/选择要查看/);assert.equal(d.querySelector('#chWordCloud').hidden,true);
 d.querySelector('#chRefreshMemory').click();await tick();assert.equal(selectedMemory(h).length,0);
 selectMemory(h,['room']);assert.equal(d.querySelector('#chMemoryStats').textContent,'');assert.equal(d.querySelector('#chWordCloud').hidden,true);assert.match(d.querySelector('#chMemoryStatus').textContent,/群主/);
 assert.equal(h.requests.filter(x=>x.method!=='GET').length,0);
 const picker=d.querySelector('#chRecipientPicker');picker.open=true;picker.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(picker.open,false);
 h.dom.window.close();
});


test('proactive destinations persist an explicit private and group allowlist independently of memory viewing',async()=>{
 const one='a'.repeat(24),two='b'.repeat(24);
 const h=setup({}, {recipients:[]}, {connected:true,groups:[{id:one,name:'一起摸鱼群',available:true,permission:'allowed'},{id:two,name:'<img src=x>',available:false,permission:'denied'}]});await tick();
 const d=h.d;assert.equal(d.querySelector('#chProactivePrivate').checked,true);assert.match(d.querySelector('#chProactiveGroups').textContent,/一起摸鱼群/);assert.equal(d.querySelector('#chProactiveGroups img'),null);
 assert.equal(d.querySelector('[data-proactive-group="'+two+'"]').disabled,true);
 const input=d.querySelector('[data-proactive-group="'+one+'"]');input.checked=true;input.dispatchEvent(new h.w.Event('change',{bubbles:true}));d.querySelector('#chProactivePrivate').checked=false;
 d.querySelector('#characterForm').dispatchEvent(new h.w.Event('submit',{cancelable:true}));await tick();
 const saved=h.requests.find(r=>r.method==='PUT').body;assert.equal(saved.proactivePrivate,false);assert.deepEqual(saved.proactiveGroups,[one]);
 d.querySelector('#chSyncProactiveGroups').click();await tick();assert.equal(h.requests.some(r=>r.path.endsWith('/proactive-targets/sync')&&r.method==='POST'),true);
 assert.equal(d.querySelector('[data-proactive-group="'+one+'"]').checked,true);
 d.querySelector('#chClearProactiveGroups').click();assert.equal(d.querySelectorAll('[data-proactive-group]:checked').length,0);
 h.dom.window.close();
});
