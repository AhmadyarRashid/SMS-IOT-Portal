'use client';

import dynamic from 'next/dynamic';
import { PublicGate } from '../../src/components/auth/AuthGate';
import { LoadingSpinner } from '../../src/components/ui';

const LoginPage = dynamic(() => import('../../src/views/LoginPage'), {
  ssr: false,
  loading: () => <LoadingSpinner size="lg" fullScreen />,
});

export default function RouteLogin() {
  return (
    <PublicGate>
      <LoginPage />
    </PublicGate>
  );
}
