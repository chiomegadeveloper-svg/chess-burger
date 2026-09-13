import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authStorage,setKeepLogin,keepLogin,clearAccountCache} from '../app/auth-storage.ts';
class Storage{data=new Map();getItem(k){return this.data.get(k)??null;}setItem(k,v){this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}}
test('Keep me logged in moves session material between durable and tab storage',()=>{
 globalThis.localStorage=new Storage();globalThis.sessionStorage=new Storage();globalThis.window=new EventTarget();assert.equal(keepLogin(),true);authStorage.setItem('cb-auth','session');authStorage.setItem('cb-staff-profile','profile');assert.equal(localStorage.getItem('cb-auth'),'session');setKeepLogin(false);assert.equal(localStorage.getItem('cb-auth'),null);assert.equal(sessionStorage.getItem('cb-auth'),'session');assert.equal(authStorage.getItem('cb-staff-profile'),'profile');setKeepLogin(true);assert.equal(localStorage.getItem('cb-auth'),'session');assert.equal(sessionStorage.getItem('cb-auth'),null);
});
test('Sign out removes cached credentials from both storage locations and notifies the app',()=>{
 globalThis.localStorage=new Storage();globalThis.sessionStorage=new Storage();globalThis.window=new EventTarget();let fired=false;window.addEventListener('cb-signed-out',()=>fired=true);for(const s of [localStorage,sessionStorage])for(const k of ['cb-auth','cb-staff-profile','cb-guest-profile','cb-local-rating'])s.setItem(k,'private');clearAccountCache();for(const s of [localStorage,sessionStorage])for(const k of ['cb-auth','cb-staff-profile','cb-guest-profile','cb-local-rating'])assert.equal(s.getItem(k),null);assert.equal(fired,true);
});
