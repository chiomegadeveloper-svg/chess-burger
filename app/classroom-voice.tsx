"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {Room,RoomEvent,Track,type RemoteTrack,type LocalVideoTrack} from "livekit-client";
import {createPortal} from "react-dom";
import {Camera,CameraOff,ExternalLink,Hand,Mic,MicOff,PhoneOff,Radio,Settings,Users,Volume2,X} from "lucide-react";
import {toast} from "sonner";
import {classroom} from "./classroom-client";
import "./classroom-voice.css";

type VoiceRole="teacher"|"student";
type PermissionState="checking"|"prompt"|"granted"|"denied"|"unavailable";
type VoiceCredentials={server_url:string;participant_token:string};
type VideoFeed={id:string;name:string;track:RemoteTrack|LocalVideoTrack;local:boolean};
function VideoTile({feed}:{feed:VideoFeed}){
  const videoRef=useRef<HTMLVideoElement>(null);
  useEffect(()=>{const element=videoRef.current;if(!element)return;feed.track.attach(element);return()=>{feed.track.detach(element)}},[feed.track]);
  return <figure className="seba-video-tile"><video ref={videoRef} autoPlay playsInline muted={feed.local} aria-label={`${feed.name} camera`}/><figcaption>{feed.local?"You":feed.name}</figcaption></figure>;
}

