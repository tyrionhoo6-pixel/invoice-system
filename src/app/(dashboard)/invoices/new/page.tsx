'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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

const STD_PAYMENT_OPTIONS = ['Cash / COD', '7 Days', '14 Days', '30 Days', '60 Days'];

const parsePaymentTerms = (terms?: string) => {
  if (!terms) return { option: '30 Days', custom: '' };
  if (STD_PAYMENT_OPTIONS.includes(terms)) {
    return { option: terms, custom: '' };
  }
  return { option: 'Custom', custom: terms };
};

const getRecordValue = (record: object, keys: string[]): string => {
  for (const key of keys) {
    const value = (record as Record<string, unknown>)[key];
    if (typeof value === 'string' || typeof value === 'number') return String(value);
  }
  return '';
};

const emptyItem = (key: number): DraftItem => ({
  key,
  product_id: null,
  description: '',
  qty: 1,
  unit: 'pcs',
  unit_price: 0,
  subtotal: 0,
});

function InvoiceFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('id');

  const { t } = useLanguage();
  const [invoiceNumber, setInvoiceNumber] = useState('Loading...');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  
  const [companyInput, setCompanyInput] = useState('');
  const [contactNameInput, setContactNameInput] = useState('');

  const [paymentTermsOption, setPaymentTermsOption] = useState('30 Days');
  const [customPaymentTerms, setCustomPaymentTerms] = useState('');
  const [requiresCustomerSignature, setRequiresCustomerSignature] = useState(false);

  const [items, setItems] = useState<DraftItem[]>([emptyItem(1)]);
  const [lessAmount, setLessAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const isProforma = invoiceNumber.startsWith('PI');

  useEffect(() => {
    const initializeForm = async () => {
      try {
        const [loadedCustomers, loadedProducts, companySettings] = await Promise.all([
          InvoiceService.getCustomers(),
          InvoiceService.getProducts(),
          InvoiceService.getCompanySettings(),
        ]);

        setCustomers(loadedCustomers);
        setProducts(loadedProducts);
        setCompany(companySettings);

        if (!editId && companySettings?.payment_terms) {
          const { option, custom } = parsePaymentTerms(companySettings.payment_terms);
          setPaymentTermsOption(option);
          setCustomPaymentTerms(custom);
        }

        if (editId) {
          const existingInvoice = await InvoiceService.getInvoiceById(editId);
          if (existingInvoice) {
            setInvoiceNumber(existingInvoice.invoice_number);
            setLessAmount(Number(existingInvoice.less_amount) || 0);
            setRequiresCustomerSignature(!!existingInvoice.requires_customer_signature);

            if (existingInvoice.payment_terms) {
              const { option, custom } = parsePaymentTerms(existingInvoice.payment_terms);
              setPaymentTermsOption(option);
              setCustomPaymentTerms(custom);
            }

            if (existingInvoice.customer) {
              setCompanyInput(existingInvoice.customer.company_name || existingInvoice.customer.name || '');
              setContactNameInput(existingInvoice.customer.name || '');
            }

            if (existingInvoice.invoice_items && existingInvoice.invoice_items.length > 0) {
              setItems(
                existingInvoice.invoice_items.map((item, idx) => ({
                  key: Date.now() + idx,
                  product_id: item.product_id ?? null,
                  description: item.product_name || '',
                  qty: Number(item.quantity) || 1,
                  unit: item.unit || 'pcs',
                  unit_price: Number(item.unit_price) || 0,
                  subtotal: Number(item.subtotal) || 0,
                }))
              );
            }
          } else {
            setErrorMessage('Invoice not found.');
          }
        } else {
          const number = await InvoiceService.generateNextInvoiceNumber();
          setInvoiceNumber(number);

          const duplicateDraft = sessionStorage.getItem('invoice-duplicate-draft');
          if (duplicateDraft) {
            const draft = JSON.parse(duplicateDraft) as InvoiceDraft;
            const matchedCust = loadedCustomers.find(c => c.id === draft.customerId);
            if (matchedCust) {
              setCompanyInput(matchedCust.company_name || matchedCust.name);
              setContactNameInput(matchedCust.name || '');
            }
            setItems(draft.items.map((item, index) => ({ ...item, unit: item.unit || 'pcs', key: Date.now() + index })));
            setLessAmount(draft.lessAmount);
            sessionStorage.removeItem('invoice-duplicate-draft');
          }
        }
      } catch (error: unknown) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to initialize invoice form.');
      } finally {
        setLoading(false);
      }
    };

    void initializeForm();
  }, [editId]);

  const totalQty = useMemo(() => items.reduce((sum, item) => sum + Math.max(0, item.qty), 0), [items]);
  const subtotalAmount = useMemo(() => items.reduce((sum, item) => sum + Math.max(0, item.subtotal), 0), [items]);
  const totalAmount = Math.max(0, subtotalAmount - Math.max(0, lessAmount));

  const handleSelectExistingCustomer = (companyName: string) => {
    setCompanyInput(companyName);
    const matched = customers.find(
      (c) => c.company_name?.toLowerCase() === companyName.toLowerCase() || c.name?.toLowerCase() === companyName.toLowerCase()
    );
    if (matched) {
      setContactNameInput(matched.name || '');
    }
  };

  const resolveCustomerId = async (): Promise<string> => {
    const trimmedCompany = companyInput.trim();
    const trimmedPerson = contactNameInput.trim();

    const existing = customers.find(
      (c) =>
        (c.company_name && c.company_name.toLowerCase() === trimmedCompany.toLowerCase()) ||
        (c.name && c.name.toLowerCase() === trimmedCompany.toLowerCase())
    );

    if (existing) {
      return existing.id;
    }

    const newCustomer = await InvoiceService.createCustomer({
      company_name: trimmedCompany,
      name: trimmedPerson || '', 
    });

    return newCustomer.id;
  };

  const updateItem = (key: number, changes: Partial<DraftItem>) => {
    setItems((current) =>
      current.map((item) => {
        if (item.key !== key) return item;
        const next = { ...item, ...changes };
        next.subtotal = Math.max(0, next.qty) * Math.max(0, next.unit_price);
        return next;
      })
    );
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
    if (!companyInput.trim()) {
      setErrorMessage('Please enter or select a customer company name.');
      return;
    }
    if (items.some((item) => !item.description.trim() || item.qty <= 0)) {
      setErrorMessage('Please complete every item with a description and quantity.');
      return;
    }
    setSaving(true);
    try {
      const customerId = await resolveCustomerId();
      const finalPaymentTerms = paymentTermsOption === 'Custom' ? customPaymentTerms : paymentTermsOption;

      const payload = {
        invoice_number: invoiceNumber,
        customer_id: customerId,
        payment_terms: finalPaymentTerms,
        requires_customer_signature: requiresCustomerSignature,
        total_qty: totalQty,
        subtotal_amount: subtotalAmount,
        less_amount: lessAmount,
        total_amount: totalAmount,
        items,
      };

      const savedInvoice = editId
        ? await InvoiceService.updateInvoice(editId, payload)
        : await InvoiceService.createInvoice(payload);

      router.push(`/invoices/${savedInvoice.id}${printAfterSave ? '?print=1' : ''}`);
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

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-700">
              {t.navigation.invoices} / {editId ? 'Edit' : 'Create'}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              {editId ? `Edit Invoice (${invoiceNumber})` : t.invoice.newTitle}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-slate-500">{t.invoice.prepare}</p>
          </div>
          <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{t.invoice.invoiceNumber}</p>
            <p className="mt-1 text-lg font-bold">{invoiceNumber}</p>
          </div>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="inline-flex min-h-11 items-center rounded-xl bg-slate-900 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800"
          >
            {t.invoice.preview}
          </button>
        </div>

        {errorMessage && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{errorMessage}</p>}

        <form className="space-y-5" onSubmit={submit}>
          {/* Customer Input Block */}
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">{t.invoice.customer} Details</h2>
              <span className="text-xs text-slate-500">Auto-saves new customers automatically</span>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-bold text-slate-700" htmlFor="company-name">
                  Company / Business Name *
                </label>
                <input
                  id="company-name"
                  type="text"
                  list="existing-customers-list"
                  className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  placeholder="Type new company name or select..."
                  value={companyInput}
                  onChange={(e) => handleSelectExistingCustomer(e.target.value)}
                  disabled={loading}
                  required
                />
                <datalist id="existing-customers-list">
                  {customers.map((customer) => {
                    const id = getRecordValue(customer, ['id']);
                    const name = getRecordValue(customer, ['company_name', 'name']);
                    return <option key={id} value={name} />;
                  })}
                </datalist>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700" htmlFor="contact-person">
                  Contact Person Name (Optional)
                </label>
                <input
                  id="contact-person"
                  type="text"
                  className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  placeholder="e.g. Mr. Tan"
                  value={contactNameInput}
                  onChange={(e) => setContactNameInput(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700" htmlFor="payment-terms">
                  Payment Terms
                </label>
                <select
                  id="payment-terms"
                  className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  value={paymentTermsOption}
                  onChange={(e) => setPaymentTermsOption(e.target.value)}
                  disabled={loading}
                >
                  {STD_PAYMENT_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                  <option value="Custom">Custom...</option>
                </select>

                {paymentTermsOption === 'Custom' && (
                  <input
                    type="text"
                    className="mt-2 min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-600"
                    placeholder="e.g. 50% Deposit"
                    value={customPaymentTerms}
                    onChange={(e) => setCustomPaymentTerms(e.target.value)}
                  />
                )}
              </div>
            </div>

            <div className="mt-5 border-t border-slate-100 pt-4">
              <label htmlFor="requires-signature" className="inline-flex cursor-pointer items-center gap-3">
                <input
                  id="requires-signature"
                  type="checkbox"
                  checked={requiresCustomerSignature}
                  onChange={(e) => setRequiresCustomerSignature(e.target.checked)}
                  className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-semibold text-slate-700">
                  Require Customer Signature Column on Printable Invoice
                </span>
              </label>
            </div>
          </section>

          {/* Line Items */}
          <section id="common-specifications" className="scroll-mt-5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">{t.invoice.items}</h2>
              <button
                type="button"
                className="min-h-11 rounded-xl bg-blue-50 px-4 font-semibold text-blue-700 hover:bg-blue-100"
                onClick={() => setItems((current) => [...current, emptyItem(Date.now())])}
              >
                + {t.invoice.addItem}
              </button>
            </div>

            <div className="space-y-4">
              {items.map((item, index) => (
                <div key={item.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-500">Item {index + 1}</span>
                    {items.length > 1 && (
                      <button
                        type="button"
                        className="text-sm font-semibold text-red-600 hover:underline"
                        onClick={() => setItems((current) => current.filter((candidate) => candidate.key !== item.key))}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                    <label className="text-sm font-semibold sm:col-span-2 lg:col-span-2">
                      {t.invoice.productSpecification}
                      <select
                        className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal"
                        value={item.product_id ?? ''}
                        onChange={(event) => selectProduct(item.key, event.target.value)}
                      >
                        <option value="">{t.invoice.customItem}</option>
                        {products.map((product) => {
                          const id = getRecordValue(product, ['id']);
                          return (
                            <option key={id} value={id}>
                              {getRecordValue(product, ['name', 'description', 'sku'])}
                            </option>
                          );
                        })}
                      </select>
                      <input
                        className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal"
                        value={item.description}
                        onChange={(event) => updateItem(item.key, { description: event.target.value })}
                        placeholder={t.invoice.itemDescription}
                        required
                      />
                    </label>

                    {/* Qty 数量：使用 inputMode="numeric" */}
                    <label className="text-sm font-semibold">
                      {t.invoice.qty}
                      <input
                        type="number"
                        inputMode="numeric"
                        min="1"
                        step="1"
                        className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal"
                        value={item.qty}
                        onChange={(event) => updateItem(item.key, { qty: Number(event.target.value) || 0 })}
                        required
                      />
                    </label>

                    <label className="text-sm font-semibold">
                      Unit
                      <input
                        type="text"
                        className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal"
                        value={item.unit || 'pcs'}
                        onChange={(event) => updateItem(item.key, { unit: event.target.value })}
                        placeholder="pcs / lot"
                      />
                    </label>

                    {/* Unit Price 单价：使用 inputMode="decimal" */}
                    <label className="text-sm font-semibold">
                      {t.invoice.unitPriceShort}
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal"
                        value={item.unit_price === 0 ? '' : item.unit_price}
                        onChange={(event) => {
                          const val = event.target.value === '' ? 0 : parseFloat(event.target.value);
                          updateItem(item.key, { unit_price: isNaN(val) ? 0 : val });
                        }}
                      />
                    </label>

                    <div className="text-sm font-semibold">
                      Subtotal
                      <p className="mt-1 flex min-h-11 items-center rounded-lg bg-slate-200 px-3 text-base font-bold">
                        {formatMoney(item.subtotal)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Amount Summary */}
          <section className="rounded-2xl bg-slate-900 p-5 text-white shadow-sm sm:ml-auto sm:max-w-md sm:p-6">
            <div className="flex justify-between border-b border-slate-700 pb-3">
              <span>{t.invoice.quantity}</span>
              <strong>{totalQty}</strong>
            </div>

            {/* Less Discount 折扣：使用 inputMode="decimal" */}
            <div className="flex items-center justify-between gap-4 border-b border-slate-700 py-3">
              <label htmlFor="less">{t.invoice.lessDiscount}</label>
              <input
                id="less"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                className="min-h-11 w-32 rounded-lg bg-white px-3 text-right font-normal text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                value={lessAmount === 0 ? '' : lessAmount}
                onChange={(event) => {
                  const val = event.target.value === '' ? 0 : parseFloat(event.target.value);
                  setLessAmount(isNaN(val) ? 0 : val);
                }}
              />
            </div>
            <div className="flex justify-between pt-4 text-lg">
              <span>{t.invoice.totalDue}</span>
              <strong>{formatMoney(totalAmount)}</strong>
            </div>
          </section>

          <button
            type="submit"
            disabled={loading || saving}
            className="min-h-14 w-full rounded-xl bg-blue-700 px-5 text-lg font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? t.invoice.savingInvoice : editId ? 'Update Invoice' : t.invoice.saveInvoice}
          </button>
        </form>
      </div>

      {/* Preview Modal */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-3 sm:p-6" role="dialog" aria-modal="true">
          <div className="mx-auto flex min-h-full max-w-4xl items-center justify-center">
            <div className="w-full bg-white shadow-2xl sm:my-6">
              <div className="invoice-paper p-5 sm:p-10">
                <header className="flex flex-col justify-between gap-6 border-b border-slate-200 pb-7 sm:flex-row">
                  <div className="flex items-start gap-4">
                    {company?.logo_url && <img src={company.logo_url} alt="Company logo" className="h-16 w-16 object-contain" />}
                    <div>
                      <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-700">{company?.company_name || 'InvoiceSys'}</p>
                      <h2 className="mt-3 text-3xl font-bold tracking-tight">
                        {isProforma ? 'PROFORMA INVOICE' : 'INVOICE'}
                      </h2>
                    </div>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      {isProforma ? 'Proforma Invoice Number' : 'Invoice Number'}
                    </p>
                    <p className="mt-1 text-xl font-bold">{invoiceNumber}</p>
                    <p className="mt-2 text-sm text-slate-500">Issued: {formatDate(new Date().toISOString())}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Terms: {paymentTermsOption === 'Custom' ? customPaymentTerms : paymentTermsOption}
                    </p>
                  </div>
                </header>
                <section className="grid gap-5 border-b border-slate-200 py-6 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">From</p>
                    <p className="mt-2 font-bold">{company?.company_name || 'InvoiceSys'}</p>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Bill To</p>
                    <p className="mt-2 font-bold">{companyInput || 'Customer Company'}</p>
                    {contactNameInput && contactNameInput.trim() !== companyInput.trim() && (
                      <p className="text-sm text-slate-500">Attn: {contactNameInput}</p>
                    )}
                  </div>
                </section>
                <div className="overflow-x-auto py-6">
                  <table className="w-full min-w-[500px] text-left text-sm">
                    <thead className="border-b-2 border-slate-900">
                      <tr>
                        <th className="pb-3 font-bold">Item Description</th>
                        <th className="pb-3 text-right font-bold">Qty</th>
                        <th className="pb-3 text-right font-bold">Unit Price</th>
                        <th className="pb-3 text-right font-bold">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map((item) => (
                        <tr key={item.key}>
                          <td className="py-3 font-medium">{item.description || 'Item description'}</td>
                          <td className="py-3 text-right">{item.qty} {item.unit || 'pcs'}</td>
                          <td className="py-3 text-right">{formatMoney(item.unit_price)}</td>
                          <td className="py-3 text-right font-semibold">{formatMoney(item.subtotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <section className="ml-auto max-w-sm border-t border-slate-200 pt-4">
                  <div className="flex justify-between py-2 text-sm">
                    <span className="text-slate-500">Subtotal</span>
                    <span className="font-semibold">{formatMoney(subtotalAmount)}</span>
                  </div>
                  <div className="flex justify-between py-2 text-sm">
                    <span className="text-slate-500">Discount</span>
                    <span className="font-semibold">-{formatMoney(lessAmount)}</span>
                  </div>
                  <div className="mt-2 flex justify-between border-t-2 border-slate-900 pt-3 text-lg">
                    <span className="font-bold">Total Payable</span>
                    <span className="font-bold">{formatMoney(totalAmount)}</span>
                  </div>
                </section>

                {requiresCustomerSignature && (
                  <section className="mt-12 flex justify-end">
                    <div className="w-64 text-center">
                      <div className="h-16 border-b border-slate-400"></div>
                      <p className="mt-2 text-xs font-bold uppercase tracking-wider text-slate-600">Customer Acceptance & Signature</p>
                    </div>
                  </section>
                )}
              </div>
              <div className="no-print flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 p-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setPreviewOpen(false)}
                  className="min-h-11 rounded-xl bg-white px-5 text-sm font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                >
                  {t.invoice.close}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveInvoice(true)}
                  className="min-h-11 rounded-xl bg-blue-700 px-5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60"
                >
                  {saving ? t.invoice.savingInvoice : t.invoice.savePrint}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function NewInvoicePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading form...</div>}>
      <InvoiceFormContent />
    </Suspense>
  );
}