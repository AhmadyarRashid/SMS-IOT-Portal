'use client';

import dynamic from 'next/dynamic';
import { ProtectedGate } from '../../src/components/auth/AuthGate';
import { LoadingSpinner } from '../../src/components/ui';

const DashboardLayout = dynamic(
  () => import('../../src/components/layout/DashboardLayout'),
  { ssr: false, loading: () => <LoadingSpinner size="lg" fullScreen /> }
);

export default function AppLayout({ children }) {
  return (
    <ProtectedGate>
      <DashboardLayout>{children}</DashboardLayout>
    </ProtectedGate>
  );
}
