'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, FileText, Search, ArrowLeft, Download } from 'lucide-react';
import { InvoiceService } from '@/services/invoice.service';
import type { CreditNote } from '@/types/creditNote';
import { downloadCsv } from '@/utils/csv';
import { useLanguage } from '@/context/LanguageContext';

export default function CreditNotesPage() {
  const { t } = useLanguage();
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadCreditNotes();
  }, []);

  const loadCreditNotes = async () => {
    try {
      setLoading(true);
      const data = await InvoiceService.getCreditNotes();
      setCreditNotes(data);
    } catch (err) {
      console.error('Failed to load credit notes:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredCNs = creditNotes.filter(
    (cn) =>
      cn.cn_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cn.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (cn.reason && cn.reason.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getStatusLabel = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s === 'issued') return t.creditNote?.statusIssued ?? 'Issued';
    if (s === 'void' || s === 'voided') return t.invoice?.void ?? 'Void';
    return status;
  };

  const exportCreditNotes = (rows: CreditNote[], fileName: string) => {
    let grandTotal = 0;

    const rowsForExport = rows.map((cn) => {
      const amount = Number(cn.total_amount) || 0;
      grandTotal += amount;

      const formattedDate = cn.created_at
        ? new Date(cn.created_at).toLocaleDateString()
        : '';

      return [
        cn.cn_number,
        cn.customer_name,
        cn.reason || '',
        amount.toFixed(2),
        getStatusLabel(cn.status),
        formattedDate,
      ];
    });

    const headers = [
      t.creditNote?.cnNumber ?? 'CN Number',
      t.invoice?.customer ?? 'Customer',
      t.creditNote?.reason ?? 'Reason',
      t.invoice?.totalShort ?? 'Amount',
      t.invoice?.statusHeader ?? 'Status',
      t.invoice?.date ?? 'Date',
    ];

    const summaryRow = [
      `${t.quotation?.total ?? 'Total'}:`,
      '',
      '',
      grandTotal.toFixed(2),
      '',
      '',
    ];

    downloadCsv([headers, ...rowsForExport, [], summaryRow], fileName);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm text-slate-500">
            <Link href="/" className="flex items-center gap-1 hover:text-slate-700">
              <ArrowLeft className="h-4 w-4" /> {t.navigation?.dashboard ?? 'Dashboard'}
            </Link>
          </div>
          <h1 className="text-2xl font-black text-slate-900 sm:text-3xl">
            {t.creditNote?.title ?? 'Credit Notes'}
          </h1>
          <p className="text-sm text-slate-500">
            {t.creditNote?.description ?? 'Manage credit notes, refunds, and invoice adjustments.'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              const today = new Date().toISOString().slice(0, 10);
              exportCreditNotes(filteredCNs, `credit_notes_${today}.csv`);
            }}
            disabled={filteredCNs.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> {t.quotation?.exportCsv ?? t.invoice?.exportCsv ?? 'Export CSV'}
          </button>

          <Link
            href="/credit-notes/create"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800"
          >
            <Plus className="h-4 w-4" /> {t.creditNote?.issueCN ?? 'Issue Credit Note'}
          </Link>
        </div>
      </div>

      {/* Search Input Container */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <div className="relative max-w-md">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={t.creditNote?.searchPlaceholder ?? 'Search by CN Number, Customer, or Reason...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 py-2 pl-10 pr-4 text-sm font-medium focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-12 text-center text-sm font-medium text-slate-500 shadow-sm">
          {t.invoice?.loading ?? 'Loading...'}
        </div>
      ) : filteredCNs.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-12 text-center shadow-sm">
          <FileText className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-sm font-bold text-slate-900">
            {t.invoice?.noMatch ?? 'No Credit Notes found'}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {searchTerm
              ? (t.invoice?.noMatch ?? 'No matching results.')
              : (t.creditNote?.createFirst ?? 'Create your first credit note to get started.')}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile View */}
          <div className="space-y-3 sm:hidden">
            {filteredCNs.map((cn) => (
              <div key={cn.id} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                  <div>
                    <p className="font-bold text-slate-900">{cn.cn_number}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {new Date(cn.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="inline-flex rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                    {getStatusLabel(cn.status)}
                  </span>
                </div>

                <div className="my-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-400">
                      {t.invoice?.customer ?? 'Customer'}
                    </p>
                    <p className="text-sm font-medium text-slate-800">{cn.customer_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-slate-400">
                      {t.invoice?.totalShort ?? 'Amount'}
                    </p>
                    <p className="text-base font-bold text-slate-900">RM {cn.total_amount.toFixed(2)}</p>
                  </div>
                </div>

                {cn.reason && (
                  <p className="mb-3 text-xs text-slate-500">
                    <span className="font-medium text-slate-600">{t.creditNote?.reason ?? 'Reason'}:</span> {cn.reason}
                  </p>
                )}

                <div className="flex justify-end border-t border-slate-100 pt-3">
                  <Link
                    href={`/credit-notes/${cn.id}`}
                    className="text-xs font-bold text-blue-700 hover:text-blue-800"
                  >
                    {t.deliveryOrder?.viewPrint ?? 'View Details'} →
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm sm:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50/50 text-xs font-bold uppercase text-slate-500">
                  <tr>
                    <th className="px-6 py-3.5">{t.creditNote?.cnNumber ?? 'CN Number'}</th>
                    <th className="px-6 py-3.5">{t.invoice?.customer ?? 'Customer'}</th>
                    <th className="px-6 py-3.5">{t.creditNote?.reason ?? 'Reason'}</th>
                    <th className="px-6 py-3.5 text-right">{t.invoice?.totalShort ?? 'Amount'}</th>
                    <th className="px-6 py-3.5">{t.invoice?.statusHeader ?? 'Status'}</th>
                    <th className="px-6 py-3.5">{t.invoice?.date ?? 'Date'}</th>
                    <th className="px-6 py-3.5 text-right">{t.invoice?.actionsHeader ?? 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCNs.map((cn) => (
                    <tr key={cn.id} className="hover:bg-slate-50/50">
                      <td className="px-6 py-4 font-bold text-slate-900">{cn.cn_number}</td>
                      <td className="px-6 py-4 font-medium text-slate-700">{cn.customer_name}</td>
                      <td className="max-w-xs truncate px-6 py-4 text-slate-500">{cn.reason || '-'}</td>
                      <td className="px-6 py-4 text-right font-bold text-slate-900">
                        RM {cn.total_amount.toFixed(2)}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                          {getStatusLabel(cn.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-500">
                        {new Date(cn.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/credit-notes/${cn.id}`}
                          className="font-bold text-blue-700 hover:text-blue-800"
                        >
                          {t.deliveryOrder?.viewPrint ?? 'View Details'}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}