"use client";
import {useState} from "react";
import {Copy,Router,UsersRound,WifiOff} from "lucide-react";
import {toast} from "sonner";

export default function OfflinePairing({start}:{start:()=>void}){
 const[room,setRoom]=useState(""),[joinCode,setJoinCode]=useState("");
 function create(){const code=crypto.randomUUID().replaceAll("-","").slice(0,6).toUpperCase();setRoom(code);}
 return <section className="pairing-page"><div className="page-heading"><h1>Offline pairing</h1><span className="sample-label">No internet</span></div>
  <p className="page-caption">Connect both devices to the same Wi-Fi router or phone hotspot.</p>
  <div className="pairing-options">
   <article><UsersRound/><div><h2>Same-device board</h2><p>Two players share this screen.</p></div><button onClick={start}>Play</button></article>
   <article><Router/><div><h2>Local Wi-Fi room</h2><p>Create a six-character pairing code for a nearby device.</p>{room&&<strong className="room-code">{room}</strong>}</div><button onClick={room?()=>{void navigator.clipboard.writeText(room);toast.success("Room code copied.");}:create}>{room?<Copy/>:"Create"}</button></article>
   <article><WifiOff/><div><h2>Join by code</h2><p>Enter the code shown on the host device.</p><input maxLength={6} value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""))} placeholder="ABC123"/></div><button disabled={joinCode.length!==6} onClick={()=>toast.info("Local device synchronization is in beta.",{description:"Keep both devices on the same router or hotspot."})}>Join</button></article>
  </div><p className="account-note">Bluetooth pairing is not enabled because browser support varies by device. Local Wi-Fi gameplay synchronization is prepared as a beta connection flow.</p>
 </section>;
}
