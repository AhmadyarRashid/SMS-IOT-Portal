import { motion } from 'framer-motion';
import clsx from 'clsx';

const variants = {
  primary: 'bg-brand-600 hover:bg-brand-700 text-white border-brand-600 shadow-sm',
  secondary: 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-sm',
  danger: 'bg-danger-50 hover:bg-danger-100 text-danger-600 border-danger-200',
  accent: 'bg-accent-50 hover:bg-accent-100 text-accent-600 border-accent-200',
  ghost: 'bg-transparent hover:bg-slate-100 text-slate-500 border-transparent',
};

const sizes = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-sm',
};

export default function Button({ children, variant = 'primary', size = 'md', icon: Icon, className, loading, ...props }) {
  return (
    <motion.button
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      className={clsx(
        'inline-flex items-center justify-center gap-2 font-semibold rounded-lg border transition-colors cursor-pointer',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className
      )}
      disabled={loading}
      {...props}
    >
      {loading ? (
        <motion.div
          className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        />
      ) : Icon ? (
        <Icon className="w-4 h-4" />
      ) : null}
      {children}
    </motion.button>
  );
}
