export function requestRpgLandscape(){
 const lock=()=>{const orientation=screen.orientation as ScreenOrientation&{lock?:(mode:string)=>Promise<void>};return orientation?.lock?.('landscape').catch(()=>{});};
 if(document.fullscreenElement){void lock();return;}
 if(document.documentElement.requestFullscreen)void document.documentElement.requestFullscreen().then(lock).catch(()=>{});
}
