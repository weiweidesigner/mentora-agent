import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function isImageGalleryArtifact('),source.indexOf('function syncReportFrameThemes('));
function proxyRewrite(text,mount){
 for(const route of ['api','static','generated','share-artifact','share'])
  for(const quote of ['"',"'",'`'])text=text.replaceAll(quote+'/'+route+'/',quote+mount+'/'+route+'/');
 return text;
}
for(const mount of ['', '/mentora','/veya'])for(const rewrite of [false,true]){
 test('gallery loads as an image and upgrades artifacts at '+mount+' proxy='+rewrite,()=>{
  const dom=new JSDOM('',{url:'https://example.com'+mount+'/',runScripts:'outside-only'}),w=dom.window;
  try{
   w.isGeneratedImageArtifact=()=>false;w.currentThemeMode=()=> 'dark';
   w.eval(rewrite?proxyRewrite(code,mount):code);
   const node=w.createArtifactFallbackFrame({url:mount+'/generated/opaque-id.html',contentKind:'image-gallery'},0);
   assert.equal(node.querySelector('.chartLoadingLabel').textContent,'正在加载图片');
   assert.equal(new URL(node.querySelector('iframe').src).pathname,mount+'/share-artifact/opaque-id.html');
   assert.equal(w.artifactLoadingMessage({url:mount+'/generated/image-search-1.html'}),'正在加载图片');
   assert.notEqual(w.artifactLoadingMessage({url:mount+'/generated/unknown.html'}),'正在加载图表');
  }finally{w.close();}
 });
}
