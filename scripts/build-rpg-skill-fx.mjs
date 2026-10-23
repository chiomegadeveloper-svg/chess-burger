import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const path=file=>fileURLToPath(new URL('../'+file,import.meta.url));
await build({entryPoints:[path('rpg/src/skill-fx/index.mjs')],outfile:path('public/rpg/vendor/ctjs-skill-fx.js'),bundle:true,minify:true,format:'iife',platform:'browser',inject:[path('rpg/src/skill-fx/pixi-global.mjs')],plugins:[{name:'ctjs-resource-bridge',setup(build){build.onResolve({filter:/^\.\.\/res$/},args=>args.importer.endsWith('PixiAnimatedSprite.ts')?{path:path('rpg/src/skill-fx/resources.mjs')}:null);}}]});
