import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import SiteHeader from '@/components/site-header';
import { LanguageProvider } from '@/context/LanguageContext';

export const metadata: Metadata = {
  title: 'Invoice System',
  description: 'Invoice management system',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body suppressHydrationWarning>
        <LanguageProvider>
          <SiteHeader />
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}