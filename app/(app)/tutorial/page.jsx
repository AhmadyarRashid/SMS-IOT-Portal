'use client';

import dynamic from 'next/dynamic';
import { LoadingSpinner } from '../../../src/components/ui';

const Page = dynamic(() => import('../../../src/views/TutorialPage'), {
  ssr: false,
  loading: () => <LoadingSpinner size="lg" fullScreen />,
});

export default function RouteTutorial() {
  return <Page />;
}
