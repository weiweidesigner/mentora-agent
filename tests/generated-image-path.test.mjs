import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function generatedImageUrl('),source.indexOf('function fileDeliverables('));
// Mirror nginx's literal sub_filter rules on the delivered JavaScript.
function proxyRewrite(text,mount){
 for(const route of ['api','static','generated','share-artifact','share'])
  for(const quote of ['"',"'",'`'])text=text.replaceAll(quote+'/'+route+'/',quote+mount+'/'+route+'/');
 return text;
}
for(const mount of ['', '/mentora', '/veya', '/nested/mentora'])for(const rewritten of [false,true]){
 test('generated image uses the actual application mount '+mount+' with proxy rewriting '+rewritten,()=>{
  const dom=new JSDOM('<script src="'+mount+'/static/app.js?v=test"></script>',{url:'https://example.com'+mount+'/',runScripts:'outside-only'});
  try{dom.window.eval(rewritten?proxyRewrite(code,mount):code);const node=dom.window.createGeneratedImageArtifact({url:'/generated/flux-example.html',imageUrl:'/generated/flux-example.png'});
   assert.equal(node.querySelector('img').src,'https://example.com'+mount+'/generated/flux-example.png');
   assert.equal(dom.window.generatedImageUrl(mount+'/generated/flux-example.png'),'https://example.com'+mount+'/generated/flux-example.png');
   assert.equal(dom.window.generatedImageUrl('https://cdn.example.com/generated/image.png'),'https://cdn.example.com/generated/image.png');
   assert.equal(dom.window.createGeneratedImageArtifact({url:mount+'/generated/flux-example.html'}).querySelector('img').src,'https://example.com'+mount+'/generated/flux-example.png');
   assert.equal(dom.window.generatedImageUrl('/generated/flux-example.png?version=2#image'),'https://example.com'+mount+'/generated/flux-example.png?version=2#image');
  }finally{dom.window.close();}
 });
}
