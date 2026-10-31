(function(){
 'use strict';
 let panel,input,output,submit,returnFocus,opening=false,running=false,applying=false,polling=false,lastSeen=null,pending=null;
 const history=[];let cursor=0;
 const requestId=()=>crypto.randomUUID?.()||Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
 const help='healme · heal <hero name> · recoverme · recover <hero name>\nUse @username if hero names match. Quotes around names are optional.';
 function line(text,kind=''){const p=document.createElement('p');p.textContent=text;if(kind)p.className='console-'+kind;output.append(p);while(output.childElementCount>60)output.firstElementChild.remove();output.scrollTop=output.scrollHeight;}
 function close(){if(panel?.open)panel.close();returnFocus?.focus?.();}
 function create(){
  panel=document.createElement('dialog');panel.className='rpg-owner-console';panel.id='rpg-owner-console';panel.setAttribute('aria-labelledby','rpg-console-title');
  panel.innerHTML='<header><span id="rpg-console-title">CHESS BURGER · OWNER CONSOLE</span><button type="button" aria-label="Close owner console">×</button></header><div class="rpg-owner-console-output" role="log" aria-live="polite" aria-relevant="additions"></div><form><label for="rpg-console-command">&gt;</label><input id="rpg-console-command" aria-label="Owner command" maxlength="100" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type a command"><button type="submit">Run</button></form><footer>~ toggle · Esc close · ↑ ↓ history · help · clear</footer>';
  document.body.append(panel);input=panel.querySelector('input');output=panel.querySelector('[role="log"]');submit=panel.querySelector('[type="submit"]');
  panel.querySelector('header button').onclick=close;panel.addEventListener('cancel',event=>{event.preventDefault();close();});
  panel.querySelector('form').addEventListener('submit',async event=>{
   event.preventDefault();const command=input.value.trim();if(!command||running)return;input.value='';history.push(command);if(history.length>30)history.shift();cursor=history.length;line('> '+command,'command');
   if(command.toLowerCase()==='clear'){output.replaceChildren();return;}if(command.toLowerCase()==='help'){line(help);return;}
   running=true;input.disabled=true;submit.disabled=true;
   try{const result=await window.RPGLive.ownerConsole({action:'owner_command',command,requestId:requestId()});line(result.message);await poll();}
   catch(error){line(error.message,'error');if(error.status===403)close();}
   finally{running=false;input.disabled=false;submit.disabled=false;if(panel.open)input.focus();}
  });
  input.addEventListener('keydown',event=>{if(!['ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();cursor=Math.max(0,Math.min(history.length,cursor+(event.key==='ArrowUp'?-1:1)));input.value=history[cursor]||'';});line(help);
 }
 async function toggle(){
  if(opening)return;if(panel?.open){close();return;}opening=true;
  try{await window.RPGLive.ownerConsole({action:'owner_console_access'});if(!panel)create();returnFocus=document.activeElement;panel.showModal();input.focus();}
  catch(error){if(error.status!==403){const feedback=document.getElementById('hr-feedback');if(feedback)feedback.textContent=error.message;}}
  finally{opening=false;}
 }
 async function apply(){
  if(applying||!pending)return;applying=true;
  try{if(await window.RPGBattle?.applyOwnerRecovery?.(pending)!==false){
   const snapshot=window.RPGRoom?.snapshot?.();if(snapshot&&pending.resources){snapshot.currentHp=pending.resources.hp;snapshot.currentMp=pending.resources.mp;snapshot.currentAp=pending.resources.ap;window.RPGRoom.accept(snapshot);}
   lastSeen=pending.recovery.id;pending=null;
  }}catch{}finally{applying=false;}
 }
 async function poll(){
  if(polling||applying||document.hidden)return;polling=true;
  try{const data=await window.RPGLive?.recoveryStatus?.(lastSeen);if(data?.recovery)pending=data;await apply();}catch{}finally{polling=false;}
 }
 document.addEventListener('keydown',event=>{
  if(event.repeat||event.isComposing||event.ctrlKey||event.metaKey||event.altKey)return;
  if(event.code==='Backquote'||event.key==='~'||event.key==='`'){event.preventDefault();event.stopImmediatePropagation();void toggle();}
  else if(panel?.open&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}
 },true);
 window.addEventListener('message',event=>{if(event.source===parent&&event.origin===location.origin&&event.data?.type==='CB_RPG_CONSOLE_TOGGLE')void toggle();});
 window.addEventListener('online',()=>void poll());document.addEventListener('visibilitychange',()=>{if(!document.hidden)void poll();});
 setInterval(()=>void poll(),8000);setInterval(()=>{if(pending)void apply();},500);
})();
