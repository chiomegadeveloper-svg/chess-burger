(function(root){
 const MAX_LEVEL=88,clampLevel=n=>Math.max(1,Math.min(MAX_LEVEL,Math.floor(Number(n)||1)));
 const nextXp=level=>level>=MAX_LEVEL?0:100+35*(level-1)+5*(level-1)**2;
 function threshold(level){let xp=0;for(let n=1;n<clampLevel(level);n++)xp+=nextXp(n);return xp;}
 function progress(totalXp=0){totalXp=Math.min(threshold(88),Math.max(0,Math.floor(Number(totalXp)||0)));let level=1;while(level<88&&totalXp>=threshold(level+1))level++;return {level,totalXp,xp:totalXp-threshold(level),nextXp:nextXp(level),maxLevel:88};}
 const baseStats=level=>{const n=clampLevel(level)-1;return [20+4*n,4+n,4+n,4+n,20+3*n,4+n];};
 const maxAp=level=>20+2*(clampLevel(level)-1);
 function victoryXp(heroLevel,monsterLevel){return Math.round((40+12*clampLevel(monsterLevel))*Math.max(.5,Math.min(1.6,1+(monsterLevel-heroLevel)*.15)));}
 const api={MAX_LEVEL,clampLevel,nextXp,threshold,progress,baseStats,maxAp,victoryXp};root.RPGProgression=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
