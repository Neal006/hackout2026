import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useGlobalState } from '../context/GlobalStateContext';
import { MODE_COPY, flash } from '../lib/ui';
import AssistDrawer from './AssistDrawer';

const NAV = [
  { path: '/ops/overview', label: 'Overview' },
  { path: '/ops/sites', label: 'Live charging' },
  { path: '/ops/sessions', label: 'Sessions' },
  { path: '/ops/chargers', label: 'Chargers' },
  { path: '/ops/schedules', label: 'Plan' },
  { path: '/ops/impact', label: 'Energy & Impact' },
  { path: '/ops/alerts', label: 'Alerts' },
  { path: '/ops/tariffs', label: 'Tariffs & Package' },
];

// The rungs below the current one that are switched off (from /sites/{id}/status.ladder), for the "why" line.
const downRungs = (ladder) => Object.entries(ladder).filter(([, ok]) => !ok).map(([r]) => r);

export default function AppShell() {
  const { data, triggerEvent } = useGlobalState();
  const { status } = data;
  const navigate = useNavigate();
  const [note, setNote] = useState(null); // what the last demo button did, from the backend's `changed`
  // Where each scenario's effect is visible; new rows / a changed mode badge flash there (index.css .flash).
  const SHOW_ON = { demo_late_surge: '/ops/sessions', demo_driver_early: '/ops/alerts', demo_grid_fail: '/ops/overview', demo_grid_restore: '/ops/overview' };
  const demo = async (endpoint) => {
    setNote('…');
    try {
      const r = await triggerEvent(endpoint);
      if (r.ok) {
        setNote((await r.json()).changed);
        navigate(SHOW_ON[endpoint]);
      } else {
        setNote(`not now: ${(await r.json().catch(() => ({}))).detail ?? r.status}`);
      }
    } catch {
      setNote('failed: backend unreachable');
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row text-ink font-sans bg-bg relative">
      {/* Left rail on desktop, top bar on a phone */}
      <nav className="md:w-56 border-b md:border-b-0 md:border-r border-border shrink-0 flex flex-col md:sticky md:top-0 md:h-screen bg-surface">
        <div className="px-4 py-3 md:p-6 font-semibold text-lg tracking-tight md:border-b border-border">Noonshift Ops</div>

        <div className="flex md:flex-col md:flex-1 overflow-x-auto md:overflow-y-auto md:py-4 border-t md:border-t-0 border-border">
          {NAV.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `px-4 md:px-6 py-2 whitespace-nowrap transition-colors border-b-2 md:border-b-0 md:border-l-2 text-sm ${isActive ? 'text-ink border-grid-blue md:bg-bg' : 'text-ink-muted border-transparent hover:text-ink hover:bg-bg/50'}`}
            >
              {item.label}
            </NavLink>
          ))}
        </div>

        <div className="border-t border-border p-4 flex flex-col gap-4 bg-bg text-sm">
          {/* keyed so a mode / queue change remounts it and the flash runs */}
          <div key={status.mode} className={`${flash(status.modeChangedAt)} flex items-start gap-2 -mx-2 px-2`}>
            <div className={`w-2 h-2 mt-1 rounded-full shrink-0 ${data.systemStatus === 'Optimal' ? 'bg-saved' : 'bg-solar'}`}></div>
            <span className="text-xs text-ink-muted">
              {data.systemStatus} · mode <span className="text-ink">{status.mode}</span>
              {data.simTime ? ` · sim ${new Date(data.simTime).toTimeString().slice(0, 5)}` : ''}
              {status.waiting > 0 ? ` · ${status.waiting} waiting` : ''}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-[10px] uppercase font-medium text-ink-muted tracking-wider mb-1">Demo</div>
            <div className="grid grid-cols-2 md:grid-cols-1 gap-2">
              <button onClick={() => demo('demo_driver_early')} className="text-left text-xs border border-border p-1.5 hover:border-ink transition-colors">Driver leaves early</button>
              <button onClick={() => demo('demo_late_surge')} className="text-left text-xs border border-border p-1.5 hover:border-ink transition-colors">20 late arrivals</button>
              <button onClick={() => demo('demo_grid_fail')} className="text-left text-xs border border-border p-1.5 hover:border-ink transition-colors">Grid signal unavailable</button>
              <button onClick={() => demo('demo_grid_restore')} className="text-left text-xs border border-border p-1.5 hover:border-ink transition-colors">Restore grid signal</button>
            </div>
            {note && <div className="text-[11px] text-ink-muted leading-snug">{note}</div>}
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 flex flex-col relative min-w-0 md:overflow-y-auto md:max-h-screen">
        {/* Fail-safe ladder banner: live -> cached -> tariff -> deadline -> full (from /sites/{id}/status) */}
        {status.mode !== 'live' && (
          <div className="bg-solar/10 border-b border-solar/30 text-solar text-xs px-4 md:px-6 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="w-2 h-2 rounded-full bg-solar animate-pulse"></span>
            <span className="font-medium uppercase tracking-wider">Fail-safe: {status.mode}</span>
            <span className="text-ink-muted">{MODE_COPY[status.mode]}</span>
            {downRungs(status.ladder).length > 0 && <span className="text-ink-muted">Rungs down: {downRungs(status.ladder).join(', ')}.</span>}
          </div>
        )}
        {!data.connected && (
          <div className="bg-danger/10 border-b border-danger/30 text-danger text-xs px-4 md:px-6 py-2">
            Backend offline — run <code className="mono">python -m uvicorn noonshift.api:app --port 8000</code> from the repo root, then reload.
          </div>
        )}
        <Outlet />
      </main>
      <AssistDrawer />
    </div>
  );
}
