import { useState } from 'react';
import { useGlobalState } from '../context/GlobalStateContext';
import { useNavigate } from 'react-router-dom';

export default function OpsDashboard() {
  const { data, triggerEvent } = useGlobalState();
  const { siteDetail: site } = data;
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState('Live charging');
  const [selectedConnectorId, setSelectedConnectorId] = useState(null);
  const selectedConnector = selectedConnectorId ? site.connectors.find(c => c.id === selectedConnectorId) : null;

  if (!site) return null;

  const tabs = ['Overview', 'Live charging', 'Schedule', 'Chargers', 'Impact', 'Settings'];

  return (
    <div className="flex flex-col h-screen max-h-screen">
      
      {/* HEADER & KPI STRIP */}
      <header className="px-8 py-6 border-b border-border shrink-0 bg-surface">
        <div className="flex justify-between items-end mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-ink">{site.id}</h1>
          </div>
          <div className="flex gap-8 text-right text-sm">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-ink-muted">Status</span>
              <span className="text-ink font-medium">Operational</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-ink-muted">Site limit</span>
              <span className="mono text-ink font-medium">{site.limitKw} kW</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-ink-muted">Current EV load</span>
              <span className="mono text-solar font-medium">{site.evLoadKw} kW</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-ink-muted">Available</span>
              <span className="mono text-ink font-medium">{site.limitKw - site.currentLoadKw} kW</span>
            </div>
          </div>
        </div>
        
        {/* TABS */}
        <div className="flex gap-6 mt-6">
          {tabs.map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-grid-blue text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex overflow-hidden bg-bg">
        
        {activeTab === 'Live charging' ? (
          <div className="flex-1 flex overflow-hidden">
            
            {/* GANTT CHART */}
            <div className="flex-1 overflow-y-auto p-8 border-r border-border">
              <div className="flex justify-between items-end mb-4">
                <h2 className="text-lg font-medium text-ink">Site-Level Charging Plan</h2>
                <div className="flex gap-4 text-[10px] uppercase tracking-wider text-ink-muted">
                  <span className="flex items-center gap-1"><div className="w-3 h-3 bg-solar/20"></div> Planned</span>
                  <span className="flex items-center gap-1"><div className="w-3 h-3 bg-grid-blue/80"></div> Actual</span>
                  <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 bg-ink rotate-45"></div> Deadline</span>
                </div>
              </div>

              <div className="border border-border bg-surface flex flex-col">
                <div className="flex border-b border-border bg-bg px-4 py-2">
                  <div className="w-16 text-xs text-ink-muted mono shrink-0">CN</div>
                  <div className="flex-1 flex justify-between text-[10px] text-ink-muted mono">
                    <span>06:00</span><span>08:00</span><span>10:00</span><span>12:00</span><span>14:00</span><span>16:00</span><span>18:00</span><span>20:00</span><span>22:00</span>
                  </div>
                </div>
                
                <div className="flex flex-col p-4 gap-2">
                  {site.connectors.map(c => (
                    <div 
                      key={c.id} 
                      onClick={() => setSelectedConnectorId(c.id)}
                      className={`flex items-center gap-4 group cursor-pointer p-1 -mx-1 rounded transition-colors ${selectedConnector?.id === c.id ? 'bg-bg' : 'hover:bg-bg/50'}`}
                    >
                      <span className="mono text-xs w-12 shrink-0 text-ink-muted group-hover:text-ink">{c.id}</span>
                      <div className="flex-1 h-6 relative bg-bg border border-border group-hover:border-ink/20 transition-colors">
                        <div className="absolute top-0 bottom-0 bg-solar/20" style={{ left: `${c.startPct}%`, width: `${c.planWidth}%` }}>
                          <div className="absolute top-1 bottom-1 left-0 bg-grid-blue/80" style={{ width: `${(c.actualWidth / c.planWidth) * 100}%` }}></div>
                        </div>
                        <div className="absolute top-1/2 -mt-1 w-2 h-2 bg-ink rotate-45" style={{ left: `${c.startPct + c.planWidth}%`, transform: 'translate(-50%, -50%) rotate(45deg)' }}></div>
                        {c.hasBoost && <div className="absolute top-0 bottom-0 w-[2px] bg-danger" style={{ left: `${c.startPct + 5}%` }}></div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* RIGHT SIDE PANEL */}
            {selectedConnector && (
              <aside className="w-80 shrink-0 bg-surface flex flex-col overflow-y-auto">
                <div className="p-6 border-b border-border flex justify-between items-center sticky top-0 bg-surface z-10">
                  <h2 className="text-xl font-semibold">{selectedConnector.id}</h2>
                  <button onClick={() => setSelectedConnectorId(null)} className="text-ink-muted hover:text-ink text-sm">Close</button>
                </div>
                
                <div className="p-6 flex flex-col gap-6">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-ink-muted">Status</span>
                    <span className={`inline-flex w-max items-center px-2 py-0.5 rounded text-[10px] uppercase font-mono ${selectedConnector.status === 'Charging' ? 'bg-solar/10 text-solar border border-solar/20' : selectedConnector.status === 'Paused' ? 'bg-danger/10 text-danger border border-danger/20' : 'bg-bg border border-border'}`}>{selectedConnector.status}</span>
                  </div>

                  <div className="flex flex-col gap-3 text-sm">
                    <div className="flex justify-between border-b border-border pb-2">
                      <span className="text-ink-muted">Driver Name</span>
                      <span className="font-medium">{selectedConnector.driver}</span>
                    </div>
                    <div className="flex justify-between border-b border-border pb-2">
                      <span className="text-ink-muted">Car Model</span>
                      <span className="font-medium">{selectedConnector.carModel}</span>
                    </div>
                    <div className="flex justify-between border-b border-border pb-2">
                      <span className="text-ink-muted">License Plate</span>
                      <span className="mono">{selectedConnector.licensePlate}</span>
                    </div>
                    <div className="flex justify-between border-b border-border pb-2">
                      <span className="text-ink-muted">Energy required</span>
                      <span className="mono">{selectedConnector.energyReq.toFixed(1)} kWh</span>
                    </div>
                    <div className="flex justify-between border-b border-border pb-2">
                      <span className="text-ink-muted">Delivered</span>
                      <span className="mono">{selectedConnector.delivered.toFixed(1)} kWh</span>
                    </div>
                    <div className="flex justify-between border-b border-border pb-2">
                      <span className="text-ink-muted">Current power</span>
                      <span className="mono">{selectedConnector.power.toFixed(1)} kW</span>
                    </div>
                    <div className="flex justify-between border-b border-border pb-2">
                      <span className="text-ink-muted">Scheduled</span>
                      <span className="mono">{selectedConnector.scheduled}</span>
                    </div>
                    <div className="flex justify-between border-b border-border pb-2">
                      <span className="text-ink-muted">Ready by</span>
                      <span className="mono">{selectedConnector.readyBy}</span>
                    </div>
                    <div className="flex justify-between border-b border-border pb-2">
                      <span className="text-ink-muted">Deadline risk</span>
                      <span className={`font-medium ${selectedConnector.risk === 'High' ? 'text-danger' : 'text-saved'}`}>{selectedConnector.risk}</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 mt-4">
                    <button onClick={() => navigate('/ops/overview')} className="w-full text-xs uppercase tracking-wider border border-border py-2 hover:bg-bg transition-colors">Dashboard (Overview)</button>
                    <button onClick={() => navigate('/ops/sessions')} className="w-full text-xs uppercase tracking-wider border border-border py-2 hover:bg-bg transition-colors">View session</button>
                    <button onClick={() => navigate('/ops/schedules')} className="w-full text-xs uppercase tracking-wider border border-border py-2 hover:bg-bg transition-colors">Edit schedule</button>
                    <button 
                      onClick={() => triggerEvent('prioritize_connector', selectedConnector.id)}
                      className="w-full text-xs uppercase tracking-wider bg-ink text-surface py-2 hover:opacity-90 transition-opacity"
                    >
                      Prioritize (Boost)
                    </button>
                    <button 
                      onClick={() => triggerEvent('pause_connector', selectedConnector.id)}
                      className="w-full text-xs uppercase tracking-wider border border-danger text-danger py-2 hover:bg-danger/5 transition-colors"
                    >
                      Pause
                    </button>
                  </div>
                </div>
              </aside>
            )}
          </div>
        ) : (
          <div className="p-8 flex flex-col justify-center items-center h-full w-full">
            <h2 className="text-2xl font-medium text-ink mb-2">{activeTab}</h2>
            <p className="text-ink-muted text-sm mb-6">This section displays the {activeTab.toLowerCase()} data for the selected site.</p>
            <button onClick={() => setActiveTab('Live charging')} className="px-4 py-2 border border-border text-ink hover:bg-bg transition-colors text-sm">Return to Live charging</button>
          </div>
        )}
      </main>
    </div>
  );
}
