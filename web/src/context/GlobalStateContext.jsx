import React, { createContext, useContext, useState, useEffect } from 'react';

const GlobalStateContext = createContext();

export function GlobalStateProvider({ children }) {
  const [data, setData] = useState(() => {
    // Generate 40 stable mock connectors for Ahmedabad Office (the main detail site)
    const connectors = Array.from({ length: 40 }, (_, i) => {
      const id = `CN-${String(i + 1).padStart(2, '0')}`;
      const hasBoost = Math.random() > 0.9;
      const deadlineMins = Math.floor(Math.random() * 240) + 15; 
      const startPct = Math.random() * 20; 
      const planWidth = 30 + Math.random() * 40; 
      const actualWidth = planWidth * (0.5 + Math.random() * 0.5); 
      const status = Math.random() > 0.3 ? 'Charging' : 'Waiting';
      const energyReq = 8.0 + Math.floor(Math.random() * 10);
      const delivered = energyReq * (actualWidth / planWidth);
      const driver = ['Priya', 'Rahul', 'Arjun', 'Neha', 'Tom', 'Sofia'][Math.floor(Math.random() * 6)];
      const carModels = ['Tesla Model 3', 'Hyundai Ioniq 5', 'Ford Mustang Mach-E', 'Nissan Leaf', 'Chevy Bolt'];
      const carModel = carModels[Math.floor(Math.random() * carModels.length)];
      const licensePlate = `ABC-${1000 + Math.floor(Math.random() * 9000)}`;
      return { id, driver, carModel, licensePlate, deadlineMins, hasBoost, startPct, planWidth, actualWidth, status, energyReq, delivered, power: status === 'Charging' ? 6.8 : 0 };
    });

    // Mock Sites Table
    const sites = [
      { id: 'Ahmedabad Office', status: 'Normal', connectors: 40, charging: 26, loadKw: 118, limitKw: 150, risk: 2, savings: 142 },
      { id: 'Campus North', status: 'Normal', connectors: 24, charging: 18, loadKw: 74, limitKw: 100, risk: 0, savings: 96 },
      { id: 'Tech Park', status: 'Attention', connectors: 32, charging: 27, loadKw: 144, limitKw: 150, risk: 4, savings: 81 },
      { id: 'Airport Lot', status: 'Normal', connectors: 48, charging: 31, loadKw: 126, limitKw: 180, risk: 1, savings: 109 },
    ];

    // Mock Alerts
    const alerts = [
      { id: 1, severity: 'Warning', site: 'Tech Park', entity: 'CN-14', time: '10 mins ago', desc: 'Approaching deadline risk', status: 'Active' },
      { id: 2, severity: 'Critical', site: 'Tech Park', entity: 'Site Load', time: '14 mins ago', desc: 'Load within 5% of hardware limit', status: 'Active' },
      { id: 3, severity: 'Warning', site: 'Ahmedabad Office', entity: 'CN-04', time: '1 hour ago', desc: 'Charger offline', status: 'Active' },
    ];

    // Sessions History
    const sessions = Array.from({ length: 50 }, (_, i) => ({
      id: `SESS-${1000 + i}`,
      site: sites[Math.floor(Math.random() * sites.length)].id,
      connector: `CN-${Math.floor(Math.random() * 20) + 1}`,
      arrival: '08:30 AM',
      departure: '17:30 PM',
      energy: `${8.0 + Math.floor(Math.random() * 10)} kWh`,
      status: Math.random() > 0.5 ? 'Completed' : (Math.random() > 0.5 ? 'Charging' : 'Waiting'),
      risk: Math.random() > 0.9 ? 'High' : 'Low'
    }));

    // Hardware Chargers
    const chargersList = Array.from({ length: 144 }, (_, i) => ({
      id: `HW-${2000 + i}`,
      site: sites[Math.floor(Math.random() * sites.length)].id,
      connector: `CN-${(i % 40) + 1}`,
      status: Math.random() > 0.05 ? (Math.random() > 0.5 ? 'Charging' : 'Available') : (Math.random() > 0.5 ? 'Offline' : 'Faulted'),
      power: 6.8,
      energyToday: 14.5,
      lastHeartbeat: '1 min ago'
    }));

    return {
      systemStatus: 'Optimal',
      portfolio: {
        totalSites: 12,
        activeSessions: 342,
        totalSavingsUsd: 428,
        totalSavingsKgCo2: 136,
        currentDemandKw: 840,
        limitKw: 1200,
        peakAvoidedKw: 94,
        energyScheduledMwh: 1.42
      },
      siteDetail: {
        id: 'Ahmedabad Office',
        limitKw: 150,
        currentLoadKw: 118, // 86 EV + 32 Building
        evLoadKw: 86,
        buildingLoadKw: 32,
        mode: 'normal',
        solved_at: Date.now(),
        isOptimizing: false,
        impact: { saved_usd: 142.50, saved_kgco2: 45.2, peak_avoided: 18.5 },
        meter_ticks: Array.from({ length: 24 }, (_, i) => ({
          time: i,
          ev: 30 + Math.random() * 50,
          building: 20 + Math.random() * 10
        })),
        connectors
      },
      sites,
      alerts,
      sessions,
      chargersList
    };
  });

  const triggerEvent = (endpoint, payload) => {
    setData(prev => {
      let newState = { ...prev };
      let siteDetail = { ...newState.siteDetail };
      let connectors = [...siteDetail.connectors];
      let alerts = [...newState.alerts];

      if (endpoint === 'demo_driver_early') {
        if (connectors.length > 0) connectors.shift();
      } else if (endpoint === 'demo_driver_boost' || endpoint === 'boost') {
        if (connectors.length > 0) {
          connectors[0].hasBoost = true;
          connectors[0].deadlineMins = 5; 
          connectors[0].status = 'Charging';
        }
      } else if (endpoint === 'demo_late_surge') {
        for (let i = 0; i < 20; i++) {
          connectors.push({
            id: `CN-L${i}-${Date.now()}`, driver: 'Guest', carModel: 'Unknown', licensePlate: 'N/A', deadlineMins: Math.floor(Math.random() * 120) + 10,
            hasBoost: false, startPct: 80, planWidth: 10, actualWidth: 5, status: 'Waiting', energyReq: 10, delivered: 2, power: 0
          });
        }
        siteDetail.evLoadKw += 40;
        alerts.unshift({ id: Date.now(), severity: 'Critical', site: 'Ahmedabad Office', entity: 'Site Load', time: 'Just now', desc: 'Load spike due to late arrivals', status: 'Active' });
      } else if (endpoint === 'demo_grid_fail') {
        newState.systemStatus = 'Degraded';
        siteDetail.mode = 'cached forecast';
        alerts.unshift({ id: Date.now(), severity: 'Warning', site: 'Global', entity: 'System', time: 'Just now', desc: 'Grid carbon signal unavailable, using fallback', status: 'Active' });
      } else if (endpoint === 'resolve_alert') {
        alerts = alerts.map(a => a.id === payload ? { ...a, status: 'Resolved' } : a);
      } else if (endpoint === 'reoptimize_start') {
        siteDetail.isOptimizing = true;
      } else if (endpoint === 'reoptimize_end') {
        siteDetail.isOptimizing = false;
        siteDetail.solved_at = Date.now();
      } else if (endpoint === 'prioritize_connector') {
        connectors = connectors.map(c => c.id === payload ? { ...c, status: 'Charging', hasBoost: true, deadlineMins: 5 } : c);
      } else if (endpoint === 'pause_connector') {
        connectors = connectors.map(c => c.id === payload ? { ...c, status: 'Paused', power: 0 } : c);
      }
      
      siteDetail.connectors = connectors;
      newState.siteDetail = siteDetail;
      newState.alerts = alerts;
      return newState;
    });
  };

  return (
    <GlobalStateContext.Provider value={{ data, triggerEvent }}>
      {children}
    </GlobalStateContext.Provider>
  );
}

export const useGlobalState = () => useContext(GlobalStateContext);
