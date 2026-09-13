"use client";

const players=[{name:"Mira",initial:"M",className:"mira"},{name:"Kairo",initial:"K",className:"kairo"},{name:"Andre",initial:"A",className:"andre"}];
export default function MapPreview(){return <div className="osm-shell"><iframe title="OpenStreetMap preview" loading="lazy" referrerPolicy="no-referrer" src="https://www.openstreetmap.org/export/embed.html?bbox=124.985%2C11.225%2C125.025%2C11.265&layer=mapnik&marker=11.244%2C125.003"/>{players.map(player=><button type="button" key={player.name} className={"player-marker "+player.className} aria-label={player.name+" sample player marker"}><span>{player.initial}</span><b>{player.name}</b></button>)}<span className="map-config">Sample avatars · configure soon</span></div>}
