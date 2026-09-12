import React from 'react';
import { Check, Loader2, Sparkles, Zap } from 'lucide-react';
import { useWattwise } from '../../context/WattwiseContext';

export const OptimizationLoader: React.FC = () => {
  const { isOptimizing, optimizationSteps } = useWattwise();

  if (!isOptimizing) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white rounded-2xl p-7 shadow-2xl border border-neutral-200/80 relative overflow-hidden">
        {/* Top glowing ambient accent */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-neutral-900 via-[#D4F634] to-neutral-900 animate-energy-flow" />

        {/* Central pulse icon */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="relative w-16 h-16 mb-4 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-[#D4F634]/20 animate-ping" />
            <div className="w-16 h-16 rounded-full bg-neutral-900 flex items-center justify-center shadow-lg">
              <Zap className="w-7 h-7 text-[#D4F634] animate-pulse" />
            </div>
          </div>
          <h3 className="text-xl font-semibold text-neutral-900 tracking-tight">
            Optimizing charging schedule…
          </h3>
          <p className="text-xs text-neutral-500 mt-1">
            Analyzing multi-variable grid signals & vehicle dwell time
          </p>
        </div>

        {/* 4 sequential step checks */}
        <div className="space-y-3 bg-neutral-50/80 rounded-xl p-4 border border-neutral-100">
          {optimizationSteps.map((step) => {
            return (
              <div
                key={step.id}
                className={`flex items-center justify-between p-2.5 rounded-lg transition-all duration-300 ${
                  step.active
                    ? 'bg-white shadow-sm border border-neutral-200 scale-[1.02]'
                    : step.completed
                    ? 'bg-neutral-100/60 opacity-90'
                    : 'opacity-40'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                      step.completed
                        ? 'bg-neutral-900 text-[#D4F634]'
                        : step.active
                        ? 'bg-[#D4F634] text-neutral-900'
                        : 'bg-neutral-200 text-neutral-500'
                    }`}
                  >
                    {step.completed ? (
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    ) : step.active ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <span>{step.id}</span>
                    )}
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-neutral-900">
                      {step.label}
                    </div>
                    <div className="text-[11px] text-neutral-500">
                      {step.sublabel}
                    </div>
                  </div>
                </div>

                <div>
                  {step.completed && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                      <Sparkles className="w-3 h-3" /> Ready
                    </span>
                  )}
                  {step.active && (
                    <span className="text-[11px] font-medium text-neutral-500 animate-pulse">
                      Analyzing…
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer status text */}
        <div className="mt-5 text-center text-xs text-neutral-400 font-mono">
          Algorithm: Linear Cost-Carbon Minimization • CAISO & Time-of-Day
        </div>
      </div>
    </div>
  );
};
