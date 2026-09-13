// The preference contains no credentials. Supabase session material follows it.
export function keepLogin(){return typeof window!=='undefined'&&localStorage.getItem('cb-keep-login')!=='false';}
export function setKeepLogin(keep:boolean){
  const source=keepLogin()?localStorage:sessionStorage,target=keep?localStorage:sessionStorage;
  for(const key of ['cb-auth','cb-auth-code-verifier','cb-staff-profile']){const value=source.getItem(key);if(value)target.setItem(key,value);if(source!==target)source.removeItem(key);}
  localStorage.setItem('cb-keep-login',String(keep));
}
export const authStorage={
  getItem:(key:string)=>(keepLogin()?localStorage:sessionStorage).getItem(key),
  setItem:(key:string,value:string)=>(keepLogin()?localStorage:sessionStorage).setItem(key,value),
  removeItem:(key:string)=>{localStorage.removeItem(key);sessionStorage.removeItem(key);},
};
export function clearAccountCache(){for(const key of ['cb-auth','cb-auth-code-verifier','cb-staff-profile','cb-guest-profile','cb-local-rating','cb-active-match']){localStorage.removeItem(key);sessionStorage.removeItem(key);}window.dispatchEvent(new Event('cb-signed-out'));}
