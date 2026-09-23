"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {Room,RoomEvent,Track,type RemoteTrack} from "livekit-client";
import {ExternalLink,Mic,MicOff,PhoneOff,Radio,Settings,Volume2,X} from "lucide-react";
import {toast} from "sonner";
import {classroom} from "./classroom-client";
import "./classroom-voice.css";

type VoiceRole="teacher"|"student";
type PermissionState="checking"|"prompt"|"granted"|"denied"|"unavailable";
type VoiceCredentials={server_url:string;participant_token:string};

export default function ClassroomVoice({roomId,role}:{roomId:string;role:VoiceRole}){
  const [status,setStatus]=useState<"idle"|"starting"|"live">("idle");
  const [permission,setPermission]=useState<PermissionState>("checking");
  const [showPermissionHelp,setShowPermissionHelp]=useState(false);
  const [muted,setMuted]=useState(false);
  const [needsAudioStart,setNeedsAudioStart]=useState(false);
  const [participantCount,setParticipantCount]=useState(0);
  const roomRef=useRef<Room|null>(null);
  const audioHostRef=useRef<HTMLDivElement|null>(null);
  const autoStartedRef=useRef(false);
  const startingRef=useRef(false);
  const isIOS=typeof navigator!=="undefined"&&/iPad|iPhone|iPod/.test(navigator.userAgent);
  const isAndroid=typeof navigator!=="undefined"&&/Android/i.test(navigator.userAgent);

  const clearRemoteAudio=useCallback(()=>{
    audioHostRef.current?.querySelectorAll("audio").forEach(element=>element.remove());
  },[]);

  const leave=useCallback(()=>{
    const room=roomRef.current;
    roomRef.current=null;
    startingRef.current=false;
    if(room)void room.disconnect(true);
    clearRemoteAudio();
    setParticipantCount(0);
    setMuted(false);
    setNeedsAudioStart(false);
    setStatus("idle");
  },[clearRemoteAudio]);

  const attachRemoteAudio=useCallback((track:RemoteTrack)=>{
    if(track.kind!==Track.Kind.Audio||!audioHostRef.current)return;
    const element=track.attach();
    element.autoplay=true;
    element.setAttribute("playsinline","");
    audioHostRef.current.appendChild(element);
    void element.play().catch(()=>setNeedsAudioStart(true));
  },[]);

  const detachRemoteAudio=useCallback((track:RemoteTrack)=>{
    track.detach().forEach(element=>element.remove());
  },[]);

  const start=useCallback(async()=>{
    if(status!=="idle"||startingRef.current)return;
    startingRef.current=true;
    setStatus("starting");
    const liveRoom=new Room({
      adaptiveStream:true,
      dynacast:true,
      audioCaptureDefaults:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}
    });
    roomRef.current=liveRoom;
    const updateCount=()=>setParticipantCount(liveRoom.numParticipants);
    liveRoom
      .on(RoomEvent.TrackSubscribed,(track)=>attachRemoteAudio(track))
      .on(RoomEvent.TrackUnsubscribed,(track)=>detachRemoteAudio(track))
      .on(RoomEvent.ParticipantConnected,updateCount)
      .on(RoomEvent.ParticipantDisconnected,updateCount)
      .on(RoomEvent.AudioPlaybackStatusChanged,(playing)=>setNeedsAudioStart(!playing))
      .on(RoomEvent.MediaDevicesError,(error)=>{
        if(error.name==="NotAllowedError"){
          setPermission("denied");
          setShowPermissionHelp(true);
          window.localStorage.removeItem("seba-voice-enabled");
        }
      })
      .on(RoomEvent.Disconnected,()=>{
        if(roomRef.current!==liveRoom)return;
        roomRef.current=null;
        startingRef.current=false;
        clearRemoteAudio();
        setParticipantCount(0);
        setMuted(false);
        setNeedsAudioStart(false);
        setStatus("idle");
        toast.error("SEba Voice disconnected. Tap Enable Microphone to reconnect.");
      });
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw Error("Microphone calling is not supported on this browser.");
      const credentials=await classroom<VoiceCredentials>("voice-token",{room_id:roomId});
      await liveRoom.connect(credentials.server_url,credentials.participant_token);
      await liveRoom.localParticipant.setMicrophoneEnabled(true);
      if(roomRef.current!==liveRoom){await liveRoom.disconnect(true);return}
      setPermission("granted");
      window.localStorage.setItem("seba-voice-enabled","1");
      setParticipantCount(liveRoom.numParticipants);
      setNeedsAudioStart(!liveRoom.canPlaybackAudio);
      setStatus("live");
    }catch(error){
      if(roomRef.current===liveRoom)leave();
      else await liveRoom.disconnect(true).catch(()=>{});
      if(error instanceof DOMException&&error.name==="NotAllowedError"){
        setPermission("denied");
        setShowPermissionHelp(true);
        window.localStorage.removeItem("seba-voice-enabled");
      }
      const message=error instanceof DOMException&&error.name==="NotAllowedError"?"Microphone is blocked. Allow it in this site’s browser settings, then tap Enable Microphone.":error instanceof Error?error.message:"Microphone could not start.";
      toast.error(message);
    }finally{startingRef.current=false}
  },[attachRemoteAudio,clearRemoteAudio,detachRemoteAudio,leave,roomId,status]);

  const refreshPermission=useCallback(async()=>{
    if(!navigator.mediaDevices?.getUserMedia){setPermission("unavailable");return}
    try{
      const result=await navigator.permissions.query({name:"microphone" as PermissionName});
      setPermission(result.state);
      if(result.state==="granted"&&status==="idle")void start();
    }catch{
      // Safari does not consistently expose microphone through Permissions API.
      setPermission(current=>current==="denied"?current:"prompt");
    }
  },[start,status]);

  const toggleMute=async()=>{
    const room=roomRef.current;if(!room)return;
    const next=!muted;
    try{await room.localParticipant.setMicrophoneEnabled(!next);setMuted(next)}
    catch(error){toast.error(error instanceof Error?error.message:"Microphone could not be changed.")}
  };

  const enableSound=async()=>{
    const room=roomRef.current;if(!room)return;
    try{await room.startAudio();setNeedsAudioStart(false)}
    catch{toast.error("Your browser still blocked classroom audio. Tap the site settings and allow sound.")}
  };

  useEffect(()=>{
    if(autoStartedRef.current)return;
    autoStartedRef.current=true;
    let active=true,permissionStatus:PermissionStatus|null=null;
    const prepare=async()=>{
      if(!navigator.mediaDevices?.getUserMedia){if(active)setPermission("unavailable");return}
      try{
        permissionStatus=await navigator.permissions.query({name:"microphone" as PermissionName});
        if(!active)return;
        setPermission(permissionStatus.state);
        permissionStatus.onchange=()=>{
          const next=permissionStatus?.state||"prompt";
          setPermission(next);
          if(next==="granted")void start();
        };
        if(permissionStatus.state==="granted")void start();
      }catch{
        setPermission("prompt");
        if(window.localStorage.getItem("seba-voice-enabled")==="1")void start();
      }
    };
    void prepare();
    return()=>{active=false;if(permissionStatus)permissionStatus.onchange=null};
  },[start]);

  useEffect(()=>leave,[leave,roomId]);

  useEffect(()=>{
    const checkAfterSettings=()=>{if(document.visibilityState==="visible")void refreshPermission()};
    document.addEventListener("visibilitychange",checkAfterSettings);
    return()=>document.removeEventListener("visibilitychange",checkAfterSettings);
  },[refreshPermission]);

  return <div className={`classroom-voice ${status}`}>
    <div ref={audioHostRef} className="voice-audio-host" aria-hidden="true"/>
    {status==="idle"?<div className="voice-permission-actions"><button type="button" className={permission==="denied"?"permission-blocked":""} onClick={()=>permission==="denied"?setShowPermissionHelp(true):void start()} aria-label={permission==="denied"?"Open microphone permission help":`Allow microphone and join SEba Voice as ${role}`} data-tooltip={permission==="denied"?"Mic blocked":"Enable microphone"}>{permission==="denied"?<MicOff/>:<Mic/>}</button>{permission==="denied"&&<button type="button" className="voice-settings" onClick={()=>setShowPermissionHelp(true)} aria-label="Microphone settings help" data-tooltip="Microphone settings"><Settings/></button>}</div>:
      status==="starting"?<button type="button" disabled aria-label="Connecting to SEba Voice" data-tooltip="Connecting to voice"><Radio/></button>:<>
        <span role="status" aria-label={`${participantCount} people connected to SEba Voice`} data-tooltip={`${participantCount} on voice`}><Radio/></span>
        {needsAudioStart&&<button type="button" className="enable-sound" onClick={()=>void enableSound()} aria-label="Enable Sound" data-tooltip="Enable Sound"><Volume2/></button>}
        <button type="button" className={muted?"muted":""} onClick={()=>void toggleMute()} aria-label={muted?"Unmute microphone":"Mute microphone"} data-tooltip={muted?"Unmute microphone":"Mute microphone"}>{muted?<MicOff/>:<Mic/>}</button>
        <button type="button" className="leave-voice" onClick={leave} aria-label="Leave Classroom Voice" data-tooltip="Leave classroom voice"><PhoneOff/></button>
      </>}
    {showPermissionHelp&&<div className="voice-permission-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowPermissionHelp(false)}}><section className="voice-permission-dialog" role="dialog" aria-modal="true" aria-labelledby="voice-permission-title"><button type="button" className="voice-dialog-close" onClick={()=>setShowPermissionHelp(false)} aria-label="Close microphone help"><X/></button><div className="voice-dialog-icon"><MicOff/></div><h2 id="voice-permission-title">Allow microphone access</h2><p>For privacy, SEba cannot switch on a blocked microphone by itself. Change the permission, return here, then tap <b>Try Microphone Again</b>.</p><ol>{isIOS?<><li>Open the iPhone or iPad <b>Settings</b> app.</li><li>Open <b>Safari</b>, then <b>Microphone</b>, and choose <b>Allow</b>. You can also tap <b>aA</b> in Safari’s address bar → <b>Website Settings</b> → <b>Microphone</b> → <b>Allow</b>.</li></>:isAndroid?<><li>Tap the lock or site-settings icon beside the Chrome address.</li><li>Open <b>Permissions</b> → <b>Microphone</b> → <b>Allow</b>.</li><li>If Android privacy blocks it: <b>Settings</b> → <b>Privacy</b> → turn on <b>Microphone access</b>, then allow Chrome.</li></>:<><li>Click the lock or site-settings icon beside the browser address.</li><li>Set <b>Microphone</b> to <b>Allow</b>, then reload if your browser asks you to.</li></>}</ol><div className="voice-dialog-actions"><button type="button" onClick={()=>{setShowPermissionHelp(false);void start()}}><Mic/>Try Microphone Again</button><button type="button" className="voice-help-link" onClick={()=>window.open("https://support.google.com/chrome/answer/2693767","_blank","noopener,noreferrer")}><ExternalLink/>Browser Help</button></div></section></div>}
  </div>;
}
