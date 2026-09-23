import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const api=fs.readFileSync("api/classroom.ts","utf8");

test("LiveKit tokens require authenticated Supabase classroom access",()=>{
  assert.match(api,/AccessToken, TrackSource/);
  assert.match(api,/from "livekit-server-sdk"/);
  assert.match(api,/client\.auth\.getUser\(token\)/);
  assert.match(api,/action==="voice-token"/);
  assert.match(api,/cb_classroom_rooms/);
  assert.match(api,/cb_classroom_enrollments/);
  assert.match(api,/gt\("access_expires_at",now\)/);
});

test("LiveKit credentials are server-only, short-lived and microphone-scoped",()=>{
  assert.match(api,/process\.env\.LIVEKIT_URL/);
  assert.match(api,/process\.env\.LIVEKIT_API_KEY/);
  assert.match(api,/process\.env\.LIVEKIT_API_SECRET/);
  assert.match(api,/ttl:"10m"/);
  assert.match(api,/identity:userId/);
  assert.match(api,/room:`seba-\$\{roomId\}`/);
  assert.match(api,/roomJoin:true/);
  assert.match(api,/canPublishSources:\[TrackSource\.MICROPHONE\]/);
  assert.match(api,/canSubscribe:true/);
  assert.match(api,/canPublishData:false/);
  assert.match(api,/participant_token:await accessToken\.toJwt\(\)/);
  assert.match(api,/server_url:livekitUrl/);
});
