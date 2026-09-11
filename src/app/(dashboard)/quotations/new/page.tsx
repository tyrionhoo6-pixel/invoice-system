'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Customer, Product } from '@/types/invoice';
import { QuotationService, type CreateQuotationItemInput } from '@/services/quotation.service';
import { useLanguage } from '@/context/LanguageContext';
import type { CompanySettings } from '@/types/company';
import { formatMoney } from '@/lib/utils';
import { formatDate } from '@/utils/format';

type DraftItem = CreateQuotationItemInput & { key: number };
type QuotationDraft = {
  customerId: string;
  items: CreateQuotationItemInput[];
  lessAmount: number;
  validUntil?: string;
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

export default function NewQuotationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('id');

  const { t } = useLanguage();
  const [quotationNumber, setQuotationNumber] = useState('Loading...');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [companyInput, setCompanyInput] = useState('');
  const [contactNameInput, setContactNameInput] = useState('');

  // Quotation 专属字段状态
  const [validUntil, setValidUntil] = useState('');

  // Payment Terms 状态
  const [paymentTermsOption, setPaymentTermsOption] = useState('30 Days');
  const [customPaymentTerms, setCustomPaymentTerms] = useState('');

  const [items, setItems] = useState<DraftItem[]>([emptyItem(1)]);
  const [lessAmount, setLessAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    const initializeForm = async () => {
      try {
        const [loadedCustomers, loadedProducts, companySettings] = await Promise.all([
          QuotationService.getCustomers(),
          QuotationService.getProducts(),
          QuotationService.getCompanySettings(),
        ]);

        setCustomers(loadedCustomers);
        setProducts(loadedProducts);
        setCompany(companySettings);

        if (!editId && companySettings?.payment_terms) {
          const stdOptions = ['Cash / COD', '7 Days', '14 Days', '30 Days', '60 Days'];
          if (stdOptions.includes(companySettings.payment_terms)) {
            setPaymentTermsOption(companySettings.payment_terms);
          } else {
            setPaymentTermsOption('Custom');
            setCustomPaymentTerms(companySettings.payment_terms);
          }
        }

        if (editId) {
          const existing = await QuotationService.getQuotationById(editId);
          if (existing) {
            setQuotationNumber(existing.quotation_number);
            setLessAmount(Number(existing.less_amount) || 0);

            // 回显 Quotation 专属字段
            if (existing.valid_until) setValidUntil(existing.valid_until.split('T')[0]);

            // 回显 Payment Terms
            if (existing.payment_terms) {
              const stdOptions = ['Cash / COD', '7 Days', '14 Days', '30 Days', '60 Days'];
              if (stdOptions.includes(existing.payment_terms)) {
                setPaymentTermsOption(existing.payment_terms);
              } else {
                setPaymentTermsOption('Custom');
                setCustomPaymentTerms(existing.payment_terms);
              }
            }

            if (existing.customer) {
              setCompanyInput(existing.customer.company_name || existing.customer.name || '');
              setContactNameInput(existing.customer.name || '');
            }

            if (existing.quotation_items && existing.quotation_items.length > 0) {
              setItems(
                existing.quotation_items.map((item, idx) => ({
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
            setErrorMessage('Quotation not found.');
          }
        } else {
          const number = await QuotationService.generateNextQuotationNumber();
          setQuotationNumber(number);

          const duplicateDraft = sessionStorage.getItem('quotation-duplicate-draft');
          if (duplicateDraft) {
            const draft = JSON.parse(duplicateDraft) as QuotationDraft;
            const matchedCust = loadedCustomers.find((c) => c.id === draft.customerId);
            if (matchedCust) {
              setCompanyInput(matchedCust.company_name || matchedCust.name);
              setContactNameInput(matchedCust.name || '');
            }
            if (draft.validUntil) setValidUntil(draft.validUntil);

            setItems(
              draft.items.map((item, index) => ({
                ...item,
                unit: item.unit || 'pcs',
                key: Date.now() + index,
              }))
            );
            setLessAmount(draft.lessAmount);
            sessionStorage.removeItem('quotation-duplicate-draft');
          }
        }
      } catch (error: unknown) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to initialize quotation form.');
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
      (c) =>
        c.company_name?.toLowerCase() === companyName.toLowerCase() ||
        c.name?.toLowerCase() === companyName.toLowerCase()
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

    const newCustomer = await QuotationService.createCustomer({
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

  const saveQuotation = async (printAfterSave = false) => {
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
        quotation_number: quotationNumber,
        customer_id: customerId,
        payment_terms: finalPaymentTerms,
        valid_until: validUntil || null,
        total_qty: totalQty,
        subtotal_amount: subtotalAmount,
        less_amount: lessAmount,
        total_amount: totalAmount,
        items,
      };

      const saved = editId
        ? await QuotationService.updateQuotation(editId, payload)
        : await QuotationService.createQuotation(payload);

      router.push(`/quotations/${saved.id}${printAfterSave ? '?print=1' : ''}`);
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save quotation.');
    } finally {
      setSaving(false);
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await saveQuotation();
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-700">
              Quotations / {editId ? 'Edit' : 'Create'}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              {editId ? `Edit Quotation (${quotationNumber})` : 'Create New Quotation'}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-slate-500">Prepare price estimation for your client.</p>
          </div>
          <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Quotation No.</p>
            <p className="mt-1 text-lg font-bold">{quotationNumber}</p>
          </div>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="inline-flex min-h-11 items-center rounded-xl bg-slate-900 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800"
          >
            Preview
          </button>
        </div>

        {errorMessage && (
          <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{errorMessage}</p>
        )}

        <form className="space-y-5" onSubmit={submit}>
          {/* Customer & Terms */}
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Customer & Payment Terms</h2>
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
                  <option value="Cash / COD">Cash / COD</option>
                  <option value="7 Days">7 Days</option>
                  <option value="14 Days">14 Days</option>
                  <option value="30 Days">30 Days</option>
                  <option value="60 Days">60 Days</option>
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
          </section>

          {/* Quotation Specific Fields */}
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6">
            <h2 className="mb-3 text-lg font-bold">Quotation Specific Details</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-bold text-slate-700" htmlFor="valid-date">
                  Valid Until Date
                </label>
                <input
                  id="valid-date"
                  type="date"
                  className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
          </section>

          {/* Line Items */}
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">Quotation Items</h2>
              <button
                type="button"
                className="min-h-11 rounded-xl bg-blue-50 px-4 font-semibold text-blue-700 hover:bg-blue-100"
                onClick={() => setItems((current) => [...current, emptyItem(Date.now())])}
              >
                + Add Item
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
                        onClick={() =>
                          setItems((current) => current.filter((candidate) => candidate.key !== item.key))
                        }
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                    <label className="text-sm font-semibold sm:col-span-2 lg:col-span-2">
                      Product / Specification
                      <select
                        className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal"
                        value={item.product_id ?? ''}
                        onChange={(event) => selectProduct(item.key, event.target.value)}
                      >
                        <option value="">Custom Item</option>
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
                        placeholder="Item description"
                        required
                      />
                    </label>
                    <label className="text-sm font-semibold">
                      Qty
                      <input
                        type="number"
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
                    <label className="text-sm font-semibold">
                      Unit Price
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal"
                        value={item.unit_price}
                        onChange={(event) => updateItem(item.key, { unit_price: Number(event.target.value) || 0 })}
                        required
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
              <span>Total Quantity</span>
              <strong>{totalQty}</strong>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-slate-700 py-3">
              <label htmlFor="less">Discount / Less</label>
              <input
                id="less"
                type="number"
                min="0"
                step="0.01"
                className="min-h-11 w-32 rounded-lg bg-white px-3 text-right text-slate-900"
                value={lessAmount}
                onChange={(event) => setLessAmount(Number(event.target.value) || 0)}
              />
            </div>
            <div className="flex justify-between pt-4 text-lg">
              <span>Total Amount</span>
              <strong>{formatMoney(totalAmount)}</strong>
            </div>
          </section>

          <button
            type="submit"
            disabled={loading || saving}
            className="min-h-14 w-full rounded-xl bg-blue-700 px-5 text-lg font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving Quotation...' : editId ? 'Update Quotation' : 'Save Quotation'}
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
                    {company?.logo_url && (
                      <img src={company.logo_url} alt="Company logo" className="h-16 w-16 object-contain" />
                    )}
                    <div>
                      <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-700">
                        {company?.company_name || 'System'}
                      </p>
                      <h2 className="mt-3 text-3xl font-bold tracking-tight">QUOTATION</h2>
                    </div>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Quotation Number</p>
                    <p className="mt-1 text-xl font-bold">{quotationNumber}</p>
                    <p className="mt-2 text-sm text-slate-500">Issued: {formatDate(new Date().toISOString())}</p>
                    {validUntil && (
                      <p className="mt-1 text-sm font-semibold text-amber-700">Valid Until: {formatDate(validUntil)}</p>
                    )}
                    <p className="mt-1 text-sm text-slate-500">
                      Terms: {paymentTermsOption === 'Custom' ? customPaymentTerms : paymentTermsOption}
                    </p>
                  </div>
                </header>

                <section className="grid gap-5 border-b border-slate-200 py-6 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">From</p>
                    <p className="mt-2 font-bold">{company?.company_name || 'System'}</p>
                    {(company?.bank_name || company?.bank_account_no || company?.bank_account_holder) && (
                      <div className="mt-3 text-xs text-slate-600">
                        <p className="font-bold uppercase tracking-wider text-slate-400">Bank Details:</p>
                        {company.bank_name && <p>Bank: {company.bank_name}</p>}
                        {company.bank_account_holder && <p>Holder: {company.bank_account_holder}</p>}
                        {company.bank_account_no && <p>Acc No: {company.bank_account_no}</p>}
                      </div>
                    )}
                  </div>
                  <div className="sm:text-right">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Quotation For</p>
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
                          <td className="py-3 text-right">
                            {item.qty} {item.unit || 'pcs'}
                          </td>
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
                    <span className="font-bold">Total Amount</span>
                    <span className="font-bold">{formatMoney(totalAmount)}</span>
                  </div>
                </section>

                {/* Preview Modal 底部条款与签名区 */}
                <section className="mt-8 grid grid-cols-2 gap-8 border-t border-slate-200 pt-6 text-xs text-slate-500">
                  <div>
                    <p className="font-bold text-slate-700">Terms & Conditions:</p>
                    <p className="mt-1">1. Goods/Services as per specified quotation.</p>
                    <p>2. Validity: {validUntil ? formatDate(validUntil) : '30 Days from issue date'}.</p>
                  </div>
                  <div className="text-right">
                    <div className="ml-auto h-12 w-36 border-b border-slate-300"></div>
                    <p className="mt-2 font-bold text-slate-700">Authorized Signature</p>
                  </div>
                </section>
              </div>

              <div className="no-print flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 p-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setPreviewOpen(false)}
                  className="min-h-11 rounded-xl bg-white px-5 text-sm font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveQuotation(true)}
                  className="min-h-11 rounded-xl bg-blue-700 px-5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save & Print'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}