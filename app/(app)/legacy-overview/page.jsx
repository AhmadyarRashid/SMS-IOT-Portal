'use client';

import dynamic from 'next/dynamic';
import { LoadingSpinner } from '../../../src/components/ui';

const Page = dynamic(() => import('../../../src/views/OverviewPage'), {
  ssr: false,
  loading: () => <LoadingSpinner size="lg" fullScreen />,
});

export default function RouteLegacyOverview() {
  return <Page />;
}
