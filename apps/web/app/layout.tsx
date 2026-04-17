import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '../components/providers';

export const metadata: Metadata = {
  title: { default: 'Aurum Operations Platform', template: '%s | AOP' },
  description: 'Gold trade finance and export operations platform',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'AOP Agent',
  },
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
