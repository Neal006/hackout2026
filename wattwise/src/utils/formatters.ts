export function formatCurrency(amount: number): string {
  const v = Math.abs(amount) < 0.005 ? 0 : amount; // no "$-0.00"
  return `$${v.toFixed(2)}`;
}

export function formatKw(kw: number): string {
  return `${kw.toFixed(1)} kW`;
}

export function formatKwh(kwh: number): string {
  return `${kwh.toFixed(1)} kWh`;
}

export function formatCo2(kg: number): string {
  return `${kg.toFixed(1)} kg`;
}

export function calculateFlexibility(connectDateStr: string, connectTimeStr: string, departureDateStr: string, departureTimeStr: string): {
  hours: number;
  minutes: number;
  totalMinutes: number;
  formatted: string;
  isValid: boolean;
} {
  try {
    const connect = new Date(`${connectDateStr}T${connectTimeStr}`);
    const departure = new Date(`${departureDateStr}T${departureTimeStr}`);

    const diffMs = departure.getTime() - connect.getTime();
    if (isNaN(diffMs) || diffMs <= 0) {
      return {
        hours: 0,
        minutes: 0,
        totalMinutes: 0,
        formatted: '0h 0m',
        isValid: false,
      };
    }

    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return {
      hours,
      minutes,
      totalMinutes,
      formatted: minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`,
      isValid: true,
    };
  } catch {
    return {
      hours: 0,
      minutes: 0,
      totalMinutes: 0,
      formatted: '0h 0m',
      isValid: false,
    };
  }
}

export function estimateKmRange(socPercent: number, totalCapacityKwh: number = 75): number {
  // Tesla Model 3 Long Range ~ 560 km on 100% (approx 7.46 km per kWh)
  const availableKwh = (socPercent / 100) * totalCapacityKwh;
  return Math.round(availableKwh * 7.46);
}
