'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useAuthStore from '../../store/authStore';
import { LoadingSpinner } from '../ui';

/**
 * Wraps protected routes. On client mount, if no token, redirect to /login.
 * Auth lives in localStorage so this can't be server-rendered.
 */
export function ProtectedGate({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
    } else {
      setReady(true);
    }
  }, [isAuthenticated, router]);

  if (!ready) return <LoadingSpinner size="lg" fullScreen />;
  return children;
}

/**
 * Wraps /login. If a token is already present, bounce to the home page.
 */
export function PublicGate({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/');
    } else {
      setReady(true);
    }
  }, [isAuthenticated, router]);

  if (!ready) return <LoadingSpinner size="lg" fullScreen />;
  return children;
}
