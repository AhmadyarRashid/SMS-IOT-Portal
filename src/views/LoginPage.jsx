import { useState } from 'react';
import { useNavigate } from '@/lib/router-shim';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Lock, User, ArrowRight, ShieldCheck } from 'lucide-react';
import useAuthStore from '../store/authStore';
import './login.css';

/**
 * SMS IoT portal sign-in screen.
 *
 * Everything auth-related is unchanged — same username/password grant via
 * `useAuthStore#login`, same navigate-on-success, same isLoading / error
 * handling. This rewrite is purely a visual layering pass to match the
 * restrained-premium direction used elsewhere in the app:
 *
 *   • ambient drifting gradient blobs (same CSS pattern as /sites)
 *   • bigger brand tile with a breathing halo and an orbiting accent dot
 *   • an inline SVG illustration of connected device nodes with a flowing
 *     dasharray pulse between them
 *   • glass-morphism form panel with a subtle cyan rim
 *   • cyan bloom on the focused input field (icon + border + soft glow)
 *   • white shine sweep across the submit button on hover
 *   • gradient-filled title ("Welcome back")
 *   • L-shaped corner bracket accents in the viewport
 *   • staggered mount entrance
 *
 * Every animation is gated on `prefers-reduced-motion` (see login.css).
 */
export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const { login, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const success = await login(username, password);
    if (success) navigate('/');
  };

  const stagger = {
    hidden: {},
    show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
  };
  const item = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 26 } },
  };

  return (
    <div className="login-page">
      {/* Layer 0 — ambient gradient blobs + subtle grid */}
      <div className="login-ambient" aria-hidden="true">
        <span className="login-blob login-blob-a" />
        <span className="login-blob login-blob-b" />
      </div>
      <div className="login-grid" aria-hidden="true" />

      {/* Layer 1 — corner bracket accents */}
      <span className="login-corner login-corner-tl" aria-hidden="true" />
      <span className="login-corner login-corner-tr" aria-hidden="true" />
      <span className="login-corner login-corner-bl" aria-hidden="true" />
      <span className="login-corner login-corner-br" aria-hidden="true" />

      {/* Layer 10 — content */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={stagger}
        className="relative z-10 w-full max-w-[440px]"
      >
        {/* Brand tile with halo + orbiting dot */}
        <motion.div variants={item} className="login-brand">
          <div className="login-brand-tile">
            <span className="login-brand-halo" aria-hidden="true" />
            <ShieldCheck className="w-10 h-10 text-white relative z-[1]" strokeWidth={2} />
            <span className="login-brand-orbit" aria-hidden="true" />
          </div>
        </motion.div>

        {/* Product name — the only text above the form */}
        <motion.h1 variants={item} className="login-product">
          SMS IoT Portal
        </motion.h1>

        {/* Glass form panel */}
        <motion.div variants={item} className="login-panel">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <motion.div
                initial={{ opacity: 0, x: 0 }}
                animate={{ opacity: 1, x: [0, -6, 6, -3, 3, 0] }}
                transition={{ x: { duration: 0.45 } }}
                className="login-error"
              >
                {error}
              </motion.div>
            )}

            <div>
              <label className="login-label" htmlFor="login-username">Username</label>
              <div className={`login-field ${focusedField === 'username' ? 'login-field-focus' : ''}`}>
                <User className="login-field-icon" strokeWidth={1.75} />
                <input
                  id="login-username"
                  type="text"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); clearError(); }}
                  onFocus={() => setFocusedField('username')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Your username"
                  className="login-input"
                  autoFocus
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div>
              <label className="login-label" htmlFor="login-password">Password</label>
              <div className={`login-field ${focusedField === 'password' ? 'login-field-focus' : ''}`}>
                <Lock className="login-field-icon" strokeWidth={1.75} />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearError(); }}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="••••••••"
                  className="login-input login-input-pw"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="login-toggle"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={isLoading || !username || !password}
              className="login-submit"
            >
              <span className="login-submit-shine" aria-hidden="true" />
              {isLoading ? (
                <motion.span
                  className="login-spinner"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
              ) : (
                <>Sign in <ArrowRight className="w-4 h-4" /></>
              )}
            </motion.button>
          </form>
        </motion.div>

        <motion.p variants={item} className="login-footer">
          Secured via SMS IoT · v1.0.0
        </motion.p>
      </motion.div>
    </div>
  );
}
