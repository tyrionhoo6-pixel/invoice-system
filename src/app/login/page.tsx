'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setErrorMessage('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setErrorMessage(error.message);
    else router.replace(new URLSearchParams(window.location.search).get('next') || '/');
    setLoading(false);
  };

  return <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-slate-50 px-4 py-10"><section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8"><p className="text-sm font-black uppercase tracking-[0.18em] text-blue-700">InvoiceSys</p><h1 className="mt-3 text-3xl font-bold">Welcome back</h1><p className="mt-2 text-sm text-slate-500">Sign in to manage your invoices and company profile.</p>{errorMessage && <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{errorMessage}</p>}<form className="mt-6 space-y-4" onSubmit={submit}><label className="block text-sm font-bold">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-3 font-normal outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" /></label><label className="block text-sm font-bold">Password<input required type="password" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-3 font-normal outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" /></label><button disabled={loading} className="min-h-12 w-full rounded-xl bg-blue-700 px-4 font-bold text-white hover:bg-blue-800 disabled:opacity-60">{loading ? 'Signing in...' : 'Sign in'}</button></form><p className="mt-6 text-center text-sm text-slate-500">No account? <Link href="/register" className="font-bold text-blue-700">Create one</Link></p></section></main>;
}