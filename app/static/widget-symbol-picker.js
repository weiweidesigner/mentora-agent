(() => {
  'use strict';
  const names={us:'美股',hk:'港股',cn:'A 股',auto:'自动识别'};
  const parts=value=>value.split(/[,，、;；]+/).map(s=>s.trim()).filter(Boolean);
  const displayCode=item=>item.market==='hk'?item.code.padStart(5,'0'):item.code;
  class WidgetSymbolPicker {
    constructor(form,input,field){
      Object.assign(this,{form,input,field,enabled:false,group:false,timer:null,controller:null,version:0,chosen:new Map(),matches:[],active:-1});
      this.marketField=document.createElement('label');this.marketField.className='widgetSymbolMarketField';this.marketField.innerHTML='<span>证券市场</span><select aria-label="选择证券市场">'+Object.entries(names).map(([value,name])=>`<option value="${value}">${name}</option>`).join('')+'</select>';form.prepend(this.marketField);this.marketField.hidden=true;this.select=this.marketField.querySelector('select');
      this.list=document.createElement('div');this.list.id='widgetSymbolChoices';this.list.className='widgetSymbolChoices';this.list.setAttribute('role','listbox');this.list.setAttribute('aria-label','匹配的证券');this.list.hidden=true;field.append(this.list);
      this.status=document.createElement('span');this.status.className='widgetSymbolStatus';this.status.setAttribute('role','status');field.append(this.status);
      input.addEventListener('input',()=>{if(!this.enabled)return;this.status.textContent='';clearTimeout(this.timer);this.cancel();this.timer=setTimeout(()=>this.suggest(),250);});
      input.addEventListener('keydown',event=>{
        if(!this.enabled||this.list.hidden)return;
        if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();this.active=(this.active+(event.key==='ArrowDown'?1:-1)+this.matches.length)%this.matches.length;this.highlight();}
        if(event.key==='Enter'&&this.active>=0){event.preventDefault();event.stopImmediatePropagation();this.choose(this.matches[this.active],this.replaceIndex);}
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.cancel();}
      });
      this.select.addEventListener('change',()=>{this.cancel();this.chosen.clear();this.status.textContent='';this.placeholder();if(input.value.trim())void this.suggest();});
      form.closest('dialog')?.addEventListener('close',()=>this.cancel());
    }
    configure(enabled,group){
      this.enabled=enabled;this.group=group;this.marketField.hidden=!enabled;this.form.classList.toggle('has-symbol-market',enabled);this.cancel();this.status.textContent='';
      if(enabled){this.input.setAttribute('role','combobox');this.input.setAttribute('aria-autocomplete','list');this.input.setAttribute('aria-controls',this.list.id);this.input.autocomplete='off';this.placeholder();}
      else{for(const attr of ['role','aria-autocomplete','aria-controls','aria-expanded','aria-activedescendant'])this.input.removeAttribute(attr);}
    }
    placeholder(){
      const sample={us:'苹果、AAPL 或微软',hk:'腾讯、00700 或阿里巴巴',cn:'贵州茅台、600519 或宁德时代',auto:'股票名称或代码'}[this.select.value];
      this.input.placeholder='例如 '+sample;this.status.textContent=this.group?'支持多个标的，用逗号分隔。':'';
    }
    cancel(){clearTimeout(this.timer);this.controller?.abort();this.controller=null;this.version++;this.list.hidden=true;this.input.setAttribute('aria-expanded','false');this.input.removeAttribute('aria-activedescendant');this.matches=[];this.active=-1;}
    async search(query,signal){
      const response=await fetch('/api/widgets/symbols?'+new URLSearchParams({query,market:this.select.value}),{signal});
      const data=await response.json();if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:'标的搜索暂不可用，请稍后重试。');return data.results||[];
    }
    async suggest(){
      this.cancel();const queryParts=parts(this.input.value),index=queryParts.length-1,query=queryParts[index];
      if(!query||/[,，、;；]\s*$/.test(this.input.value))return;
      const version=this.version,controller=new AbortController();this.controller=controller;this.status.textContent='正在查找…';
      try{const matches=await this.search(query,controller.signal);if(version!==this.version||!this.enabled)return;this.show(matches,index);this.status.textContent=matches.length?'选择匹配的股票，或继续输入名称 / 代码。':'未找到匹配标的，请检查证券市场或换一个名称 / 代码。';}
      catch(error){if(!controller.signal.aborted&&version===this.version)this.status.textContent=error.message;}
      finally{if(this.controller===controller)this.controller=null;}
    }
    show(matches,index){
      this.matches=matches;this.replaceIndex=index;this.active=-1;this.list.replaceChildren();
      matches.forEach((item,i)=>{const option=document.createElement('button');option.type='button';option.id='widgetSymbolChoice-'+i;option.setAttribute('role','option');option.setAttribute('aria-selected','false');
        const title=document.createElement('strong');title.textContent=item.name;const meta=document.createElement('small');meta.textContent=(names[item.market]||item.exchange)+' · '+displayCode(item);option.append(title,meta);option.addEventListener('mousedown',event=>event.preventDefault());option.onclick=()=>this.choose(item,index);this.list.append(option);});
      this.list.hidden=!matches.length;this.input.setAttribute('aria-expanded',String(matches.length>0));
    }
    highlight(){[...this.list.children].forEach((node,i)=>node.setAttribute('aria-selected',String(i===this.active)));const selected=this.list.children[this.active];if(selected){this.input.setAttribute('aria-activedescendant',selected.id);selected.scrollIntoView?.({block:'nearest'});}}
    choose(item,index){
      const values=this.group?parts(this.input.value):[];if(this.group)values[index]=item.name;else values.push(item.name);
      this.input.value=values.join('、');this.chosen.set(item.name,item.symbol);this.cancel();this.status.textContent=item.name+' · '+displayCode(item);this.input.focus({preventScroll:true});
    }
    async resolve(){
      if(!this.enabled)return this.input.value.trim();this.cancel();const values=this.group?parts(this.input.value):[this.input.value.trim()],resolved=[];
      for(let i=0;i<values.length;i++){
        const value=values[i];if(!value)throw Error('请填写股票名称或代码。');
        if(/^[A-Za-z0-9_]+:[A-Za-z0-9_.!/^+\-]+$/.test(value)){resolved.push(value.toUpperCase());continue;}
        if(this.chosen.has(value)){resolved.push(this.chosen.get(value));continue;}
        this.status.textContent='正在识别 '+value+'…';const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);let matches;
        try{matches=await this.search(value,controller.signal);}finally{clearTimeout(timeout);}
        const exact=matches.filter(item=>item.name.toLowerCase()===value.toLowerCase()||item.code.toLowerCase()===value.toLowerCase()||(/^\d+$/.test(value)&&/^\d+$/.test(item.code)&&Number(value)===Number(item.code)));
        const match=exact.length===1?exact[0]:matches.length===1?matches[0]:null;
        if(!match){this.show(matches,i);throw Error(matches.length?'有多个匹配标的，请从列表中选择。':'未找到股票，请检查证券市场、名称或代码。');}
        resolved.push(match.symbol);
      }
      this.status.textContent='';return resolved.join('、');
    }
  }
  window.WidgetSymbolPicker=WidgetSymbolPicker;
})();
