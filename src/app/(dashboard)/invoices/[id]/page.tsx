'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { InvoiceService } from '@/services/invoice.service';
import type { InvoiceWithItems } from '@/types/invoice';
import { useLanguage } from '@/context/LanguageContext';
import type { CompanySettings } from '@/types/company';
import { formatMoney } from '@/lib/utils';
import { formatDate } from '@/utils/format';

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const [invoice, setInvoice] = useState<InvoiceWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingStatus, setSavingStatus] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [company, setCompany] = useState<CompanySettings | null>(null);

  useEffect(() => {
    const loadInvoice = async () => {
      try {
        const result = await InvoiceService.getInvoiceById(params.id);
        const companySettings = await InvoiceService.getCompanySettings();
        if (!result) setErrorMessage('Invoice not found.');
        setInvoice(result);
        setCompany(companySettings);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load invoice.');
      } finally {
        setLoading(false);
      }
    };
    if (params.id) void loadInvoice();
  }, [params.id]);

  useEffect(() => {
    if (!loading && invoice && searchParams.get('print') === '1') {
      const printTimer = window.setTimeout(() => window.print(), 250);
      return () => window.clearTimeout(printTimer);
    }
    return undefined;
  }, [invoice, loading, searchParams]);

  const changeStatus = async (status: 'paid' | 'unpaid') => {
    if (!invoice) return;
    setSavingStatus(true);
    setErrorMessage('');
    try {
      setInvoice({ ...invoice, ...(await InvoiceService.updateInvoiceStatus(invoice.id, status)) });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update invoice status.');
    } finally {
      setSavingStatus(false);
    }
  };

  const shareViaWhatsApp = () => {
    if (!invoice) return;
    const customerName = invoice.customer?.name ?? 'customer';
    const amount = formatMoney(invoice.total_amount);
    const link = `${window.location.origin}/invoices/${invoice.id}`;
    const message = `Hello ${customerName}, your invoice ${invoice.invoice_number} for ${amount} is ready. View it here: ${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const duplicateInvoice = () => {
    if (!invoice) return;
    sessionStorage.setItem('invoice-duplicate-draft', JSON.stringify({
      customerId: invoice.customer_id,
      lessAmount: Number(invoice.less_amount) || 0,
      items: (invoice.invoice_items ?? []).map((item) => ({
        product_id: item.product_id ?? null,
        description: item.product_name,
        qty: Number(item.quantity) || 1,
        unit_price: Number(item.unit_price) || 0,
        subtotal: Number(item.subtotal) || 0,
      })),
    }));
    router.push('/invoices/new?duplicate=1');
  };

  if (loading) return <main className="min-h-screen bg-slate-50 px-4 py-10 text-center text-slate-500">{t.invoice.loading}</main>;
  if (!invoice) return <main className="min-h-screen bg-slate-50 px-4 py-10 text-center"><p className="font-semibold text-red-700">{errorMessage || t.invoice.notFound}</p><Link href="/invoices" className="mt-4 inline-flex font-bold text-blue-700">{t.invoice.backToInvoices}</Link></main>;

  const invoiceStatus = (invoice.status ?? 'unpaid').toLowerCase();
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="no-print mx-auto mb-5 flex max-w-4xl flex-wrap items-center justify-between gap-3"><Link href="/invoices" className="text-sm font-bold text-slate-600 hover:text-blue-700">← {t.invoice.backToInvoices}</Link><div className="flex flex-wrap gap-2"><button type="button" onClick={shareViaWhatsApp} className="min-h-11 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-emerald-700">{t.actions.shareWhatsApp}</button><button type="button" onClick={duplicateInvoice} className="min-h-11 rounded-xl bg-white px-4 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">{t.actions.duplicate}</button><button type="button" onClick={() => void changeStatus(invoiceStatus === 'paid' ? 'unpaid' : 'paid')} disabled={savingStatus} className="min-h-11 rounded-xl bg-white px-4 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-60">{savingStatus ? t.actions.saving : invoiceStatus === 'paid' ? t.actions.markUnpaid : t.actions.markPaid}</button><button type="button" onClick={() => window.print()} className="min-h-11 rounded-xl bg-blue-700 px-4 text-sm font-bold text-white shadow-sm hover:bg-blue-800">{t.actions.print}</button></div></div>
      {errorMessage && <p className="no-print mx-auto mb-4 max-w-4xl rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{errorMessage}</p>}
      <article className="invoice-paper mx-auto max-w-4xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-10">
        <header className="flex flex-col justify-between gap-6 border-b border-slate-200 pb-8 sm:flex-row"><div className="flex items-start gap-4">{company?.logo_url && <img src={company.logo_url} alt="Company logo" className="h-16 w-16 object-contain" />}<div><p className="text-sm font-bold uppercase tracking-[0.2em] text-blue-700">{company?.company_name || 'InvoiceSys'}</p><h1 className="mt-3 text-3xl font-bold tracking-tight">INVOICE</h1><p className="mt-2 text-sm text-slate-500">Professional billing statement</p><p className="mt-2 text-xs text-slate-500">{company?.reg_no || ''}{company?.sst_no ? ` | SST: ${company.sst_no}` : ''}</p></div></div><div className="sm:text-right"><p className="text-sm font-bold text-slate-500">Invoice Number</p><p className="mt-1 text-2xl font-bold">{invoice.invoice_number}</p><p className="mt-2 text-sm text-slate-500">Issued: {formatDate(invoice.created_at)}</p><span className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-bold ${invoiceStatus === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{invoiceStatus === 'paid' ? 'PAID' : 'UNPAID'}</span></div></header>
        <section className="grid gap-6 border-b border-slate-200 py-8 sm:grid-cols-2"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">From</p><p className="mt-2 font-bold">{company?.company_name || 'InvoiceSys'}</p><p className="whitespace-pre-line text-sm text-slate-500">{company?.address || 'Billing Department'}</p><p className="text-sm text-slate-500">{company?.phone || ''} {company?.email ? `| ${company.email}` : ''}</p></div><div className="sm:text-right"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Bill To</p><p className="mt-2 font-bold">{invoice.customer?.name ?? 'Customer'}</p><p className="text-sm text-slate-500">{invoice.customer?.company_name ?? 'Individual customer'}</p><p className="text-sm text-slate-500">{invoice.customer?.phone ?? ''}</p></div></section>
        <section className="py-8"><div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead className="border-b-2 border-slate-900"><tr><th className="pb-3 font-bold">Item Description</th><th className="pb-3 text-right font-bold">Qty</th><th className="pb-3 text-right font-bold">Unit Price</th><th className="pb-3 text-right font-bold">Subtotal</th></tr></thead><tbody className="divide-y divide-slate-100">{(invoice.invoice_items ?? []).map((item, index) => <tr key={item.id ?? `${item.product_name}-${index}`}><td className="py-4 font-medium">{item.product_name}</td><td className="py-4 text-right">{item.quantity}</td><td className="py-4 text-right">{formatMoney(item.unit_price)}</td><td className="py-4 text-right font-semibold">{formatMoney(item.subtotal)}</td></tr>)}</tbody></table></div></section>
        <section className="ml-auto max-w-sm border-t border-slate-200 pt-5"><div className="flex justify-between py-2 text-sm"><span className="text-slate-500">Subtotal</span><span className="font-semibold">{formatMoney(invoice.subtotal_amount)}</span></div><div className="flex justify-between py-2 text-sm"><span className="text-slate-500">Discount</span><span className="font-semibold">-{formatMoney(invoice.less_amount)}</span></div><div className="mt-3 flex justify-between border-t-2 border-slate-900 pt-4 text-lg"><span className="font-bold">Total Payable</span><span className="font-bold">{formatMoney(invoice.total_amount)}</span></div></section>
        <footer className="mt-12 border-t border-slate-200 pt-5 text-sm text-slate-500"><p>Thank you for your business.</p><p className="mt-1">{company?.payment_terms || 'Please retain this invoice for your records.'}</p>{company?.bank_name && <p className="mt-3 font-semibold text-slate-700">Bank: {company.bank_name} | Account: {company.bank_account_no} | Holder: {company.bank_account_holder}</p>}</footer>
      </article>
      <div className="no-print mx-auto mt-5 max-w-4xl text-center text-xs text-slate-500">Use your browser&apos;s print dialog to save this invoice as a PDF.</div>
    </main>
  );
}