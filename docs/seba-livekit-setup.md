# SEba Voice: LiveKit Cloud setup

SEba uses LiveKit Cloud for classroom audio, optional live camera, and raise-hand messages. Supabase remains the identity and classroom-access authority: the browser sends its Supabase access token to `/api/classroom`, and the server returns a short-lived, room-scoped LiveKit participant token only when that user is the active teacher or has active paid student access.

## Required Vercel environment variables

Create a LiveKit Cloud project, then add these values in Vercel Project Settings → Environment Variables:

```text
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret
```

Apply them to Production and Preview as needed, then redeploy. Never expose the API secret through a `NEXT_PUBLIC_` or `VITE_` variable.

No database migration is required. The token endpoint authorizes against the existing `cb_classroom_rooms` and `cb_classroom_enrollments` records.

## Security and behavior

- Participant identity is the authenticated Supabase user ID.
- Room names use the classroom UUID and contain no profile data.
- Tokens expire after 10 minutes and can only join their assigned room.
- Participants may publish microphone audio and camera video, subscribe to the room, and send raise-hand status through LiveKit data messages. Camera starts off and requires a deliberate tap.
- Students can raise or lower a hand after connecting. The teacher sees a large orange badge on that student's board. Raise-hand status is live room state, so it clears when a student disconnects.
- The camera toggle works for teacher and students; turning it off stops publishing camera video. Audio and camera use the same room and the existing LiveKit credentials.
- LiveKit Cloud's Build plan includes monthly WebRTC minutes and downstream transfer. Video can consume the transfer allowance quickly in large classes; check the project's Usage dashboard.
- Teachers must own an active room. Students must have unexpired paid enrollment.
