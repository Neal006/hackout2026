export default function SettingsView() {
  return (
    <div className="p-8 max-w-5xl mx-auto w-full">
      <header className="mb-8 flex justify-between items-end border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Settings</h1>
          <p className="text-sm text-ink-muted mt-1">Configure application preferences</p>
        </div>
      </header>

      <section className="mb-12">
        <h2 className="text-lg font-medium text-ink mb-4">General Preferences</h2>
        <div className="border border-border bg-surface p-6 flex flex-col gap-6">
          <p className="text-sm text-ink-muted">Settings configuration options will appear here in the final version.</p>
        </div>
      </section>
    </div>
  );
}
