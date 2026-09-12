import type { Vehicle } from '../types/wattwise';

// Vehicle cosmetics only. The backend knows kWh per session, not the car, so name/model/VIN stay client-side.
// currentSoC here is the SoC assumed at plug-in; live SoC = this + delivered kWh / capacity.
export const INITIAL_VEHICLE: Vehicle = {
  id: 'veh_tm3_001',
  name: 'Srishti’s Model 3',
  model: 'Tesla Model 3',
  variant: 'Long Range Dual Motor',
  batteryCapacityKwh: 75,
  currentSoC: 62,
  targetSoC: 80,
  maxChargeRateKw: 7,
  chargerName: 'Noonshift site-1',
  chargerType: 'Level 2 AC (7 kW)',
  vin: '5YJ3E1EB9MF892314',
  firmware: 'v2026.8.4',
  connected: false,
  status: 'idle',
};
