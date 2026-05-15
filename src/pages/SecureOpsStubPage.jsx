import { Construction } from 'lucide-react';

/**
 * Shared stub for SecureOps tabs that aren't built yet (Video, Control, Audit).
 * The shell + header are provided by DashboardLayout / SecureOpsHeader so the
 * tabs render in place — the stub only fills the page body.
 */
export default function SecureOpsStubPage({ title, subtitle }) {
  return (
    <div className="p-6 max-w-[900px] mx-auto">
      <section className="panel p-8 text-center">
        <div
          className="w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center"
          style={{ background: 'color-mix(in srgb, var(--color-accent-500) 14%, transparent)', color: 'var(--color-accent-400)' }}
        >
          <Construction className="w-6 h-6" strokeWidth={1.75} />
        </div>
        <h2 className="text-xl font-bold mb-1">{title}</h2>
        <p className="text-sm text-[var(--color-ink-2)]">{subtitle}</p>
      </section>
    </div>
  );
}
