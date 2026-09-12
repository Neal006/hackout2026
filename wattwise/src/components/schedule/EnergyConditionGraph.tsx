import React, { useState } from 'react';
import { useWattwise } from '../../context/WattwiseContext';
import type { HourlyDataPoint } from '../../types/wattwise';
import { Zap, TrendingDown, Leaf, Info } from 'lucide-react';

interface EnergyConditionGraphProps {
  showControls?: boolean;
  compact?: boolean;
}

export const EnergyConditionGraph: React.FC<EnergyConditionGraphProps> = ({
  compact = false,
}) => {
  const [activeMetric, setActiveMetric] = useState<'tariff' | 'demand' | 'renewable'>('tariff');
  const [hoveredPoint, setHoveredPoint] = useState<HourlyDataPoint | null>(null);

  const { hourly } = useWattwise();
  const data = hourly;

  // Chart dimensions
  const width = 800;
  const height = compact ? 180 : 260;
  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 25;
  const paddingBottom = 35;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Min / Max for scales
  const minTariff = data.length ? Math.min(...data.map((d) => d.tariff)) : 0;
  const maxTariff = data.length ? Math.max(...data.map((d) => d.tariff), minTariff + 0.01) : 1;

  const minDemand = 0;
  const maxDemand = data.length ? Math.max(...data.map((d) => d.gridDemandGw), 10) : 10;

  const getX = (index: number) => {
    return paddingLeft + (index / (data.length - 1)) * chartWidth;
  };

  const getTariffY = (val: number) => {
    const norm = (val - minTariff) / (maxTariff - minTariff);
    return paddingTop + chartHeight * (1 - norm);
  };

  const getDemandY = (val: number) => {
    const norm = (val - minDemand) / (maxDemand - minDemand);
    return paddingTop + chartHeight * (1 - norm);
  };

  // Build SVG path strings
  const tariffPoints = data.map((d, i) => `${getX(i)},${getTariffY(d.tariff)}`).join(' ');
  const demandPoints = data.map((d, i) => `${getX(i)},${getDemandY(d.gridDemandGw)}`).join(' ');

  // Optimal window = the hours the plan actually charges this car (isOptimal from the plan frame)
  const optIdx = data.map((d, i) => (d.isOptimal ? i : -1)).filter((i) => i >= 0);
  const optimalStartX = optIdx.length ? getX(optIdx[0]) : paddingLeft;
  const optimalEndX = optIdx.length ? getX(optIdx[optIdx.length - 1] + 1 < data.length ? optIdx[optIdx.length - 1] + 1 : optIdx[optIdx.length - 1]) : paddingLeft;

  return (
    <div className="w-full bg-white rounded-2xl border border-neutral-200/80 p-5 shadow-sm">
      {/* Header controls & legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-neutral-900 tracking-tight">
              Grid Signals & Dynamic Tariff
            </h3>
            <span className="text-[10px] font-mono font-bold bg-[#D4F634] text-neutral-950 px-2 py-0.5 rounded-full">
              OPTIMAL WINDOW HIGHLIGHTED
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-0.5">
            Hourly tariff ($/kWh), site load (kW) and grid carbon (WattTime marginal, estimate)
          </p>
        </div>

        {/* Metric Switcher */}
        <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-xl text-xs font-medium">
          <button
            onClick={() => setActiveMetric('tariff')}
            className={`px-3 py-1 rounded-lg transition-all ${
              activeMetric === 'tariff'
                ? 'bg-white text-neutral-900 shadow-sm font-semibold'
                : 'text-neutral-500 hover:text-neutral-900'
            }`}
          >
            ⚡ Tariff ($/kWh)
          </button>
          <button
            onClick={() => setActiveMetric('demand')}
            className={`px-3 py-1 rounded-lg transition-all ${
              activeMetric === 'demand'
                ? 'bg-white text-neutral-900 shadow-sm font-semibold'
                : 'text-neutral-500 hover:text-neutral-900'
            }`}
          >
            📉 Site Load (kW)
          </button>
          <button
            onClick={() => setActiveMetric('renewable')}
            className={`px-3 py-1 rounded-lg transition-all ${
              activeMetric === 'renewable'
                ? 'bg-white text-neutral-900 shadow-sm font-semibold'
                : 'text-neutral-500 hover:text-neutral-900'
            }`}
          >
            🌱 Grid Clean %
          </button>
        </div>
      </div>

      {/* SVG Chart Container */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible select-none"
        >
          <defs>
            {/* Optimal window gradient */}
            <linearGradient id="optimalZone" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#D4F634" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#D4F634" stopOpacity="0.05" />
            </linearGradient>

            {/* Tariff line gradient */}
            <linearGradient id="tariffArea" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#171717" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#171717" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines horizontal */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
            const y = paddingTop + chartHeight * ratio;
            return (
              <g key={idx}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="#E5E5E2"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                  fill="#A3A39E"
                >
                  {activeMetric === 'tariff'
                    ? `$${(maxTariff - ratio * (maxTariff - minTariff)).toFixed(2)}`
                    : activeMetric === 'demand'
                    ? `${(maxDemand - ratio * (maxDemand - minDemand)).toFixed(0)}kW`
                    : `${Math.round(100 - ratio * 100)}%`}
                </text>
              </g>
            );
          })}

          {/* Optimal Window Highlight Box */}
          <rect
            x={optimalStartX}
            y={paddingTop}
            width={optimalEndX - optimalStartX}
            height={chartHeight}
            fill="url(#optimalZone)"
            rx="4"
          />

          {/* Optimal Window Left & Right Borders */}
          <line
            x1={optimalStartX}
            y1={paddingTop}
            x2={optimalStartX}
            y2={paddingTop + chartHeight}
            stroke="#A3C610"
            strokeWidth="2"
            strokeDasharray="4 3"
          />
          <line
            x1={optimalEndX}
            y1={paddingTop}
            x2={optimalEndX}
            y2={paddingTop + chartHeight}
            stroke="#A3C610"
            strokeWidth="2"
            strokeDasharray="4 3"
          />

          {/* Optimal Window Label Banner */}
          <g transform={`translate(${(optimalStartX + optimalEndX) / 2}, ${paddingTop + 14})`}>
            <rect
              x="-65"
              y="-11"
              width="130"
              height="20"
              rx="10"
              fill="#171717"
            />
            <text
              textAnchor="middle"
              y="3"
              fill="#D4F634"
              fontSize="9"
              fontWeight="bold"
              fontFamily="JetBrains Mono, monospace"
            >
              ⚡ 11:40 PM — 2:10 AM
            </text>
          </g>

          {/* Grid Demand Line (Subtle dotted grey) */}
          <polyline
            fill="none"
            stroke="#9CA3AF"
            strokeWidth="2"
            strokeDasharray="4 4"
            points={demandPoints}
            opacity={activeMetric === 'demand' ? '1' : '0.45'}
          />

          {/* Tariff Fill Area & Line */}
          <polygon
            points={`${paddingLeft},${paddingTop + chartHeight} ${tariffPoints} ${width - paddingRight},${paddingTop + chartHeight}`}
            fill="url(#tariffArea)"
          />

          <polyline
            fill="none"
            stroke="#171717"
            strokeWidth={activeMetric === 'tariff' ? '3' : '2'}
            points={tariffPoints}
          />

          {/* Data nodes */}
          {data.map((d, i) => {
            const x = getX(i);
            const y = activeMetric === 'demand' ? getDemandY(d.gridDemandGw) : getTariffY(d.tariff);
            const isHovered = hoveredPoint?.rawHour === d.rawHour;

            return (
              <g key={i} className="cursor-pointer">
                {/* Hover trigger zone */}
                <rect
                  x={x - 12}
                  y={paddingTop}
                  width="24"
                  height={chartHeight}
                  fill="transparent"
                  onMouseEnter={() => setHoveredPoint(d)}
                  onMouseLeave={() => setHoveredPoint(null)}
                />

                {/* Point circle */}
                <circle
                  cx={x}
                  cy={y}
                  r={isHovered ? 6 : d.isOptimal ? 4 : 2.5}
                  fill={d.isOptimal ? '#D4F634' : '#171717'}
                  stroke={d.isOptimal ? '#171717' : '#FFFFFF'}
                  strokeWidth={d.isOptimal ? '2' : '1.5'}
                />

                {/* X Axis Label */}
                {i % 2 === 0 && (
                  <text
                    x={x}
                    y={height - 10}
                    textAnchor="middle"
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                    fill={d.isOptimal ? '#171717' : '#737373'}
                    fontWeight={d.isOptimal ? 'bold' : 'normal'}
                  >
                    {d.hourLabel}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Hover info pill */}
        {hoveredPoint && (
          <div
            className="absolute top-2 left-1/2 -translate-x-1/2 bg-neutral-900 text-white px-4 py-2 rounded-xl shadow-xl border border-neutral-800 flex items-center gap-4 text-xs z-30 animate-in fade-in"
          >
            <div className="font-bold text-[#D4F634] font-mono">
              {hoveredPoint.hourLabel}
            </div>
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Tariff: <strong className="font-mono">${hoveredPoint.tariff.toFixed(3)}/kWh</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendingDown className="w-3.5 h-3.5 text-blue-400" />
              <span>Site load: <strong className="font-mono">{hoveredPoint.gridDemandGw.toFixed(1)} kW</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <Leaf className="w-3.5 h-3.5 text-emerald-400" />
              <span>Grid clean: <strong className="font-mono">{hoveredPoint.renewablePercent}%</strong></span>
            </div>
          </div>
        )}
      </div>

      {/* Footer explanation note */}
      <div className="mt-4 pt-3 border-t border-neutral-100 flex flex-wrap items-center justify-between text-xs text-neutral-500 gap-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-neutral-900" />
            <span>Electricity Tariff ($/kWh)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 border-t-2 border-dashed border-neutral-400" />
            <span>Site Load (kW)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-[#D4F634]/50 border border-[#A3C610]" />
            <span className="font-semibold text-neutral-800">Wattwise Optimal Window</span>
          </div>
        </div>

        <div className="flex items-center gap-1 text-neutral-600 font-mono text-[11px]">
          <Info className="w-3.5 h-3.5 text-neutral-400" />
          <span>Shifting avoids the 5.2 GW peak and locks in $3.35–$3.38/kWh</span>
        </div>
      </div>
    </div>
  );
};
