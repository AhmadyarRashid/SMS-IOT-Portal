import { motion } from 'framer-motion';

export default function StatCard({ title, value, change, icon: Icon, color = 'brand', delay = 0 }) {
  const colors = {
    brand: { bg: 'bg-brand-50', text: 'text-brand-600', iconBg: 'bg-brand-100', border: 'border-brand-200' },
    accent: { bg: 'bg-accent-50', text: 'text-accent-600', iconBg: 'bg-accent-100', border: 'border-accent-200' },
    warning: { bg: 'bg-warning-50', text: 'text-warning-600', iconBg: 'bg-warning-100', border: 'border-warning-200' },
    danger: { bg: 'bg-danger-50', text: 'text-danger-600', iconBg: 'bg-danger-100', border: 'border-danger-200' },
  };
  const c = colors[color] || colors.brand;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className={`card-hover p-4`}
    >
      <div className="flex items-start justify-between mb-2.5">
        <div className={`p-2 rounded-lg ${c.iconBg}`}>
          <Icon className={`w-5 h-5 ${c.text}`} />
        </div>
        {change !== undefined && (
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
            change >= 0 ? 'text-accent-600 bg-accent-50 border border-accent-200' : 'text-danger-600 bg-danger-50 border border-danger-200'
          }`}>
            {change >= 0 ? '+' : ''}{change}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-slate-800 mb-0.5">{value}</p>
      <p className="text-xs text-slate-500">{title}</p>
    </motion.div>
  );
}
