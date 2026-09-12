import React, { createContext, useContext, useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import type { Vehicle, ChargingSchedule, NavTab, OptimizationStep } from '../types/wattwise';
import { INITIAL_VEHICLE, INITIAL_SCHEDULE } from '../utils/mockData';
import { calculateFlexibility } from '../utils/formatters';

interface WattwiseContextType {
  vehicle: Vehicle;
  schedule: ChargingSchedule;
  currentNav: NavTab;
  setCurrentNav: (tab: NavTab) => void;
  isConnectModalOpen: boolean;
  setIsConnectModalOpen: (open: boolean) => void;
  isOptimizing: boolean;
  optimizationSteps: OptimizationStep[];
  startOptimizationFlow: (
    connectDate: string,
    connectTime: string,
    departureDate: string,
    departureTime: string,
    targetSoC: number
  ) => void;
  disconnectVehicle: () => void;
  openConnectModal: () => void;
  setChargeMode: (mode: 'smart' | 'immediate') => void;
  updateTargetSoC: (soc: number) => void;
  isSimulatingCharge: boolean;
  startSimulation: () => void;
  stopSimulation: () => void;
  resetDemo: () => void;
}

const WattwiseContext = createContext<WattwiseContextType | undefined>(undefined);

const DEFAULT_OPTIMIZATION_STEPS: OptimizationStep[] = [
  { id: 1, label: 'Electricity prices', sublabel: 'Evaluating dynamic time-of-day tariffs', completed: false, active: false },
  { id: 2, label: 'Grid demand', sublabel: 'Analyzing regional peak load and transmission strain', completed: false, active: false },
  { id: 3, label: 'Renewable availability', sublabel: 'Forecasting local wind and solar surplus', completed: false, active: false },
  { id: 4, label: 'Vehicle availability', sublabel: 'Calculating 28.4 kWh requirement at 11 kW', completed: false, active: false },
];

export const WattwiseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [vehicle, setVehicle] = useState<Vehicle>(INITIAL_VEHICLE);
  const [schedule, setSchedule] = useState<ChargingSchedule>(INITIAL_SCHEDULE);
  const [currentNav, setCurrentNav] = useState<NavTab>('dashboard');
  const [isConnectModalOpen, setIsConnectModalOpen] = useState<boolean>(false);
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  const [optimizationSteps, setOptimizationSteps] = useState<OptimizationStep[]>(DEFAULT_OPTIMIZATION_STEPS);
  const [isSimulatingCharge, setIsSimulatingCharge] = useState<boolean>(false);

  // Mandatory connect modal opening helper
  const openConnectModal = () => {
    setIsConnectModalOpen(true);
  };

  const disconnectVehicle = () => {
    setVehicle((prev) => ({
      ...prev,
      connected: false,
      status: 'idle',
    }));
    setSchedule((prev) => ({
      ...prev,
      hasOptimized: false,
    }));
  };

  const setChargeMode = (mode: 'smart' | 'immediate') => {
    setSchedule((prev) => ({
      ...prev,
      chargeMode: mode,
    }));
    if (mode === 'immediate') {
      setVehicle((prev) => ({
        ...prev,
        status: 'charging',
      }));
    } else {
      setVehicle((prev) => ({
        ...prev,
        status: 'scheduled',
      }));
    }
  };

  const updateTargetSoC = (newTarget: number) => {
    setVehicle((prev) => ({
      ...prev,
      targetSoC: newTarget,
    }));

    const kwhNeeded = Number((((newTarget - vehicle.currentSoC) / 100) * vehicle.batteryCapacityKwh).toFixed(1));
    const durationHours = Number((kwhNeeded / vehicle.maxChargeRateKw).toFixed(1));
    const smartCost = Math.round(kwhNeeded * 3.38);
    const normalCost = Math.round(kwhNeeded * 4.51);
    const savings = normalCost - smartCost;
    const co2Avoided = Number((kwhNeeded * 0.148).toFixed(1));

    setSchedule((prev) => ({
      ...prev,
      energyNeededKwh: Math.max(0, kwhNeeded),
      chargingDurationHours: Math.max(0.5, durationHours),
      smartCost,
      normalCost,
      savings,
      co2AvoidedKg: co2Avoided,
    }));
  };

  const startOptimizationFlow = (
    connectDate: string,
    connectTime: string,
    departureDate: string,
    departureTime: string,
    targetSoC: number
  ) => {
    setIsConnectModalOpen(false);
    setIsOptimizing(true);

    const flex = calculateFlexibility(connectDate, connectTime, departureDate, departureTime);

    // Reset steps
    setOptimizationSteps(DEFAULT_OPTIMIZATION_STEPS.map((s) => ({ ...s, completed: false, active: false })));

    // Step 1: Electricity prices
    setTimeout(() => {
      setOptimizationSteps((prev) => [
        { ...prev[0], active: true },
        prev[1],
        prev[2],
        prev[3],
      ]);
    }, 200);

    setTimeout(() => {
      setOptimizationSteps((prev) => [
        { ...prev[0], active: false, completed: true },
        { ...prev[1], active: true },
        prev[2],
        prev[3],
      ]);
    }, 800);

    // Step 2: Grid demand
    setTimeout(() => {
      setOptimizationSteps((prev) => [
        prev[0],
        { ...prev[1], active: false, completed: true },
        { ...prev[2], active: true },
        prev[3],
      ]);
    }, 1400);

    // Step 3: Renewable availability
    setTimeout(() => {
      setOptimizationSteps((prev) => [
        prev[0],
        prev[1],
        { ...prev[2], active: false, completed: true },
        { ...prev[3], active: true },
      ]);
    }, 2000);

    // Step 4: Complete and reveal result
    setTimeout(() => {
      setOptimizationSteps((prev) => prev.map((s) => ({ ...s, completed: true, active: false })));
      
      // Calculate realistic metrics
      const kwhNeeded = Number((((targetSoC - 62) / 100) * 75).toFixed(1));
      const smartCost = 96;
      const normalCost = 128;
      const savings = 32;
      const co2Avoided = 4.2;

      setVehicle((prev) => ({
        ...prev,
        connected: true,
        currentSoC: 62,
        targetSoC: targetSoC,
        status: 'scheduled',
      }));

      setSchedule((prev) => ({
        ...prev,
        connectTime: '6:30 PM',
        departureTime: '11:00 AM',
        flexibilityHours: flex.hours || 16,
        flexibilityMinutes: flex.minutes || 30,
        optimalStart: '11:40 PM',
        optimalEnd: '2:10 AM',
        chargingDurationHours: 2.5,
        energyNeededKwh: kwhNeeded || 28.4,
        smartCost,
        normalCost,
        savings,
        co2AvoidedKg: co2Avoided,
        hasOptimized: true,
        chargeMode: 'smart',
      }));

      setIsOptimizing(false);

      // Trigger celebration confetti
      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.6 },
          colors: ['#D4F634', '#171717', '#10B981'],
        });
      } catch {
        // Safe fallback
      }
    }, 2800);
  };

  // Charge simulation loop
  useEffect(() => {
    let timer: any;
    if (isSimulatingCharge) {
      timer = setInterval(() => {
        setVehicle((prev) => {
          if (prev.currentSoC >= prev.targetSoC) {
            setIsSimulatingCharge(false);
            return { ...prev, currentSoC: prev.targetSoC, status: 'complete' };
          }
          return {
            ...prev,
            currentSoC: Math.min(prev.targetSoC, prev.currentSoC + 1),
            status: 'charging',
          };
        });
      }, 400);
    }
    return () => clearInterval(timer);
  }, [isSimulatingCharge]);

  const startSimulation = () => {
    setVehicle((prev) => ({ ...prev, currentSoC: 62, status: 'charging' }));
    setIsSimulatingCharge(true);
  };

  const stopSimulation = () => {
    setIsSimulatingCharge(false);
    setVehicle((prev) => ({ ...prev, status: 'scheduled' }));
  };

  const resetDemo = () => {
    setIsSimulatingCharge(false);
    setVehicle({ ...INITIAL_VEHICLE });
    setSchedule({ ...INITIAL_SCHEDULE });
    setOptimizationSteps(DEFAULT_OPTIMIZATION_STEPS);
    setCurrentNav('dashboard');
  };

  return (
    <WattwiseContext.Provider
      value={{
        vehicle,
        schedule,
        currentNav,
        setCurrentNav,
        isConnectModalOpen,
        setIsConnectModalOpen,
        isOptimizing,
        optimizationSteps,
        startOptimizationFlow,
        disconnectVehicle,
        openConnectModal,
        setChargeMode,
        updateTargetSoC,
        isSimulatingCharge,
        startSimulation,
        stopSimulation,
        resetDemo,
      }}
    >
      {children}
    </WattwiseContext.Provider>
  );
};

export const useWattwise = () => {
  const context = useContext(WattwiseContext);
  if (!context) {
    throw new Error('useWattwise must be used within a WattwiseProvider');
  }
  return context;
};
