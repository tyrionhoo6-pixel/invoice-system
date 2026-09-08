'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { InvoiceService } from '@/services/invoice.service';
import type { CompanySettings } from '@/types/company';
import type { Invoice } from '@/types/invoice';
import { useLanguage } from '@/context/LanguageContext';
import { downloadCsv, invoiceExportHeaders } from '@/utils/csv';
import { formatDate, monthKey } from '@/utils/format';
import { formatMoney } from '@/lib/utils';

export default function InvoicesPage() {
  const { t } = useLanguage();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [customerId, setCustomerId] = useState('all');
  const [month, setMonth] = useState('');
  const [exportMode, setExportMode] = useState('current');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [loadedInvoices, settings] = await Promise.all([InvoiceService.getInvoices(), InvoiceService.getCompanySettings()]);
        setInvoices(loadedInvoices);
        setCompany(settings);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load invoices.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const customers = useMemo(() => {
    const uniqueCustomers = new Map<string, string>();
    invoices.forEach((invoice) => uniqueCustomers.set(invoice.customer_id, invoice.customer?.name || 'Unnamed customer'));
    return Array.from(uniqueCustomers, ([id, name]) => ({ id, name })).sort((left, right) => left.name.localeCompare(right.name));
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return invoices.filter((invoice) => {
      const customerName = `${invoice.customer?.name ?? ''} ${invoice.customer?.company_name ?? ''}`.toLowerCase();
      return (!normalizedQuery || invoice.invoice_number.toLowerCase().includes(normalizedQuery) || customerName.includes(normalizedQuery))
        && (status === 'all' || (invoice.status ?? 'unpaid').toLowerCase() === status)
        && (customerId === 'all' || invoice.customer_id === customerId)
        && (!month || monthKey(invoice.created_at) === month);
    });
  }, [invoices, query, status, customerId, month]);

  const summary = useMemo(() => filteredInvoices.reduce((result, invoice) => {
    const amount = Number(invoice.total_amount) || 0;
    result.totalInvoices += 1;
    result.totalValue += amount;
    if ((invoice.status ?? 'unpaid').toLowerCase() === 'paid') result.paid += amount;
    else result.outstanding += amount;
    return result;
  }, { totalInvoices: 0, totalValue: 0, paid: 0, outstanding: 0 }), [filteredInvoices]);

  const exportRows = (rows: Invoice[], fileName: string) => {
    const rowsForExport = rows.map((invoice) => [
      invoice.invoice_number,
      invoice.created_at ? new Date(invoice.created_at).toISOString().slice(0, 10) : '',
      String(invoice.due_date ?? ''),
      invoice.customer?.name ?? '',
      invoice.customer?.email ?? '',
      Number(invoice.subtotal_amount) || 0,
      company?.sst_no ?? '',
      Number(invoice.total_amount) || 0,
      (invoice.status ?? 'unpaid').toUpperCase(),
      company?.payment_terms ?? '',
    ]);
    downloadCsv([invoiceExportHeaders, ...rowsForExport], fileName);
  };

  const exportInvoices = () => {
    const today = new Date().toISOString().slice(0, 10);
    if (exportMode === 'monthly') {
      const selectedMonth = month || today.slice(0, 7);
      exportRows(invoices.filter((invoice) => monthKey(invoice.created_at) === selectedMonth), `invoices_monthly_${selectedMonth}.csv`);
    } else if (exportMode === 'backup') {
      const companyName = (company?.company_name || 'company').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toLowerCase();
      exportRows(invoices, `backup_all_invoices_${companyName || 'company'}_${today}.csv`);
    } else {
      const clientName = customerId === 'all' ? 'all_clients' : (customers.find((customer) => customer.id === customerId)?.name || 'client').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
      exportRows(filteredInvoices, `statement_${clientName}_${today}.csv`);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-700">{t.invoice.workspace}</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{t.navigation.invoices}</h1><p className="mt-2 text-sm text-slate-500">{t.invoice.latestActivity}</p></div>
          <div className="flex flex-col gap-2 sm:flex-row"><select value={exportMode} onChange={(event) => setExportMode(event.target.value)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold"><option value="current">Export current view / statement</option><option value="monthly">Export all invoices this month</option><option value="backup">Full company backup</option></select><button type="button" onClick={exportInvoices} className="min-h-11 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700">Export CSV</button><Link href="/invoices/new" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-700 px-4 text-sm font-bold text-white hover:bg-blue-800">+ {t.invoice.newInvoice}</Link></div>
        </header>
        {errorMessage && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{errorMessage}</p>}
        <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Invoices</p><p className="mt-2 text-2xl font-bold">{summary.totalInvoices}</p></div><div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Value</p><p className="mt-2 text-2xl font-bold">{formatMoney(summary.totalValue)}</p></div><div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-100"><p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Paid</p><p className="mt-2 text-2xl font-bold text-emerald-800">{formatMoney(summary.paid)}</p></div><div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-100"><p className="text-xs font-bold uppercase tracking-wider text-amber-700">Outstanding</p><p className="mt-2 text-2xl font-bold text-amber-800">{formatMoney(summary.outstanding)}</p></div></section>
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_190px_170px_170px]"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.invoice.search} className="min-h-12 rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" /><select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="min-h-12 rounded-xl border border-slate-300 bg-white px-3 font-semibold"><option value="all">Select client</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="min-h-12 rounded-xl border border-slate-300 px-3 font-semibold" aria-label="Select month" /><select value={status} onChange={(event) => setStatus(event.target.value)} className="min-h-12 rounded-xl border border-slate-300 bg-white px-3 font-semibold"><option value="all">{t.invoice.allStatuses}</option><option value="paid">{t.status.paid}</option><option value="unpaid">{t.status.unpaid}</option></select></div>
          <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-3 font-bold">{t.invoice.invoice}</th><th className="px-3 py-3 font-bold">{t.invoice.customer}</th><th className="px-3 py-3 font-bold">{t.invoice.issued}</th><th className="px-3 py-3 text-right font-bold">{t.invoice.totalShort}</th><th className="px-3 py-3 font-bold">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{loading && <tr><td colSpan={5} className="px-3 py-10 text-center text-slate-500">{t.invoice.loadingInvoices}</td></tr>}{!loading && filteredInvoices.length === 0 && <tr><td colSpan={5} className="px-3 py-10 text-center text-slate-500">{t.invoice.noMatch}</td></tr>}{filteredInvoices.map((invoice) => { const paid = (invoice.status ?? 'unpaid').toLowerCase() === 'paid'; return <tr key={invoice.id} className="hover:bg-slate-50"><td className="px-3 py-4"><Link href={`/invoices/${invoice.id}`} className="font-bold text-blue-700">{invoice.invoice_number}</Link></td><td className="px-3 py-4"><p className="font-semibold">{invoice.customer?.name ?? t.invoice.customer}</p><p className="text-xs text-slate-500">{invoice.customer?.company_name ?? t.customer.noCompany}</p></td><td className="px-3 py-4 text-slate-600">{formatDate(invoice.created_at)}</td><td className="px-3 py-4 text-right font-bold">{formatMoney(invoice.total_amount)}</td><td className="px-3 py-4"><span className={`rounded-full px-3 py-1 text-xs font-bold ${paid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{paid ? t.status.paid : t.status.unpaid}</span></td></tr>; })}</tbody></table></div>
        </section>
      </div>
    </main>
  );
}
