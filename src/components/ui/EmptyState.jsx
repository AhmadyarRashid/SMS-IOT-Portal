import { motion } from 'framer-motion';
import { Inbox } from 'lucide-react';

export default function EmptyState({ icon: Icon = Inbox, title = 'Nothing here yet', message = 'There is no data to display.', action }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-16 px-4"
    >
      <div className="p-4 rounded-2xl mb-4 border"
           style={{
             background: 'color-mix(in srgb, var(--color-ink-0) 4%, transparent)',
             borderColor: 'color-mix(in srgb, var(--color-ink-0) 8%, transparent)',
           }}>
        <Icon className="w-8 h-8 text-[var(--color-ink-2)]" strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold text-[var(--color-ink-0)] mb-1">{title}</h3>
      <p className="text-sm text-[var(--color-ink-2)] mb-4 text-center max-w-sm">{message}</p>
      {action}
    </motion.div>
  );
}
