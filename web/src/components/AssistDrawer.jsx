import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { API } from '../lib/api';

// The operator assistant (prompt.md WP6): explains and suggests from live state + repo docs; never acts. The operator clicks.
const KEY = 'noonshift.assist.history';
const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) || []; } catch { return []; } };
const save = (msgs) => { try { sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-40))); } catch { /* private window etc. */ } };

export default function AssistDrawer() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState(load);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null); // { text, retry }
  const [chips, setChips] = useState([]);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const endRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    fetch(`${API}/assist/suggestions`).then((r) => (r.ok ? r.json() : [])).then(setChips).catch(() => setChips([]));
  }, [open]);
  useEffect(() => { save(msgs); endRef.current?.scrollIntoView({ block: 'end' }); }, [msgs, busy]);

  const ask = async (question) => {
    const q = question.trim();
    if (!q || busy) return;
    const history = msgs.slice(-6).map(({ role, content }) => ({ role, content }));
    setMsgs((m) => [...m, { role: 'user', content: q }]);
    setInput('');
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${API}/assist`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q, history, page: pathname }) });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(r.status === 429 ? `${d.detail || 'Too many questions.'} (retry in ${r.headers.get('retry-after') || 20} s)` : d.detail || `Backend answered ${r.status}`);
      }
      const a = await r.json();
      setMsgs((m) => [...m, { role: 'assistant', content: a.answer, sources: a.sources, actions: a.suggested_actions, offline: a.fallback || a.degraded }]);
    } catch (e) {
      setMsgs((m) => m.slice(0, -1));
      setError({ text: e.message || 'Could not reach the backend.', retry: q });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="assist-drawer" title="Ask the operator assistant"
        className="fixed bottom-4 right-4 z-40 h-11 px-4 rounded-full bg-ink text-surface text-sm font-medium shadow-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-grid-blue">
        {open ? 'Close' : 'Ask'}
      </button>

      {open && (
        <aside id="assist-drawer" role="dialog" aria-label="Operator assistant"
          className="fixed inset-y-0 right-0 z-30 w-full sm:w-[360px] bg-surface border-l border-border shadow-xl flex flex-col">
          <header className="px-4 py-3 border-b border-border">
            <div className="font-semibold text-sm">Operator assistant</div>
            <div className="text-[11px] text-ink-muted">Answers from today's site state and the docs. It explains and suggests; you click.</div>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3 text-sm">
            {msgs.length === 0 && <div className="text-ink-muted text-xs">Try one of the questions below, or ask about a bay by id (e.g. "why is c07 at 1.4 kW?").</div>}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'self-end max-w-[90%] bg-bg border border-border px-3 py-2' : 'self-start max-w-[95%] flex flex-col gap-2'}>
                <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                {m.role === 'assistant' && (
                  <>
                    {(m.offline || m.sources?.length > 0) && (
                      <div className="flex flex-wrap gap-1">
                        {m.offline && <span className="text-[10px] uppercase tracking-wider text-ink-muted border border-border px-1.5 py-0.5">offline answer</span>}
                        {m.sources?.map((s) => <span key={s} className="text-[10px] text-ink-muted bg-bg px-1.5 py-0.5">{s}</span>)}
                      </div>
                    )}
                    {m.actions?.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {m.actions.map((a) => (
                          <button key={a.label + a.path} onClick={() => navigate(a.path)} className="text-xs border border-ink px-2 py-1 hover:bg-ink hover:text-surface transition-colors">{a.label} →</button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
            {busy && <div className="text-ink-muted text-xs animate-pulse">Thinking…</div>}
            {error && (
              <div className="text-xs text-danger flex flex-wrap items-center gap-2">
                <span>{error.text}</span>
                <button onClick={() => ask(error.retry)} className="underline">Retry</button>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {chips.length > 0 && (
            <div className="px-4 pb-2 flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <button key={c} onClick={() => ask(c)} disabled={busy} className="text-[11px] border border-border px-2 py-1 hover:border-ink transition-colors text-left disabled:opacity-50">{c}</button>
              ))}
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="border-t border-border p-3 flex gap-2">
            <input id="assist-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about today's site…" maxLength={2000} autoComplete="off"
              className="flex-1 min-w-0 border border-border px-3 py-2 text-sm bg-bg focus:outline-none focus:border-ink" />
            <button type="submit" disabled={busy || !input.trim()} className="px-3 py-2 text-sm bg-ink text-surface disabled:opacity-50">Send</button>
          </form>
        </aside>
      )}
    </>
  );
}
