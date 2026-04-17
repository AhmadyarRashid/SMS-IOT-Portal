import clsx from 'clsx';

const variants = {
  online: 'bg-accent-50 text-accent-600 border-accent-200',
  offline: 'bg-slate-100 text-slate-500 border-slate-200',
  warning: 'bg-warning-50 text-warning-600 border-warning-200',
  danger: 'bg-danger-50 text-danger-600 border-danger-200',
  info: 'bg-brand-50 text-brand-600 border-brand-200',
};

export default function StatusBadge({ status, label, dot = true, className }) {
  const variant = variants[status] || variants.info;
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-md border', variant, className)}>
      {dot && (
        <span className={clsx('w-1.5 h-1.5 rounded-full', {
          'bg-accent-500 pulse-dot': status === 'online',
          'bg-slate-400': status === 'offline',
          'bg-warning-500 pulse-dot': status === 'warning',
          'bg-danger-500 pulse-dot': status === 'danger',
          'bg-brand-500': status === 'info',
        })} />
      )}
      {label || status}
    </span>
  );
}
