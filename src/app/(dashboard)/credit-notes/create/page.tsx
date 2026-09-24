'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react';
import { InvoiceService } from '@/services/invoice.service';
import type { Customer, InvoiceWithItems } from '@/types/invoice';
import type { CreateCreditNoteItemInput, CreateCreditNoteInput } from '@/types/creditNote';

function CreateCreditNoteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefilledInvoiceId = searchParams.get('invoice_id');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<InvoiceWithItems[]>([]);

  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>(prefilledInvoiceId || '');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  
  // CN Type States
  const [cnType, setCnType] = useState<string>('RETURN');
  const [customCnType, setCustomCnType] = useState<string>('');

  const [reason, setReason] = useState<string>('');

  const [items, setItems] = useState<CreateCreditNoteItemInput[]>([
    { description: '', quantity: 1, unit_price: 0, subtotal: 0 },
  ]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [customersData, invoicesData] = await Promise.all([
        InvoiceService.getCustomers(),
        InvoiceService.getInvoices(),
      ]);
      setCustomers(customersData);

      const fullInvoices = await Promise.all(
        invoicesData.map((inv) => InvoiceService.getInvoiceById(inv.id))
      );
      const validInvoices = fullInvoices.filter((inv): inv is InvoiceWithItems => inv !== null);
      setInvoices(validInvoices);

      if (prefilledInvoiceId) {
        const inv = validInvoices.find((i) => i.id === prefilledInvoiceId);
        if (inv) {
          handleSelectInvoice(inv);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load initial data');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectInvoice = (inv: InvoiceWithItems) => {
    setSelectedInvoiceId(inv.id);
    setSelectedCustomerId(inv.customer_id);
    setCustomerName(inv.customer?.name || inv.customer?.company_name || '');

    if (inv.invoice_items && inv.invoice_items.length > 0) {
      setItems(
        inv.invoice_items.map((item) => ({
          description: item.product_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal: item.subtotal,
        }))
      );
    }
  };

  const handleInvoiceChange = (invId: string) => {
    setSelectedInvoiceId(invId);
    if (!invId) {
      return;
    }
    const inv = invoices.find((i) => i.id === invId);
    if (inv) {
      handleSelectInvoice(inv);
    }
  };

  const handleCustomerChange = (custId: string) => {
    setSelectedCustomerId(custId);
    const cust = customers.find((c) => c.id === custId);
    if (cust) {
      setCustomerName(cust.name || cust.company_name || '');
    }
  };

  const handleItemChange = (index: number, field: keyof CreateCreditNoteItemInput, value: any) => {
    const updated = [...items];
    const item = { ...updated[index], [field]: value };

    if (field === 'quantity' || field === 'unit_price') {
      const q = field === 'quantity' ? Number(value) : item.quantity;
      const p = field === 'unit_price' ? Number(value) : item.unit_price;
      item.subtotal = Math.round((q * p + Number.EPSILON) * 100) / 100;
    }

    updated[index] = item;
    setItems(updated);
  };

  const addItem = () => {
    setItems([...items, { description: '', quantity: 1, unit_price: 0, subtotal: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId || !customerName) {
      setError('Please select a customer.');
      return;
    }

    if (items.some((i) => !i.description.trim())) {
      setError('Please ensure all items have a description.');
      return;
    }

    const finalCnType = cnType === 'CUSTOM' ? customCnType.trim() : cnType;

    if (cnType === 'CUSTOM' && !finalCnType) {
      setError('Please enter a custom C/N Type.');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const selectedInvoice = invoices.find((i) => i.id === selectedInvoiceId);

      const payload: CreateCreditNoteInput = {
        invoice_id: selectedInvoiceId || undefined,
        invoice_no: selectedInvoice?.invoice_number || undefined,
        customer_id: selectedCustomerId,
        customer_name: customerName,
        cn_type: finalCnType,
        reason: reason || '',
        total_amount: calculateTotal(),
        items,
      };

      await InvoiceService.createCreditNote(payload);

      router.push('/credit-notes');
    } catch (err: any) {
      setError(err.message || 'Failed to create credit note.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-slate-500">Loading form...</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-5xl mx-auto pb-12">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/credit-notes"
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Create Credit Note</h1>
            <p className="text-sm text-slate-500">Issue a credit note against an invoice or customer.</p>
          </div>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:opacity-50"
        >
          <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Credit Note'}
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 p-4 text-sm font-bold text-red-600 border border-red-200">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-slate-900">Basic Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
              Link to Invoice (Optional)
            </label>
            <select
              value={selectedInvoiceId}
              onChange={(e) => handleInvoiceChange(e.target.value)}
              className="w-full rounded-xl border border-slate-200 p-2.5 text-sm font-medium focus:border-blue-500 focus:outline-none"
            >
              <option value="">-- No linked invoice --</option>
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoice_number} ({inv.customer?.name || inv.customer?.company_name || 'No Customer'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
              Customer <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedCustomerId}
              onChange={(e) => handleCustomerChange(e.target.value)}
              className="w-full rounded-xl border border-slate-200 p-2.5 text-sm font-medium focus:border-blue-500 focus:outline-none"
              required
            >
              <option value="">-- Select Customer --</option>
              {customers.map((cust) => (
                <option key={cust.id} value={cust.id}>
                  {cust.name || cust.company_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
              C/N Type
            </label>
            <select
              value={cnType}
              onChange={(e) => setCnType(e.target.value)}
              className="w-full rounded-xl border border-slate-200 p-2.5 text-sm font-medium focus:border-blue-500 focus:outline-none"
            >
              <option value="RETURN">RETURN</option>
              <option value="DISCOUNT">DISCOUNT</option>
              <option value="ADJUSTMENT">ADJUSTMENT</option>
              <option value="CANCELLATION">CANCELLATION</option>
              <option value="CUSTOM">OTHER / CUSTOM</option>
            </select>

            {cnType === 'CUSTOM' && (
              <input
                type="text"
                placeholder="Enter custom C/N type"
                value={customCnType}
                onChange={(e) => setCustomCnType(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 p-2.5 text-sm font-medium focus:border-blue-500 focus:outline-none"
                required
              />
            )}
          </div>

          <div className="md:col-span-3">
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
              Reason / Remarks
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Returned goods, price adjustment, discount applied..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-xl border border-slate-200 p-2.5 text-sm font-medium focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Line Items</h2>
          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center gap-1 text-sm font-bold text-blue-700 hover:text-blue-800"
          >
            <Plus className="w-4 h-4" /> Add Item
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/50 text-xs font-bold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 w-28">Qty</th>
                <th className="px-4 py-3 w-36">Unit Price</th>
                <th className="px-4 py-3 w-36 text-right">Subtotal</th>
                <th className="px-4 py-3 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item, idx) => (
                <tr key={idx}>
                  <td className="p-3">
                    <input
                      type="text"
                      placeholder="Item description"
                      value={item.description}
                      onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                      className="w-full rounded-lg border border-slate-200 p-2 text-sm font-medium focus:border-blue-500 focus:outline-none"
                      required
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                      className="w-full rounded-lg border border-slate-200 p-2 text-sm font-medium focus:border-blue-500 focus:outline-none"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="number"
                      step="0.01"
                      value={item.unit_price}
                      onChange={(e) => handleItemChange(idx, 'unit_price', e.target.value)}
                      className="w-full rounded-lg border border-slate-200 p-2 text-sm font-medium focus:border-blue-500 focus:outline-none"
                    />
                  </td>
                  <td className="p-3 text-right font-bold text-slate-900">
                    {item.subtotal.toFixed(2)}
                  </td>
                  <td className="p-3 text-center">
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      disabled={items.length === 1}
                      className="text-slate-400 hover:text-red-600 disabled:opacity-30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-100 pt-4 flex justify-end">
          <div className="w-64 space-y-2 text-right">
            <div className="flex justify-between text-base font-black text-slate-900 border-t border-slate-200 pt-2">
              <span>Total Credit Amount:</span>
              <span>{calculateTotal().toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

export default function CreateCreditNotePage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-500">Loading...</div>}>
      <CreateCreditNoteForm />
    </Suspense>
  );
}