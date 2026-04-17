import { motion } from 'framer-motion';

export default function LoadingSpinner({ size = 'md', fullScreen = false }) {
  const sizes = { sm: 'w-5 h-5', md: 'w-8 h-8', lg: 'w-12 h-12' };

  const spinner = (
    <div className="flex flex-col items-center gap-3">
      <motion.div
        className={`${sizes[size]} rounded-full border-2`}
        style={{
          borderColor: 'color-mix(in srgb, var(--color-ink-0) 10%, transparent)',
          borderTopColor: 'var(--color-accent-500)',
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      />
      {size === 'lg' && (
        <p className="text-sm text-[var(--color-ink-2)]">Loading…</p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="flex items-center justify-center min-h-screen"
           style={{ background: 'var(--color-surface-0)' }}>
        {spinner}
      </div>
    );
  }
  return spinner;
}
