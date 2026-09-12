// The driver app is WattWise (../wattwise, :5174 in dev, :3001 under compose). This route just sends people there.
const DRIVER_URL = import.meta.env.VITE_DRIVER_URL ?? (import.meta.env.DEV ? 'http://localhost:5174' : 'http://localhost:3001');

export default function DriverView() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-bg text-ink p-8">
      <h1 className="text-2xl font-semibold">Driver app lives in WattWise</h1>
      <p className="text-sm text-ink-muted text-center max-w-md">
        One question at plug-in ("ready by when?"), one Boost button, a receipt on unplug. Same backend, same site.
      </p>
      <a href={DRIVER_URL} className="px-6 py-2 bg-ink text-surface text-sm uppercase tracking-wider">Open WattWise →</a>
      <code className="text-xs text-ink-muted">{DRIVER_URL}</code>
    </div>
  );
}
