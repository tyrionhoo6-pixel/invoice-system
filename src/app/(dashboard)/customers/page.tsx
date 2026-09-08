'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { CustomerService } from '@/services/customer.service';
import type { CustomerInput } from '@/services/invoice.service';
import type { Customer } from '@/types/invoice';
import { useLanguage } from '@/context/LanguageContext';

const emptyForm: CustomerInput = { name: '', company_name: '', contact_person: '', email: '', phone: '', address: '', registration_no: '', sst_no: '' };

function getForm(customer?: Customer): CustomerInput {
  return customer ? { name: customer.name || '', company_name: customer.company_name || '', contact_person: customer.contact_person || '', email: customer.email || '', phone: customer.phone || '', address: customer.address || '', registration_no: customer.registration_no || customer.reg_no || '', sst_no: customer.sst_no || '' } : { ...emptyForm };
}

export default function CustomersPage() {
  const { t } = useLanguage();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [form, setForm] = useState<CustomerInput>({ ...emptyForm });
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const loadCustomers = async () => {
    setErrorMessage('');
    try { setCustomers(await CustomerService.list()); }
    catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Unable to load customers.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void loadCustomers(); }, []);

  const openForm = (customer?: Customer) => { setEditingCustomer(customer || null); setForm(getForm(customer)); setFormOpen(true); setErrorMessage(''); setMessage(''); };
  const closeForm = () => { setFormOpen(false); setEditingCustomer(null); setForm({ ...emptyForm }); };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setErrorMessage(''); setMessage('');
    try {
      if (editingCustomer) { await CustomerService.update(editingCustomer.id, form); setMessage(t.customer.updated); }
      else { await CustomerService.create(form); setMessage(t.customer.added); }
      closeForm();
      await loadCustomers();
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Unable to save customer.'); }
    finally { setSaving(false); }
  };

  const removeCustomer = async () => {
    if (!deletingCustomer) return;
    setDeleting(true); setErrorMessage(''); setMessage('');
    try { await CustomerService.remove(deletingCustomer.id); setDeletingCustomer(null); setMessage(t.customer.deleted); await loadCustomers(); }
    catch (error) { setDeletingCustomer(null); setErrorMessage(error instanceof Error ? error.message : t.customer.invoiceBlock); }
    finally { setDeleting(false); }
  };

  const input = (key: keyof CustomerInput, label: string, type = 'text', required = false) => <label className="block text-sm font-bold">{label}<input required={required} type={type} value={form[key] || ''} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 font-normal outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" /></label>;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-700">{t.customer.directory}</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{t.customer.title}</h1><p className="mt-2 text-sm text-slate-500">{t.customer.description}</p></div><div className="flex gap-2"><button type="button" onClick={() => openForm()} className="min-h-11 rounded-xl bg-blue-700 px-4 text-sm font-bold text-white hover:bg-blue-800">+ {t.customer.add}</button><Link href="/invoices/new" className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">{t.customer.create}</Link></div></header>
        {errorMessage && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{errorMessage}</p>}
        {message && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</p>}
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6"><div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-bold">{t.customer.list}</h2><p className="mt-1 text-sm text-slate-500">{customers.length} {t.customer.saved}</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">{t.customer.directory}</span></div><div className="mt-5 divide-y divide-slate-100">{loading && <p className="py-8 text-center text-sm text-slate-500">{t.customer.loading}</p>}{!loading && customers.length === 0 && <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">{t.customer.empty}</p>}{customers.map((customer) => <div key={customer.id} className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="font-bold">{customer.company_name || customer.name || t.customer.unnamed}</p><p className="text-sm text-slate-600">{customer.contact_person || customer.name || t.customer.unnamed}{customer.email ? ` - ${customer.email}` : ''}</p><p className="text-xs text-slate-500">{customer.phone || t.customer.noPhone}{customer.registration_no ? ` - ${customer.registration_no}` : ''}</p></div><div className="flex shrink-0 gap-2"><button type="button" onClick={() => openForm(customer)} className="min-h-10 rounded-lg bg-slate-100 px-3 text-sm font-bold text-slate-700 hover:bg-slate-200">{t.customer.edit}</button><button type="button" onClick={() => setDeletingCustomer(customer)} className="min-h-10 rounded-lg bg-red-50 px-3 text-sm font-bold text-red-700 hover:bg-red-100">{t.customer.delete}</button></div></div>)}</div></section>
      </div>
      {formOpen && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4" role="dialog" aria-modal="true"><div className="mx-auto my-6 max-w-2xl rounded-2xl bg-white p-5 shadow-2xl sm:p-7"><div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-bold">{editingCustomer ? t.customer.edit : t.customer.add}</h2><p className="mt-1 text-sm text-slate-500">{t.customer.description}</p></div><button type="button" onClick={closeForm} className="text-xl font-bold text-slate-400">x</button></div><form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">{input('company_name', t.customer.company, 'text', true)}{input('contact_person', t.customer.contactPerson)}{input('name', t.customer.name, 'text', true)}{input('email', t.customer.email, 'email')}{input('phone', t.customer.phone)}{input('registration_no', t.customer.registrationNo)}{input('sst_no', t.customer.sstNo)}<label className="block text-sm font-bold sm:col-span-2">{t.customer.address}<textarea value={form.address || ''} onChange={(event) => setForm({ ...form, address: event.target.value })} rows={3} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" /></label><div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={closeForm} className="min-h-11 rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-700">{t.customer.cancel}</button><button disabled={saving} className="min-h-11 rounded-xl bg-blue-700 px-4 text-sm font-bold text-white disabled:opacity-60">{saving ? t.customer.adding : editingCustomer ? t.customer.update : t.customer.add}</button></div></form></div></div>}
      {deletingCustomer && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-xl font-bold">{t.customer.confirmDelete}</h2><p className="mt-2 text-sm text-slate-500">{t.customer.confirmDeleteDescription}</p><p className="mt-3 font-semibold">{deletingCustomer.company_name || deletingCustomer.name}</p><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setDeletingCustomer(null)} className="min-h-11 rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-700">{t.customer.cancel}</button><button type="button" onClick={() => void removeCustomer()} disabled={deleting} className="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-bold text-white disabled:opacity-60">{deleting ? t.customer.deleting : t.customer.delete}</button></div></div></div>}
    </main>
  );
}
