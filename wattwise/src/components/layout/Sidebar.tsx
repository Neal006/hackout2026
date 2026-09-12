import React from 'react';
import { 
  LayoutDashboard, 
  Zap, 
  CalendarClock, 
  History, 
  User, 
  RotateCcw,
  Cable
} from 'lucide-react';
import { useWattwise } from '../../context/WattwiseContext';
import type { NavTab } from '../../types/wattwise';

export const Sidebar: React.FC = () => {
  const { currentNav, setCurrentNav, vehicle, resetDemo, openConnectModal } = useWattwise();

  const navItems: { id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'charge', label: 'Charge', icon: Zap },
    { id: 'schedule', label: 'Schedule', icon: CalendarClock },
    { id: 'history', label: 'History', icon: History },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <aside className="hidden md:flex flex-col justify-between w-64 h-screen fixed left-0 top-0 bg-[#F7F7F5] border-r border-neutral-200/80 p-5 z-40 select-none">
      {/* Brand Header */}
      <div>
        <div className="flex items-center gap-3 px-2 py-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-neutral-900 flex items-center justify-center shadow-md text-[#D4F634] relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-tr from-[#D4F634]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <Zap className="w-5 h-5 fill-current" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-lg text-neutral-900 tracking-tight">
                Wattwise
              </span>
              <span className="text-[9px] font-mono font-bold bg-[#D4F634] text-neutral-950 px-1.5 py-0.2 rounded">
                DEMO
              </span>
            </div>
            <p className="text-[11px] text-neutral-500 font-medium">
              Charge when energy makes sense.
            </p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentNav === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentNav(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-neutral-900 text-white shadow-sm'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/50'
                }`}
              >
                <Icon
                  className={`w-4 h-4 ${
                    isActive ? 'text-[#D4F634]' : 'text-neutral-500'
                  }`}
                />
                <span>{item.label}</span>
                {item.id === 'schedule' && vehicle.connected && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#D4F634]" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Connect EV quick banner if disconnected */}
        {!vehicle.connected && (
          <div className="mt-6 p-4 rounded-xl bg-white border border-neutral-200/90 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Cable className="w-4 h-4 text-neutral-900" />
              <span className="text-xs font-bold text-neutral-900">EV Disconnected</span>
            </div>
            <p className="text-[11px] text-neutral-500 mb-3">
              Connect to schedule smart overnight charging.
            </p>
            <button
              onClick={openConnectModal}
              className="w-full py-2 px-3 rounded-lg bg-neutral-900 hover:bg-black text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow transition-all cursor-pointer"
            >
              <span>Connect Vehicle</span>
            </button>
          </div>
        )}
      </div>

      {/* Footer Section */}
      <div className="space-y-3 pt-4 border-t border-neutral-200/70">
        {/* Vehicle Mini Profile Pill */}
        <div className="p-3 rounded-xl bg-white border border-neutral-200/80 shadow-xs">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-semibold text-neutral-900">Tesla Model 3</span>
            <span className="text-[10px] font-mono text-neutral-500">62% • 75 kWh</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-neutral-500">
            <span className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${vehicle.connected ? 'bg-emerald-500' : 'bg-neutral-300'}`} />
              {vehicle.connected ? 'Plugged in' : 'Unplugged'}
            </span>
            <span className="font-mono text-neutral-700">11 kW AC</span>
          </div>
        </div>

        {/* Reset Demo Button */}
        <button
          onClick={resetDemo}
          className="w-full py-2 px-3 rounded-xl text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200/60 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          title="Reset to default presentation state"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Demo State</span>
        </button>

        <div className="text-[10px] text-center text-neutral-400 font-mono">
          Wattwise v2.4 • Hackathon Build
        </div>
      </div>
    </aside>
  );
};
