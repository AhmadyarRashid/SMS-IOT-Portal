import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Lock, User, ArrowRight, ShieldCheck } from 'lucide-react';
import useAuthStore from '../store/authStore';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { login, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const success = await login(username, password);
    if (success) navigate('/');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
         style={{ background: 'radial-gradient(1200px 600px at 20% 0%, color-mix(in srgb, var(--color-accent-500) 18%, transparent), transparent 60%), radial-gradient(1200px 600px at 80% 100%, color-mix(in srgb, var(--color-brand-700) 40%, transparent), transparent 60%), var(--color-surface-0)' }}>
      {/* Grid bg */}
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
           style={{
             backgroundImage: 'linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)',
             backgroundSize: '60px 60px',
           }} />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative z-10 w-full max-w-[420px]"
      >
        <div className="text-center mb-6">
          <div className="inline-flex p-3 rounded-2xl mb-3"
               style={{ background: 'linear-gradient(135deg, var(--color-accent-400), var(--color-accent-600))' }}>
            <ShieldCheck className="w-8 h-8 text-white" strokeWidth={2} />
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-ink-0)] mb-1">SMS IoT Portal</h1>
          <p className="text-sm text-[var(--color-ink-2)]">Monitor and control your sites, anywhere.</p>
        </div>

        <div className="panel p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="p-3 rounded-xl text-sm sev-critical"
              >
                {error}
              </motion.div>
            )}

            <div>
              <label className="block text-xs font-medium text-[var(--color-ink-2)] mb-1.5">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-ink-3)]" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); clearError(); }}
                  placeholder="Your username"
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{
                    background: 'var(--color-surface-0)',
                    color: 'var(--color-ink-0)',
                    border: '1px solid color-mix(in srgb, var(--color-ink-0) 8%, transparent)',
                  }}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--color-ink-2)] mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-ink-3)]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearError(); }}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl text-sm outline-none"
                  style={{
                    background: 'var(--color-surface-0)',
                    color: 'var(--color-ink-0)',
                    border: '1px solid color-mix(in srgb, var(--color-ink-0) 8%, transparent)',
                  }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)] hover:text-[var(--color-ink-0)]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              type="submit"
              disabled={isLoading || !username || !password}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, var(--color-accent-500), var(--color-accent-600))',
                boxShadow: '0 8px 20px -10px color-mix(in srgb, var(--color-accent-500) 60%, transparent)',
              }}
            >
              {isLoading ? (
                <motion.div
                  className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
              ) : (
                <>Sign in <ArrowRight className="w-4 h-4" /></>
              )}
            </motion.button>
          </form>
        </div>

        <p className="text-center text-[11px] text-[var(--color-ink-3)] mt-4">
          Secured via SMS IoT
        </p>
      </motion.div>
    </div>
  );
}
