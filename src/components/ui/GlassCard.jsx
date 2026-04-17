import { motion } from 'framer-motion';
import clsx from 'clsx';

export default function GlassCard({ children, className, hover = false, animate = true, ...props }) {
  const Component = animate ? motion.div : 'div';
  const animateProps = animate ? {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35 },
  } : {};

  return (
    <Component
      className={clsx(hover ? 'card-hover' : 'card', className)}
      {...animateProps}
      {...props}
    >
      {children}
    </Component>
  );
}
