'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { QuotationService } from '@/services/quotation.service';
import type { Quotation, QuotationStatus } from '@/types/quotation';
import { formatDate, monthKey } from '@/utils/format';
import { formatMoney } from '@/lib/utils';

export default function QuotationsPage() {
  const router = useRouter();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [month, setMonth] = useState('');
  const [loading, setLoading] = useState(true);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const loadQuotations = async () => {
    try {
      const loaded = await QuotationService.getQuotations();
      setQuotations(loaded);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load quotations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadQuotations();
  }, []);

  const filteredQuotations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return quotations.filter((q) => {
      const customerName = `${q.customer?.name ?? ''} ${q.customer?.company_name ?? ''}`.toLowerCase();
      const currentStatus = (q.status ?? 'pending').toLowerCase();

      return (
        (!normalizedQuery || q.quotation_number.toLowerCase().includes(normalizedQuery) || customerName.includes(normalizedQuery)) &&
        (status === 'all' || currentStatus === status) &&
        (!month || monthKey(q.created_at) === month)
      );
    });
  }, [quotations, query, status, month]);

  const handleStatusChange = async (id: string, nextStatus: QuotationStatus) => {
    try {
      await QuotationService.updateQuotationStatus(id, nextStatus);
      setQuotations((curr) => curr.map((q) => (q.id === id ? { ...q, status: nextStatus } : q)));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update status.');
    }
  };

  const handleConvertToInvoice = async (id: string) => {
    setConvertingId(id);
    try {
      const createdInvoice = await QuotationService.convertToInvoice(id);
      router.push(`/invoices/new?id=${createdInvoice.id}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to convert quotation.');
      setConvertingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this quotation?')) return;
    setDeletingId(id);
    try {
      await QuotationService.deleteQuotation(id);
      setQuotations((curr) => curr.filter((q) => q.id !== id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete quotation.');
    } finally {
      setDeletingId(null);
    }
  };

  const getStatusBadge = (statusValue: QuotationStatus) => {
    switch (statusValue) {
      case 'accepted':
        return <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">Accepted</span>;
      case 'converted':
        return <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800">Converted to Invoice</span>;
      case 'rejected':
        return <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-800">Rejected</span>;
      case 'VOID':
        return <span className="inline-flex rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-700">VOID</span>;
      default:
        return <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">Pending</span>;
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Quotations</h1>
            <p className="mt-1 text-sm text-slate-500">Manage client proposals and convert them directly into invoices.</p>
          </div>
          <Link
            href="/quotations/new"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-5 font-bold text-white shadow-sm hover:bg-blue-800"
          >
            + Create New Quotation
          </Link>
        </div>

        {errorMessage && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{errorMessage}</p>}

        {/* Filters */}
        <section className="mb-6 grid gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:grid-cols-3">
          <input
            type="text"
            placeholder="Search quotation # or customer..."
            className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-600"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-600"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="converted">Converted</option>
            <option value="rejected">Rejected</option>
          </select>
          <input
            type="month"
            className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-600"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </section>

        {/* List */}
        {loading ? (
          <p className="p-8 text-center text-slate-500">Loading quotations...</p>
        ) : filteredQuotations.length === 0 ? (
          <div className="rounded-2xl bg-white p-12 text-center shadow-sm ring-1 ring-slate-200">
            <p className="text-slate-500">No quotations found.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="p-4">Quotation No.</th>
                    <th className="p-4">Customer</th>
                    <th className="p-4">Date</th>
                    <th className="p-4 text-right">Amount</th>
                    <th className="p-4 text-center">Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredQuotations.map((q) => (
                    <tr key={q.id} className="hover:bg-slate-50">
                      <td className="p-4 font-bold text-blue-700">{q.quotation_number}</td>
                      <td className="p-4 font-medium">{q.customer?.company_name || q.customer?.name || 'Unknown'}</td>
                      <td className="p-4 text-slate-500">{q.created_at ? formatDate(q.created_at) : '-'}</td>
                      <td className="p-4 text-right font-bold">{formatMoney(q.total_amount)}</td>
                      <td className="p-4 text-center">{getStatusBadge(q.status)}</td>
                      <td className="p-4 text-right space-x-2">
                        {q.status !== 'converted' && (
                          <button
                            type="button"
                            disabled={convertingId === q.id}
                            onClick={() => handleConvertToInvoice(q.id)}
                            className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                          >
                            {convertingId === q.id ? 'Converting...' : '→ Convert to Invoice'}
                          </button>
                        )}
                        <Link
                          href={`/quotations/new?id=${q.id}`}
                          className="inline-block rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200"
                        >
                          Edit
                        </Link>
                        <button
                          type="button"
                          disabled={deletingId === q.id}
                          onClick={() => handleDelete(q.id)}
                          className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}