(function(){
 'use strict';
 document.addEventListener('DOMContentLoaded',()=>{
  const meta=document.querySelector('.hr-live-meta');if(!meta)return;
  const button=document.createElement('button');button.type='button';button.className='hr-btn rpg-files-button';
  button.title='Download game files for faster loading';button.setAttribute('aria-label',button.title);
  button.innerHTML='<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4"/></svg>';meta.prepend(button);
  const loading=document.getElementById('live-loading'),loadingButton=loading?document.createElement('button'):null;
  if(loadingButton){loadingButton.type='button';loadingButton.textContent='Download game files';loading.append(loadingButton);}
  const dialog=document.createElement('dialog');dialog.className='live-confirm rpg-files-dialog';
  dialog.innerHTML='<h2>Game files</h2><p>Save artwork, sounds and animations on this device for faster loading. GPS, accounts and rewards still need internet.</p><small data-size>Checking saved files…</small><progress max="1" value="0" aria-label="Game file download"></progress><p data-status role="status" aria-live="polite"></p><div><button type="button" data-close>Close</button><button type="button" data-download>Download</button></div>';
  document.body.append(dialog);
  const style=document.createElement('style');style.textContent='.rpg-files-button{width:32px;min-width:32px;height:32px;padding:5px;display:inline-grid;place-items:center}.rpg-files-dialog{max-height:90dvh;overflow:auto}.rpg-files-dialog progress{width:100%;height:10px;margin:15px 0 3px;accent-color:#67dcc0}.rpg-files-dialog [data-status]{font-size:12px;min-height:18px;margin:4px 0 15px}.rpg-files-dialog small{font-size:12px;color:#b9d7d4}.rpg-files-dialog button:disabled{opacity:.55}.hr-live-meta{gap:7px;align-items:center}';document.head.append(style);
  const status=dialog.querySelector('[data-status]'),size=dialog.querySelector('[data-size]'),progress=dialog.querySelector('progress'),start=dialog.querySelector('[data-download]');
  let worker=null,channel=null,active=false,job=null,timer=null,request=0,returnFocus=button;
  const mb=n=>(n/1048576).toFixed(1)+' MB';
  function release(){clearTimeout(timer);channel?.port1.close();channel=null;}
  function paint(data){
   progress.max=data.totalBytes||1;progress.value=data.bytes||0;
   size.textContent=`${mb(data.bytes||0)} of ${mb(data.totalBytes||0)} saved · ${data.files||0}/${data.totalFiles||0} files`;
   start.textContent=data.files===data.totalFiles&&data.totalFiles?'Saved':'Download';start.disabled=active||data.files===data.totalFiles&&!!data.totalFiles;
  }
  async function connect(){
   if(!('serviceWorker' in navigator)||!window.isSecureContext)throw Error('This browser cannot save game files. You can still play online.');
   const ready=(async()=>{
    const registration=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});await registration.update();
    const candidate=registration.installing||registration.waiting;
    if(candidate&&candidate.state!=='activated')await new Promise((resolve,reject)=>{
     const changed=()=>{if(candidate.state==='activated'||candidate.state==='redundant'){candidate.removeEventListener('statechange',changed);candidate.state==='activated'?resolve():reject(Error('Game files are updating. Try again shortly.'));}};
     candidate.addEventListener('statechange',changed);changed();
    });
    return navigator.serviceWorker.ready;
   })();
   let timeout;try{const registration=await Promise.race([ready,new Promise((_,reject)=>timeout=setTimeout(()=>reject(Error('Game files are not ready yet. Reopen RPG and try again.')),8000))]);worker=registration.active||navigator.serviceWorker.controller;if(!worker)throw Error('Reopen RPG to enable saved game files.');}finally{clearTimeout(timeout);}
  }
  function listen(type){
   release();channel=new MessageChannel();
   const resetTimeout=()=>{clearTimeout(timer);timer=setTimeout(()=>{cancel();status.textContent='Download paused. Check your connection and try again.';},45000);};
   channel.port1.onmessage=event=>{
    resetTimeout();const data=event.data;
    if(data.type==='error'){active=false;start.disabled=false;start.textContent='Retry';status.textContent=data.error;release();return;}
    paint(data);
    if(data.type==='progress')status.textContent='Downloading · keep this window open…';
    else{active=false;paint(data);status.textContent=data.type==='complete'?'Game files saved. They will update automatically when needed.':data.type==='cancelled'?'Paused. Saved files will be reused next time.':'Files save automatically as you play. You can download the rest now.';release();}
   };
   resetTimeout();worker.postMessage({type,id:job},[channel.port2]);
  }
  function cancel(){request++;if(active&&worker)worker.postMessage({type:'RPG_FILES_CANCEL',id:job});active=false;start.disabled=false;start.textContent='Download';release();}
  const openFiles=async event=>{returnFocus=event.currentTarget;dialog.showModal();start.disabled=true;status.textContent='';const version=++request;try{await connect();if(version===request&&dialog.open)listen('RPG_FILES_STATUS');}catch(error){if(version===request&&dialog.open){size.textContent='';status.textContent=error.message;start.disabled=true;}}};
  button.onclick=openFiles;if(loadingButton)loadingButton.onclick=openFiles;
  start.onclick=()=>{if(!worker||active)return;active=true;start.disabled=true;job='files-'+Date.now()+'-'+Math.random().toString(36).slice(2);listen('RPG_FILES_DOWNLOAD');};
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{cancel();returnFocus.focus();});
  window.addEventListener('pagehide',cancel);
 });
})();
