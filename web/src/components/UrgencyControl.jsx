import { useState } from 'react';
import { useGlobalState } from '../context/GlobalStateContext';

// business.md §4b: three bands, one price. The operator sets it on a driver's behalf ("she called reception").
const BANDS = [
  { level: 'now', label: 'Leaving now', copy: 'Full power from the next slot until the car unplugs. Pays today\'s rate.' },
  { level: 'soon', label: 'Leaving soon', copy: 'New ready-by time; the plan moves into the cleanest slots before it. Under 15 min = leaving now.' },
  { level: 'priority', label: 'Prioritise', copy: 'Keeps the ready-by; holds 90 % of pro-rata and gives way last if the site is tight.' },
];

export default function UrgencyControl({ sessionId, simTime, current, compact = false }) {
  const { setUrgency } = useGlobalState();
  const [pick, setPick] = useState(null); // band awaiting confirmation
  const [leaveAt, setLeaveAt] = useState('');
  const [busy, setBusy] = useState(false);

  const defaultLeave = () => {
    const t = simTime ? new Date(simTime) : new Date();
    t.setHours(t.getHours() + 1, 0, 0, 0);
    return t.toTimeString().slice(0, 5);
  };

  const confirm = async () => {
    setBusy(true);
    let iso = null;
    if (pick.level === 'soon') {
      const base = simTime ? new Date(simTime) : new Date();
      const [h, m] = (leaveAt || defaultLeave()).split(':').map(Number);
      base.setHours(h, m, 0, 0);
      iso = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
    }
    await setUrgency(sessionId, pick.level, iso);
    setBusy(false);
    setPick(null);
  };

  if (current) {
    return <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] border bg-solar/10 text-solar border-solar/20">{current === 'now' ? 'leaving now' : current}</span>;
  }

  if (pick) {
    return (
      <div className={`flex flex-col gap-2 border border-border bg-bg p-2 text-left ${compact ? 'text-[11px]' : 'text-xs'}`}>
        <span className="font-medium text-ink">{pick.label}</span>
        <span className="text-ink-muted">{pick.copy}</span>
        {pick.level === 'soon' && (
          <label className="flex items-center gap-2">
            <span className="text-ink-muted">Leaves at</span>
            <input id={`leave-at-${sessionId}`} type="time" value={leaveAt || defaultLeave()} onChange={(e) => setLeaveAt(e.target.value)} className="border border-border bg-surface px-1 py-0.5 mono" />
          </label>
        )}
        <div className="flex gap-2">
          <button disabled={busy} onClick={confirm} className="px-2 py-1 bg-ink text-surface disabled:opacity-50">{busy ? 'Sending…' : 'Confirm'}</button>
          <button disabled={busy} onClick={() => setPick(null)} className="px-2 py-1 border border-border">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap gap-1 ${compact ? '' : 'justify-end'}`}>
      {BANDS.map((b) => (
        <button key={b.level} onClick={() => setPick(b)} title={b.copy} className="px-1.5 py-0.5 text-[10px] border border-border hover:border-ink transition-colors">
          {b.label}
        </button>
      ))}
    </div>
  );
}
