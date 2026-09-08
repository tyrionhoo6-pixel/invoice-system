'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { User } from 'lucide-react';
import { localeLabels } from '@/lib/i18n';
import { useLanguage } from '@/context/LanguageContext';
import { supabase } from '@/lib/supabase/client';
import { InvoiceService } from '@/services/invoice.service';

export default function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [companyName, setCompanyName] = useState('My Company');
  const [logoUrl, setLogoUrl] = useState('');
  const { locale, toggleLocale, t } = useLanguage();
  const links = [
    { href: '/', label: t.navigation.dashboard },
    { href: '/invoices', label: t.navigation.invoices },
    { href: '/customers', label: t.navigation.customers },
    { href: '/settings', label: 'Settings' },
  ];

  useEffect(() => {
    const syncHeader = async () => {
      const { data } = await supabase.auth.getUser();
      setUserEmail(data.user?.email ?? '');
      if (!data.user) {
        setCompanyName('My Company');
        setLogoUrl('');
        return;
      }
      try {
        const settings = await InvoiceService.getCompanySettings();
        setCompanyName(settings?.company_name?.trim() || 'My Company');
        setLogoUrl(settings?.logo_url?.trim() || '');
      } catch {
        setCompanyName('My Company');
        setLogoUrl('');
      }
    };

    void syncHeader();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? '');
      void syncHeader();
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const logout = async () => { await supabase.auth.signOut(); router.replace('/login'); };

  return (
    <header className="no-print sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" onClick={() => setMenuOpen(false)} className="group flex items-center gap-3" aria-label="InvoiceSys home">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-700 text-sm font-black text-white shadow-sm transition group-hover:bg-blue-800">IS</span>
          <span className="text-base font-black tracking-tight text-slate-900">InvoiceSys</span>
        </Link>
        <Link href="/settings" className="ml-auto mr-3 flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-50" aria-label="Company settings">
          <span className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-slate-100 border border-slate-200 flex items-center justify-center">
            {logoUrl ? <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" /> : <User className="w-4 h-4 text-slate-500" />}
          </span>
          <span className="max-w-[150px] truncate text-sm font-bold text-slate-700">{companyName}</span>
        </Link>
        <div className="flex items-center gap-2">
        <button type="button" onClick={toggleLocale} aria-label={`${t.navigation.language}: ${localeLabels[locale]}`} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 shadow-sm transition hover:border-blue-300 hover:text-blue-700">{locale === 'en' ? '中文' : 'English'}</button>
        <button type="button" aria-expanded={menuOpen} aria-controls="site-navigation" onClick={() => setMenuOpen((open) => !open)} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 md:hidden"><span className="sr-only">{t.actions.toggleMenu}</span><span className="text-xl">{menuOpen ? 'x' : '='}</span></button>
        </div>
        <nav id="site-navigation" className={`${menuOpen ? 'absolute left-4 right-4 top-[4.5rem] flex' : 'hidden'} flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg md:static md:flex md:flex-row md:items-center md:border-0 md:bg-transparent md:p-0 md:shadow-none`}>
          {links.map((link) => {
            const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
            return <Link key={link.href} href={link.href} onClick={() => setMenuOpen(false)} className={`rounded-xl px-4 py-2.5 text-sm font-bold transition ${active ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>{link.label}</Link>;
          })}
          {userEmail && <Link href="/settings" onClick={() => setMenuOpen(false)} className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100">{userEmail}</Link>}
          {userEmail && <button type="button" onClick={logout} className="rounded-xl px-4 py-2.5 text-left text-sm font-bold text-red-600 hover:bg-red-50">Logout</button>}
        </nav>
      </div>
    </header>
  );
}