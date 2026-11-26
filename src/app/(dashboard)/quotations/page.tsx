'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { QuotationService } from '@/services/quotation.service';
import type { Quotation, QuotationStatus } from '@/types/quotation';
import { formatDate, monthKey } from '@/utils/format';
import { formatMoney } from '@/lib/utils';
import { downloadCsv } from '@/utils/csv';
import { useLanguage } from '@/context/LanguageContext';

export default function QuotationsPage() {
  const router = useRouter();
  const { t } = useLanguage();

  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [month, setMonth] = useState('');
  const [outletFilter, setOutletFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [groupBy, setGroupBy] = useState<'none' | 'outlet' | 'state'>('none');
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

  const outlets = useMemo(
    () => [...new Set(quotations.map((q) => q.outlet?.trim()).filter((value): value is string => !!value))]
      .sort((a, b) => a.localeCompare(b)),
    [quotations]
  );
  const states = useMemo(
    () => [...new Set(quotations.map((q) => q.state?.trim()).filter((value): value is string => !!value))]
      .sort((a, b) => a.localeCompare(b)),
    [quotations]
  );

  const filteredQuotations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return quotations.filter((q) => {
      const customerName = `${q.customer?.name ?? ''} ${q.customer?.company_name ?? ''}`.toLowerCase();
      const currentStatus = (q.status ?? 'pending').toLowerCase();

      return (
        (!normalizedQuery || q.quotation_number.toLowerCase().includes(normalizedQuery) || customerName.includes(normalizedQuery)) &&
        (status === 'all' || currentStatus === status) &&
        (outletFilter === 'all' || q.outlet?.trim() === outletFilter) &&
        (stateFilter === 'all' || q.state?.trim() === stateFilter) &&
        (!month || monthKey(q.created_at) === month)
      );
    });
  }, [quotations, query, status, outletFilter, stateFilter, month]);

  const groupedQuotations = useMemo(() => {
    if (groupBy === 'none') return [{ key: 'all', label: '', quotations: filteredQuotations }];
    const groups = new Map<string, Quotation[]>();
    filteredQuotations.forEach((quotation) => {
      const key = (groupBy === 'outlet' ? quotation.outlet : quotation.state)?.trim() || '';
      groups.set(key, [...(groups.get(key) ?? []), quotation]);
    });
    return [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, rows]) => ({
        key: `${groupBy}:${key || 'unassigned'}`,
        label: key || (groupBy === 'outlet' ? t.invoice.noOutlet : t.invoice.noState),
        quotations: rows,
      }));
  }, [filteredQuotations, groupBy, t.invoice.noOutlet, t.invoice.noState]);

  const exportQuotations = (rows: Quotation[], fileName: string) => {
    let grandTotal = 0;

    const rowsForExport = rows.map((q) => {
      const total = Number(q.total_amount) || 0;
      grandTotal += total;

      const formattedDate = q.created_at ? formatDate(q.created_at) : '';
      const customerName = q.customer?.company_name || q.customer?.name || 'Unknown';

      return [
        q.quotation_number,
        formattedDate,
        customerName,
        q.customer?.email ?? '',
        total.toFixed(2),
        (q.status ?? 'pending').toUpperCase(),
      ];
    });

    const headers = ['Quotation No', 'Date', 'Customer', 'Email', 'Amount', 'Status'];
    const summaryRow = ['TOTAL / SUMMARY', '', '', '', grandTotal.toFixed(2), ''];

    downloadCsv([headers, ...rowsForExport, [], summaryRow], fileName);
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
        return <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">{t.quotation?.statusAccepted ?? 'Accepted'}</span>;
      case 'converted':
        return <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800">{t.quotation?.statusConverted ?? 'Converted to Invoice'}</span>;
      case 'rejected':
        return <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-800">{t.quotation?.statusDeclined ?? 'Rejected'}</span>;
      case 'VOID':
        return <span className="inline-flex rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-700">VOID</span>;
      default:
        return <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">{t.quotation?.statusDraft ?? 'Pending'}</span>;
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t.quotation?.title ?? 'Quotations'}</h1>
            <p className="mt-1 text-sm text-slate-500">{t.quotation?.description ?? 'Manage client proposals and convert them directly into invoices.'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                const today = new Date().toISOString().slice(0, 10);
                exportQuotations(filteredQuotations, `quotations_${today}.csv`);
              }}
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 px-4 font-bold text-white shadow-sm hover:bg-emerald-700"
            >
              {t.quotation?.exportCsv ?? 'Export CSV'}
            </button>
            <Link
              href="/quotations/new"
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-5 font-bold text-white shadow-sm hover:bg-blue-800"
            >
              {t.quotation?.createNew ?? '+ Create New Quotation'}
            </Link>
          </div>
        </div>

        {errorMessage && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{errorMessage}</p>}

        <section className="mb-6 grid gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:grid-cols-2 lg:grid-cols-3">
          <input
            type="text"
            placeholder={t.quotation?.searchPlaceholder ?? 'Search quotation # or customer...'}
            className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-600"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-600"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">{t.quotation?.allStatuses ?? 'All Statuses'}</option>
            <option value="pending">{t.quotation?.statusDraft ?? 'Pending'}</option>
            <option value="accepted">{t.quotation?.statusAccepted ?? 'Accepted'}</option>
            <option value="converted">{t.quotation?.statusConverted ?? 'Converted'}</option>
            <option value="rejected">{t.quotation?.statusDeclined ?? 'Rejected'}</option>
          </select>
          <input
            type="month"
            className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-600"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          <select
            className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-600"
            value={outletFilter}
            onChange={(e) => setOutletFilter(e.target.value)}
          >
            <option value="all">{t.invoice.allOutlets}</option>
            {outlets.map((outlet) => <option key={outlet} value={outlet}>{outlet}</option>)}
          </select>
          <select
            className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-600"
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
          >
            <option value="all">{t.invoice.allStates}</option>
            {states.map((stateValue) => <option key={stateValue} value={stateValue}>{stateValue}</option>)}
          </select>
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-3 text-sm font-semibold">
            <span className="shrink-0">{t.invoice.groupBy}</span>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as 'none' | 'outlet' | 'state')}
              className="min-w-0 flex-1 bg-transparent outline-none"
            >
              <option value="none">{t.invoice.noGrouping}</option>
              <option value="outlet">{t.invoice.byOutlet}</option>
              <option value="state">{t.invoice.byState}</option>
            </select>
          </label>
        </section>

        {loading ? (
          <p className="p-8 text-center text-slate-500">{t.invoice?.loading ?? 'Loading quotations...'}</p>
        ) : filteredQuotations.length === 0 ? (
          <div className="rounded-2xl bg-white p-12 text-center shadow-sm ring-1 ring-slate-200">
            <p className="text-slate-500">{t.invoice?.noMatch ?? 'No quotations found.'}</p>
          </div>
        ) : (
          <>
            <div className="space-y-3 sm:hidden">
              {groupedQuotations.map((group) => (
                <Fragment key={group.key}>
                  {groupBy !== 'none' && <h2 className="rounded-lg bg-slate-200 px-3 py-2 text-sm font-bold text-slate-700">{group.label}</h2>}
                  {group.quotations.map((q) => (
                <div key={q.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                  <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                    <div>
                      <p className="font-bold text-blue-700">{q.quotation_number}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{q.created_at ? formatDate(q.created_at) : '-'}</p>
                      {(q.outlet || q.state) && <p className="mt-1 text-xs text-slate-500">{[q.outlet, q.state].filter(Boolean).join(' · ')}</p>}
                    </div>
                    <div>{getStatusBadge(q.status)}</div>
                  </div>

                  <div className="my-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-slate-400">{t.invoice?.customer ?? 'Customer'}</p>
                      <p className="text-sm font-medium text-slate-800">{q.customer?.company_name || q.customer?.name || 'Unknown'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-slate-400">{t.invoice?.totalShort ?? 'Amount'}</p>
                      <p className="text-base font-bold text-slate-900">{formatMoney(q.total_amount)}</p>
                    </div>
                  </div>
                  {q.internal_remark && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900"><span className="font-bold">{t.invoice.internalRemark}:</span> {q.internal_remark}</p>}

                  <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
                    {q.status !== 'converted' && (
                      <button
                        type="button"
                        disabled={convertingId === q.id}
                        onClick={() => handleConvertToInvoice(q.id)}
                        className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        {convertingId === q.id ? '...' : '→ Convert'}
                      </button>
                    )}
                    <Link
                      href={`/quotations/new?id=${q.id}`}
                      className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200"
                    >
                      {t.invoice?.edit ?? 'Edit'}
                    </Link>
                    <button
                      type="button"
                      disabled={deletingId === q.id}
                      onClick={() => handleDelete(q.id)}
                      className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100 disabled:opacity-50"
                    >
                      {t.invoice?.delete ?? 'Delete'}
                    </button>
                  </div>
                </div>
                  ))}
                </Fragment>
              ))}
            </div>

            <div className="hidden overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 sm:block">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="p-4">{t.quotation?.title ?? 'Quotation No.'}</th>
                      <th className="p-4">{t.invoice?.customer ?? 'Customer'}</th>
                      <th className="p-4">{t.invoice?.date ?? 'Date'}</th>
                      <th className="p-4 text-right">{t.invoice?.totalShort ?? 'Amount'}</th>
                      <th className="p-4 text-center">Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {groupedQuotations.map((group) => (
                      <Fragment key={group.key}>
                        {groupBy !== 'none' && <tr className="bg-slate-100"><td colSpan={6} className="p-3 font-bold text-slate-700">{group.label}</td></tr>}
                        {group.quotations.map((q) => (
                      <tr key={q.id} className="hover:bg-slate-50">
                        <td className="p-4 font-bold text-blue-700">
                          {q.quotation_number}
                          {(q.outlet || q.state) && <p className="mt-1 text-xs font-normal text-slate-500">{[q.outlet, q.state].filter(Boolean).join(' · ')}</p>}
                          {q.internal_remark && <p className="mt-1 max-w-xs truncate text-xs font-normal text-amber-800">{t.invoice.internalRemark}: {q.internal_remark}</p>}
                        </td>
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
                              {convertingId === q.id ? '...' : '→ Convert to Invoice'}
                            </button>
                          )}
                          <Link
                            href={`/quotations/new?id=${q.id}`}
                            className="inline-block rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200"
                          >
                            {t.invoice?.edit ?? 'Edit'}
                          </Link>
                          <button
                            type="button"
                            disabled={deletingId === q.id}
                            onClick={() => handleDelete(q.id)}
                            className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100 disabled:opacity-50"
                          >
                            {t.invoice?.delete ?? 'Delete'}
                          </button>
                        </td>
                      </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}