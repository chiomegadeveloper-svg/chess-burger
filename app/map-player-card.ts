import {levelFor} from './cbr';
import type {ArenaPlayer} from './game-rules';
import './map-player-card.css';

// Build text as DOM nodes so profile names can never inject HTML.
export function mapPlayerCard(player:ArenaPlayer & {distance:number}) {
  const level=levelFor(player.cbr);
  const card=document.createElement('article');card.className='map-mini-card';
  const image=(src:string,alt:string,className:string)=>{const el=document.createElement('img');el.src=src;el.alt=alt;el.className=className;return el;};
  const text=(tag:string,value:string,className='')=>{const el=document.createElement(tag);el.textContent=value;el.className=className;return el;};
  card.append(image('/cburger_logo.png','Chess Burger','mini-logo'));
  const identity=document.createElement('div');identity.className='mini-identity';
  const portrait=text('div',player.display_name.slice(0,1),'mini-portrait');
  if(player.avatar_url){portrait.textContent='';const img=image(player.avatar_url,player.display_name,'');img.onerror=()=>{portrait.textContent=player.display_name.slice(0,1);};portrait.append(img);}
  const copy=document.createElement('div');copy.className='mini-copy';
  copy.append(text('small',`@${player.username} · ${player.country_code}`),text('strong',player.display_name),text('span','● Online','mini-online'),text('small',`Level ${level.level} · ${level.name}`));
  identity.append(portrait,copy,image(`/levels/level-${String(level.level-1).padStart(2,'0')}.png`,level.name,'mini-level'));
  card.append(identity);
  const stats=document.createElement('div');stats.className='mini-stats';
  const games=player.wins+player.losses;
  for(const [label,value] of [['CBR',player.cbr],['OCBR',player.ocbr??88],['Gold',player.gold_points],['Win rate',`${games?Math.round(player.wins/games*100):0}%`]]){const stat=document.createElement('div');stat.append(text('b',String(value)),text('small',String(label)));stats.append(stat);}
  card.append(stats,text('footer',`${player.distance} m away · Tap avatar to invite`));
  return card;
}
