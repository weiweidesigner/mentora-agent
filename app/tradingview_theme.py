"""Keep theme-derived TradingView colors adaptive, including saved widgets."""
import re

DEFAULT_STYLES = {
    'backgroundColor': {'#0f0f0f', '#ffffff'},
    'gridColor': {'rgba(242,242,242,0.06)', 'rgba(46,46,46,0.06)'},
}


def adaptive_widget_config(config, follow_theme=True):
    result = dict(config)
    if follow_theme:
        for key, defaults in DEFAULT_STYLES.items():
            if str(result.get(key, '')).replace(' ', '').lower() in defaults:
                result.pop(key)
    return result


THEME_BOOTSTRAP = '''<script data-widget-tv-theme>(function(){
try{
 const node=document.getElementById('tv-config'),spec=JSON.parse(node.textContent);
 if(spec.widget!=='advanced-chart'||spec.followTheme===false)return;
 const requested=new URLSearchParams(location.search).get('theme');
 const theme=['light','dark'].includes(requested)?requested:document.documentElement.dataset.theme;
 if(!['light','dark'].includes(theme))return;
 const cfg=spec.config||{};cfg.theme=theme;
 const colors={backgroundColor:['#0f0f0f','#ffffff'],gridColor:['rgba(242,242,242,0.06)','rgba(46,46,46,0.06)']};
 for(const [key,defaults] of Object.entries(colors)){
  if(!defaults.includes(String(cfg[key]||'').replace(/ /g,'').toLowerCase()))continue;
  cfg[key]=defaults[theme==='dark'?0:1];
  spec.preserveStyles=(spec.preserveStyles||[]).filter(value=>value!==key);
 }
 spec.config=cfg;node.textContent=JSON.stringify(spec);
}catch{}
})();</script>'''


def upgrade_tradingview_theme(artifact):
    if 'data-widget-tv-theme' in artifact:
        return artifact
    return re.sub(r'(<script\b[^>]*id=["\']tv-config["\'][^>]*>.*?</script>)',
                  lambda match: match[1] + THEME_BOOTSTRAP, artifact, count=1, flags=re.S)
