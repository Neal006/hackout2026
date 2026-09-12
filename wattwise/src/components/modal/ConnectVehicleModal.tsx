import React, { useState, useMemo, useEffect } from 'react';
import { X, Calendar, Clock, Zap, ArrowRight, AlertCircle, Sparkles, BatteryCharging } from 'lucide-react';
import { useWattwise } from '../../context/WattwiseContext';
import { calculateFlexibility, estimateKmRange } from '../../utils/formatters';
import type { PricePreview } from '../../api/noonshift';

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const ConnectVehicleModal: React.FC = () => {
  const { isConnectModalOpen, setIsConnectModalOpen, vehicle, startOptimizationFlow, simTime, previewPrice } = useWattwise();

  // Plug-in is "now" on the sim clock; the default ready-by is 4 h out (pre-filled, one tap to accept)
  const now = simTime ? new Date(simTime) : new Date();
  const [connectDate, setConnectDate] = useState<string>(ymd(now));
  const [connectTime, setConnectTime] = useState<string>(hhmm(now));
  const [departureDate, setDepartureDate] = useState<string>(ymd(now));
  const [departureTime, setDepartureTime] = useState<string>(hhmm(new Date(now.getTime() + 4 * 3600000)));
  const [targetSoC, setTargetSoC] = useState<number>(vehicle.targetSoC || 90);
  const [price, setPrice] = useState<PricePreview | null>(null);

  useEffect(() => {
    if (!isConnectModalOpen || !simTime) return;
    const t = new Date(simTime);
    setConnectDate(ymd(t));
    setConnectTime(hhmm(t));
    setDepartureDate(ymd(t));
    setDepartureTime(hhmm(new Date(t.getTime() + 4 * 3600000)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnectModalOpen]);

  // Deadline sets the price: preview the tier for this ready-by (GET /price)
  useEffect(() => {
    if (!isConnectModalOpen) return;
    let stale = false;
    previewPrice(departureTime, targetSoC).then((p) => !stale && setPrice(p));
    return () => {
      stale = true;
    };
  }, [isConnectModalOpen, departureTime, targetSoC, previewPrice]);

  // Dynamic flexibility calculation
  const flex = useMemo(() => {
    return calculateFlexibility(connectDate, connectTime, departureDate, departureTime);
  }, [connectDate, connectTime, departureDate, departureTime]);

  if (!isConnectModalOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!flex.isValid) return;
    startOptimizationFlow(connectDate, connectTime, departureDate, departureTime, targetSoC);
  };

  // Needed kWh calculation based on target SoC
  const kwhNeeded = Math.max(0, (((targetSoC - vehicle.currentSoC) / 100) * vehicle.batteryCapacityKwh)).toFixed(1);
  const estimatedHours = (Number(kwhNeeded) / vehicle.maxChargeRateKw).toFixed(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-neutral-200/90 overflow-hidden relative my-8"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* Subtle accent bar */}
        <div className="h-1.5 w-full bg-neutral-950 flex">
          <div className="h-full bg-[#D4F634] w-2/3" />
        </div>

        {/* Modal Header */}
        <div className="p-6 pb-4 border-b border-neutral-100 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-[#D4F634] inline-block animate-pulse" />
              <span className="text-[11px] font-mono uppercase tracking-widest text-neutral-400 font-semibold">
                Wattwise Optimizer
              </span>
            </div>
            <h2 id="modal-title" className="text-2xl font-bold text-neutral-900 tracking-tight">
              Connect your EV
            </h2>
            <p className="text-sm text-neutral-500 mt-1">
              Tell us when you’ll need your vehicle back. We’ll find the best time to charge.
            </p>
          </div>

          {/* Close button only available if already connected */}
          {vehicle.connected && (
            <button
              onClick={() => setIsConnectModalOpen(false)}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Vehicle snapshot pill */}
        <div className="px-6 py-3 bg-neutral-50/80 border-b border-neutral-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-neutral-900">{vehicle.model}</span>
            <span className="text-neutral-400">•</span>
            <span className="text-neutral-600">Current: {vehicle.currentSoC}% ({estimateKmRange(vehicle.currentSoC)} km)</span>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-neutral-600">
            <Zap className="w-3.5 h-3.5 text-neutral-900" />
            <span>{vehicle.maxChargeRateKw} kW Level 2</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Time Inputs Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Connect Time */}
            <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/40 focus-within:border-neutral-900 focus-within:bg-white transition-all">
              <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-2">
                Plug-in Time
              </label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-neutral-400 shrink-0" />
                  <input
                    type="date"
                    value={connectDate}
                    onChange={(e) => setConnectDate(e.target.value)}
                    className="w-full text-xs font-medium text-neutral-800 bg-transparent border-none focus:outline-none"
                    required
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-neutral-400 shrink-0" />
                  <input
                    type="time"
                    value={connectTime}
                    onChange={(e) => setConnectTime(e.target.value)}
                    className="w-full text-sm font-semibold text-neutral-900 bg-transparent border-none focus:outline-none"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Departure Time */}
            <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/40 focus-within:border-neutral-900 focus-within:bg-white transition-all">
              <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-2">
                Departure Time
              </label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-neutral-400 shrink-0" />
                  <input
                    type="date"
                    value={departureDate}
                    onChange={(e) => setDepartureDate(e.target.value)}
                    className="w-full text-xs font-medium text-neutral-800 bg-transparent border-none focus:outline-none"
                    required
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-neutral-400 shrink-0" />
                  <input
                    type="time"
                    value={departureTime}
                    onChange={(e) => setDepartureTime(e.target.value)}
                    className="w-full text-sm font-semibold text-neutral-900 bg-transparent border-none focus:outline-none"
                    required
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Dynamic Flexibility Banner */}
          <div
            className={`p-4 rounded-xl border transition-all ${
              flex.isValid
                ? 'bg-neutral-900 text-white border-neutral-800 shadow-sm'
                : 'bg-rose-50 text-rose-900 border-rose-200'
            }`}
          >
            {flex.isValid ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-neutral-800 flex items-center justify-center text-[#D4F634]">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-neutral-400">Available Flexibility</div>
                    <div className="text-base font-bold text-white tracking-tight">
                      You have <span className="text-[#D4F634]">{flex.formatted}</span> of charging flexibility.
                    </div>
                  </div>
                </div>
                <div className="text-right hidden sm:block">
                  <div className="text-[10px] uppercase text-neutral-400 font-mono">Needed charge</div>
                  <div className="text-xs font-medium text-neutral-200">~{estimatedHours}h at {vehicle.maxChargeRateKw}kW</div>
                </div>
              </div>
            ) : null}
            {/* Deadline sets the price: the three tiers, the one this ready-by earns highlighted */}
            {flex.isValid && price ? (
              <div className="mt-3 pt-3 border-t border-neutral-700 flex flex-wrap items-center gap-2 text-[11px] font-mono">
                <span className="text-neutral-400 mr-1">Your rate:</span>
                {price.tiers.map((t) => (
                  <span
                    key={t.tier}
                    className={`px-2 py-0.5 rounded-full border ${
                      t.tier === price.price.tier ? 'bg-[#D4F634] text-neutral-950 border-[#D4F634] font-bold' : 'text-neutral-300 border-neutral-600'
                    }`}
                  >
                    {t.tier} ${t.usd_per_kwh.toFixed(2)}/kWh{t.min_slack_hours > 0 ? ` · ≥${t.min_slack_hours}h slack` : ' · <1h'}
                  </span>
                ))}
              </div>
            ) : null}
            {!flex.isValid && (
              <div className="flex items-center gap-2 text-xs font-medium">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Departure time must be strictly after plug-in time.</span>
              </div>
            )}
          </div>

          {/* Target Battery Slider */}
          <div className="p-4 rounded-xl border border-neutral-200 bg-white space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-neutral-700 flex items-center gap-1.5">
                <BatteryCharging className="w-4 h-4 text-neutral-900" />
                Target Battery Charge
              </span>
              <span className="font-mono font-bold text-sm text-neutral-900">
                {targetSoC}% ({estimateKmRange(targetSoC)} km)
              </span>
            </div>
            
            <div className="space-y-1">
              <input
                type="range"
                min={70}
                max={100}
                step={5}
                value={targetSoC}
                onChange={(e) => setTargetSoC(Number(e.target.value))}
                className="w-full accent-neutral-900 h-2 bg-neutral-100 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-neutral-400 font-mono">
                <span>70% (Daily commute)</span>
                <span className="font-bold text-neutral-700">90% (Recommended)</span>
                <span>100% (Trip)</span>
              </div>
            </div>

            <div className="pt-2 border-t border-neutral-100 flex items-center justify-between text-xs text-neutral-500">
              <span>Energy required: <strong className="text-neutral-800 font-mono">+{kwhNeeded} kWh</strong></span>
              <span>Min dwell needed: <strong className="text-neutral-800 font-mono">{estimatedHours} hours</strong></span>
            </div>
          </div>

          {/* CTA Submit Button */}
          <button
            type="submit"
            disabled={!flex.isValid}
            className={`w-full py-4 px-6 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-md ${
              flex.isValid
                ? 'bg-neutral-900 hover:bg-black text-white active:scale-[0.99] cursor-pointer'
                : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
            }`}
          >
            <span>Find Optimal Charging</span>
            <ArrowRight className="w-4 h-4 text-[#D4F634]" />
          </button>
        </form>
      </div>
    </div>
  );
};
