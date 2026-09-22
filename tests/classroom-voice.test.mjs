import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const voice=fs.readFileSync("app/classroom-voice.tsx","utf8");
const workshop=fs.readFileSync("app/classroom-workshop.tsx","utf8");
const css=fs.readFileSync("app/classroom-voice.css","utf8");

test("Classroom workshop offers cost-free room-scoped voice",()=>{
  assert.match(workshop,/ClassroomVoice/);
  assert.match(workshop,/roomId=\{roomId\}/);
  assert.match(voice,/navigator\.mediaDevices\.getUserMedia/);
  assert.match(voice,/new RTCPeerConnection/);
  assert.match(voice,/classroom-voice:\$\{roomId\}/);
  assert.match(voice,/event:"voice-signal"/);
  assert.match(voice,/presence:\{key:session\.user\.id\}/);
});

test("Classroom Voice supports permission errors, mute, leave and cleanup",()=>{
  assert.match(voice,/NotAllowedError/);
  assert.match(voice,/echoCancellation:true/);
  assert.match(voice,/noiseSuppression:true/);
  assert.match(voice,/track\.enabled=!next/);
  assert.match(voice,/getTracks\(\)\.forEach\(track=>track\.stop\(\)\)/);
  assert.match(voice,/removeChannel/);
  assert.match(css,/leave-voice/);
});

test("Classroom Voice stores no audio and uses free WebRTC signaling",()=>{
  assert.doesNotMatch(voice,/MediaRecorder/);
  assert.doesNotMatch(voice,/upload/);
  assert.match(voice,/stun:stun\.l\.google\.com:19302/);
  assert.match(voice,/RemoteAudio/);
});


test("SEba Voice is pre-activated when the workshop opens",()=>{
  assert.match(voice,/autoStartedRef/);
  assert.match(voice,/autoStartedRef\.current=true/);
  assert.match(voice,/void start\(\)/);
  assert.match(voice,/Retry SEba Voice/);
});
