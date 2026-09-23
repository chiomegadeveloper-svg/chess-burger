import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const voice=fs.readFileSync("app/classroom-voice.tsx","utf8");
const workshop=fs.readFileSync("app/classroom-workshop.tsx","utf8");
const css=fs.readFileSync("app/classroom-voice.css","utf8");

test("Classroom workshop uses LiveKit Cloud room audio",()=>{
  assert.match(workshop,/ClassroomVoice/);
  assert.match(workshop,/roomId=\{roomId\}/);
  assert.match(voice,/from "livekit-client"/);
  assert.match(voice,/new Room\(/);
  assert.match(voice,/"voice-token",\{room_id:roomId\}/);
  assert.match(voice,/liveRoom\.connect\(credentials\.server_url,credentials\.participant_token\)/);
  assert.match(voice,/RoomEvent\.TrackSubscribed/);
  assert.match(voice,/RoomEvent\.TrackUnsubscribed/);
  assert.doesNotMatch(voice,/RTCPeerConnection/);
  assert.doesNotMatch(voice,/voice-signal/);
  assert.doesNotMatch(voice,/stun:stun\.l\.google\.com/);
});

test("Classroom Voice supports permission errors, mute, leave and cleanup",()=>{
  assert.match(voice,/NotAllowedError/);
  assert.match(voice,/echoCancellation:true/);
  assert.match(voice,/noiseSuppression:true/);
  assert.match(voice,/setMicrophoneEnabled\(!next\)/);
  assert.match(voice,/room\.disconnect\(true\)/);
  assert.match(voice,/track\.detach\(\)\.forEach/);
  assert.match(css,/leave-voice/);
});

test("Classroom Voice attaches remote audio and recovers from autoplay blocking",()=>{
  assert.match(voice,/track\.attach\(\)/);
  assert.match(voice,/RoomEvent\.AudioPlaybackStatusChanged/);
  assert.match(voice,/room\.startAudio\(\)/);
  assert.match(voice,/Enable Sound/);
  assert.doesNotMatch(voice,/MediaRecorder/);
  assert.doesNotMatch(voice,/upload/);
});

test("SEba Voice is pre-activated when the workshop opens",()=>{
  assert.match(voice,/autoStartedRef/);
  assert.match(voice,/autoStartedRef\.current=true/);
  assert.match(voice,/navigator\.permissions\.query/);
  assert.match(voice,/permissionStatus\.state==="granted"/);
  assert.match(voice,/seba-voice-enabled/);
  assert.match(voice,/Enable Microphone/);
  assert.match(voice,/Mic blocked/);
});

test("Blocked microphones show recovery steps for Safari, Chrome and Android privacy",()=>{
  assert.match(voice,/Allow microphone access/);
  assert.match(voice,/Try Microphone Again/);
  assert.match(voice,/Website Settings/);
  assert.match(voice,/Android privacy blocks it/);
  assert.match(voice,/visibilitychange/);
  assert.match(css,/voice-permission-dialog/);
});

test("Microphone is explicitly permitted for same-origin classrooms",()=>{
  const nextConfig=fs.readFileSync("next.config.ts","utf8");
  const vercelConfig=fs.readFileSync("vercel.json","utf8");
  assert.match(nextConfig,/microphone=\(self\)/);
  assert.match(vercelConfig,/microphone=\(self\)/);
  assert.match(nextConfig,/camera=\(self\)/);
  assert.match(vercelConfig,/camera=\(self\)/);
});

test("Live camera starts off and raise hand reaches the teacher board",()=>{
  assert.match(voice,/setCameraEnabled\(!cameraOn\)/);
  assert.match(voice,/RoomEvent\.DataReceived/);
  assert.match(voice,/publishData\(/);
  assert.match(workshop,/raisedHands\.includes\(s\.user_id\)/);
  assert.match(workshop,/id="seba-camera-stage"/);
});