export default function ClassroomVoice({roomId,role,onRaisedHands,students=[],acknowledgedHand}:{roomId:string;role:VoiceRole;onRaisedHands?:(ids:string[])=>void;students?:{user_id:string;display_name?:string;username?:string}[];acknowledgedHand?:{id:string;sequence:number}|null}){
  const [status,setStatus]=useState<"idle"|"starting"|"live">("idle");
  const [permission,setPermission]=useState<PermissionState>("checking");
  const [showPermissionHelp,setShowPermissionHelp]=useState(false);
  const [muted,setMuted]=useState(false);
  const [needsAudioStart,setNeedsAudioStart]=useState(false);
  const [participantCount,setParticipantCount]=useState(0);
  const [cameraOn,setCameraOn]=useState(false);
  const [cameraBusy,setCameraBusy]=useState(false);
  const [handRaised,setHandRaised]=useState(false);
  const [mediaOpen,setMediaOpen]=useState(false);
  const [mediaBusy,setMediaBusy]=useState(false);
  const [unmuteRequested,setUnmuteRequested]=useState(false);
  const [videoFeeds,setVideoFeeds]=useState<VideoFeed[]>([]);
  const [videoHost,setVideoHost]=useState<HTMLElement|null>(null);
  const raisedRef=useRef(new Set<string>());
  const handRaisedRef=useRef(false);
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
    setCameraOn(false);
    setVideoFeeds([]);
    setHandRaised(false);
    setUnmuteRequested(false);
    handRaisedRef.current=false;
    raisedRef.current.clear();
    onRaisedHands?.([]);
  },[clearRemoteAudio,onRaisedHands]);

  const syncVideos=useCallback((liveRoom:Room)=>{
    const feeds:VideoFeed[]=[];
    const local=liveRoom.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack;
    if(local&&!local.isMuted)feeds.push({id:liveRoom.localParticipant.identity,name:"You",track:local,local:true});
    liveRoom.remoteParticipants.forEach(participant=>participant.videoTrackPublications.forEach(publication=>{
      if(publication.videoTrack&&!publication.isMuted)feeds.push({id:participant.identity,name:participant.name||"Participant",track:publication.videoTrack,local:false});
    }));
    setVideoFeeds(feeds);
  },[]);
  const syncHands=useCallback(()=>onRaisedHands?.([...raisedRef.current]),[onRaisedHands]);
  useEffect(()=>{if(acknowledgedHand){raisedRef.current.delete(acknowledgedHand.id);syncHands()}},[acknowledgedHand,syncHands]);
  const sendHand=useCallback(async(raised:boolean)=>{
    const room=roomRef.current;
    if(!room||!room.localParticipant.identity)return;
    await room.localParticipant.publishData(new TextEncoder().encode(raised?"hand:1":"hand:0"),{reliable:true});
  },[]);

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

  const start=useCallback(async(enableMic=true,enableCamera=false)=>{
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
      .on(RoomEvent.TrackSubscribed,(track)=>{attachRemoteAudio(track);if(track.kind===Track.Kind.Video)syncVideos(liveRoom)})
      .on(RoomEvent.TrackUnsubscribed,(track)=>{detachRemoteAudio(track);if(track.kind===Track.Kind.Video)syncVideos(liveRoom)})
      .on(RoomEvent.TrackMuted,()=>syncVideos(liveRoom))
      .on(RoomEvent.TrackUnmuted,()=>syncVideos(liveRoom))
      .on(RoomEvent.ParticipantConnected,()=>{updateCount();if(handRaisedRef.current)void sendHand(true)})
      .on(RoomEvent.ParticipantDisconnected,(participant)=>{updateCount();raisedRef.current.delete(participant.identity);syncHands();syncVideos(liveRoom)})
      .on(RoomEvent.DataReceived,(payload,participant)=>{
        if(payload.length>32)return;
        const message=new TextDecoder().decode(payload);
        if(!participant&&message==="media:camera-off"){
          void liveRoom.localParticipant.setCameraEnabled(false).then(()=>{setCameraOn(false);syncVideos(liveRoom)}).catch(()=>{});return;
        }
        if(role==="student"&&!participant){
          if(message==="hand:ack"){handRaisedRef.current=false;setHandRaised(false);return}
          if(message==="media:mute"){
            void liveRoom.localParticipant.setMicrophoneEnabled(false).then(()=>setMuted(true)).catch(()=>{});
            setUnmuteRequested(false);return;
          }
          if(message==="media:unmute-request"){setUnmuteRequested(true);return}
        }
        if(role!=="teacher"||!participant)return;
        if(message==="hand:1")raisedRef.current.add(participant.identity);
        else if(message==="hand:0")raisedRef.current.delete(participant.identity);
        else return;
        syncHands();
      })
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
        setCameraOn(false);setVideoFeeds([]);setHandRaised(false);setUnmuteRequested(false);handRaisedRef.current=false;raisedRef.current.clear();syncHands();
        toast.error("SEba Voice disconnected. Tap Enable Microphone to reconnect.");
      });
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw Error("Microphone calling is not supported on this browser.");
      const credentials=await classroom<VoiceCredentials>("voice-token",{room_id:roomId});
      await liveRoom.connect(credentials.server_url,credentials.participant_token);
      if(enableMic)await liveRoom.localParticipant.setMicrophoneEnabled(true);
      setMuted(!enableMic);
      if(enableCamera){await liveRoom.localParticipant.setCameraEnabled(true);setCameraOn(true)}
      if(roomRef.current!==liveRoom){await liveRoom.disconnect(true);return}
      setPermission("granted");
      window.localStorage.setItem("seba-voice-enabled","1");
      setParticipantCount(liveRoom.numParticipants);
      setNeedsAudioStart(!liveRoom.canPlaybackAudio);
      setStatus("live");
      syncVideos(liveRoom);
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
  },[attachRemoteAudio,clearRemoteAudio,detachRemoteAudio,leave,roomId,status,role,syncVideos,syncHands,sendHand]);

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
  const toggleCamera=async()=>{
    const room=roomRef.current;if(!room||cameraBusy)return;
    setCameraBusy(true);
    try{
      await room.localParticipant.setCameraEnabled(!cameraOn);
      setCameraOn(!cameraOn);
      syncVideos(room);
    }catch(error){toast.error(error instanceof Error?error.message:"Camera could not start. Allow camera access in your browser.")}
    finally{setCameraBusy(false)}
  };
  const mediaAction=async(operation:"mute-all"|"mute-student"|"request-unmute"|"close-all-cameras",studentId?:string)=>{
    setMediaBusy(true);
    try{await classroom("media-control",{room_id:roomId,operation,student_id:studentId});toast.success(operation==="request-unmute"?"Student asked to turn on their microphone.":operation==="close-all-cameras"?"Class cameras turned off.":"Student microphones muted.")}
    catch(error){toast.error(error instanceof Error?error.message:"Media control failed.")}
    finally{setMediaBusy(false)}
  };
  const acceptUnmute=async()=>{
    const room=roomRef.current;if(!room)return;
    try{await room.localParticipant.setMicrophoneEnabled(true);setMuted(false);setUnmuteRequested(false)}
    catch(error){toast.error(error instanceof Error?error.message:"Microphone could not start.")}
  };
  const toggleHand=async()=>{
    const next=!handRaised;
    try{await sendHand(next);handRaisedRef.current=next;setHandRaised(next)}
    catch{toast.error("Raise hand could not be sent. Reconnect to the classroom.")}
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

  useEffect(()=>{
    setVideoHost(document.getElementById("seba-camera-stage"));
  },[status]);

  return <div className={`classroom-voice ${status}`}>
    <div ref={audioHostRef} className="voice-audio-host" aria-hidden="true"/>
    {status==="idle"?<div className="voice-permission-actions"><button type="button" className={permission==="denied"?"permission-blocked":""} onClick={()=>permission==="denied"?setShowPermissionHelp(true):void start()} aria-label={permission==="denied"?"Open microphone permission help":`Allow microphone and join SEba Voice as ${role}`} data-tooltip={permission==="denied"?"Mic blocked":"Enable microphone"}>{permission==="denied"?<MicOff/>:<Mic/>}</button><button type="button" onClick={()=>void start(false,true)} aria-label="Join with camera and microphone off" data-tooltip="Enable camera"><Camera/></button>{permission==="denied"&&<button type="button" className="voice-settings" onClick={()=>setShowPermissionHelp(true)} aria-label="Microphone settings help" data-tooltip="Microphone settings"><Settings/></button>}</div>:
      status==="starting"?<button type="button" disabled aria-label="Connecting to SEba Voice" data-tooltip="Connecting to voice"><Radio/></button>:<>
        <span role="status" aria-label={`${participantCount} people connected to SEba Voice`} data-tooltip={`${participantCount} on voice`}><Radio/></span>
        {needsAudioStart&&<button type="button" className="enable-sound" onClick={()=>void enableSound()} aria-label="Enable Sound" data-tooltip="Enable Sound"><Volume2/></button>}
        <button type="button" className={muted?"muted":""} onClick={()=>void toggleMute()} aria-label={muted?"Unmute microphone":"Mute microphone"} data-tooltip={muted?"Unmute microphone":"Mute microphone"}>{muted?<MicOff/>:<Mic/>}</button>
        <button type="button" disabled={cameraBusy} className={cameraOn?"camera-on":""} onClick={()=>void toggleCamera()} aria-label={cameraOn?"Turn camera off":"Turn camera on"} data-tooltip={cameraOn?"Turn camera off":"Turn camera on"}>{cameraOn?<Camera/>:<CameraOff/>}</button>
        {role==="teacher"&&<button type="button" aria-expanded={mediaOpen} onClick={()=>setMediaOpen(value=>!value)} aria-label="Class media controls" data-tooltip="Class media controls"><Users/></button>}
        {role==="student"&&<button type="button" className={handRaised?"hand-raised":""} onClick={()=>void toggleHand()} aria-pressed={handRaised} aria-label={handRaised?"Lower hand":"Raise hand"} data-tooltip={handRaised?"Lower hand":"Raise hand"}><Hand/></button>}
        <button type="button" className="leave-voice" onClick={leave} aria-label="Leave Classroom Voice" data-tooltip="Leave classroom voice"><PhoneOff/></button>
      </>}
    {role==="teacher"&&mediaOpen&&status==="live"&&<div className="seba-media-controls" role="dialog" aria-label="Class media controls"><header><strong>Class media</strong><button type="button" onClick={()=>setMediaOpen(false)} aria-label="Close media controls"><X/></button></header><div className="seba-media-actions"><button disabled={mediaBusy} onClick={()=>void mediaAction("mute-all")}><MicOff/>Mute all students</button><button disabled={mediaBusy} onClick={()=>void mediaAction("close-all-cameras")}><CameraOff/>Close all cameras</button></div><p>Students choose whether to accept an unmute request. Cameras can only be turned on by their owners.</p>{students.map(student=><div className="seba-media-student" key={student.user_id}><b>{student.display_name||student.username||"Student"}</b><button disabled={mediaBusy} onClick={()=>void mediaAction("mute-student",student.user_id)} aria-label={`Mute ${student.display_name||student.username||"student"}`}><MicOff/>Mute</button><button disabled={mediaBusy} onClick={()=>void mediaAction("request-unmute",student.user_id)} aria-label={`Ask ${student.display_name||student.username||"student"} to unmute`}><Mic/>Ask to unmute</button></div>)}</div>}
    {role==="student"&&unmuteRequested&&<div className="seba-unmute-request" role="alert"><span>Teacher asks you to unmute your microphone.</span><button type="button" onClick={()=>void acceptUnmute()}>Unmute</button><button type="button" onClick={()=>setUnmuteRequested(false)}>Stay muted</button></div>}
    {videoHost&&videoFeeds.length>0&&createPortal(<div className="seba-camera-strip" aria-label="Live classroom cameras">{videoFeeds.map(feed=><VideoTile key={feed.id} feed={feed}/>)}</div>,videoHost)}
    {showPermissionHelp&&<div className="voice-permission-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowPermissionHelp(false)}}><section className="voice-permission-dialog" role="dialog" aria-modal="true" aria-labelledby="voice-permission-title"><button type="button" className="voice-dialog-close" onClick={()=>setShowPermissionHelp(false)} aria-label="Close microphone help"><X/></button><div className="voice-dialog-icon"><MicOff/></div><h2 id="voice-permission-title">Allow microphone access</h2><p>For privacy, SEba cannot switch on a blocked microphone by itself. Change the permission, return here, then tap <b>Try Microphone Again</b>.</p><ol>{isIOS?<><li>Open the iPhone or iPad <b>Settings</b> app.</li><li>Open <b>Safari</b>, then <b>Microphone</b>, and choose <b>Allow</b>. You can also tap <b>aA</b> in Safari’s address bar → <b>Website Settings</b> → <b>Microphone</b> → <b>Allow</b>.</li></>:isAndroid?<><li>Tap the lock or site-settings icon beside the Chrome address.</li><li>Open <b>Permissions</b> → <b>Microphone</b> → <b>Allow</b>.</li><li>If Android privacy blocks it: <b>Settings</b> → <b>Privacy</b> → turn on <b>Microphone access</b>, then allow Chrome.</li></>:<><li>Click the lock or site-settings icon beside the browser address.</li><li>Set <b>Microphone</b> to <b>Allow</b>, then reload if your browser asks you to.</li></>}</ol><div className="voice-dialog-actions"><button type="button" onClick={()=>{setShowPermissionHelp(false);void start()}}><Mic/>Try Microphone Again</button><button type="button" className="voice-help-link" onClick={()=>window.open("https://support.google.com/chrome/answer/2693767","_blank","noopener,noreferrer")}><ExternalLink/>Browser Help</button></div></section></div>}
  </div>;
}
