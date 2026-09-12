import React from 'react';

interface StatCardProps {
  label: string;
  value: string;
  subtext?: string;
  icon: React.ReactNode;
  badge?: string;
  badgeType?: 'positive' | 'neutral' | 'accent';
  highlight?: boolean;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subtext,
  icon,
  badge,
  badgeType = 'neutral',
  highlight = false,
}) => {
  return (
    <div
      className={`p-5 rounded-2xl border transition-all duration-200 ${
        highlight
          ? 'bg-neutral-900 text-white border-neutral-800 shadow-md ring-1 ring-[#D4F634]/30'
          : 'bg-white text-neutral-900 border-neutral-200/80 shadow-sm hover:border-neutral-300'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <span
          className={`text-xs font-semibold tracking-wider uppercase ${
            highlight ? 'text-neutral-400' : 'text-neutral-500'
          }`}
        >
          {label}
        </span>
        <div
          className={`p-2 rounded-xl ${
            highlight
              ? 'bg-neutral-800 text-[#D4F634]'
              : 'bg-neutral-100 text-neutral-800'
          }`}
        >
          {icon}
        </div>
      </div>

      <div className="flex items-baseline gap-2">
        <span
          className={`text-3xl font-extrabold tracking-tight font-mono ${
            highlight ? 'text-white' : 'text-neutral-900'
          }`}
        >
          {value}
        </span>
        {badge && (
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              badgeType === 'positive'
                ? 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/20'
                : badgeType === 'accent'
                ? 'bg-[#D4F634] text-neutral-950 font-mono'
                : 'bg-neutral-100 text-neutral-600'
            }`}
          >
            {badge}
          </span>
        )}
      </div>

      {subtext && (
        <p
          className={`text-xs mt-2 font-medium ${
            highlight ? 'text-neutral-400' : 'text-neutral-500'
          }`}
        >
          {subtext}
        </p>
      )}
    </div>
  );
};
