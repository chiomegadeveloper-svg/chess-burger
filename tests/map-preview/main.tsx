import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import '../../app/globals.css';
import '../../app/arena.css';
import '../../app/charcoal-theme.css';
import NearbyMap from '../../app/nearby-map';
import {setFixtureMode, type fixtureMode} from './mock-arena';

function Preview() {
  const [enabled, setEnabled] = useState(true);
  const [open, setOpen] = useState(true);
  const [scenario, setScenario] = useState<typeof fixtureMode>('legacy');
  return <main style={{padding: 20, maxWidth: 1000, margin: 'auto'}}>
    <h1>Map regression preview</h1>
    <p>Read-only fixture matching the current API response. No live account or database.</p>
    <button onClick={() => setOpen(value => !value)}>{open ? 'Leave Map' : 'Open Map'}</button>
    <label>Test scenario<select value={scenario} onChange={event=>{const mode=event.target.value as typeof fixtureMode;setFixtureMode(mode);setScenario(mode);}}>
      <option value="legacy">Current API territory</option><option value="invalid">Malformed records</option><option value="network-error">Network unavailable</option>
    </select></label>
    {open && <NearbyMap key={scenario} enabled={enabled} position={enabled ? {lat:11.244,lng:125.003,accuracy:10} : null}
      toggle={() => setEnabled(value => !value)} error="" onInvite={() => {}} onOpenProfile={() => {}} onClaimed={() => {}}/>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Preview/></React.StrictMode>);
