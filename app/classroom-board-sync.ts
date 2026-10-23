/** Ignore delayed database events after a newer confirmed board has arrived. */
export function mergeClassroomBoard<T extends {fen:string;updated_at?:string}>(current:T,incoming:Partial<T>):T{
 const before=Date.parse(current.updated_at||''),after=Date.parse(incoming.updated_at||'');
 if(Number.isFinite(before)&&Number.isFinite(after)&&after<before)return current;
 return {...current,...incoming};
}
