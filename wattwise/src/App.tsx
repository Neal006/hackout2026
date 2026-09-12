import React from 'react';
import { WattwiseProvider, useWattwise } from './context/WattwiseContext';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { MobileNav } from './components/layout/MobileNav';
import { ConnectVehicleModal } from './components/modal/ConnectVehicleModal';
import { OptimizationLoader } from './components/modal/OptimizationLoader';
import { DashboardView } from './components/views/DashboardView';
import { ChargeView } from './components/views/ChargeView';
import { ScheduleView } from './components/views/ScheduleView';
import { HistoryView } from './components/views/HistoryView';
import { ProfileView } from './components/views/ProfileView';

const MainLayout: React.FC = () => {
  const { currentNav } = useWattwise();

  return (
    <div className="min-h-screen bg-[#F7F7F5] text-[#171717] flex flex-col md:flex-row antialiased">
      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 md:pl-64 flex flex-col min-h-screen pb-20 md:pb-10">
        {/* Sticky Header */}
        <Header />

        {/* Dynamic Page Views */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6">
          {currentNav === 'dashboard' && <DashboardView />}
          {currentNav === 'charge' && <ChargeView />}
          {currentNav === 'schedule' && <ScheduleView />}
          {currentNav === 'history' && <HistoryView />}
          {currentNav === 'profile' && <ProfileView />}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileNav />

      {/* Mandatory Connect Vehicle Modal */}
      <ConnectVehicleModal />

      {/* 2-3s Optimization Animation Sequence */}
      <OptimizationLoader />
    </div>
  );
};

export function App() {
  return (
    <WattwiseProvider>
      <MainLayout />
    </WattwiseProvider>
  );
}

export default App;
