import {boardResult,gameFromPgn,timeControl,type ArenaMatch,type ArenaPlayer} from './game-rules.ts';
export type Signal={v:1;room:string;description:RTCSessionDescriptionInit};
export async function encodeSignal(signal:Signal){
 const bytes=new TextEncoder().encode(JSON.stringify(signal));
 if(typeof CompressionStream==='undefined')return 'CBL1.'+btoa(String.fromCharCode(...bytes));
 const stream=new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
 return 'CBLZ.'+btoa(String.fromCharCode(...new Uint8Array(await new Response(stream).arrayBuffer())));
}
export async function decodeSignal(code:string):Promise<Signal>{
 const text=code.trim();if(text.length>12000||!/^CBL[1Z]\./.test(text))throw Error('Scan the host’s local pairing QR or paste its full pairing code.');
 try{let bytes=Uint8Array.from(atob(text.slice(5)),c=>c.charCodeAt(0));if(text.startsWith('CBLZ.')){const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));const reader=stream.getReader();const chunks:Uint8Array[]=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16000){await reader.cancel();throw Error('Invalid pairing code.');}chunks.push(value);}bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}}
  const s=JSON.parse(new TextDecoder().decode(bytes));if(s.v!==1||typeof s.room!=='string'||s.room.length>40||!['offer','answer'].includes(s.description?.type)||typeof s.description?.sdp!=='string')throw Error();return s;
 }catch{throw Error('Invalid or unsupported pairing code. Please scan it again.');}
}
export class LanConnection {
 pc:RTCPeerConnection;channel:RTCDataChannel|null=null;host:boolean;room:string;own:ArenaPlayer;control:string;match:ArenaMatch|null=null;guest:ArenaPlayer|null=null;peer:ArenaPlayer|null=null;guestReady=false;closed=false;timer:ReturnType<typeof setInterval>|null=null;
 onState:(match:ArenaMatch)=>void;onStatus:(status:string)=>void;
 constructor(host:boolean,own:ArenaPlayer,control:string,onState:(match:ArenaMatch)=>void,onStatus:(s:string)=>void,room=crypto.randomUUID()){
  this.host=host;this.own={user_id:own.user_id,display_name:own.display_name,username:own.username,avatar_url:/^https:\/\//.test(own.avatar_url)?own.avatar_url.slice(0,500):"",country_code:own.country_code,cbr:own.cbr,gold_points:0,wins:own.wins,losses:own.losses,win_streak:own.win_streak};this.control=control;this.room=room;this.onState=onState;this.onStatus=onStatus;
  this.pc=new RTCPeerConnection({iceServers:[]});
  this.pc.onconnectionstatechange=()=>{const state=this.pc.connectionState;onStatus(state==='connected'?'Connected over local Wi-Fi':state==='failed'?'Connection failed. Check that your hotspot allows devices to communicate.':state==='disconnected'?'Disconnected. Reconnect to the same Wi-Fi network.':state);};
  this.pc.ondatachannel=e=>this.attach(e.channel);if(host)this.attach(this.pc.createDataChannel('chess-burger',{ordered:true}));
 }
 attach(channel:RTCDataChannel){this.channel=channel;channel.onopen=()=>{this.send({type:'hello',player:this.own});this.onStatus(this.host?'Guest connected. Waiting for Ready.':'Connected. Press Ready to play.');};channel.onclose=()=>this.onStatus('Connection closed. Your replay is saved on this device.');channel.onmessage=e=>{try{if(typeof e.data!=='string'||e.data.length>30000)return;this.receive(JSON.parse(e.data));}catch{this.onStatus('An invalid game message was rejected.');}};}
 send(value:unknown){if(this.channel?.readyState==='open')this.channel.send(JSON.stringify(value));}
 receive(message:any){
  if(message.type==='hello'&&!this.match){const p=message.player;if(!p||typeof p.user_id!=='string'||p.user_id===this.own.user_id||typeof p.display_name!=='string')return;
   const player={user_id:p.user_id.slice(0,80),display_name:p.display_name.slice(0,60),username:String(p.username??'player').slice(0,24),avatar_url:typeof p.avatar_url==='string'&&/^https:\/\//.test(p.avatar_url)?p.avatar_url.slice(0,500):'',country_code:String(p.country_code??'').slice(0,3),cbr:Number.isFinite(p.cbr)?Math.max(0,Math.min(100000,p.cbr)):88,gold_points:0,wins:0,losses:0,win_streak:0};
   this.peer=player;if(this.host){this.guest=player;this.onStatus(`${player.display_name} connected. Waiting for Ready.`);}else this.onStatus(`Connected to ${player.display_name}. Press Ready to play.`);
  }else if(message.type==='ready'&&this.host&&this.guest&&!this.match){this.guestReady=true;this.onStatus(`${this.guest.display_name} is ready. Press Start game.`);}
  else if(message.type==='action'&&this.host)this.apply(message.move,message.resign,this.match?.black_id??'',message.version);
  else if(message.type==='state'&&!this.host){const m=message.match as ArenaMatch;if(m?.id!==this.room||!m.black_id||m.black_id!==this.own.user_id||typeof m.pgn!=='string'||!['active','finished'].includes(m.status)||!['white','black','draw',null].includes(m.result)||!Number.isInteger(m.version)||m.version<0||![m.white_ms,m.black_ms,m.last_tick].every(Number.isFinite)||!m.white||!m.black||m.white_id===m.black_id)return;timeControl(m.control);gameFromPgn(m.pgn);if(this.match&&m.version<this.match.version)return;this.match=m;this.onState({...m,server_now:m.server_now??Date.now()});}
 }
 publish(){if(!this.match)return;const snapshot={...this.match,server_now:Date.now()};this.onState(snapshot);this.send({type:'state',match:snapshot});}
 ready(){if(this.host||this.match||this.channel?.readyState!=='open')return;this.send({type:'ready'});this.onStatus('Ready sent. Waiting for the host to start.');}
 start(){if(!this.host||!this.guestReady||!this.guest||this.match)return;const guest=this.guest,t=timeControl(this.control);this.match={id:this.room,host_id:this.own.user_id,white_id:this.own.user_id,black_id:guest.user_id,invite_to:null,code:this.room.slice(0,8),control:this.control,status:'active',pgn:'',white_ms:t.seconds*1000,black_ms:t.seconds*1000,last_tick:Date.now(),version:0,result:null,white_cbr:this.own.cbr,black_cbr:guest.cbr,rating_applied:0,created_at:Date.now(),white:{...this.own,avatar_url:''},black:guest};this.publish();this.timer=setInterval(()=>this.checkClock(),250);}
 checkClock(){const m=this.match;if(!m||m.status!=='active')return;const chess=gameFromPgn(m.pgn),white=chess.turn()==='w';if((white?m.white_ms:m.black_ms)-(Date.now()-m.last_tick)<=0){m.status='finished';m.result=chess.isInsufficientMaterial()?'draw':white?'black':'white';m.version++;this.publish();}}
 apply(move:any,resign:boolean,actor:string,version:number){
  this.checkClock();const m=this.match;if(!m||m.status!=='active'||m.version!==version)return;const chess=gameFromPgn(m.pgn),white=chess.turn()==='w';
  if(resign)m.result=actor===m.white_id?'black':'white';else {if(actor!==(white?m.white_id:m.black_id))return;const actionAt=Date.now(),remaining=(white?m.white_ms:m.black_ms)-Math.max(0,actionAt-m.last_tick);if(remaining<=0){if(white)m.white_ms=0;else m.black_ms=0;m.result=white?'black':'white';m.status='finished';m.version++;m.last_tick=actionAt;this.publish();return;}try{chess.move({from:move.from,to:move.to,promotion:move.promotion??'q'});}catch{return;}const inc=timeControl(m.control).increment*1000;if(white)m.white_ms=remaining+inc;else m.black_ms=remaining+inc;m.pgn=chess.pgn();m.result=boardResult(chess);}
  m.version++;m.last_tick=Date.now();if(m.result)m.status='finished';this.publish();
 }
 action(move?:{from:string;to:string;promotion?:string},resign=false){if(!this.match)return;if(this.host)this.apply(move,resign,this.own.user_id,this.match.version);else this.send({type:'action',move,resign,version:this.match.version});}
 async gather(){if(this.pc.iceGatheringState==='complete')return;await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{cleanup();reject(Error('Local address discovery timed out. Retry on the same Wi-Fi network.'));},12000);const done=()=>{if(this.pc.iceGatheringState==='complete'){cleanup();resolve();}};const cleanup=()=>{clearTimeout(timer);this.pc.removeEventListener('icegatheringstatechange',done);};this.pc.addEventListener('icegatheringstatechange',done);done();});}
 async offer(){await this.pc.setLocalDescription(await this.pc.createOffer());await this.gather();return encodeSignal({v:1,room:this.room,description:this.pc.localDescription!});}
 async answer(signal:Signal){if(signal.description.type!=='offer')throw Error('Scan the host’s offer first.');await this.pc.setRemoteDescription(signal.description);await this.pc.setLocalDescription(await this.pc.createAnswer());await this.gather();return encodeSignal({v:1,room:this.room,description:this.pc.localDescription!});}
 async finish(signal:Signal){if(signal.room!==this.room||signal.description.type!=='answer')throw Error('This reply belongs to a different pairing.');await this.pc.setRemoteDescription(signal.description);}
 close(){this.closed=true;if(this.timer)clearInterval(this.timer);this.channel?.close();this.pc.close();}
}
