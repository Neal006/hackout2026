export interface Vehicle {
  id: string;
  name: string;
  model: string;
  variant: string;
  batteryCapacityKwh: number;
  currentSoC: number; // percentage, e.g. 62
  targetSoC: number; // percentage, e.g. 90
  maxChargeRateKw: number; // e.g. 11
  chargerName: string;
  chargerType: string;
  vin: string;
  firmware: string;
  connected: boolean;
  status: 'idle' | 'scheduled' | 'charging' | 'complete';
}

export interface OptimizationStep {
  id: number;
  label: string;
  sublabel: string;
  completed: boolean;
  active: boolean;
}

export interface ChargingSchedule {
  connectTime: string; // "6:30 PM"
  departureTime: string; // "11:00 AM"
  connectDateTime: Date;
  departureDateTime: Date;
  flexibilityHours: number;
  flexibilityMinutes: number;
  optimalStart: string; // "11:40 PM"
  optimalEnd: string; // "2:10 AM"
  chargingDurationHours: number; // 2.5
  energyNeededKwh: number; // 28.4
  smartCost: number; // 96
  normalCost: number; // 128
  savings: number; // 32
  co2AvoidedKg: number; // 4.2
  normalCo2Kg: number; // 7.3
  smartCo2Kg: number; // 3.1
  isOptimizing: boolean;
  hasOptimized: boolean;
  chargeMode: 'smart' | 'immediate';
}

export interface HourlyDataPoint {
  hourLabel: string; // e.g. "6 PM"
  rawHour: number; // 18 for 6 PM, 23 for 11 PM, 2 for 2 AM etc.
  tariff: number; // in $/kWh e.g. 4.50, 3.38
  gridDemandGw: number; // e.g. 4.8, 1.8
  renewablePercent: number; // e.g. 38%, 84%
  isOptimal: boolean;
  isPluggedIn: boolean;
}

export interface ChargingSession {
  id: string;
  date: string;
  timeRange: string;
  energyKwh: number;
  cost: number;
  normalCost: number;
  savings: number;
  co2AvoidedKg: number;
  targetReached: number;
  isOptimal: boolean;
  charger: string;
}

export type NavTab = 'dashboard' | 'charge' | 'schedule' | 'history' | 'profile';
