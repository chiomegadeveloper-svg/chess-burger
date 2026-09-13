import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encodeSignal,decodeSignal,LanConnection} from '../app/lan-connection.ts';
const player=id=>({user_id:id,display_name:id,username:id,avatar_url:'',country_code:'PH',cbr:88,gold_points:0,wins:0,losses:0,win_streak:0});
class Peer{iceGatheringState='complete';createDataChannel(){return {readyState:'open',send(){},close(){}};}close(){} }
test('Offline QR codes round-trip connection details and reject unrelated/malformed input',async()=>{
 const original={v:1,room:crypto.randomUUID(),description:{type:'offer',sdp:'v=0\r\na=ice-ufrag:abc\r\n'}};assert.deepEqual(await decodeSignal(await encodeSignal(original)),original);await assert.rejects(decodeSignal('123456'),/pairing/);await assert.rejects(decodeSignal('CBLZ.invalid'),/Invalid/);await assert.rejects(decodeSignal('CBL1.'+'x'.repeat(13000)),/pairing/);
});
test('Local host enforces its clock, move order and legality across exchanged messages',()=>{
 globalThis.RTCPeerConnection=Peer;const states=[];const host=new LanConnection(true,{...player('host'),featured_photos:['private photo']},'3+2',m=>states.push(m),()=>{});const guest=new LanConnection(false,player('guest'),'1+0',()=>{},()=>{},host.room);
 host.channel.send=raw=>guest.receive(JSON.parse(raw));guest.attach({readyState:'open',send:raw=>host.receive(JSON.parse(raw)),close(){}});guest.channel.onopen();assert.equal(host.match.control,'3+2');assert.equal(guest.match.control,'3+2');assert.equal(host.match.white_ms,180000);assert.equal('featured_photos' in host.own,false);assert.equal(host.match.black_id,'guest');guest.action({from:'e7',to:'e5'});assert.equal(host.match.version,0);host.action({from:'e2',to:'e5'});assert.equal(host.match.version,0);host.action({from:'e2',to:'e4'});assert.equal(host.match.version,1);assert.equal(guest.match.pgn,host.match.pgn);guest.action({from:'e7',to:'e5'});assert.equal(host.match.version,2);assert.equal(host.match.black_ms>=181900,true);guest.action(undefined,true);assert.equal(host.match.result,'white');assert.equal(guest.match.status,'finished');host.close();guest.close();
});
