import {build} from 'esbuild';
await build({entryPoints:['frontend/action-cards-entry.mjs'],outfile:'app/static/vendor/action-cards.js',bundle:true,format:'iife',target:'es2022',minify:true});
