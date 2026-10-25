import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function generatedImageUrl('),source.indexOf('function fileDeliverables('));
for(const mount of ['', '/mentora', '/nested/mentora']){
 test('generated image uses the actual application mount '+mount,()=>{
  const dom=new JSDOM('<script src="'+mount+'/static/app.js?v=test"></script>',{url:'https://example.com'+mount+'/',runScripts:'outside-only'});
  try{dom.window.eval(code);const node=dom.window.createGeneratedImageArtifact({url:'/generated/flux-example.html',imageUrl:'/generated/flux-example.png'});
   assert.equal(node.querySelector('img').src,'https://example.com'+mount+'/generated/flux-example.png');
   assert.equal(dom.window.generatedImageUrl(mount+'/generated/flux-example.png'),'https://example.com'+mount+'/generated/flux-example.png');
   assert.equal(dom.window.generatedImageUrl('https://cdn.example.com/generated/image.png'),'https://cdn.example.com/generated/image.png');
  }finally{dom.window.close();}
 });
}
