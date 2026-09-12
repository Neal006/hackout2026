import { NavLink, Outlet } from 'react-router-dom';
import { useGlobalState } from '../context/GlobalStateContext';

export default function AppShell() {
  const { data, triggerEvent } = useGlobalState();

  const navItems = [
    { path: '/ops/overview', label: 'Overview' },
    { path: '/ops/sites', label: 'Sites' },
    { path: '/ops/sessions', label: 'Sessions' },
    { path: '/ops/chargers', label: 'Chargers' },
    { path: '/ops/schedules', label: 'Schedules' },
    { path: '/ops/impact', label: 'Energy & Impact' },
    { path: '/ops/alerts', label: 'Alerts' },
    { path: '/ops/tariffs', label: 'Tariffs' },
  ];

  return (
    <div className="min-h-screen flex text-ink font-sans bg-bg relative overflow-hidden">
      {/* Persistent B2B Left Rail */}
      <nav className="w-56 border-r border-border shrink-0 flex flex-col sticky top-0 h-screen bg-surface">
        <div className="p-6 font-semibold text-lg tracking-tight border-b border-border">Noonshift Ops</div>
        
        <div className="flex flex-col flex-1 overflow-y-auto py-4">
          {navItems.map(item => (
            <NavLink 
              key={item.path}
              to={item.path} 
              className={({ isActive }) => `px-6 py-2 transition-colors border-l-2 text-sm ${isActive ? 'text-ink border-grid-blue bg-bg' : 'text-ink-muted border-transparent hover:text-ink hover:bg-bg/50'}`}
            >
              {item.label}
            </NavLink>
          ))}
          
          <div className="px-6 mt-8 mb-2 text-[10px] uppercase font-medium text-ink-muted tracking-wider">Settings</div>
          <NavLink to="/ops/settings" className="px-6 py-2 text-sm text-ink-muted hover:text-ink transition-colors">Settings</NavLink>
        </div>

        <div className="border-t border-border p-4 flex flex-col gap-4 bg-bg text-sm">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${data.systemStatus === 'Optimal' ? 'bg-saved' : 'bg-solar'}`}></div>
            <span className="text-xs text-ink-muted">System {data.systemStatus} · mode {data.siteDetail.mode}{data.simTime ? ` · sim ${new Date(data.simTime).toTimeString().slice(0, 5)}` : ""}</span>
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-[10px] uppercase font-medium text-ink-muted tracking-wider mb-1">Demo Mode</div>
            <button onClick={() => triggerEvent('demo_driver_early')} className="text-left text-xs border border-border p-1.5 hover:border-ink transition-colors">Driver leaves early</button>
            <button onClick={() => triggerEvent('demo_late_surge')} className="text-left text-xs border border-border p-1.5 hover:border-ink transition-colors">20 late arrivals</button>
            <button onClick={() => triggerEvent('demo_grid_fail')} className="text-left text-xs border border-border p-1.5 hover:border-ink transition-colors">Grid signal unavailable</button>
            <button onClick={() => triggerEvent('demo_grid_restore')} className="text-left text-xs border border-border p-1.5 hover:border-ink transition-colors">Restore grid signal</button>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative min-w-0 overflow-y-auto max-h-screen">
        {/* Fail-safe ladder banner: live -> cached -> tariff -> deadline -> full (from /sites/{id}/status.mode) */}
        {data.siteDetail.mode !== 'live' && (
          <div className="bg-solar/10 border-b border-solar/30 text-solar text-xs px-6 py-2 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-solar animate-pulse"></span>
            <span className="font-medium uppercase tracking-wider">Fail-safe mode: {data.siteDetail.mode}</span>
            <span className="text-ink-muted">
              {data.siteDetail.mode === 'cached' && 'Live carbon signal lost; scheduling on the cached forecast (≤ 6 h).'}
              {data.siteDetail.mode === 'tariff' && 'No carbon signal; scheduling on the tariff only.'}
              {data.siteDetail.mode === 'deadline' && 'No signal or tariff; deadlines only.'}
              {data.siteDetail.mode === 'full' && 'Backend degraded; every charger at full power.'}
            </span>
          </div>
        )}
        {!data.connected && (
          <div className="bg-danger/10 border-b border-danger/30 text-danger text-xs px-6 py-2">Not connected to the Noonshift backend (ws /ws). Showing last known state.</div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
