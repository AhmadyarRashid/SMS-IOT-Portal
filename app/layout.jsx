import './globals.css';
import Providers from './providers';
import ServiceWorkerRegister from './sw-register';

export const metadata = {
  title: 'SMS IoT — Client Portal',
  description: 'SMS IoT client portal — monitor and control IoT devices across sites.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'SMS IoT',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: '/favicon.svg',
    apple: '/favicon.svg',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1.0,
  themeColor: '#0891b2',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      </head>
      <body>
        <Providers>{children}</Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
