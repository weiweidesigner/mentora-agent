(() => {
  'use strict';
  if(document.getElementById('portfolioWorkspace'))return;
  const $=id=>document.getElementById(id),shell=document.querySelector('.shell');
  if(!shell)return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>v===null||v===undefined?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(v);
  const num=(v,d=2)=>v!==null&&v!==undefined&&Number.isFinite(Number(v))?Number(v).toLocaleString('en-US',{maximumFractionDigits:d}):'—';
  const date=v=>v?new Date(v).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'尚未更新';
  const tone=v=>v>0?'pfGain':v<0?'pfLoss':'';
  const nativeMoney=(value,currency)=>`${esc(currency||'USD')} ${num(value,4)}`;
  const names={trend:'均线趋势',reversion:'均值回归',momentum:'20 日动量',breakout:'20 日突破',ma_cross:'双均线交叉',rsi_reversal:'RSI 反转',volume_breakout:'放量突破',pullback:'趋势回踩',custom:'自定义策略',event:'事件观察',manual:'手动交易','jev-entry':'JEV 买入决策','jev-risk':'JEV 风险处置'};
  const views=[['watchlist','观察列表'],['positions','持仓明细'],['returns','收益情况'],['trades','交易记录'],['strategies','策略配置'],['profile','个人信息']];
  const icon='<svg class="navigationIcon navigationOutline" aria-hidden="true" viewBox="0 0 1024 1024"><path d="M939.68 737.984c-20.448-8.416-80.256-32.8-141.664-56.736 62.112-67.52 97.568-156.544 97.568-248.608 0-202.912-165.12-368-368.064-368-202.912 0-368 165.088-368 368 0 16.224 1.024 32.352 3.072 47.968 2.304 17.504 18.496 29.664 35.904 27.584 17.536-2.304 29.888-18.368 27.584-35.904-1.696-12.864-2.56-26.208-2.56-39.648 0-167.616 136.384-304 304-304 167.648 0 304.064 136.384 304.064 304 0 84.736-34.112 163.36-96.128 221.472-0.768 0.736-1.088 1.76-1.824 2.528-42.848-15.936-79.328-28.48-93.76-30.656-24.896-3.904-48.672 7.616-63.104 28.896-12.032 17.792-15.072 38.816-8.096 56.256 4.288 10.656 20.512 32.896 39.776 57.28-46.432-0.064-117.312-6.336-192.832-35.488-31.264-12.064-69.44-52.64-103.136-88.416-47.968-50.976-93.28-99.104-142.56-99.104-18.336 0-35.744 6.848-50.336 19.776-18.24 16.224-35.136 48.32-12 109.248 42.624 112.16 208.544 285.12 341.728 285.12h478.144c17.696 0 32-14.304 32-32v-160c0.064-12.928-7.776-24.64-19.776-29.568z m-44.16 157.6H449.376c-97.6 0-247.072-152.128-281.92-243.872-10.112-26.656-6.72-37.408-5.344-38.624 4.128-3.648 6.528-3.648 7.84-3.648 21.632 0 64.608 45.632 95.968 78.944 40.224 42.752 81.856 86.944 126.656 104.256 85.216 32.896 164.896 39.808 216.736 39.808 41.376 0 67.584-4.352 68.672-4.544 11.328-1.952 20.736-9.76 24.672-20.544a31.928 31.928 0 0 0-5.536-31.616c-27.008-32.096-58.592-71.808-67.296-85.344 0.288-0.576 0.512-1.024 0.352-1.152 22.848 3.488 162.432 57.952 265.28 99.84v106.496h0.064z"/><path d="M402.238 438.64c-11.849-11.85-11.849-31.06 0-42.909l107.27-107.27c11.85-11.85 31.06-11.85 42.91 0l107.27 107.27c11.849 11.849 11.849 31.06 0 42.908L552.418 545.91c-11.85 11.849-31.06 11.849-42.91 0l-107.27-107.27z m128.725 42.908l64.362-64.363-64.362-64.362-64.362 64.362 64.362 64.363z"/></svg>';
  const solidIcon='<svg class="navigationIcon navigationSolid" aria-hidden="true" viewBox="0 0 1024 1024"><path fill-rule="evenodd" d="M896 432a368 368 0 1 0-736 0 368 368 0 0 0 736 0ZM531 303 417 417l114 114 114-114Z"/><path d="M113 598c35-38 71-23 115 18l125 128c77 58 171 77 279 73l-65-80c-24-30-18-65 6-90 19-20 42-23 68-15l296 112v184H450c-141 0-291-162-338-267-14-31-16-48 1-63Z" stroke="var(--soft-2)" stroke-width="34" stroke-linejoin="round"/></svg>';
  for(const [id,anchor,cls] of [['railPortfolio','railWidgets','railButton desktopNavRail'],['navPortfolio','navWidgets','sidebarAction taskNavLink']]){
    const el=document.createElement('button');el.id=id;el.className=cls;el.type='button';el.setAttribute('aria-label','交易');el.dataset.tip='交易';el.innerHTML=icon+(id==='railPortfolio'?solidIcon:'')+(id==='navPortfolio'?'<span>交易</span>':'');
    // Match the rail's optical icon size without enlarging its button/hit area.
    if(id==='railPortfolio')el.querySelectorAll('svg').forEach(svg=>svg.setAttribute('viewBox','72 48 912 912'));
    $(anchor)?.after(el);
  }
  const workspace=document.createElement('section');workspace.id='portfolioWorkspace';workspace.className='portfolioWorkspace';workspace.hidden=true;workspace.setAttribute('aria-label','Mentora Deal 交易');
  workspace.innerHTML=`<div class="pfPage"><header class="pfHeader"><div><h1>交易</h1></div><div class="pfRefresh"><span id="pfRefreshAt" role="status">加载中…</span><button type="button" data-pf-action="refresh" class="pageRefreshButton" aria-label="刷新交易页面"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 6.1A8 8 0 0 1 19.6 10M4.4 14a8 8 0 0 0 13.5 3.9"/></svg><span>刷新</span></button></div></header><nav class="pfTabs" role="tablist" aria-label="交易页面">${views.map(([id,title])=>`<button data-pf-view="${id}" role="tab" aria-selected="false">${title}</button>`).join('')}</nav><div id="pfPanel"><div class="pfEmpty">正在读取账户…</div></div><form id="pfIdeaForm" class="pfIdeaDock composer" aria-label="输入交易想法"><div class="pfIdeaComposer composerBox"><button class="pfIdeaAttach attachButton" type="button" aria-label="选择图片"><span aria-hidden="true"></span></button><textarea id="pfIdeaInput" name="question" rows="1" minlength="2" maxlength="2000" required placeholder="例如：英伟达现在能买吗？" aria-label="交易想法"></textarea><button class="pfIdeaSubmit" type="submit" aria-label="发送到首页分析"><span class="sendArrow" aria-hidden="true"></span></button></div></form></div>`;
  shell.append(workspace);
  const sharedReasoningControl=$('reasoningStrengthControl');
  if(sharedReasoningControl){
    const homeReasoningAnchor=document.createComment('shared reasoning selector');
    sharedReasoningControl.before(homeReasoningAnchor);
    const syncReasoningComposer=()=>{
      if(typeof syncReasoningStrengthComposer==='function'){syncReasoningStrengthComposer();return;}
      const target=workspace.hidden?homeReasoningAnchor.parentElement:workspace.querySelector('.pfIdeaComposer');
      if(!target||sharedReasoningControl.parentElement===target)return;
      if(typeof setReasoningStrengthPopover==='function')setReasoningStrengthPopover(false);
      if(workspace.hidden)homeReasoningAnchor.after(sharedReasoningControl);
      else target.querySelector('.pfIdeaSubmit').before(sharedReasoningControl);
      if(workspace.hidden&&typeof resizeComposerInput==='function')resizeComposerInput();
      else if(!workspace.hidden&&typeof updateIdeaComposer==='function')updateIdeaComposer();
    };
    new MutationObserver(syncReasoningComposer).observe(workspace,{attributes:true,attributeFilter:['hidden']});
    syncReasoningComposer();
  }
  const dialog=document.createElement('dialog');dialog.id='pfDialog';dialog.className='pfDialog';dialog.setAttribute('aria-label','账户操作');document.body.append(dialog);
  const toast=document.createElement('div');toast.className='pfToast';toast.hidden=true;toast.setAttribute('role','status');document.body.append(toast);
  let firstPageRefreshAt=null;
  let data=null,flow=null,items=[],view='watchlist',internal=false,loading=false,busy=false,timer=null,toastTimer=null,filter='all',lastNavView='',favoritePicker=null,stickyWatchCleanup=null;
  const message=(text,duration=6500)=>{toast.textContent=text;toast.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.hidden=true,duration);};
  async function api(path,method='GET',body){
    const response=await fetch('/api/portfolio'+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-Veya-Portfolio':'1'},...(body?{body:JSON.stringify(body)}:{})});
    let result;try{result=await response.json();}catch{throw Error('服务暂时不可用，请稍后重试');}
    if(!response.ok)throw Error(typeof result.detail==='string'?result.detail:'请求未完成，请重试');return result;
  }
  const card=(title,content,size='',action='')=>`<section class="pfCard ${size}"><header class="pfCardHead"><h2>${title}</h2>${action}</header>${content}</section>`;
  const empty=(title,text)=>`<div class="pfEmpty"><strong>${title}</strong>${text}</div>`;
  const tag=text=>`<span class="pfTag">${esc(text)}</span>`;
  function quoteLabel(q){if(!q)return'待获取行情';return`${q.nativeCurrency||'USD'} ${num(q.nativePrice??q.price,4)} · ${q.dateOnly?q.priceDate+' 收盘':date(q.priceAt)} · ${q.realTime?'源标记实时':'参考行情'}`;}
  function sourceRefs(item){return(item.sources||[]).slice(0,2).map(s=>{if(!s.taskId||s.taskId==='mentora-deal-input')return`${esc(s.title||'交易想法')} · ${date(s.at)}`;const url=new URL(location.href);url.search='';url.searchParams.set('tab','tasks');url.searchParams.set('task',s.taskId);return`<a class="pfLink" href="${esc(url.href)}">${esc(s.title)}</a> · ${date(s.at)}`;}).join('<br>');}
  function equityChart(){const history=data.history||[];if(history.length<2)return`<div class="pfChart">${history.length?'已记录首次估值，持续积累每日净值':'首次更新行情后开始记录每日净值'}</div>`;const values=history.map(h=>h.equity),lo=Math.min(...values),hi=Math.max(...values),span=hi-lo||Math.max(1,hi*.01);const points=values.map((v,i)=>`${(i/(values.length-1)*900).toFixed(1)},${(145-(v-lo)/span*120).toFixed(1)}`).join(' ');return`<div class="pfChart"><svg viewBox="0 0 900 190" role="img" aria-label="实际记录的每日账户净值"><line x1="0" y1="145" x2="900" y2="145" stroke="currentColor" opacity=".12"/><polyline points="${points}" stroke="#6cba9c" stroke-width="2.5" fill="none"/><text x="0" y="180" fill="currentColor" font-size="11">${esc(history[0].day)}</text><text x="900" y="180" text-anchor="end" fill="currentColor" font-size="11">${esc(history.at(-1).day)}</text></svg></div>`;}
  function overview(){const equity=data.equity,profit=equity===null?null:equity-data.initial;const metrics=[['可用现金',data.cash],['持仓市值',data.marketValue],['未实现盈亏',data.unrealized],['已实现盈亏',data.realized]];const total=Number.isFinite(equity)&&equity>0?equity:null;return`<div class="pfGrid">${card('账户总资产',`<div class="pfHero">${money(equity)}</div><div class="${tone(profit)}">${money(profit)} <span class="pfMuted">累计收益 · ${num(data.totalReturn)}%</span></div><div class="pfMetrics">${metrics.map(([name,value])=>`<div><small>${name}</small><strong class="${name.includes('盈亏')?tone(value):''}">${money(value)}</strong></div>`).join('')}</div><p class="pfSubtle">初始资金 ${money(data.initial)} · ${data.valuationComplete?'账户估值完整':'部分持仓价格待更新，当前估值可能已过期'}</p>`,'eight')}${card('资产分布',`<div class="pfAllocation" role="img" aria-label="现金与持仓占比"><span style="width:${total?Math.min(100,data.cash/total*100):0}%"></span></div><div class="pfRows"><div class="pfRow"><span class="pfMuted">现金</span><b>${num(total?data.cash/total*100:null)}%</b></div><div class="pfRow"><span class="pfMuted">股票 / ETF</span><b>${num(total&&data.marketValue!==null?data.marketValue/total*100:null)}%</b></div><div class="pfRow"><span class="pfMuted">持仓数量</span><b>${data.positions.length}</b></div></div><p class="pfSubtle">原币行情按真实汇率折算 USD，成交与资金记录持续保存。</p>`,'four')}${card('当前收益',`<div class="pfProfitRow"><div><span class="pfMuted">累计收益率</span><strong class="${tone(data.totalReturn)}">${num(data.totalReturn)}%</strong></div><div><span class="pfMuted">未实现收益</span><strong class="${tone(data.unrealized)}">${money(data.unrealized)}</strong></div><div><span class="pfMuted">已实现收益</span><strong class="${tone(data.realized)}">${money(data.realized)}</strong></div></div><p class="pfSubtle">历史收益从首次更新行情开始记录，可在「收益变化」查看真实估值轨迹。</p>`)}</div>`;}
  function positionAsset(symbol,name,isCN){
    // Match the existing watchlist's TradingView market-code mapping.
    const target=/^\d{4,5}\.HK$/.test(symbol)?'HKEX:'+Number(symbol.slice(0,-3)):/^6\d{5}\.SH$/.test(symbol)?'SSE:'+symbol.slice(0,6):/^\d{6}\.SZ$/.test(symbol)?'SZSE:'+symbol.slice(0,6):/^\d{6}\.BJ$/.test(symbol)?'BSE:'+symbol.slice(0,6):symbol;
    const label=isCN?`<b>${esc(name)}</b><small>${esc(symbol)}</small>`:`<b>${esc(symbol)}</b><small>${esc(name)}</small>`;
    return `<a class="pfPositionSymbolLink" href="https://www.tradingview.com/chart/?symbol=${encodeURIComponent(target)}" target="_blank" rel="noopener noreferrer" aria-label="在 TradingView 查看 ${esc(symbol)} 行情">${label}</a>`;
  }
  function positions(){const summary=`<div class="pfMetrics pfDealMetrics">${[['账户总资产',data.equity],['可用现金',data.cash],['持仓市值',data.marketValue],['累计收益',data.equity==null?null:data.equity-data.initial]].map(([label,value])=>`<div><small>${label}</small><strong class="${label.includes('收益')?tone(value):''}">${money(value)}</strong></div>`).join('')}</div>`;return card('持仓明细',summary+(data.positions.length?`<div class="pfTableWrap"><table class="pfTable"><thead><tr>${['标的','持仓 / 可卖','成本均价','最新价','市值','未实现盈亏','最近 JEV 决策'].map(s=>`<th>${s}</th>`).join('')}</tr></thead><tbody>${data.positions.map(p=>{const risk=(flow?.decisions||[]).find(d=>d.kind==='risk'&&d.symbol===p.symbol),entry=(flow?.decisions||[]).find(d=>d.kind==='entry'&&d.symbol===p.symbol&&d.executionStatus!=='voided'),currency=p.nativeCurrency||p.quote?.nativeCurrency||'USD',name=p.quote?.name||p.symbol,isCN=/\.(SH|SZ|BJ)$/.test(p.symbol),asset=positionAsset(p.symbol,name,isCN);return`<tr><td class="pfPositionAsset">${asset}</td><td>${num(p.quantity,0)}<small>可卖 ${num(p.availableToSell??p.quantity,0)}</small></td><td>${nativeMoney(p.nativeAverageCost??(currency==='USD'?p.averageCost:null),currency)}</td><td>${nativeMoney(p.quote?.nativePrice??(currency==='USD'?p.quote?.price:null),currency)}</td><td>${nativeMoney(p.nativeMarketValue??(currency==='USD'?p.marketValue:null),currency)}</td><td class="${tone(p.unrealized)}">${nativeMoney(p.nativeUnrealized??(currency==='USD'?p.unrealized:null),currency)}</td><td>${risk&&(!entry||risk.created>=entry.created)?`<b>${esc(actionLabel(risk))}</b><small>${date(risk.created)}</small>` :entry?`<b>${esc(actionLabel(entry))}</b><small>${typeof entry.confidence==='number'?num(entry.confidence*100,1)+'% · ':''}${date(entry.created)}</small>`:'暂无 JEV 决策'}</td></tr>`;}).join('')}</tbody></table></div>`:empty('还没有持仓','Mentora Deal 的定时任务发现候选后，JEV 交易信号与下单 Skill 会将成交记录更新到这里。')));}
  function confidenceSide(d){
    const side=[d.confidenceDirection,d.confidenceAction,d.confidenceGate?.action,d.modelAction,d.action].find(a=>['buy','sell','reduce'].includes(a));
    if(side)return side==='reduce'?'sell':side;
    const sides=['buy','sell'].filter(a=>typeof d.actionConfidences?.[a]==='number');return sides.length===1?sides[0]:null;
  }
  function modelConfidence(d){
    const provider=d.providerModel||'',status=d.decisionStatus||d.status;
    const model=/laya/i.test(provider)?'Laya':provider?'JEV':'';
    if(status==='blocked'||provider.endsWith('/constraint-guard')){
      const reason=d.decisionReason||d.reason||'当前证据未通过风控校验';
      return `<span>未调用模型</span><details><summary>风控未通过</summary><small>${esc(reason)}</small></details>`;
    }
    const side=confidenceSide(d),value=side?(d.actionConfidences?.[side]??d.confidence):null;
    if(value!=null)return `<span>${side==='buy'?'买入':'卖出'} ${num(value*100,1)}%</span><small>${esc(model)}${status==='inconsistent'?' · 顺序校验未通过':status==='low-confidence'?' · 置信度不足':''}</small>`;
    if(d.confidence!=null||d.classificationConfidence!=null)return '<span>未记录买卖方向置信度</span>';
    return `<span>${status==='unavailable'?'决策未完成':'待模型分析'}</span>`;
  }
  function watchlistTests(item){
    return (item.backtests||[]).filter(test=>test.status==='computed');
  }
  function watchlist(){
    const rows=(flow?.watchlist||[]).filter(item=>item.workflowExecution||[item.hasPosition?item.directionAssessment?.confidence:undefined,item.buyConfidence,item.sellConfidence,item.confidence].some(value=>value!==null&&value!==undefined&&Number.isFinite(Number(value))));
    return card('观察列表',rows.length?`<div class="pfTableWrap"><table class="pfTable pfWatchTable"><thead><tr><th>标的</th><th>纳入观察的原因</th><th>事件催化影响分数</th><th>最新行情</th><th>量化策略</th><th>回测收益率</th><th>最大回撤</th><th>交易次数 / 胜率</th><th>动作</th><th>置信度</th><th>交易</th><th>时间</th></tr></thead><tbody>${rows.map(item=>{
      const q=item.quote||item.eventResearch?.quote,signal=item.signal||{},reason=item.reason||'尚未记录纳入依据',company=item.name&&item.name!==item.symbol?item.name:q?.name||item.symbol,isCN=/\.(SH|SZ|BJ)$/.test(item.symbol),symbol=`<a class="pfWatchSymbolLink" href="${esc(item.tradingViewUrl)}" target="_blank" rel="noopener noreferrer" aria-label="在 TradingView 查看 ${esc(item.symbol)}">${esc(item.symbol)}</a>`,asset=isCN?`<strong title="${esc(company)}">${esc(company)}</strong><small>${symbol}</small>`:`<strong>${symbol}</strong><small title="${esc(company)}">${esc(company)}</small>`,market=q?`<b>${esc(q.nativeCurrency||'USD')} ${num(q.nativePrice??q.price,4)}</b><small>${esc(q.priceDate||date(q.priceAt))}</small>`:signal.lastClose!=null?`<b>${esc(signal.currency||'USD')} ${num(signal.lastClose,4)}</b><small>${esc(signal.asOf||'尚未更新')}</small>`:'暂无有效历史行情',tests=watchlistTests(item),stack=(render,missing='—')=>tests.length?`<div class="pfWatchMetricList">${tests.map(render).join('')}</div>`:`<span class="pfMuted">${missing}</span>`,metric=render=>stack(t=>t.status==='computed'?render(t):`<span class="pfMuted" title="${esc(t.reason||'回测未完成')}">${t.status==='pending'?'待回测':t.status==='insufficient'?'数据不足':'未完成'}</span>`),trade=item.executionStatus==='filled'?(item.tradePolicyMismatch?'低置信误成交':item.decision==='buy'?'买入':['sell','reduce'].includes(item.decision)?'卖出':'未下单'):'未下单';
      const actionTime=item.directionAssessment?.assessedAt||(item.executionStatus==='filled'&&item.tradeAt?item.tradeAt:item.decisionAt)||item.workflowExecution?.updated;
      const assessment=item.directionAssessment||{};
      const direction=item.observationAction||(assessment.action==='sell'&&item.hasPosition?'sell':'buy');
      const workflowDecision=item.workflowExecution?.decision||{},side=confidenceSide({confidenceAction:item.confidenceAction,confidenceGate:item.confidenceGate,action:assessment.action})||(item.buyConfidence!=null?'buy':item.hasPosition&&item.sellConfidence!=null?'sell':confidenceSide(workflowDecision));
      const value=side?(assessment[side+'Confidence']??item[side+'Confidence']??(confidenceSide(workflowDecision)===side?workflowDecision.actionConfidences?.[side]??workflowDecision.confidence:undefined)??(confidenceSide(item)===side?item.confidence:undefined)??(assessment.action===side?assessment.confidence:undefined)):null;
      const pending=['queued','running'].includes(assessment.status);
      const missingText=pending?'正在评估':item.decisionStatus==='unavailable'||assessment.status==='failed'?'等待重试':side?`未生成${side==='sell'?'卖出':'买入'}置信度`:item.confidence!=null||workflowDecision.confidence!=null?'未记录买卖方向置信度':'未生成买卖方向置信度';
      const confidenceText=value!==null&&value!==undefined&&Number.isFinite(Number(value))?(side==='sell'?'卖出':'买入')+' '+num(Number(value)*100,1)+'%':missingText;
      const backtestTrades=t=>`${num(t.trades??0,0)} 次 / ${num(t.winRate??0,1)}%`;
      return`<tr><td class="pfWatchAsset">${asset}</td><td class="pfWatchReasonCell">${esc(reason)}</td><td class="pfWatchCatalyst" title="事件对当前投资逻辑的正向催化强度，0–100分；非盈利概率">${typeof item.catalystImpactScore==='number'&&Number.isFinite(item.catalystImpactScore)&&item.catalystImpactScore>=0&&item.catalystImpactScore<=100?num(item.catalystImpactScore,0)+' / 100':item.catalystImpactStatus==='no-event'?'无事件催化':item.catalystImpactStatus==='insufficient-evidence'?'证据不足':'—'}</td><td class="pfWatchMarket">${market}</td><td>${stack(t=>`<span title="回测结果不代表当前已触发买入信号">${esc((flow?.strategies?.customStrategies||[]).find(s=>s.id===t.strategy)?.name||t.strategyName||(t.strategy==='custom'?(flow?.strategies?.customName||names.custom):(names[t.strategy]||t.strategy)))}</span>`,Array.isArray(flow?.strategies?.enabled)?'未启用策略':'未完成有效回测')}</td><td>${metric(t=>`<span class="${tone(t.totalReturn)}">${num(t.totalReturn)}%</span>`)}</td><td>${metric(t=>`<span>${num(t.maxDrawdown)}%</span>`)}</td><td>${metric(t=>`<span>${backtestTrades(t)}</span>`)}</td><td class="pfWatchAction">${({buy:'买入',sell:'卖出',reduce:'减仓',hold:'持有',watch:'观察',skip:'暂不参与'})[direction]||'待决策'}</td><td class="pfWatchJev" title="基于当前证据对该买卖方向的模型置信度；不代表已成交或盈利概率">${confidenceText}</td><td class="pfWatchTrade">${trade}</td><td class="pfWatchTime">${actionTime?date(actionTime):'—'}</td></tr>`;
    }).join('')}</tbody></table></div>`:empty('观察列表为空','定时任务或底部交易想法完成标的提取后，会在这里展示纳入原因、行情、回测和 JEV 决策。'))
  }
  function mountStickyWatchHeader(){
    stickyWatchCleanup?.();stickyWatchCleanup=null;
    const table=$('pfPanel').querySelector('.pfWatchTable'),wrap=table?.closest('.pfTableWrap'),head=table?.tHead;
    if(!table||!wrap||!head)return;
    const sticky=document.createElement('div'),clip=document.createElement('div'),clone=document.createElement('table');
    sticky.className='pfWatchSticky';sticky.setAttribute('aria-hidden','true');
    clip.className='pfWatchStickyClip';clone.className='pfTable pfWatchStickyTable';
    clone.append(head.cloneNode(true));clip.append(clone);sticky.append(clip);wrap.before(sticky);
    let frame=0;
    const update=()=>{
      frame=0;
      const cells=[...head.rows[0].cells],widths=cells.map(cell=>cell.getBoundingClientRect().width),total=widths.reduce((sum,width)=>sum+width,0);
      let colgroup=clone.querySelector('colgroup');
      if(!colgroup){colgroup=document.createElement('colgroup');clone.prepend(colgroup);}
      colgroup.innerHTML=widths.map(width=>`<col style="width:${width}px">`).join('');
      const headRect=head.getBoundingClientRect(),tableRect=table.getBoundingClientRect(),workspaceRect=workspace.getBoundingClientRect(),height=headRect.height;
      clone.style.width=`${total}px`;clone.style.transform=`translateX(${-wrap.scrollLeft}px)`;
      clip.style.height=`${height}px`;
      sticky.classList.toggle('is-visible',headRect.top<workspaceRect.top&&tableRect.bottom>workspaceRect.top+height);
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};
    workspace.addEventListener('scroll',schedule,{passive:true});wrap.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);update();
    stickyWatchCleanup=()=>{workspace.removeEventListener('scroll',schedule);wrap.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);if(frame)cancelAnimationFrame(frame);sticky.remove();};
  }
  function trades(){const decisions=new Map((flow?.decisions||[]).map(d=>[d.id,d]));return card('交易记录',data.trades.length?`<div class="pfTableWrap"><table class="pfTable"><thead><tr>${['时间','标的','方向','数量','成交价','手续费','已实现盈亏 USD','依据'].map(s=>`<th>${s}</th>`).join('')}</tr></thead><tbody>${data.trades.map(t=>{const name=t.quote?.name||t.name||t.symbol,isCN=/\.(SH|SZ|BJ)$/.test(t.symbol),asset=isCN?`<b>${esc(name)}</b><small>${esc(t.symbol)}</small>`:`<b>${esc(t.symbol)}</b><small>${esc(name)}</small>`,decision=decisions.get(t.decisionId)||{},reason=t.decisionReason||decision.reason,factor=t.decisionFactorLabel||decision.factorLabel,confidence=t.decisionConfidence??decision.confidence,title=String(t.decisionSource||'').startsWith('user')?'用户指定 · JEV 加权决策':t.decisionId?(t.decisionAction==='buy'?'JEV 买入决策':'JEV 风险处置'):(names[t.strategy]||t.strategy),basis=reason||factor||title,meta=[factor&&factor!==basis?factor:'',confidence!=null?'置信度 '+num(confidence*100,1)+'%':''].filter(Boolean).join(' · ');return`<tr><td>${date(t.created)}</td><td class="pfTradeAsset">${asset}</td><td>${t.side==='buy'?'买入':'卖出'}</td><td>${num(t.quantity,0)}</td><td>${nativeMoney(t.nativePrice??t.price,t.nativeCurrency||'USD')}</td><td>${nativeMoney(t.fee/((t.quote?.fx?.rate)||1),t.nativeCurrency||'USD')}</td><td class="${tone(t.realized)}">${t.side==='sell'?money(t.realized):'—'}</td><td class="pfTradeBasis" title="${esc(t.fillRule||'')}"><b>${esc(basis)}</b>${meta?`<small>${esc(meta)}</small>`:''}</td></tr>`;}).join('')}</tbody></table></div>`:empty('还没有交易记录','每笔成交都会保存报价来源、行情时间、成交价与费用。'));}
  function actionLabel(d){return d.status==='unavailable'?'未达到 JEV 条件':({buy:'可以买入',watch:'继续观察',skip:'当前跳过',hold:'继续持有',reduce:'减仓',sell:'卖出'})[d.action]||'等待分析';}
  function executionLabel(d){return({filled:'已成交',planned:'已生成下单策略','awaiting-confirmation':'待确认下单','market-closed':'等待交易时段',blocked:'下单未通过校验','not-requested':'无需下单'})[d.executionStatus]||'无需下单';}
  function decisionCard(d){const e=d.evidence||{},q=e.quote,tests=e.backtests||[],expired=Date.now()>Date.parse(d.expires);const actionable=['buy','reduce','sell'].includes(d.action)&&d.status==='decided'&&!expired;return`<article class="pfDecision"><header><div><div class="pfTicker">${esc(d.symbol)} <span class="pfTag">${d.kind==='risk'?'持仓风险':'买入机会'}</span></div><div class="pfMeta">${esc(d.name&&d.name!==d.symbol?d.name:q?.name||d.symbol)} · ${date(d.created)}</div></div><div class="pfDecisionAction ${d.action==='buy'?'pfGain':['reduce','sell'].includes(d.action)?'pfLoss':''}">${esc(actionLabel(d))}</div></header><p>${esc(d.reason||'等待证据')}</p><div class="pfMeta">${q?esc(quoteLabel(q)):'行情暂不可用'}<br>${modelConfidence(d)}${expired?' · 决策已过期':''}</div>${e.signal?`<div class="pfEvidenceStrip"><span>日线 ${esc(e.signal.asOf)}</span><span>MA20 ${num(e.signal.ma20)} / MA60 ${num(e.signal.ma60)} ${esc(e.signal.currency)}</span><span>Z ${num(e.signal.z)}</span></div>`:''}${e.risk?`<div class="pfEvidenceStrip"><span>当前收益 ${num(e.risk.returnPct)}%</span><span>仓位 ${num(e.risk.weightPct)}%</span><span>可卖 ${num(e.risk.availableToSell,0)} 股</span></div>`:''}${tests.length?`<details><summary>量化历史验证 · ${tests.some(t=>t.sampleAdequate)?'有已平仓样本':'样本仍有限'}</summary><div class="pfBacktests">${tests.map(t=>t.status==='computed'?`<div><b>${esc(names[t.strategy]||t.strategy)}</b><span>${esc(t.fromDate)} — ${esc(t.toDate)}</span><span>收益 ${num(t.totalReturn)}% · 回撤 ${num(t.maxDrawdown)}% · 已平仓 ${t.trades} 次${t.winRate!==null?' · 胜率 '+num(t.winRate)+'%':''}</span><small>${esc(t.method)} · 单边滑点 ${num(t.slippageBps)} bps</small></div>`:`<p>${esc(t.reason||'回测数据不足')}</p>`).join('')}</div></details>`:''}${(e.eventEvidence||[]).length?`<details><summary>事件与研究证据 · ${e.eventEvidence.length} 条</summary>${e.eventEvidence.map(ref=>`<p class="pfEventExcerpt">${esc(ref.excerpt)}</p>`).join('')}</details>`:''}${(e.eventSources||[]).length?`<div class="pfMeta">${sourceRefs({sources:e.eventSources})}</div>`:''}<footer><span class="pfSubtle">${esc(executionLabel(d))}${d.executionError?' · '+esc(d.executionError):''}</span>${actionable&&d.executionStatus!=='filled'?`<button class="pfPrimary" data-pf-decision="${esc(d.id)}">生成下单策略</button>`:''}</footer></article>`;}
  function taskHref(t){const url=new URL(location.href);url.search='';url.searchParams.set('tab','tasks');url.searchParams.set('task',t.id);if(t.runId)url.searchParams.set('run',t.runId);return url.href;}
  function taskSchedule(t){if(t.cadence==='interval')return '每 '+num(t.intervalMinutes,0)+' 分钟';if(t.timeMode==='open'||t.timeMode==='close')return (t.market==='US'?'美股':'A 股')+(t.timeMode==='open'?'开盘':'收盘')+(t.offset<0?'前':'后')+Math.abs(t.offset||0)+'分钟';return ({trading:'交易日',daily:'每天',weekdays:'工作日',weekly:'每周',monthly:'每月',custom:'自定义',once:'单次'})[t.cadence]+' '+(t.time||'');}
  const sopPending=new Set(),sopControlPending=new Set();
  let profileSaving=false;
  const sopIcon={
    settings:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>',
    pause:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M10 9v6m4-6v6"/></svg>',
    play:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4Z"/></svg>'
  };
  function sopTask(kind){return(flow?.tasks||[]).find(t=>t._portfolioKind===kind||t.title===({events:'事件催化找股',quant:'量化回测找股',analysis:'机会分析与 JEV 决策',risk:'持仓风险监控与 JEV 决策'})[kind]);}
  function sopTaskState(t){if(!t)return['waiting','尚未建立任务'];if(!t.enabled)return['paused','已暂停'];if(t.activeRun)return[t.lastRun?.status==='queued'?'queued':'running',t.lastRun?.status==='queued'?'排队中':'执行中'];if(t.lastRun?.status==='failed')return['failed','执行失败'];return t.resultVersion?['done','已完成']:['waiting','等待执行'];}
  function sopOrders(){return(flow?.decisions||[]).filter(d=>['buy','reduce','sell'].includes(d.action)&&d.status==='decided'&&Date.parse(d.expires)>Date.now()&&d.executionStatus!=='filled');}
  function sopNodes(){const pool=flow?.candidates||[],orders=sopOrders(),pending=(data.plans||[]).filter(p=>p.status==='pending'&&Date.parse(p.expires)>Date.now());return[
    {id:'profile',x:24,y:100,n:'01',title:'投资目标与偏好',state:[hasInvestmentProfile()?'ready':'waiting',hasInvestmentProfile()?'已设置':'待设置']},
    {id:'events',x:24,y:62,n:'01',title:'事件催化找股',skill:'external-search',hint:'搜索事件 → 研究催化逻辑',task:sopTask('events')},
    {id:'quant',x:24,y:264,n:'02',title:'量化回测找股',skill:'portfolio-backtest',hint:'市场扫描 → 历史验证',task:sopTask('quant')},
    {id:'pool',x:304,y:164,n:'03',title:'候选池',skill:'portfolio-data',hint:'汇集事件与量化证据',state:[pool.length?'ready':'waiting',pool.length?pool.length+' 个候选':'等待候选'],metric:pool.length+' 个标的'},
    {id:'analysis',x:584,y:164,n:'04',title:'机会分析与决策',skill:'portfolio-jev',hint:'证据 + 行情 + 当前账户',task:sopTask('analysis')},
    {id:'order',x:864,y:164,n:'05',title:'下单',skill:'portfolio-order',hint:'最新价格 · 资金 · 风控',state:[pending.length||orders.length?'confirm':'waiting',pending.length?'待确认成交':orders.length?'待生成计划':'等待可执行决策'],metric:pending.length?pending.length+' 个有效计划':orders.length+' 条有效买卖决策'},
    {id:'ledger',x:1144,y:164,n:'06',title:'持仓与收益',skill:'portfolio-data',hint:'成交记账 → 市值与收益',state:[data.valuationComplete?'ready':'waiting',data.valuationComplete?'估值完整':'估值待更新'],metric:data.positions.length+' 只持仓 · '+data.trades.length+' 笔成交'},
    {id:'risk',x:1144,y:386,n:'07',title:'持仓风险监控',skill:'portfolio-jev',hint:'持仓风险 → 持有 / 减仓 / 卖出',task:sopTask('risk')}
  ].map((n,i)=>({...n,x:n.id==='profile'?n.x:n.x+280,n:String(i+1).padStart(2,'0'),state:n.state||sopTaskState(n.task)}));}
  function sopGraph(){const nodes=sopNodes(),byId=Object.fromEntries(nodes.map(n=>[n.id,n]));
    const edges=[['events','pool','M234 126H260Q280 126 280 146V208Q280 228 300 228'],['quant','pool','M234 328H260Q280 328 280 308V248Q280 228 300 228'],['pool','analysis','M514 228H580'],['analysis','order','M794 228H860'],['order','ledger','M1074 228H1140'],['ledger','risk','M1249 292V382'],['risk','order','M1144 450H989Q969 450 969 430V296']];
    return `<section class="pfSop" aria-label="自动交易"><header class="pfSopHeader"><h2>自动交易</h2><button class="pfWorkflowRun" data-pf-action="run-workflow" aria-label="执行自动交易流程" title="执行自动交易流程">${sopIcon.play}</button></header><div class="pfSopScroll" role="region" aria-label="SOP 流程画布，可横向滚动" tabindex="0"><div class="pfSopCanvas"><svg class="pfSopEdges" viewBox="0 0 1680 560" aria-hidden="true"><defs><marker id="pfSopArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor"/></marker></defs><g class="pfSopEdge is-idle" data-from="profile"><path class="pfSopTrack" d="M234 228H260V126H300M260 228V328H300"/><path class="pfSopFlow" d="M234 228H260V126H300M260 228V328H300"/></g><g transform="translate(280 0)">${edges.map(([from,to,path])=>{const state=byId[from].state[0],active=state==='running'||byId[to].state[0]==='running';return`<g class="pfSopEdge ${state==='failed'?'is-failed':active?'is-active':'is-idle'}" data-from="${from}" data-to="${to}"><path class="pfSopTrack" d="${path}" marker-end="url(#pfSopArrow)"/><path class="pfSopFlow" d="${path}"/></g>`;}).join('')}<text x="538" y="206">证据</text><text x="818" y="206">决策</text><text x="1096" y="206">成交</text><text x="1266" y="346">最新行情</text><text x="986" y="428">减仓 / 卖出</text></g></svg>${nodes.map(n=>n.id==='profile'?`<article class="pfSopNode is-${n.state[0]}" style="left:${n.x/16.8}%;top:29.2857%" data-sop-node="profile"><button class="pfSopNodeMain" data-pf-sop-open="profile" aria-label="设置投资目标与偏好"><span class="pfSopNodeTop"><span class="pfSopNumber">01</span><span class="pfSopState">${hasInvestmentProfile()?'已设置':'待设置'}</span></span><strong>投资目标与偏好</strong><span class="pfSopHint">${esc(investmentSummary())}</span></button><footer><span>本金 ${money(data.initial)}</span><button data-pf-sop-open="profile">设置</button></footer></article>`:`<article class="pfSopNode is-${n.state[0]}" style="left:${n.x/16.8}%;top:${n.y/5.6}%" data-sop-node="${n.id}">${n.task?`<a class="pfSopNodeMain" style="color:inherit;text-decoration:none;box-sizing:border-box" href="${esc(taskHref(n.task))}" aria-label="查看定时任务：${esc(n.title)}">`:`<button class="pfSopNodeMain" data-pf-sop-open="${n.id}" aria-label="查看节点：${n.title}">`}<span class="pfSopNodeTop"><span class="pfSopNumber">${n.n}</span><span class="pfSopState"><i></i>${esc(n.state[1])}</span></span><strong>${n.title}</strong><span class="pfSopSkill">${n.skill}</span><span class="pfSopHint">${n.hint}</span>${n.task?'</a>':'</button>'}<footer><span>${n.task?esc(taskSchedule(n.task)):esc(n.metric)}</span>${n.task?`<span class="pfSopControls"><button class="pfSopIconButton" data-pf-sop-settings="${n.id}" aria-label="设置：${n.title}" title="设置">${sopIcon.settings}</button><button class="pfSopIconButton" data-pf-sop-toggle="${n.id}" aria-label="${n.task.enabled?'暂停':'开始'}：${n.title}" title="${n.task.enabled?'暂停':'开始'}" ${sopControlPending.has(n.id)?'disabled':''}>${n.task.enabled?sopIcon.pause:sopIcon.play}</button></span>`:`<button data-pf-sop-open="${n.id}">查看 →</button>`}</footer></article>`).join('')}</div></div></section>`;
  }
  const investmentMarkets={CN:'A 股',US:'美股'};
  const investmentStyles={value:'价值',growth:'成长',dividend:'红利',trend:'趋势',balanced:'均衡'};
  const investmentHorizons={short:'短期 · 1 个月内',medium:'中期 · 1–12 个月',long:'长期 · 1 年以上'};
  function hasInvestmentProfile(){const p=flow?.preferences;return !!(p?.profile||(p?.investment?.markets||[]).length||(p?.investment?.styles||[]).length||p?.investment?.horizon||p?.investment?.targetReturnPct!=null||p?.investment?.maxDrawdownPct!=null||p?.investment?.confidenceThresholdPct!=null);}
  function investmentSummary(){const p=flow?.preferences?.investment||{};return [(p.markets||[]).map(v=>investmentMarkets[v]).join(' / '),(p.styles||[]).map(v=>investmentStyles[v]).join(' / '),p.targetReturnPct!=null?'目标年化 '+p.targetReturnPct+'%':''].filter(Boolean).join(' · ')||'设置市场、风格与收益目标';}
  const profileChoices=(name,labels,selected)=>Object.entries(labels).map(([value,label])=>`<label class="pfCheck"><input type="checkbox" name="${name}" value="${value}" ${selected.includes(value)?'checked':''}>${label}</label>`).join('');
  function confidenceCopy(value){return value<=30?['火力全开','更激进 · 信号更容易进入下单']:value<=50?['敢于出手','偏激进 · 接受更多不确定性']:value<=70?['稳中求进','均衡 · 需要更明确的模型信号']:['只打硬仗','更保守 · 只执行高确信度信号'];}
  function profilePersona(p){const styles=p.styles||[],threshold=Number(p.confidenceThresholdPct??60),drawdown=Number(p.maxDrawdownPct);if(threshold<=35)return{key:'charger',name:'牛市冲锋手',tags:['重仓猛干','信号就位','先上车后看图']};if(styles.includes('dividend'))return{key:'collector',name:'股息收租人',tags:['红利到账','现金流有糖','慢慢变富']};if(threshold>=75||Number.isFinite(drawdown)&&drawdown<=8)return{key:'guardian',name:'回撤守门员',tags:['宁可踏空','不接飞刀','仓位管理大师']};if(styles.includes('trend'))return{key:'surfer',name:'趋势冲浪手',tags:['顺势而为','均线有话说','涨了再相信']};if(p.horizon==='long'||styles.includes('value'))return{key:'holder',name:'长线钉子户',tags:['时间的朋友','不看分时图','估值有尺']};return{key:'explorer',name:'市场寻宝人',tags:['边走边看','证据先行','稳中带梦']};}
  const profileAssetBase=new URL('assets/portfolio-personas/',document.querySelector('script[src*="portfolio.js"]')?.src||new URL('/static/portfolio.js',location.href)).href;
  const profilePersonaImage=key=>profileAssetBase+key+'-riding-v3.webp';
  function profileAvatar(p){const persona=profilePersona(p);return`<div class="pfPersonaStage"><div class="pfAvatarScene pfPelicanScene is-${persona.key} is-synthesizing" data-pf-avatar data-persona="${persona.key}" aria-busy="true" role="group" aria-label="${esc(persona.name)} · 鹈鹕骑车"><span class="pfPelicanEdition" aria-hidden="true">PELICAN CYCLING CLUB</span>${['charger','collector','guardian','surfer','holder','explorer'].map(key=>`<img class="pfPelicanArt pfPelicanCycling" data-pf-pelican="${key}" data-pf-animation-src="${esc(profilePersonaImage(key))}" alt="" aria-hidden="true" ${key===persona.key?'':'hidden'} decoding="async" loading="${key===persona.key?'eager':'lazy'}">`).join('')}<div class="pfAvatarSynthesis" aria-hidden="true"><span class="pfSynthesisOrbit"></span><span class="pfSynthesisCore"></span><span class="pfSynthesisScan"></span>${Array.from({length:12},(_,i)=>`<i style="--ray:${i}"></i>`).join('')}</div><span class="pfAvatarLoadingLabel" data-pf-avatar-status>骑行动画加载中</span><button type="button" class="pfAvatarRetry" data-pf-avatar-retry hidden>重新加载动画</button></div><div class="pfPersonaCopy"><span>你的当前投资人格</span><strong data-pf-persona-name>${esc(persona.name)}</strong><div class="pfPersonaTags" data-pf-persona-tags>${persona.tags.map(tag=>`<span>${esc(tag)}</span>`).join('')}</div></div></div>`;}
  const profileAvatarStates=new WeakMap(),profileSeenPersonas=new Set();
  function activateProfileAvatar(avatar,key,initial=false,force=false){
    if(!avatar)return;
    const previous=profileAvatarStates.get(avatar);
    if(previous?.key===key&&!force)return;
    if(previous){clearTimeout(previous.timer);previous.cleanup?.();}
    const state={key,timer:null,cleanup:null,phase:'loading'};profileAvatarStates.set(avatar,state);
    for(const name of ['charger','collector','guardian','surfer','holder','explorer'])avatar.classList.toggle('is-'+name,name===key);
    avatar.dataset.persona=key;
    avatar.classList.remove('is-arriving','is-avatar-error');avatar.classList.add('is-synthesizing');avatar.setAttribute('aria-busy','true');
    const status=avatar.querySelector('[data-pf-avatar-status]');if(status)status.textContent='骑行动画加载中';
    const retry=avatar.querySelector('[data-pf-avatar-retry]');if(retry)retry.hidden=true;
    const images=[...avatar.querySelectorAll('[data-pf-pelican]')],image=images.find(img=>img.dataset.pfPelican===key);
    images.forEach(img=>{img.hidden=img!==image;});
    const settle=success=>{
      if(profileAvatarStates.get(avatar)!==state||!['loading','decoding'].includes(state.phase))return;
      state.phase=success?'ready':'error';state.cleanup?.();avatar.classList.remove('is-synthesizing');
      if(!success){avatar.classList.add('is-avatar-error');avatar.setAttribute('aria-busy','false');if(status)status.textContent='动画加载失败，请重试';if(retry)retry.hidden=false;return;}
      const replay=!(initial&&profileSeenPersonas.has(key));profileSeenPersonas.add(key);
      if(replay){
        avatar.classList.add('is-arriving');if(status)status.textContent='骑行动画已就绪';
        state.timer=setTimeout(()=>{if(profileAvatarStates.get(avatar)!==state)return;avatar.classList.remove('is-arriving');avatar.setAttribute('aria-busy','false');},1100);
      }else avatar.setAttribute('aria-busy','false');
    };
    if(!image){settle(false);return;}
    const failed=()=>settle(false),loaded=()=>{
      if(profileAvatarStates.get(avatar)!==state||state.phase!=='loading')return;
      state.phase='decoding';
      if(typeof image.decode==='function')image.decode().then(()=>settle(true),failed);else settle(true);
    };
    const timeout=setTimeout(failed,30000);
    state.cleanup=()=>{clearTimeout(timeout);image.removeEventListener('load',loaded);image.removeEventListener('error',failed);};
    image.addEventListener('load',loaded,{once:true});image.addEventListener('error',failed,{once:true});
    image.loading='eager';
    const url=profilePersonaImage(key)+(force?'?retry='+Date.now():'');
    if(image.src!==url)image.src=url;
    if(image.complete&&image.naturalWidth>0)loaded();
  }
  function mountProfileAvatars(root){root.querySelectorAll('[data-pf-avatar]').forEach(avatar=>activateProfileAvatar(avatar,avatar.dataset.persona,true));}
  workspace.addEventListener('click',event=>{const retry=event.target.closest('[data-pf-avatar-retry]');if(!retry)return;event.preventDefault();const avatar=retry.closest('[data-pf-avatar]');activateProfileAvatar(avatar,avatar.dataset.persona,false,true);});
  const confidenceProgress=value=>Math.max(0,Math.min(100,(Number(value)-10)/90*100));
  function profileForm(cancel=false){const p=flow?.preferences?.investment||{},notes=flow?.preferences?.profile||'',threshold=p.confidenceThresholdPct??60,copy=confidenceCopy(threshold);return`<form id="pfProfileForm" class="pfForm pfProfileForm"><section class="pfTradePreference"><div class="pfTradePreferenceHead"><div><h3>交易偏好</h3><p class="pfTradeSubtitle">JEV 下单置信度</p></div><output data-pf-confidence-output>${num(threshold,0)}%</output></div><div class="pfConfidenceControl" style="--pf-confidence:${confidenceProgress(threshold)}%"><div class="pfConfidenceTrack" aria-hidden="true"></div><input class="pfConfidenceRange" name="confidenceThresholdPct" type="range" min="10" max="100" step="1" value="${threshold}" aria-label="JEV 下单置信度" aria-valuetext="${num(threshold,0)}%，${copy[0]}"></div><div class="pfConfidenceScale"><span>10% · 激进</span><span>均衡</span><span>100% · 保守</span></div><p class="pfConfidenceDescription"><b data-pf-confidence-title>${copy[0]}</b><span data-pf-confidence-copy>买入、减仓或卖出置信度 ≥ ${num(threshold,0)}% 时通过门槛。</span></p><p class="pfTradeHint">自动模式下单，确认模式逐笔确认；其他风控仍生效。</p></section><div class="pfPreferenceDivider"></div><fieldset><legend>关注市场</legend><div class="pfProfileChoices">${profileChoices('markets',investmentMarkets,p.markets||[])}</div></fieldset><fieldset><legend>投资风格</legend><div class="pfProfileChoices">${profileChoices('styles',investmentStyles,p.styles||[])}</div></fieldset><label>投资周期<select name="horizon"><option value="">请选择</option>${Object.entries(investmentHorizons).map(([v,t])=>`<option value="${v}" ${p.horizon===v?'selected':''}>${t}</option>`).join('')}</select></label><div class="pfFields"><label>目标年化收益（%）<input name="targetReturnPct" type="number" min="0" max="1000" step="0.1" placeholder="例如 10" value="${p.targetReturnPct??''}"></label><label>可接受最大回撤（%）<input name="maxDrawdownPct" type="number" min="0" max="100" step="0.1" placeholder="例如 15" value="${p.maxDrawdownPct??''}"></label></div><label>补充偏好与约束<textarea name="profile" maxlength="4000" rows="5" placeholder="例如：偏好现金流稳定的科技与消费公司；避开高杠杆、流动性差的标的。">${esc(notes)}</textarea></label><div class="pfActions">${cancel?'<button type="button" data-pf-close>取消</button>':''}<button class="pfPrimary" type="submit">保存交易偏好</button></div></form>`;}
  function profileView(){const p=flow?.preferences?.investment||{},updated=flow?.preferences?.updated;return`<div class="pfProfilePage"><section class="pfProfileHero"><aside class="pfProfileIdentity">${profileAvatar(p)}<footer><span class="pfDot"></span>${hasInvestmentProfile()?'偏好已启用':'等待你定义风格'}<small>${updated?'更新于 '+date(updated):'保存后用于下一轮 JEV 决策'}</small></footer></aside><section class="pfProfileEditor"><header class="pfProfileEditorHead"><div><span class="pfProfileKicker">MENTORA DEAL PROFILE</span><h2>投资者档案</h2></div><span class="pfProfileCapitalMini">账户本金 <b>${money(data.initial)}</b></span></header>${profileForm(false)}</section></section></div>`;}
  function showInvestmentProfile(){openDialog('投资目标与偏好',`<div class="pfProfileCapital"><span class="pfMuted">账户本金</span><strong>${money(data.initial)}</strong></div>${profileForm(true)}`);}
  function showSopNode(id){const node=sopNodes().find(n=>n.id===id);if(!node)return;const t=node.task;
    if(id==='profile'){showInvestmentProfile();return;}
    if(id==='ledger'){view='positions';route();render();return;}
    if(id==='pool'){const pool=flow?.candidates||[];openDialog('候选池',`<p class="pfMuted">事件研究与量化回测共用的真实候选池 · ${pool.length} 个标的</p>${pool.length?`<div class="pfRows">${pool.map(p=>`<div class="pfRow"><span><b>${esc(p.symbol)}</b> ${esc(p.name||'')}<small class="pfMeta">${esc((p.sourceTypes||[]).map(s=>s==='event'?'事件催化':'量化回测').join(' · '))} · ${date(p.updated)}</small></span></div>`).join('')}</div>`:empty('暂无候选','找股节点完成研究并通过数据校验后，结果将汇入这里。')}`);return;}
    if(id==='order'){const plans=(data.plans||[]).filter(p=>p.status==='pending'&&Date.parse(p.expires)>Date.now()),orders=sopOrders();openDialog('下单',`<p class="pfMuted">portfolio-order · 最新报价、账户资金和可卖数量共同校验。当前${flow?.executionMode==='automatic'?'自动执行':'逐笔确认'}。</p>${plans.map(p=>`<div class="pfRow"><span>${esc(p.symbol)} · ${p.side==='buy'?'买入':'卖出'} ${num(p.quantity,0)} 股</span><button data-pf-open-plan="${esc(p.id)}">查看计划</button></div>`).join('')}${orders.map(d=>`<div class="pfRow"><span><b>${esc(d.symbol)}</b> · ${esc(actionLabel(d))}</span><button data-pf-decision="${esc(d.id)}">生成下单策略</button></div>`).join('')}${!plans.length&&!orders.length?empty('等待可执行决策','只有证据、置信度和有效期通过校验的买卖决策，才能生成计划。'):''}`);return;}
    if(!t){message('该节点尚未连接定时任务，请稍后刷新');return;}
    const contracts={events:['研究问句、最新公告与事件来源','已验证的催化候选、排除原因与研究报告'],quant:['市场扫描信号、真实历史行情、策略与滑点','回测收益、回撤、交易样本与量化候选'],analysis:['候选池、事件与回测证据、最新行情、当前账户','逐标的买入 / 观察 / 跳过、置信度与规模建议'],risk:['现有持仓、成本、最新行情与风控约束','持有 / 减仓 / 卖出决策；可执行处置进入下单节点']};
    const c=contracts[id];const related=id==='events'?(flow?.tasks||[]).filter(x=>!x._portfolioKind&&x.id!==t.id):[];
    openDialog(node.title,`<p class="pfMeta">${esc(node.state[1])} · ${esc(taskSchedule(t))}${t.nextAt?' · 下次 '+date(t.nextAt):''}</p><div class="pfSopContract"><h3>输入</h3><p>${c[0]}</p><h3>输出</h3><p>${c[1]}</p></div><p class="pfMuted">${esc(t.livePreview||t.resultDescription||t.summary||t.question)}</p>${related.length?`<h3>相关盘前研究</h3><div class="pfSopResearch">${related.map(x=>`<a class="pfLink" href="${esc(taskHref(x))}">${esc(x.title)} ↗</a>`).join('')}</div>`:''}<div class="pfActions"><a class="pfLink" href="${esc(taskHref(t))}">查看任务与历史结果 ↗</a><button class="pfPrimary" data-pf-sop-run="${id}" ${t.activeRun||!t.enabled||sopPending.has(id)?'disabled':''}>${t.activeRun?'正在执行':!t.enabled?'任务已暂停':'执行此节点'}</button></div>`);
  }
  async function runSopNode(kind,button){const task=sopTask(kind);if(!task||task.activeRun||!task.enabled||sopPending.has(kind))return;sopPending.add(kind);button.disabled=true;try{const response=await fetch('/api/day/tasks/'+encodeURIComponent(task.id)+'/run',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Veya-Day':'1'}});const result=await response.json();if(!response.ok)throw Error(typeof result.detail==='string'?result.detail:'节点执行请求失败');dialog.close();await load();message(task.title+'已进入定时任务队列，可点击节点查看执行结果');}catch(error){message(error.message);button.disabled=false;}finally{sopPending.delete(kind);}}
  function taskControl(kind,action){const task=sopTask(kind);if(!task)return;if(action==='toggle'&&sopControlPending.has(kind))return;if(action==='toggle')sopControlPending.add(kind);window.dispatchEvent(new CustomEvent('veya:day-task-control',{detail:{taskId:task.id,action,complete:async result=>{sopControlPending.delete(kind);if(action==='toggle')message(result?.enabled?'任务已开始，后续会按计划执行':'任务已暂停，当前排队或执行已取消');else message('定时任务设置已保存');await load();},fail:error=>{sopControlPending.delete(kind);message(error?.message||'定时任务操作失败');render();}}}));}
  function decisionList(records){return `<div class="pfTableWrap"><table class="pfTable pfDecisionTable"><thead><tr><th>标的</th><th>类型 / 判断</th><th>判断依据</th><th>买卖方向置信度</th><th>分析时间</th><th>执行状态</th><th></th></tr></thead><tbody>${records.map(d=>`<tr><td><b>${esc(d.symbol)}</b><small>${esc(d.name||d.evidence?.quote?.name||'')}</small></td><td>${d.kind==='risk'?'持仓风险':'买入机会'}<small>${esc(actionLabel(d))}</small></td><td class="pfDecisionReason">${esc(d.reason||'等待证据')}</td><td>${modelConfidence(d)}</td><td>${d.sourceTaskId?`<a class="pfLink" href="${esc(taskHref({id:d.sourceTaskId,runId:d.sourceRunId}))}">${date(d.created)}</a>`:date(d.created)}</td><td>${esc(executionLabel(d))}</td><td><button data-pf-detail="${esc(d.id)}">查看详情</button></td></tr>`).join('')}</tbody></table></div>`;}
  function decisions(){const all=flow?.decisions||[],records=all.filter(d=>filter==='all'||d.kind===filter);const tasks=(flow?.tasks||[]).filter(t=>['analysis','risk'].includes(t._portfolioKind));return`${sopGraph()}<div class="pfActions" style="justify-content:space-between;margin-bottom:16px"><div class="pfMuted">${all.filter(d=>d.kind==='entry').length} 条机会判断 · ${all.filter(d=>d.kind==='risk').length} 条风险判断</div></div><div class="pfAnalysisStatus">${tasks.map(t=>`<span>${t._portfolioKind==='analysis'?'机会分析':'风险监控'} · ${t.activeRun?'更新中':t.lastRun?.status==='failed'?'执行失败':t.successAt?date(t.successAt):'等待首次结果'}</span>`).join('')}<span>${flow?.executionMode==='automatic'?'JEV 决策后自动执行':'JEV 决策后逐笔确认'}</span></div><div class="pfFilter"><select id="pfDecisionFilter" aria-label="筛选决策"><option value="all">全部决策</option><option value="entry" ${filter==='entry'?'selected':''}>买入机会</option><option value="risk" ${filter==='risk'?'selected':''}>持仓风险</option></select></div>${records.length?card('机会判断列表',decisionList(records)):card('机会分析与 JEV 决策',empty('定时任务正在汇集候选与证据','事件任务和量化回测任务的标的进入候选池后，JEV 才会形成买入判断。持仓建立后将自动加入风险监控。'))}`;}
  let strategyDraft=null,strategySelected='',strategyStream=null,strategySaving=false,strategyStatus='',strategyPreview='';
  const strategyExpanded=new Set(),strategyCompleted=new Set();
  let strategySaveTimer=null,strategySavePending=false;
  function strategySaveStatus(text){strategyStatus=text;const el=$('pfStrategyStatus');if(el){el.textContent=text;el.hidden=!text;}}
  function scheduleStrategySave(){captureStrategies();strategySavePending=true;clearTimeout(strategySaveTimer);strategySaveStatus('正在自动保存…');strategySaveTimer=setTimeout(()=>void saveStrategies({quiet:true}),500);}
  function strategyConfig(){
    if(!strategyDraft){const cfg=flow?.strategies||{enabled:['trend','reversion']};
      strategyDraft={enabled:[...(cfg.enabled||[])],customStrategies:JSON.parse(JSON.stringify(cfg.customStrategies??(cfg.customCode||cfg.enabled?.includes('custom')?[{id:'custom',name:cfg.customName||'自定义策略',code:cfg.customCode||'',description:''}]:[])))};
      strategySelected=strategyDraft.customStrategies[0]?.id||'';
    }
    return strategyDraft;
  }
  function strategies(){
    const cfg=strategyConfig(),selected=cfg.customStrategies.find(s=>s.id===strategySelected),locked=Boolean(strategyStream)||strategySaving;
    const choices=Object.entries(names).filter(([id])=>['trend','reversion','momentum','breakout','ma_cross','rsi_reversal','volume_breakout','pullback'].includes(id));
    return card('策略配置',`<form id="pfStrategyForm" class="pfStrategyForm" data-strategy-id="${esc(strategySelected)}">
      <h3>内置策略</h3><div class="pfStrategyChoices">${choices.map(([id,title])=>`<label class="pfStrategyOption"><input type="checkbox" name="enabled" value="${id}" ${cfg.enabled.includes(id)?'checked':''} ${locked?'disabled':''}><span><strong>${esc(title)}</strong></span></label>`).join('')}</div>
      <div class="pfStrategySectionHead"><h3>自定义策略 <small class="pfMuted">${cfg.customStrategies.length} / 20</small></h3><div class="pfActions"><button type="button" data-pf-strategy="add" ${locked||cfg.customStrategies.length>=20?'disabled':''}>＋ 添加策略</button><button type="button" data-pf-strategy="remove" ${locked||!selected?'disabled':''}>删除策略</button></div></div>
      ${cfg.customStrategies.length?`<div class="pfStrategyWorkspace">
        <div class="pfStrategyList" aria-label="自定义策略列表">${cfg.customStrategies.length?cfg.customStrategies.map(s=>`<div class="pfStrategyListRow ${s.id===strategySelected?'is-selected':''}"><input type="checkbox" name="enabled" value="${esc(s.id)}" aria-label="启用 ${esc(s.name)}" ${cfg.enabled.includes(s.id)?'checked':''} ${locked||!s.code?'disabled':''}><button type="button" data-pf-strategy-select="${esc(s.id)}" aria-pressed="${s.id===strategySelected}" ${locked?'disabled':''}>${esc(s.name||'未命名策略')}</button></div>`).join(''):'<p class="pfSubtle">还没有自定义策略。点击添加，用自然语言描述你的交易规则。</p>'}</div>
        <div class="pfStrategyEditor">${selected?`
          <label class="pfCodeField"><span>策略名称</span><input name="strategyName" maxlength="60" required value="${esc(selected.name)}" ${locked?'disabled':''}></label>
          <label class="pfCodeField"><span>策略逻辑</span><textarea name="strategyDescription" maxlength="4000" rows="${strategyExpanded.has(selected.id)?2:4}" placeholder="描述你的策略逻辑，比如“目前处于筑底，有望回升”" ${locked?'disabled':''}>${esc(selected.description||'')}</textarea></label>
          ${strategyExpanded.has(selected.id)?`<label class="pfCodeField pfPineCode"><span>${selected.code?.startsWith('//@version=5')||strategyStream?'Pine Script v5':'策略代码'}</span><textarea name="customCode" aria-label="策略编辑器" maxlength="12000" rows="16" spellcheck="false" readonly placeholder="生成的代码将在这里逐步显示。">${esc(strategyStream?strategyPreview:selected.code||'')}</textarea></label>`:''}
          <div class="pfActions pfStrategyBottom"><button type="button" class="pfPrimary" data-pf-strategy="generate" ${locked?'disabled':''}>${strategyStream?'正在生成…':selected.code?'重新生成':'生成 PineScript'}</button>${strategyStream?'<button type="button" data-pf-strategy="cancel">停止生成</button>':''}${selected.code&&!strategyStream?`<button type="button" data-pf-strategy="copy">复制代码</button>${!strategyExpanded.has(selected.id)?'<button type="button" data-pf-strategy="show-code">查看代码</button>':''}`:''}</div>
        `:'<div class="pfEmpty"><strong>创建你的策略</strong>添加多个策略，分别编辑并选择是否启用。</div>'}</div>
      </div>`:'<div class="pfStrategyEmpty"><strong>还没有自定义策略</strong><p>可以使用上方内置策略，也可以点击“添加策略”，创建自己的交易规则。</p></div>'}
      <p id="pfStrategyStatus" ${strategyStatus?'':'hidden'} class="pfSubtle" role="status" aria-live="polite">${esc(strategyStatus)}</p>
    </form>`);
  }
  function captureStrategies(){
    if(!strategyDraft)return;
    const form=$('pfStrategyForm');if(!form||strategyStream)return;
    strategyDraft.enabled=[...form.querySelectorAll('[name=enabled]:checked')].map(el=>el.value);
    const selected=strategyDraft.customStrategies.find(s=>s.id===strategySelected);
    if(selected&&form.dataset.strategyId===selected.id&&form.elements.strategyName){selected.name=form.elements.strategyName.value;selected.description=form.elements.strategyDescription.value;}
  }
  function cancelStrategyStream(){
    if(!strategyStream)return;
    strategyStream.abort();strategyStream=null;strategyPreview='';strategyStatus='已停止接收生成结果。';
  }
  async function strategyAction(action){
    if(action==='cancel'){cancelStrategyStream();render();return;}
    if(strategyStream||strategySaving)return;
    captureStrategies();const cfg=strategyConfig(),selected=cfg.customStrategies.find(s=>s.id===strategySelected);
    if(action==='copy'&&selected){try{await navigator.clipboard.writeText(selected.code);message('复制成功');}catch{message('复制失败，请展开代码后手动复制');}return;}
    if(action==='show-code'&&selected){strategyExpanded.add(selected.id);render();return;}
    if(action==='add'){
      if(cfg.customStrategies.length>=20)return;
      const id='custom:'+crypto.randomUUID();cfg.customStrategies.push({id,name:'自定义策略 '+(cfg.customStrategies.length+1),description:'',code:''});strategySelected=id;strategyStatus='';render();void saveStrategies({quiet:true});$('pfStrategyForm')?.elements.strategyDescription?.focus();
    }else if(action==='remove'&&selected){
      if(!window.confirm('删除此策略？不会删除已有回测和交易记录。'))return;
      const payload=strategyPayload();payload.customStrategies=payload.customStrategies.filter(s=>s.id!==selected.id);payload.enabled=payload.enabled.filter(id=>id!==selected.id);
      if(!payload.enabled.length){message('至少保留一个启用的策略');return;}
      strategySaving=true;render();
      try{flow.strategies=await api('/strategies','PUT',payload);cfg.customStrategies=cfg.customStrategies.filter(s=>s.id!==selected.id);cfg.enabled=cfg.enabled.filter(id=>id!==selected.id);strategySelected=cfg.customStrategies[0]?.id||'';strategyStatus='';}
      catch(error){strategyStatus=error.message;}
      finally{strategySaving=false;render();}
    }else if(action==='generate'&&selected){await generateStrategy(selected);}
  }
  async function generateStrategy(selected){
    if((selected.description||'').trim().length<2){message('请先用自然语言描述策略规则');return;}
    if(!selected.name.trim()){message('请填写策略名称');return;}
    clearTimeout(strategySaveTimer);await saveStrategies({quiet:true});
    if(strategySavePending){message('策略方案尚未保存，请重试后生成');return;}
    const controller=new AbortController();strategyStream=controller;strategyPreview='';strategyExpanded.add(selected.id);strategyStatus='正在连接模型…';render();
    let reader,complete=false;
    try{
      const response=await fetch('/api/portfolio/strategies/generate',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Veya-Portfolio':'1'},body:JSON.stringify({id:selected.id,name:selected.name.trim(),description:selected.description,code:selected.code,enabled:!selected.code||strategyConfig().enabled.includes(selected.id)}),signal:controller.signal});
      if(!response.ok){const error=await response.json();throw Error(typeof error.detail==='string'?error.detail:'生成请求失败，请重试');}
      if(!response.body)throw Error('浏览器不支持流式响应');
      reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';
      while(true){
        const chunk=await reader.read();if(strategyStream!==controller)return;
        buffer+=decoder.decode(chunk.value||new Uint8Array(),{stream:!chunk.done}).replace(/\r/g,'');
        let boundary;
        while((boundary=buffer.indexOf('\n\n'))>=0){
          const frame=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);
          const line=frame.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(!line)continue;
          const event=JSON.parse(line);
          if(event.type==='error')throw Error(event.message);
          if(event.type==='delta'){strategyPreview+=event.text;if(strategyPreview.length>12000)throw Error('生成代码超出长度限制');const editor=$('pfStrategyForm')?.elements.customCode;if(editor){editor.value=strategyPreview;editor.scrollTop=editor.scrollHeight;window.MentoraCodeEditor?.sync(editor);}strategyStatus='正在生成策略代码…';if($('pfStrategyStatus'))$('pfStrategyStatus').textContent=strategyStatus;}
          if(event.type==='complete'){if(!event.settings)throw Error('生成结果缺少保存确认');selected.code=event.code;flow.strategies=event.settings;const saved=event.settings.customStrategies?.find(s=>s.id===selected.id);if(saved)Object.assign(selected,saved);const enabled=strategyConfig().enabled;strategyConfig().enabled=enabled.filter(id=>id!==selected.id);if(event.settings.enabled.includes(selected.id))strategyConfig().enabled.push(selected.id);strategyCompleted.add(selected.id);complete=true;}
        }
        if(complete||chunk.done)break;
      }
      if(!complete)throw Error('连接中断，代码未通过完整校验，请重新生成或编辑');
      strategyStatus='已自动保存';
    }catch(error){if(strategyStream===controller)strategyStatus=error.name==='AbortError'?'已停止接收生成结果。':error.message+'；请重试，未收到保存确认。';}
    finally{
      try{await reader?.cancel();}catch{}
      if(strategyStream===controller){strategyStream=null;strategyPreview='';render();}
    }
  }
  function favoritesView(){const items=flow?.favorites||[];return card('自选股票',`<form id="pfFavoriteForm" class="pfFavoriteForm"><div class="pfFavoriteAdd"><label id="pfFavoriteField" class="pfFavoriteField"><span class="srOnly">公司名称或代码</span><input id="pfFavoriteSymbol" name="symbol" maxlength="80" autocomplete="off" placeholder="输入公司名称或代码" required></label><button type="button" data-pf-action="refresh">刷新行情</button><button class="pfPrimary" type="submit">添加自选</button></div></form>${items.length?`<div class="pfTableWrap"><table class="pfTable pfFavoriteTable"><thead><tr><th>标的</th><th>最新价</th><th>涨跌幅</th><th>行情时间</th><th></th></tr></thead><tbody>${items.map(item=>{const q=item.quote,localNameFirst=/\.(SH|SZ|BJ|HK)$/.test(item.symbol),asset=localNameFirst?`<b>${esc(item.name||item.symbol)}</b><small>${esc(item.symbol)}</small>`:`<b>${esc(item.symbol)}</b><small>${esc(item.name||item.symbol)}</small>`,price=q?`${esc(q.nativeCurrency||q.currency||'USD')} ${num(q.nativePrice??q.price,4)}`:'—',change=q?.changePct==null?'—':`${num(q.changePct,2)}%`,time=q?(q.dateOnly?esc(q.priceDate)+' 收盘':date(q.priceAt)):'—';return`<tr><td class="pfFavoriteAsset"><a class="pfLink pfFavoriteLink" href="${esc(item.tradingViewUrl)}" target="_blank" rel="noopener noreferrer">${asset}<span class="srOnly">TradingView</span></a></td><td>${price}</td><td class="${tone(q?.changePct)}">${change}</td><td>${time}</td><td><button type="button" data-pf-favorite-remove="${esc(item.symbol)}">移除</button></td></tr>`;}).join('')}</tbody></table></div>`:empty('还没有自选股','添加后会在下一轮 Mentora Deal 中优先进入量化回测和 JEV 决策。')}`)}
  function compactProfileView(){return`${profileView()}<div class="pfProfileFavorites">${favoritesView()}</div>`}
  function profitChart(){
    const history=(data.history||[]).filter(h=>Number.isFinite(h.equity)&&Number.isFinite(Date.parse(h.day)));
    if(history.length<2)return`<div class="pfChart">${history.length?'已记录首次收益估值，后续按真实每日记录展示':'首次更新行情后开始记录历史收益'}</div>`;
    const values=history.map(h=>h.equity-data.initial),flat=values.every(v=>v===0);
    const lo=flat?-1:Math.min(0,...values),hi=flat?1:Math.max(0,...values),span=hi-lo;
    const start=Date.parse(history[0].day),end=Date.parse(history.at(-1).day),y=v=>172-(v-lo)/span*164,zero=y(0);
    const points=values.map((v,i)=>[2+(Date.parse(history[i].day)-start)/(end-start||1)*996,y(v)]);
    const line=points.map(([x,y],i)=>(i?'L':'M')+x.toFixed(3)+' '+y.toFixed(3)).join(' ');
    const area=line+` L ${points.at(-1)[0].toFixed(3)} ${zero} L ${points[0][0].toFixed(3)} ${zero} Z`;
    const region=(sign,clip)=>`<g class="pfProfit${sign}" clip-path="url(#${clip})"><path class="pfProfitArea" d="${area}" fill="currentColor" fill-opacity=".16"/><path class="pfProfitLine" d="${line}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></g>`;
    return`<div class="pfChart pfProfitChart"><div class="pfProfitPlot"><svg viewBox="0 0 1000 180" preserveAspectRatio="none" role="img" aria-label="按实际每日估值记录的历史收益，零轴以上红色、以下绿色" data-zero-y="${zero}"><defs><clipPath id="pfProfitAbove" clipPathUnits="userSpaceOnUse"><rect x="0" y="0" width="1000" height="${zero}"/></clipPath><clipPath id="pfProfitBelow" clipPathUnits="userSpaceOnUse"><rect x="0" y="${zero}" width="1000" height="${180-zero}"/></clipPath></defs>${flat?`<path class="pfProfitFlat" d="${line}" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`:region('Positive','pfProfitAbove')+region('Negative','pfProfitBelow')}<line class="pfProfitZeroAxis" x1="0" y1="${zero}" x2="1000" y2="${zero}" stroke="currentColor" stroke-opacity=".3" vector-effect="non-scaling-stroke"/></svg><span class="pfProfitZero" style="top:${zero/180*100}%" aria-hidden="true">0</span></div><div class="pfProfitDates"><span>${esc(history[0].day)}</span><span>${esc(history.at(-1).day)}</span></div></div>`;
  }
  function returnsView(){const profit=data.equity===null?null:data.equity-data.initial,history=data.history||[],previous=history.length>1?history.at(-2):null;return`<div class="pfGrid">${card('当前收益',`<div class="pfHero ${tone(profit)}">${money(profit)}</div><div class="${tone(data.totalReturn)}">累计收益率 ${num(data.totalReturn)}%</div><div class="pfMetrics"><div><small>未实现收益</small><strong class="${tone(data.unrealized)}">${money(data.unrealized)}</strong></div><div><small>已实现收益</small><strong class="${tone(data.realized)}">${money(data.realized)}</strong></div><div><small>较前次日度记录</small><strong class="${previous?tone(data.equity-previous.equity):''}">${previous&&data.equity!==null?money(data.equity-previous.equity):'等待完整日度估值'}</strong></div><div><small>账户总资产</small><strong>${money(data.equity)}</strong></div></div>`)}${card('历史收益变化',profitChart())}${card('历史收益记录',history.length?`<div class="pfTableWrap"><table class="pfTable"><thead><tr><th>估值日</th><th>账户资产 USD</th><th>累计收益 USD</th><th>收益率</th><th>更新时间</th></tr></thead><tbody>${[...history].reverse().map(h=>`<tr><td>${esc(h.day)}</td><td>${money(h.equity)}</td><td class="${tone(h.equity-data.initial)}">${money(h.equity-data.initial)}</td><td class="${tone(h.equity-data.initial)}">${num((h.equity/data.initial-1)*100)}%</td><td>${date(h.at)}</td></tr>`).join('')}</tbody></table></div>`:empty('历史记录正在积累','账户每次完成估值后，保存当日最近一次记录。'))}</div>`;}

  function render(){if(!data)return;const sopScroll=$('pfPanel').querySelector('.pfSopScroll')?.scrollLeft||0;stickyWatchCleanup?.();stickyWatchCleanup=null;document.querySelectorAll('.pfTabs [data-pf-view]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.pfView===view)));if(lastNavView!==view){workspace.querySelector(`.pfTabs [data-pf-view="${view}"]`)?.scrollIntoView?.({block:'nearest',inline:'center'});lastNavView=view;}$('pfPanel').innerHTML=view==='watchlist'?watchlist():view==='positions'?positions():view==='returns'?returnsView():view==='trades'?trades():view==='strategies'?strategies():compactProfileView();favoritePicker=null;mountProfileAvatars($('pfPanel'));if(view==='profile'&&window.WidgetSymbolPicker){const form=$('pfFavoriteForm'),input=$('pfFavoriteSymbol'),field=$('pfFavoriteField');if(form&&input&&field){favoritePicker=new window.WidgetSymbolPicker(form,input,field);favoritePicker.configure(true,false,['auto']);input.placeholder='输入公司名称或代码';}}const scroller=$('pfPanel').querySelector('.pfSopScroll');if(scroller)scroller.scrollLeft=sopScroll;if(view==='watchlist')mountStickyWatchHeader();}
  let questionPool=[],questionOffset=0,questionLoading=false,questionVersion='';
  function updateQuestionHint(){
    const input=$('pfIdeaInput');
    if(input.value||document.activeElement===input)return;
    const question=questionPool[questionOffset]?.question;
    input.placeholder=question||'例如：英伟达现在能买吗？';
    input.dataset.recommendedQuestion=question||'';
  }
  setInterval(()=>{
    if(workspace.hidden||$('pfIdeaInput').value||document.activeElement===$('pfIdeaInput')||questionPool.length<2)return;
    questionOffset=(questionOffset+1)%questionPool.length;updateQuestionHint();
  },7000);
  async function loadQuestions(){
    if(questionLoading)return;questionLoading=true;
    try{
      const result=await api('/questions','POST');
      if(!Array.isArray(result.items))return;
      const latest=result.items.slice(0,6),version=JSON.stringify(latest);
      if(version!==questionVersion){questionVersion=version;questionPool=latest;questionOffset=0;}
      const refreshed=result.lastRefreshAt||data?.lastRefreshAt;
      const refreshing=result.refreshStatus==='running';
      $('pfRefreshAt').textContent=(refreshed?`最近刷新 ${date(refreshed)}${result.refreshPartial?' · 部分失败':''}`:firstPageRefreshAt?`首次刷新 ${date(firstPageRefreshAt)}`:'加载中…')+(refreshing?' · 刷新中…':result.refreshError?' · 刷新失败':'');
      workspace.querySelectorAll('[data-pf-action="refresh"]').forEach(b=>b.disabled=refreshing);
      updateQuestionHint();
    }catch(e){/* Keep the previous placeholder pool while the backend retries. */}
    finally{questionLoading=false;}
  }
  $('pfIdeaInput').addEventListener('blur',updateQuestionHint);
  $('pfIdeaInput').addEventListener('click',event=>{
    const input=event.currentTarget,question=input.dataset.recommendedQuestion;
    if(workspace.hidden||input.disabled||input.value||!question||question!==input.placeholder||question.length<2||question.length>input.maxLength)return;
    input.value=question;
    delete input.dataset.recommendedQuestion;
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.form?.requestSubmit();
  });
  async function load(refresh=false){
    if(loading)return;loading=true;
    const controls=[...workspace.querySelectorAll('[data-pf-action="refresh"]')];controls.forEach(b=>b.disabled=true);
    workspace.setAttribute('aria-busy','true');
    try{
      data=await api(refresh?'/page-refresh':'/account',refresh?'POST':'GET');
      firstPageRefreshAt ||= data.serverTime || new Date().toISOString();
      $('pfRefreshAt').textContent=data.lastRefreshAt?'最近刷新 '+date(data.lastRefreshAt):'首次刷新 '+date(firstPageRefreshAt);
      flow=await api('/workflow');captureStrategies();if(!strategyStream)render();
      if(data.lastRefreshAt)$('pfRefreshAt').textContent='最近刷新 '+date(data.lastRefreshAt);
      void loadQuestions();
      if(refresh)message(data.refreshStatus==='running'?'正在后台刷新行情，完成后自动更新页面与时间':'页面已刷新，推荐池有更新时会自动补充');
    }catch(e){message(e.message);if(!data)$('pfPanel').innerHTML=empty('账户暂未连接',esc(e.message)+'<br><button data-pf-action="reload">重试</button>');}
    finally{loading=false;workspace.removeAttribute('aria-busy');controls.forEach(b=>b.disabled=false);}
  }
  workspace.addEventListener('portfolio:favorites-imported',async()=>{
    try{const result=await api('/favorites');if(flow){flow.favorites=result.items||[];if(view==='profile')render();}}
    catch(error){message('自选已保存，列表暂未更新：'+error.message);}
  });
  function route(){const url=new URL(location.href);for(const k of ['board','task','run','dayResult','dayShare'])url.searchParams.delete(k);url.searchParams.set('tab','portfolio');url.searchParams.set('portfolioView',view);history.replaceState(null,'',url);}
  function enter(push=true){delete document.documentElement.dataset.entryView;const original=new URL(location.href);const aliases={overview:'positions',opportunities:'watchlist',decisions:'watchlist',plans:'trades',sources:'watchlist',favorites:'profile'};const oldView=original.searchParams.get('portfolioView');if(aliases[oldView])original.searchParams.set('portfolioView',aliases[oldView]);internal=true;try{window.dispatchEvent(new CustomEvent('veya:chat-navigate'));}finally{internal=false;}shell.classList.remove('tasks-view','widgets-view');shell.classList.add('portfolio-view');for(const id of ['taskWorkspace','taskSidebar','widgetWorkspace','widgetSidebar'])if($(id))$(id).hidden=true;workspace.hidden=false;for(const id of ['navHome','navTasks','navWidgets','railHome','railTasks','railWidgets']){$(id)?.classList.remove('is-selected','is-active');$(id)?.removeAttribute('aria-current');}for(const id of ['navPortfolio','railPortfolio']){$(id)?.classList.add(id.startsWith('rail')?'is-active':'is-selected');$(id)?.setAttribute('aria-current','page');}if(typeof setSidebarCollapsed==='function')setSidebarCollapsed(true);if(push){original.search='';original.searchParams.set('tab','portfolio');history.pushState(null,'',original);}else history.replaceState(null,'',original);view=original.searchParams.get('portfolioView')||view;if(!views.some(([v])=>v===view))view='watchlist';route();void load();clearInterval(timer);timer=setInterval(()=>{if(!workspace.hidden&&!dialog.open){if(document.activeElement?.closest('form'))void loadQuestions();else void load();}},15000);}
  function leave(){captureStrategies();cancelStrategyStream();stickyWatchCleanup?.();stickyWatchCleanup=null;workspace.hidden=true;shell.classList.remove('portfolio-view');for(const id of ['navPortfolio','railPortfolio']){$(id)?.classList.remove('is-active','is-selected');$(id)?.removeAttribute('aria-current');}clearInterval(timer);dialog.close();}
  function openDialog(title,html){dialog.innerHTML=`<header><h2>${title}</h2><button data-pf-close aria-label="关闭">×</button></header>${html}`;if(!dialog.open)dialog.showModal();}
  function showPlan(plan){const expired=Date.now()>Date.parse(plan.expires);openDialog('确认交易',`<div class="pfTicker">${esc(plan.symbol)} · ${plan.side==='buy'?'买入':'卖出'} ${num(plan.quantity,0)} 股</div><div class="pfMeta">${esc(quoteLabel(plan.quote))}<br>来源：${esc(plan.quote.source)}<br>${esc(plan.quote.limitation)}</div><div class="pfRows">${[['成交参考价',money(plan.price)+' / 股'],['预计金额',money(plan.amount)],['手续费',money(plan.fee)],['现金变化',money(plan.cashChange)],...(plan.stopPrice?[['风险参考线',money(plan.stopPrice)],['预计止损风险',money(plan.estimatedRisk)]]:[]),['有效期至',date(plan.expires)]].map(([a,b])=>`<div class="pfRow"><span class="pfMuted">${a}</span><b>${b}</b></div>`).join('')}</div>${plan.quote.fx?`<p class="pfNotice">原币 ${num(plan.quote.nativePrice,4)} CNY · 汇率 1 CNY = ${num(plan.quote.fx.rate,6)} USD（${esc(plan.quote.fx.date)} 日度参考汇率）</p>`:''}<p class="pfSubtle">${esc(plan.fillRule)}。确认时再次获取报价，偏离超过 0.5% 将要求重建计划。持仓风险由定时任务监控并交给 JEV 决策；下单 Skill 校验最新价格、账户与可卖数量。</p><div class="pfActions"><button data-pf-close>返回</button><button class="pfPrimary" data-pf-execute="${esc(plan.id)}" ${expired||plan.status==='filled'?'disabled':''}>${plan.status==='filled'?'已成交':expired?'计划已过期':'确认成交'}</button></div>`);}
  function settings(){const s=data.settings;const fields=[['maxPositionPct','单标的市值上限 %',1,100,.1],['riskPct','每标的风险预算 %',.05,5,.05],['reservePct','最低现金比例 %',0,95,1],['stopPct','风险参考距离 %',.5,50,.5],['slippageBps','滑点 bps',0,200,1],['fee','每笔手续费 USD',0,100,.01]];openDialog('账户设置',`<form id="pfSettingsForm" class="pfForm"><div class="pfNotice" style="margin:0 0 4px">初始资金 ${money(data.initial)} · 行情与交易记录<br>修改规则不改写已有交易和收益。</div><div class="pfFields">${fields.map(([id,name,min,max,step])=>`<label>${name}<input type="number" name="${id}" value="${s[id]}" min="${min}" max="${max}" step="${step}" required></label>`).join('')}</div><label class="pfCheck"><input type="checkbox" name="automatic" ${s.automatic?'checked':''}>自动执行 JEV 买卖决策</label><p class="pfSubtle">定时任务负责找股和持仓风险监控。只有 JEV 给出置信度与证据均达标的买入、减仓或卖出决定时，下单 Skill 才在交易时段取最新行情执行。未开启时保留决策，逐笔确认；A 股执行 T+1。</p><div class="pfActions"><button type="button" data-pf-close>取消</button><button class="pfPrimary" type="submit">保存设置</button></div></form>`);}
  async function createPlan(symbol,side='buy',strategy='manual',quantity,decisionId){if(busy)return;busy=true;const controls=[...document.querySelectorAll('[data-pf-decision]')];controls.forEach(b=>b.disabled=true);message('正在获取最新真实行情并计算计划…',45000);try{const p=await api('/plans','POST',{symbol,side,strategy,...(quantity?{quantity}: {}),...(decisionId?{decisionId}:{})});toast.hidden=true;showPlan(p);await load();}catch(e){message(e.message);}finally{busy=false;controls.forEach(b=>b.disabled=false);}}
  document.addEventListener('click',e=>{if(e.target.closest('#railPortfolio,#navPortfolio'))enter();else if(e.target.closest('#navHome,#railHome,#navTasks,#railTasks,#navWidgets,#railWidgets,#railNewChat,#newChatButton,#dayCustomizeTasks'))leave();});
  window.addEventListener('veya:chat-navigate',()=>{if(!internal)leave();});
  window.addEventListener('popstate',()=>{if(new URL(location.href).searchParams.get('tab')==='portfolio')enter(false);else leave();});
  async function click(e){const b=e.target.closest('button');if(!b)return;if(b.dataset.pfSopSettings){taskControl(b.dataset.pfSopSettings,'settings');return;}if(b.dataset.pfSopToggle){taskControl(b.dataset.pfSopToggle,'toggle');return;}if(b.dataset.pfSopOpen){showSopNode(b.dataset.pfSopOpen);return;}if(b.dataset.pfSopRun){await runSopNode(b.dataset.pfSopRun,b);return;}if(b.hasAttribute('data-pf-close')){dialog.close();return;}if(b.dataset.pfStrategy){await strategyAction(b.dataset.pfStrategy);return;}if(b.dataset.pfStrategySelect){if(strategyStream||strategySaving)return;captureStrategies();strategySelected=b.dataset.pfStrategySelect;render();return;}if(b.dataset.pfView){captureStrategies();cancelStrategyStream();view=b.dataset.pfView;route();render();return;}if(b.dataset.pfDetail){const d=flow?.decisions?.find(x=>x.id===b.dataset.pfDetail);if(d)openDialog('判断详情',decisionCard(d));return;}if(b.dataset.pfDecision){const d=flow.decisions.find(x=>x.id===b.dataset.pfDecision);if(d)await createPlan(d.symbol,d.action==='buy'?'buy':'sell',d.kind==='entry'?'event':'manual',undefined,d.id);return;}if(b.dataset.pfOpenPlan){const plan=data.plans.find(p=>p.id===b.dataset.pfOpenPlan);if(plan)showPlan(plan);return;}if(b.dataset.pfExecute){if(busy)return;busy=true;b.disabled=true;try{await api('/plans/'+b.dataset.pfExecute+'/execute','POST');dialog.close();await load();message('成交已记录，持仓和现金已更新');}catch(error){message(error.message);b.disabled=false;}finally{busy=false;}return;}if(b.dataset.pfAction==='settings'){if(data)settings();return;}if(b.dataset.pfAction==='refresh'||b.dataset.pfAction==='reload'){b.disabled=true;try{await load(b.dataset.pfAction==='refresh');}finally{b.disabled=false;}return;}if(b.dataset.pfAction==='run-workflow'){b.disabled=true;try{const result=await api('/workflow/run','POST');message(result.queued===0?'工作流已经在运行':'已启动 Mentora Deal：后续节点会按顺序自动执行');await load();}catch(error){message(error.message);}finally{b.disabled=false;}}}
  workspace.querySelector('.pfIdeaAttach')?.addEventListener('click',()=>$('imageInput')?.click());
  workspace.addEventListener('click',async e=>{const button=e.target.closest('[data-pf-favorite-remove]');if(!button)return;e.stopImmediatePropagation();button.disabled=true;try{await api('/favorites/'+encodeURIComponent(button.dataset.pfFavoriteRemove),'DELETE');await load();message('已从自选股移除');}catch(error){message(error.message);button.disabled=false;}},true);
  workspace.addEventListener('submit',async e=>{if(e.target.id!=='pfFavoriteForm')return;e.preventDefault();e.stopImmediatePropagation();const input=e.target.elements.symbol,button=e.target.querySelector('[type=submit]');if(!input.value.trim())return;button.disabled=true;try{const name=input.value.trim(),symbol=favoritePicker?await favoritePicker.resolve():name;await api('/favorites','POST',{symbol,name});input.value='';await load();message('已加入自选，后续工作流会将其作为 JEV 候选');}catch(error){message(error.name==='AbortError'?'标的搜索超时，请重试':error.message);button.disabled=false;}},true);
  workspace.addEventListener('click',e=>void click(e));dialog.addEventListener('click',e=>void click(e));
  workspace.querySelector('.pfTabs').addEventListener('keydown',e=>{const tabs=[...workspace.querySelectorAll('.pfTabs button')],i=tabs.indexOf(document.activeElement);if(i<0||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[next].focus();tabs[next].click();});

  workspace.addEventListener('change',e=>{if(e.target.id==='pfDecisionFilter'){filter=e.target.value;render();}if(e.target.closest('#pfStrategyForm')&&e.target.name==='enabled')void saveStrategies();});
  function strategyPayload(){
    const cfg=strategyConfig(),custom=JSON.parse(JSON.stringify(cfg.customStrategies));
    const valid=new Set([...Object.keys(names).filter(id=>!['custom','event','manual','jev-entry','jev-risk'].includes(id)),...custom.filter(s=>s.code?.trim()).map(s=>s.id)]);
    return {enabled:cfg.enabled.filter(id=>valid.has(id)),customStrategies:custom};
  }
  async function saveStrategies({quiet=false}={}){
    clearTimeout(strategySaveTimer);
    if(strategyStream||strategySaving){strategySavePending=true;return;}
    captureStrategies();const cfg=strategyConfig(),payload=strategyPayload();
    if(!payload.enabled.length){strategySavePending=true;strategySaveStatus('至少保留一个启用的已生成策略');return;}
    if(payload.customStrategies.some(s=>!s.name.trim())){strategySavePending=true;strategySaveStatus('请填写策略名称，填写后将自动保存');return;}
    strategySaving=true;strategySavePending=false;strategySaveStatus('正在自动保存…');if(!quiet)render();
    let succeeded=false;
    try{flow.strategies=await api('/strategies','PUT',payload);succeeded=true;strategySaveStatus('已自动保存');}
    catch(error){strategySavePending=true;strategySaveStatus('自动保存失败：'+error.message+'；请重试');}
    finally{
      strategySaving=false;
      if(!quiet)render();
      if(succeeded&&strategySavePending)void saveStrategies({quiet:true});
    }
  }
  workspace.addEventListener('input',e=>{if(e.target.closest('#pfStrategyForm')&&['strategyName','strategyDescription'].includes(e.target.name))scheduleStrategySave();});
  workspace.addEventListener('focusout',e=>{if(strategySavePending&&e.target.closest('#pfStrategyForm'))void saveStrategies({quiet:true});});
  async function submit(e){if(e.target.id==='pfIdeaForm'){e.preventDefault();const input=e.target.elements.question,question=input.value.trim();if(question.length<2)return;input.value='';$('railHome')?.click();window.dispatchEvent(new CustomEvent('aime:streamviz-followup',{detail:{prompt:question,agent:'mentora-deal'}}));return;}if(e.target.id==='pfStrategyForm'){e.preventDefault();await saveStrategies(e.target);return;}if(e.target.id==='pfProfileForm'){e.preventDefault();if(profileSaving)return;profileSaving=true;const form=e.target,button=form.querySelector('[type=submit]');button.disabled=true;try{const saved=await api('/workflow/profile','PUT',(()=>{const f=new FormData(form),number=k=>f.get(k)===''?null:Number(f.get(k));return {profile:f.get('profile')||'',investment:{markets:f.getAll('markets'),styles:f.getAll('styles'),horizon:f.get('horizon')||'',targetReturnPct:number('targetReturnPct'),maxDrawdownPct:number('maxDrawdownPct'),confidenceThresholdPct:number('confidenceThresholdPct')}};})());flow.preferences={...flow.preferences,...saved};if(dialog.open)dialog.close();await load();message('交易偏好已保存，下一轮 JEV 决策将使用新置信度门槛');}catch(error){message(error.message);}finally{profileSaving=false;button.disabled=false;render();}return;}if(e.target.id==='pfSettingsForm'){e.preventDefault();const f=new FormData(e.target),settings={};for(const key of ['maxPositionPct','riskPct','reservePct','stopPct','slippageBps','fee'])settings[key]=Number(f.get(key));settings.automatic=f.get('automatic')==='on';const b=e.target.querySelector('[type=submit]');b.disabled=true;try{await api('/settings','PUT',settings);dialog.close();await load();message('账户设置已保存');}catch(error){message(error.message);b.disabled=false;}}}
  workspace.addEventListener('submit',e=>void submit(e));dialog.addEventListener('submit',e=>void submit(e));
  function profileFormState(form){const f=new FormData(form),number=k=>f.get(k)===''?null:Number(f.get(k));return{markets:f.getAll('markets'),styles:f.getAll('styles'),horizon:f.get('horizon')||'',targetReturnPct:number('targetReturnPct'),maxDrawdownPct:number('maxDrawdownPct'),confidenceThresholdPct:number('confidenceThresholdPct')};}
  function updateProfilePreview(form){if(!form)return;const p=profileFormState(form),threshold=p.confidenceThresholdPct??60,copy=confidenceCopy(threshold),persona=profilePersona(p),root=form.closest('.pfProfileHero')||form.parentElement;form.querySelector('[data-pf-confidence-output]')?.replaceChildren(document.createTextNode(num(threshold,0)+'%'));const range=form.elements.confidenceThresholdPct;if(range){range.parentElement.style.setProperty('--pf-confidence',confidenceProgress(threshold)+'%');range.setAttribute('aria-valuetext',num(threshold,0)+'%，'+copy[0]);}form.querySelector('[data-pf-confidence-title]')?.replaceChildren(document.createTextNode(copy[0]));form.querySelector('[data-pf-confidence-copy]')?.replaceChildren(document.createTextNode(`买入、减仓或卖出置信度 ≥ ${num(threshold,0)}% 时通过门槛。`));const avatar=root?.querySelector('[data-pf-avatar]');if(avatar){activateProfileAvatar(avatar,persona.key);avatar.setAttribute('aria-label',persona.name+' · 鹈鹕骑车');}root?.querySelector('[data-pf-persona-name]')?.replaceChildren(document.createTextNode(persona.name));const tags=root?.querySelector('[data-pf-persona-tags]');if(tags)tags.innerHTML=persona.tags.map(tag=>`<span>${esc(tag)}</span>`).join('');}
  const profileInput=e=>{const form=e.target.closest?.('#pfProfileForm');if(form)updateProfilePreview(form);};
  workspace.addEventListener('input',profileInput);workspace.addEventListener('change',profileInput);dialog.addEventListener('input',profileInput);dialog.addEventListener('change',profileInput);
  function updateIdeaComposer(){const input=$('pfIdeaInput'),box=input?.closest('.composerBox'),submit=box?.querySelector('[type=submit]');if(!input||!box)return;input.style.height='0px';const multiline=Boolean(input.value)&&(input.value.includes('\n')||input.scrollHeight>42);box.classList.toggle('is-multiline',multiline);input.style.height=multiline?Math.min(input.scrollHeight,120)+'px':'';submit?.classList.toggle('is-ready',Boolean(input.value.trim()));}
  $('pfIdeaInput')?.addEventListener('input',updateIdeaComposer);
  $('pfIdeaInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();e.currentTarget.form?.requestSubmit();}});
  if(new URL(location.href).searchParams.get('tab')==='portfolio')enter(false);
})();
