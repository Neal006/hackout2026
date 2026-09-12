import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GlobalStateProvider } from './context/GlobalStateContext';
import AppShell from './components/AppShell';
import DriverView from './pages/DriverView';
import DashboardOverview from './pages/DashboardOverview';
import OpsDashboard from './pages/OpsDashboard';
import SessionsView from './pages/SessionsView';
import ChargersView from './pages/ChargersView';
import SchedulesView from './pages/SchedulesView';
import ImpactView from './pages/ImpactView';
import AlertsView from './pages/AlertsView';
import TariffsView from './pages/TariffsView';

function App() {
  return (
    <GlobalStateProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/ops/overview" replace />} />
          
          <Route path="/ops" element={<AppShell />}>
            <Route path="overview" element={<DashboardOverview />} />
            <Route path="sites" element={<OpsDashboard />} />
            <Route path="sessions" element={<SessionsView />} />
            <Route path="chargers" element={<ChargersView />} />
            <Route path="schedules" element={<SchedulesView />} />
            <Route path="impact" element={<ImpactView />} />
            <Route path="alerts" element={<AlertsView />} />
            <Route path="tariffs" element={<TariffsView />} />
            <Route index element={<Navigate to="overview" replace />} />
          </Route>
          
          <Route path="/driver" element={<DriverView />} />
        </Routes>
      </BrowserRouter>
    </GlobalStateProvider>
  );
}

export default App;
