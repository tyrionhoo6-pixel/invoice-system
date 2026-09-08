'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Customer, Product } from '@/types/invoice';
import {
  InvoiceService,
  type CreateInvoiceItemInput,
} from '@/services/invoice.service';
import { useLanguage } from '@/context/LanguageContext';
import type { CompanySettings } from '@/types/company';
import { formatMoney } from '@/lib/utils';
import { formatDate } from '@/utils/format';

type DraftItem = CreateInvoiceItemInput & { key: number };
type InvoiceDraft = { customerId: string; items: CreateInvoiceItemInput[]; lessAmount: number };

const getRecordValue = (record: object, keys: string[]): string => {
  for (const key of keys) {
    const value = (record as Record<string, unknown>)[key];
    if (typeof value === 'string' || typeof value === 'number') return String(value);
  }
  return '';
};

const emptyItem = (key: number): DraftItem => ({ key, product_id: null, description: '', qty: 1, unit_price: 0, subtotal: 0 });

export default function NewInvoicePage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [invoiceNumber, setInvoiceNumber] = useState('Loading...');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [items, setItems] = useState<DraftItem[]>([emptyItem(1)]);
  const [lessAmount, setLessAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    void Promise.all([InvoiceService.generateNextInvoiceNumber(), InvoiceService.getCustomers(), InvoiceService.getProducts(), InvoiceService.getCompanySettings()])
      .then(([number, loadedCustomers, loadedProducts, companySettings]) => {
        setInvoiceNumber(number);
        setCustomers(loadedCustomers);
        setProducts(loadedProducts);
        setCompany(companySettings);
        const duplicateDraft = sessionStorage.getItem('invoice-duplicate-draft');
        if (duplicateDraft) {
          const draft = JSON.parse(duplicateDraft) as InvoiceDraft;
          setCustomerId(draft.customerId);
          setItems(draft.items.map((item, index) => ({ ...item, key: Date.now() + index })));
          setLessAmount(draft.lessAmount);
          sessionStorage.removeItem('invoice-duplicate-draft');
        }
      })
      .catch((error: unknown) => setErrorMessage(error instanceof Error ? error.message : 'Unable to load invoice form.'))
      .finally(() => setLoading(false));
  }, []);

  const totalQty = useMemo(() => items.reduce((sum, item) => sum + Math.max(0, item.qty), 0), [items]);
  const subtotalAmount = useMemo(() => items.reduce((sum, item) => sum + Math.max(0, item.subtotal), 0), [items]);
  const totalAmount = Math.max(0, subtotalAmount - Math.max(0, lessAmount));

  const updateItem = (key: number, changes: Partial<DraftItem>) => {
    setItems((current) => current.map((item) => {
      if (item.key !== key) return item;
      const next = { ...item, ...changes };
      next.subtotal = Math.max(0, next.qty) * Math.max(0, next.unit_price);
      return next;
    }));
  };

  const selectProduct = (key: number, productId: string) => {
    const product = products.find((candidate) => getRecordValue(candidate, ['id']) === productId);
    if (!product) return updateItem(key, { product_id: null });
    updateItem(key, {
      product_id: productId,
      description: getRecordValue(product, ['description', 'name', 'sku']),
      unit_price: Number(getRecordValue(product, ['unit_price', 'price'])) || 0,
    });
  };

  const saveInvoice = async (printAfterSave = false) => {
    setErrorMessage('');
    if (!customerId) { setErrorMessage('Please select a customer.'); return; }
    if (items.some((item) => !item.description.trim() || item.qty <= 0)) { setErrorMessage('Please complete every item with a description and quantity.'); return; }
    setSaving(true);
    try {
      const createdInvoice = await InvoiceService.createInvoice({ invoice_number: invoiceNumber, customer_id: customerId, total_qty: totalQty, subtotal_amount: subtotalAmount, less_amount: lessAmount, total_amount: totalAmount, items });
      router.push(`/invoices/${createdInvoice.id}${printAfterSave ? '?print=1' : ''}`);
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save invoice.');
    } finally {
      setSaving(false);
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await saveInvoice();
  };

  const previewCustomer = customers.find((customer) => getRecordValue(customer, ['id']) === customerId);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-700">{t.navigation.invoices} / Create</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{t.invoice.newTitle}</h1><p className="mt-2 max-w-xl text-sm text-slate-500">{t.invoice.prepare}</p></div>
        <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">{t.invoice.invoiceNumber}</p><p className="mt-1 text-lg font-bold">{invoiceNumber}</p></div>
      </div>
      <div className="mb-5 flex flex-wrap gap-2">
        <Link href="/customers" className="inline-flex min-h-11 items-center rounded-xl bg-blue-700 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800">+ {t.invoice.addCustomer}</Link>
        <a href="#common-specifications" className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-100">{t.invoice.browseSpecifications}</a>
        <button type="button" onClick={() => setPreviewOpen(true)} className="inline-flex min-h-11 items-center rounded-xl bg-slate-900 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800">{t.invoice.preview}</button>
      </div>
      {errorMessage && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{errorMessage}</p>}
      <form className="space-y-5" onSubmit={submit}>
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6">
          <div className="mb-3 flex items-center justify-between gap-3"><label className="block text-sm font-bold" htmlFor="customer">{t.invoice.customer}</label><Link href="/customers" className="text-sm font-bold text-blue-700 hover:text-blue-800">{t.invoice.manageCustomer}</Link></div>
          <select id="customer" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" value={customerId} onChange={(event) => setCustomerId(event.target.value)} disabled={loading} required>
            <option value="">{t.invoice.selectCustomer}</option>
            {customers.map((customer) => { const id = getRecordValue(customer, ['id']); return <option key={id} value={id}>{getRecordValue(customer, ['name', 'company_name', 'email'])}</option>; })}
          </select>
        </section>
        <section id="common-specifications" className="scroll-mt-5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-xl font-bold">{t.invoice.items}</h2><button type="button" className="min-h-11 rounded-xl bg-blue-50 px-4 font-semibold text-blue-700" onClick={() => setItems((current) => [...current, emptyItem(Date.now())])}>+ {t.invoice.addItem}</button></div>
          <div className="space-y-4">
            {items.map((item, index) => <div key={item.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-3 flex items-center justify-between"><span className="text-sm font-bold text-slate-500">Item {index + 1}</span>{items.length > 1 && <button type="button" className="text-sm font-semibold text-red-600" onClick={() => setItems((current) => current.filter((candidate) => candidate.key !== item.key))}>Remove</button>}</div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <label className="text-sm font-semibold sm:col-span-2 lg:col-span-2">{t.invoice.productSpecification}
                  <select className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal" value={item.product_id ?? ''} onChange={(event) => selectProduct(item.key, event.target.value)}><option value="">{t.invoice.customItem}</option>{products.map((product) => { const id = getRecordValue(product, ['id']); return <option key={id} value={id}>{getRecordValue(product, ['name', 'description', 'sku'])}</option>; })}</select>
                  <input className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal" value={item.description} onChange={(event) => updateItem(item.key, { description: event.target.value })} placeholder={t.invoice.itemDescription} required />
                </label>
                <label className="text-sm font-semibold">{t.invoice.qty}<input type="number" min="1" step="1" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal" value={item.qty} onChange={(event) => updateItem(item.key, { qty: Number(event.target.value) || 0 })} required /></label>
                <label className="text-sm font-semibold">{t.invoice.unitPriceShort}<input type="number" min="0" step="0.01" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal" value={item.unit_price} onChange={(event) => updateItem(item.key, { unit_price: Number(event.target.value) || 0 })} required /></label>
                <div className="text-sm font-semibold">Subtotal<p className="mt-1 flex min-h-11 items-center rounded-lg bg-slate-200 px-3 text-base">{formatMoney(item.subtotal)}</p></div>
              </div>
            </div>)}
          </div>
        </section>
        <section className="rounded-2xl bg-slate-900 p-5 text-white shadow-sm sm:ml-auto sm:max-w-md sm:p-6">
          <div className="flex justify-between border-b border-slate-700 pb-3"><span>{t.invoice.quantity}</span><strong>{totalQty}</strong></div>
          <div className="flex items-center justify-between gap-4 border-b border-slate-700 py-3"><label htmlFor="less">{t.invoice.lessDiscount}</label><input id="less" type="number" min="0" step="0.01" className="min-h-11 w-32 rounded-lg bg-white px-3 text-right text-slate-900" value={lessAmount} onChange={(event) => setLessAmount(Number(event.target.value) || 0)} /></div>
          <div className="flex justify-between pt-4 text-lg"><span>{t.invoice.totalDue}</span><strong>{formatMoney(totalAmount)}</strong></div>
        </section>
        <button type="submit" disabled={loading || saving} className="min-h-14 w-full rounded-xl bg-blue-700 px-5 text-lg font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">{saving ? t.invoice.savingInvoice : t.invoice.saveInvoice}</button>
      </form>
      </div>
      {previewOpen && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Invoice preview">
        <div className="mx-auto flex min-h-full max-w-4xl items-center justify-center">
          <div className="w-full bg-white shadow-2xl sm:my-6">
            <div className="invoice-paper p-5 sm:p-10">
              <header className="flex flex-col justify-between gap-6 border-b border-slate-200 pb-7 sm:flex-row"><div className="flex items-start gap-4">{company?.logo_url && <img src={company.logo_url} alt="Company logo" className="h-16 w-16 object-contain" />}<div><p className="text-sm font-black uppercase tracking-[0.2em] text-blue-700">{company?.company_name || 'InvoiceSys'}</p><h2 className="mt-3 text-3xl font-bold tracking-tight">INVOICE</h2><p className="mt-2 text-sm text-slate-500">Professional billing statement</p><p className="mt-2 text-xs text-slate-500">{company?.reg_no || ''}{company?.sst_no ? ` | SST: ${company.sst_no}` : ''}</p></div></div><div className="sm:text-right"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Invoice Number</p><p className="mt-1 text-xl font-bold">{invoiceNumber}</p><p className="mt-2 text-sm text-slate-500">Issued: {formatDate(new Date().toISOString())}</p></div></header>
              <section className="grid gap-5 border-b border-slate-200 py-6 sm:grid-cols-2"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">From</p><p className="mt-2 font-bold">{company?.company_name || 'InvoiceSys'}</p><p className="whitespace-pre-line text-sm text-slate-500">{company?.address || 'Billing Department'}</p><p className="text-sm text-slate-500">{company?.phone || ''} {company?.email ? `| ${company.email}` : ''}</p></div><div className="sm:text-right"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Bill To</p><p className="mt-2 font-bold">{previewCustomer?.name || 'Select a customer'}</p><p className="text-sm text-slate-500">{previewCustomer?.company_name || 'Customer company'}</p><p className="text-sm text-slate-500">{previewCustomer?.phone || ''}</p></div></section>
              <div className="overflow-x-auto py-6"><table className="w-full min-w-[500px] text-left text-sm"><thead className="border-b-2 border-slate-900"><tr><th className="pb-3 font-bold">Item Description</th><th className="pb-3 text-right font-bold">Qty</th><th className="pb-3 text-right font-bold">Unit Price</th><th className="pb-3 text-right font-bold">Subtotal</th></tr></thead><tbody className="divide-y divide-slate-100">{items.map((item) => <tr key={item.key}><td className="py-3 font-medium">{item.description || 'Item description'}</td><td className="py-3 text-right">{item.qty}</td><td className="py-3 text-right">{formatMoney(item.unit_price)}</td><td className="py-3 text-right font-semibold">{formatMoney(item.subtotal)}</td></tr>)}</tbody></table></div>
              <section className="ml-auto max-w-sm border-t border-slate-200 pt-4"><div className="flex justify-between py-2 text-sm"><span className="text-slate-500">Subtotal</span><span className="font-semibold">{formatMoney(subtotalAmount)}</span></div><div className="flex justify-between py-2 text-sm"><span className="text-slate-500">Discount</span><span className="font-semibold">-{formatMoney(lessAmount)}</span></div><div className="mt-2 flex justify-between border-t-2 border-slate-900 pt-3 text-lg"><span className="font-bold">Total Payable</span><span className="font-bold">{formatMoney(totalAmount)}</span></div></section><footer className="mt-8 border-t border-slate-200 pt-4 text-sm text-slate-500">{company?.bank_name && <p className="font-semibold text-slate-700">Bank: {company.bank_name} | Account: {company.bank_account_no} | Holder: {company.bank_account_holder}</p>}</footer>
            </div>
            <div className="no-print flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 p-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => setPreviewOpen(false)} className="min-h-11 rounded-xl bg-white px-5 text-sm font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100">{t.invoice.close}</button><button type="button" disabled={saving} onClick={() => void saveInvoice(true)} className="min-h-11 rounded-xl bg-blue-700 px-5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60">{saving ? t.invoice.savingInvoice : t.invoice.savePrint}</button></div>
          </div>
        </div>
      </div>}
    </main>
  );
}
