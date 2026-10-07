export async function readArenaResponse<T>(response:Response,fallback='Grand Arena is temporarily unavailable. Please try again shortly.'):Promise<T>{
  let data:unknown;
  try{data=await response.json();}catch{throw Error(fallback);}
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error(fallback);
  if(!response.ok){const message=(data as {error?:unknown}).error;throw Error(typeof message==='string'&&message.trim()?message:fallback);}
  return data as T;
}
