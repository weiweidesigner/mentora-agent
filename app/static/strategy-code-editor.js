(() => {
  'use strict';
  const escape = text => text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tokens = /(#.*$|\/\/.*$)|("""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)|\b(def|return|if|elif|else|and|or|not|in|is|for|while|break|continue|pass|import|from|as|class|lambda|try|except|finally|raise|with|yield|var|float|int|bool|string)\b|\b(True|False|None|true|false|na)\b|\b(\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)\b|\b([A-Za-z_]\w*)(?=\s*\()/gm;
  function highlight(code) {
    let end=0,html='';
    for (const match of code.matchAll(tokens)) {
      html+=escape(code.slice(end,match.index));
      const kind=match[1]?'comment':match[2]?'string':match[3]?'keyword':match[4]?'constant':match[5]?'number':'function';
      html+='<span class="sce-'+kind+'">'+escape(match[0])+'</span>';end=match.index+match[0].length;
    }
    return html+escape(code.slice(end))+'\n';
  }
  function sync(editor) {
    const wrap=editor.closest('.strategyCodeEditor');if(!wrap)return;
    const paint=wrap.querySelector('.strategyCodePaint');
    paint.innerHTML=highlight(editor.value);
    paint.scrollTop=editor.scrollTop;paint.scrollLeft=editor.scrollLeft;
  }
  function mount() {
    if(!document?.body)return;
    document.querySelectorAll('.pfStrategyEditor textarea[name="customCode"]').forEach(editor=>{
      if(editor.closest('.strategyCodeEditor'))return;
      const wrap=document.createElement('div');wrap.className='strategyCodeEditor';
      const paint=document.createElement('pre');paint.className='strategyCodePaint';paint.setAttribute('aria-hidden','true');
      editor.before(wrap);wrap.append(paint,editor);editor.wrap='off';editor.autocapitalize='off';editor.autocomplete='off';
      editor.addEventListener('input',()=>sync(editor));
      editor.addEventListener('scroll',()=>{paint.scrollTop=editor.scrollTop;paint.scrollLeft=editor.scrollLeft;},{passive:true});
      editor.addEventListener('keydown',event=>{
        if(event.key!=='Tab'||event.shiftKey||event.ctrlKey||event.metaKey||editor.readOnly)return;
        event.preventDefault();editor.setRangeText('    ',editor.selectionStart,editor.selectionEnd,'end');editor.dispatchEvent(new Event('input',{bubbles:true}));
      });
      new ResizeObserver(()=>{paint.style.height=editor.offsetHeight+'px';paint.style.width=editor.offsetWidth+'px';}).observe(editor);
      sync(editor);
    });
  }
  window.MentoraCodeEditor={sync,highlight};
  new MutationObserver(records=>{if(records.some(record=>[...record.addedNodes].some(node=>node.nodeType===1&&!node.closest?.('.strategyCodePaint'))))mount();}).observe(document.body,{childList:true,subtree:true});
  mount();
})();
