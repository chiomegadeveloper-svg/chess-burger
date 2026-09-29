import {readFile,writeFile} from 'node:fs/promises';

const file=new URL('../app/app-version.ts',import.meta.url);
const source=await readFile(file,'utf8');
const match=source.match(/APP_VERSION_NUMBER = (\d+);/);
if(!match)throw new Error('Could not find APP_VERSION_NUMBER.');
const next=Number(match[1])+8;
if(!Number.isSafeInteger(next))throw new Error('App version counter is invalid.');
await writeFile(file,source.replace(match[0],`APP_VERSION_NUMBER = ${next};`));
console.log(`Chess Burger v0.${String(next).padStart(4,'0')}`);
