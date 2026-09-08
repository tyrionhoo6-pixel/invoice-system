'use client';

import { ReactNode, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      else setChecking(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [pathname, router]);

  if (checking) return <main className="min-h-screen bg-slate-50 px-4 py-10 text-center text-slate-500">Checking session...</main>;
  return <>{children}</>;
}