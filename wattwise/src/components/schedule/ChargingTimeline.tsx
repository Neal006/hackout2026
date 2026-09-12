import React from 'react';
import { Cable, Clock, Zap, CheckCircle2, ArrowRightCircle } from 'lucide-react';
import { useWattwise } from '../../context/WattwiseContext';

export const ChargingTimeline: React.FC = () => {
  const { schedule } = useWattwise();

  const events = [
    {
      time: schedule.connectTime || '6:30 PM',
      title: 'Vehicle Connected',
      subtitle: 'Tesla Model 3 plugged in with 62% SoC (347 km)',
      badge: 'Completed',
      badgeClass: 'bg-neutral-100 text-neutral-700',
      icon: Cable,
      iconClass: 'bg-neutral-900 text-white',
      accentColor: 'border-neutral-300',
    },
    {
      time: `${schedule.connectTime || '6:30 PM'} — ${schedule.optimalStart}`,
      title: 'Waiting / Optimized Delay',
      subtitle: 'Smart hold active. Avoiding evening peak demand (5.2 GW) & $4.70/kWh tariff',
      badge: '5h 10m Pause',
      badgeClass: 'bg-amber-50 text-amber-700 border border-amber-200/60',
      icon: Clock,
      iconClass: 'bg-amber-100 text-amber-800',
      accentColor: 'border-amber-300',
    },
    {
      time: `${schedule.optimalStart} — ${schedule.optimalEnd}`,
      title: '⚡ Smart Charging Active',
      subtitle: `Delivering ${schedule.energyNeededKwh} kWh at 11 kW Level 2. Tapping peak wind energy`,
      badge: 'Lowest Rate $3.38',
      badgeClass: 'bg-[#D4F634] text-neutral-950 font-bold border border-black/10',
      icon: Zap,
      iconClass: 'bg-neutral-950 text-[#D4F634] animate-pulse ring-2 ring-[#D4F634]',
      accentColor: 'border-[#D4F634]',
      highlight: true,
    },
    {
      time: schedule.optimalEnd,
      title: 'Fully Charged (Target 90%)',
      subtitle: 'Battery reached 90% SoC (504 km). 28.4 kWh delivered cleanly',
      badge: 'Ready for Trip',
      badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200/60',
      icon: CheckCircle2,
      iconClass: 'bg-emerald-600 text-white',
      accentColor: 'border-emerald-300',
    },
    {
      time: schedule.departureTime || '11:00 AM',
      title: 'Scheduled Departure',
      subtitle: 'Cabin pre-conditioned & battery conditioned at 90%',
      badge: 'Departure',
      badgeClass: 'bg-neutral-100 text-neutral-600',
      icon: ArrowRightCircle,
      iconClass: 'bg-neutral-800 text-white',
      accentColor: 'border-neutral-200',
    },
  ];

  return (
    <div className="w-full bg-white rounded-2xl border border-neutral-200/80 p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
        <div>
          <h3 className="text-base font-bold text-neutral-900 tracking-tight flex items-center gap-2">
            Charging Timeline
            <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-neutral-100 text-neutral-700">
              {schedule.flexibilityHours}h {schedule.flexibilityMinutes}m flexibility window
            </span>
          </h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            Deadline-based dispatch ensures 100% readiness while cutting peak strain
          </p>
        </div>

        <div className="text-right">
          <span className="text-xs text-neutral-400">Total duration: </span>
          <span className="text-xs font-bold text-neutral-900 font-mono">
            {schedule.chargingDurationHours} hrs of actual charging
          </span>
        </div>
      </div>

      {/* Timeline track */}
      <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-3 sm:before:left-4 before:top-3 before:bottom-3 before:w-0.5 before:bg-neutral-200">
        {events.map((evt, idx) => {
          const Icon = evt.icon;
          return (
            <div
              key={idx}
              className={`relative flex items-start gap-4 p-4 rounded-xl border transition-all ${
                evt.highlight
                  ? 'bg-neutral-900 text-white border-neutral-800 shadow-md ring-1 ring-[#D4F634]/30'
                  : 'bg-neutral-50/50 border-neutral-200/70 hover:bg-neutral-50'
              }`}
            >
              {/* Node Circle Anchor */}
              <div
                className={`absolute -left-[30px] sm:-left-[38px] top-4 w-7 h-7 rounded-full flex items-center justify-center shadow-sm z-10 ${evt.iconClass}`}
              >
                <Icon className="w-3.5 h-3.5" />
              </div>

              {/* Event Body */}
              <div className="flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`text-xs font-mono font-bold uppercase tracking-wider ${
                      evt.highlight ? 'text-[#D4F634]' : 'text-neutral-500'
                    }`}
                  >
                    {evt.time}
                  </span>
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${evt.badgeClass}`}
                  >
                    {evt.badge}
                  </span>
                </div>

                <h4
                  className={`text-sm font-bold mt-1 ${
                    evt.highlight ? 'text-white' : 'text-neutral-900'
                  }`}
                >
                  {evt.title}
                </h4>
                <p
                  className={`text-xs mt-0.5 ${
                    evt.highlight ? 'text-neutral-300' : 'text-neutral-500'
                  }`}
                >
                  {evt.subtitle}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
