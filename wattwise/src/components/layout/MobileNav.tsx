import React from 'react';
import { LayoutDashboard, Zap, CalendarClock, History, User } from 'lucide-react';
import { useWattwise } from '../../context/WattwiseContext';
import type { NavTab } from '../../types/wattwise';

export const MobileNav: React.FC = () => {
  const { currentNav, setCurrentNav, vehicle } = useWattwise();

  const navItems: { id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'charge', label: 'Charge', icon: Zap },
    { id: 'schedule', label: 'Schedule', icon: CalendarClock },
    { id: 'history', label: 'History', icon: History },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-neutral-200/80 px-3 py-2 z-40 flex items-center justify-around select-none">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = currentNav === item.id;

        return (
          <button
            key={item.id}
            onClick={() => setCurrentNav(item.id)}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-[10px] font-medium transition-colors relative ${
              isActive
                ? 'text-neutral-900 font-bold'
                : 'text-neutral-400 hover:text-neutral-700'
            }`}
          >
            <div className={`relative p-1 rounded-lg ${isActive ? 'bg-[#D4F634] text-neutral-950' : ''}`}>
              <Icon className="w-5 h-5" />
              {item.id === 'schedule' && vehicle.connected && (
                <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" />
              )}
            </div>
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
