'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { InvoiceService } from '@/services/invoice.service';
import type { CompanySettings } from '@/types/company';
import type { Invoice } from '@/types/invoice';
import { useLanguage } from '@/context/LanguageContext';
import { downloadCsv } from '@/utils/csv';
import { formatDate, monthKey } from '@/utils/format';
import { formatMoney } from '@/lib/utils';

export default function InvoicesPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [customerId, setCustomerId] = useState('all');
  const [month, setMonth] = useState('');
  const [exportMode, setExportMode] = useState('current');
  const [deletingInvoice, setDeletingInvoice] = useState<Invoice | null>(null);
  const [voidingInvoice, setVoidingInvoice] = useState<Invoice | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [loadedInvoices, settings] = await Promise.all([
          InvoiceService.getInvoices(),
          InvoiceService.getCompanySettings(),
        ]);
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
    invoices.forEach((invoice) =>
      uniqueCustomers.set(invoice.customer_id, invoice.customer?.name || 'Unnamed customer')
    );
    return Array.from(uniqueCustomers, ([id, name]) => ({ id, name })).sort((left, right) =>
      left.name.localeCompare(right.name)
    );
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return invoices.filter((invoice) => {
      const customerName = `${invoice.customer?.name ?? ''} ${invoice.customer?.company_name ?? ''}`.toLowerCase();
      const currentStatus = (invoice.status ?? 'unpaid').toLowerCase();

      return (
        (!normalizedQuery || invoice.invoice_number.toLowerCase().includes(normalizedQuery) || customerName.includes(normalizedQuery)) &&
        (status === 'all' || currentStatus === status) &&
        (customerId === 'all' || invoice.customer_id === customerId) &&
        (!month || monthKey(invoice.created_at) === month)
      );
    });
  }, [invoices, query, status, customerId, month]);

  const summary = useMemo(
    () =>
      filteredInvoices.reduce(
        (result, invoice) => {
          const amount = Number(invoice.total_amount) || 0;
          const currentStatus = (invoice.status ?? 'unpaid').toLowerCase();

          result.totalInvoices += 1;
          result.totalValue += amount;

          if (currentStatus === 'paid') {
            result.paid += amount;
          } else if (currentStatus === 'unpaid') {
            result.outstanding += amount;
          }
          return result;
        },
        { totalInvoices: 0, totalValue: 0, paid: 0, outstanding: 0 }
      ),
    [filteredInvoices]
  );

  const toggleInvoiceStatus = async (invoice: Invoice) => {
    const currentStatus = (invoice.status ?? 'unpaid').toLowerCase();
    const nextStatus = currentStatus === 'paid' ? 'unpaid' : 'paid';

    setUpdatingStatusId(invoice.id);
    setErrorMessage('');
    try {
      await InvoiceService.updateInvoiceStatus(invoice.id, nextStatus);
      setInvoices((current) =>
        current.map((inv) => (inv.id === invoice.id ? { ...inv, status: nextStatus } : inv))
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update status.');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  // 核心 Excel/CSV 导出与计算逻辑
  const exportRows = (rows: Invoice[], fileName: string) => {
    let grandTotal = 0;
    let grandPaid = 0;
    let grandOutstanding = 0;

    const rowsForExport = rows.map((invoice) => {
      const total = Number(invoice.total_amount) || 0;
      const currentStatus = (invoice.status ?? 'unpaid').toLowerCase();

      let paid = 0;
      let outstanding = 0;

      if (currentStatus === 'paid') {
        paid = total;
        outstanding = 0;
      } else if (currentStatus === 'unpaid') {
        paid = 0;
        outstanding = total;
      }

      // 如果对象本身自带 paid_amount 属性则优先按 paid_amount 计算
      if (invoice.paid_amount !== undefined) {
        paid = Number(invoice.paid_amount) || 0;
        outstanding = Math.max(0, total - paid);
      }

      // 统计汇总（非 VOID 发票）
      if (currentStatus !== 'void') {
        grandTotal += total;
        grandPaid += paid;
        grandOutstanding += outstanding;
      }

      return [
        invoice.invoice_number,
        invoice.created_at ? new Date(invoice.created_at).toISOString().slice(0, 10) : '',
        String(invoice.due_date ?? ''),
        invoice.customer?.name ?? '',
        invoice.customer?.email ?? '',
        (Number(invoice.subtotal_amount) || 0).toFixed(2),
        company?.sst_no ?? '',
        total.toFixed(2),
        paid.toFixed(2),
        outstanding.toFixed(2),
        currentStatus.toUpperCase(),
        company?.payment_terms ?? '',
      ];
    });

    const customHeaders = [
      'Invoice No',
      'Date',
      'Due Date',
      'Customer Name',
      'Email',
      'Subtotal',
      'SST No',
      'Total Amount',
      'Paid Amount',
      'Outstanding Amount',
      'Status',
      'Payment Terms',
    ];

    const totalSummaryRow = [
      'TOTAL / SUMMARY',
      '',
      '',
      '',
      '',
      '',
      '',
      grandTotal.toFixed(2),
      grandPaid.toFixed(2),
      grandOutstanding.toFixed(2),
      '',
      '',
    ];

    downloadCsv([customHeaders, ...rowsForExport, [], totalSummaryRow], fileName);
  };

  const exportInvoices = () => {
    const today = new Date().toISOString().slice(0, 10);

    if (exportMode === 'outstanding_only') {
      const outstandingRows = filteredInvoices.filter(
        (inv) => (inv.status ?? 'unpaid').toLowerCase() === 'unpaid'
      );
      const clientName = customerId === 'all'
        ? 'all_clients'
        : (customers.find((c) => c.id === customerId)?.name || 'client').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
      exportRows(outstandingRows, `outstanding_invoices_${clientName}_${today}.csv`);
    } else if (exportMode === 'monthly') {
      const selectedMonth = month || today.slice(0, 7);
      exportRows(invoices.filter((invoice) => monthKey(invoice.created_at) === selectedMonth), `invoices_monthly_${selectedMonth}.csv`);
    } else if (exportMode === 'backup') {
      const companyName = (company?.company_name || 'company').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toLowerCase();
      exportRows(invoices, `backup_all_invoices_${companyName || 'company'}_${today}.csv`);
    } else {
      const clientName = customerId === 'all'
        ? 'all_clients'
        : (customers.find((customer) => customer.id === customerId)?.name || 'client').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
      exportRows(filteredInvoices, `statement_${clientName}_${today}.csv`);
    }
  };

  const confirmVoid = async () => {
    if (!voidingInvoice) return;
    setVoiding(true);
    setErrorMessage('');
    try {
      const updated = await InvoiceService.voidInvoice(voidingInvoice.id);
      setInvoices((current) => current.map((inv) => (inv.id === updated.id ? { ...inv, status: 'VOID' } : inv)));
      setVoidingInvoice(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to void invoice.');
      setVoidingInvoice(null);
    } finally {
      setVoiding(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingInvoice) return;
    setDeleting(true);
    setErrorMessage('');
    try {
      await InvoiceService.deleteInvoice(deletingInvoice.id);
      setInvoices((current) => current.filter((invoice) => invoice.id !== deletingInvoice.id));
      setDeletingInvoice(null);
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to delete invoice.');
      setDeletingInvoice(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-700">{t.invoice.workspace}</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{t.navigation.invoices}</h1>
            <p className="mt-2 text-sm text-slate-500">{t.invoice.latestActivity}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={exportMode}
              onChange={(event) => setExportMode(event.target.value)}
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold"
            >
              <option value="current">Export Statement (Current View)</option>
              <option value="outstanding_only">Export Outstanding Only (Unpaid)</option>
              <option value="monthly">Export all invoices this month</option>
              <option value="backup">Full company backup</option>
            </select>
            <button
              type="button"
              onClick={exportInvoices}
              className="min-h-11 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700"
            >
              Export CSV
            </button>
            <Link
              href="/invoices/new"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-700 px-4 text-sm font-bold text-white hover:bg-blue-800"
            >
              + {t.invoice.newInvoice}
            </Link>
          </div>
        </header>

        {errorMessage && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{errorMessage}</p>}

        <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Invoices</p>
            <p className="mt-2 text-2xl font-bold">{summary.totalInvoices}</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Value</p>
            <p className="mt-2 text-2xl font-bold">{formatMoney(summary.totalValue)}</p>
          </div>
          <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-100">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Paid</p>
            <p className="mt-2 text-2xl font-bold text-emerald-800">{formatMoney(summary.paid)}</p>
          </div>
          <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-100">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-700">Outstanding</p>
            <p className="mt-2 text-2xl font-bold text-amber-800">{formatMoney(summary.outstanding)}</p>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_190px_170px_170px]">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.invoice.search}
              className="min-h-12 rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
            />
            <select
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              className="min-h-12 rounded-xl border border-slate-300 bg-white px-3 font-semibold"
            >
              <option value="all">Select client</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="min-h-12 rounded-xl border border-slate-300 px-3 font-semibold"
              aria-label="Select month"
            />
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="min-h-12 rounded-xl border border-slate-300 bg-white px-3 font-semibold"
            >
              <option value="all">{t.invoice.allStatuses}</option>
              <option value="paid">{t.status.paid}</option>
              <option value="unpaid">{t.status.unpaid}</option>
              <option value="void">VOID</option>
            </select>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-3 font-bold">{t.invoice.invoice}</th>
                  <th className="px-3 py-3 font-bold">{t.invoice.customer}</th>
                  <th className="px-3 py-3 font-bold">{t.invoice.issued}</th>
                  <th className="px-3 py-3 text-right font-bold">{t.invoice.totalShort}</th>
                  <th className="px-3 py-3 font-bold">Status</th>
                  <th className="px-3 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-slate-500">
                      {t.invoice.loadingInvoices}
                    </td>
                  </tr>
                )}
                {!loading && filteredInvoices.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-slate-500">
                      {t.invoice.noMatch}
                    </td>
                  </tr>
                )}
                {filteredInvoices.map((invoice) => {
                  const currentStatus = (invoice.status ?? 'unpaid').toLowerCase();
                  const isPaid = currentStatus === 'paid';
                  const isVoid = currentStatus === 'void';
                  const isUpdating = updatingStatusId === invoice.id;

                  return (
                    <tr key={invoice.id} className="hover:bg-slate-50">
                      <td className="px-3 py-4">
                        <Link
                          href={`/invoices/${invoice.id}`}
                          className={`font-bold ${isVoid ? 'line-through text-slate-400' : 'text-blue-700'}`}
                        >
                          {invoice.invoice_number}
                        </Link>
                      </td>
                      <td className="px-3 py-4">
                        <p className="font-semibold">{invoice.customer?.name ?? t.invoice.customer}</p>
                        <p className="text-xs text-slate-500">{invoice.customer?.company_name ?? t.customer.noCompany}</p>
                      </td>
                      <td className="px-3 py-4 text-slate-600">{formatDate(invoice.created_at)}</td>
                      <td className={`px-3 py-4 text-right font-bold ${isVoid ? 'line-through text-slate-400' : ''}`}>
                        {formatMoney(invoice.total_amount)}
                      </td>
                      <td className="px-3 py-4">
                        {isVoid ? (
                          <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-800">VOID</span>
                        ) : (
                          <span className={`rounded-full px-3 py-1 text-xs font-bold ${isPaid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                            {isPaid ? t.status.paid : t.status.unpaid}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-4 text-right">
                        <div className="flex justify-end gap-1.5">
                          {!isVoid && (
                            <>
                              <button
                                type="button"
                                disabled={isUpdating}
                                onClick={() => void toggleInvoiceStatus(invoice)}
                                className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                                  isPaid
                                    ? 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                                    : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                                } disabled:opacity-50`}
                              >
                                {isUpdating ? 'Updating...' : isPaid ? 'Mark Unpaid' : 'Mark Paid'}
                              </button>
                              <Link
                                href={`/invoices/new?id=${invoice.id}`}
                                className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200"
                              >
                                Edit
                              </Link>
                              <button
                                type="button"
                                onClick={() => setVoidingInvoice(invoice)}
                                className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100"
                              >
                                Void
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => setDeletingInvoice(invoice)}
                            className="rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100"
                          >
                            {t.invoice.delete}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Void Modal */}
      {voidingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-bold">Void Invoice</h2>
            <p className="mt-2 text-sm text-slate-500">
              Are you sure you want to void this invoice? This will set its amount to zero in accounting reports while keeping the number for sequential auditing.
            </p>
            <p className="mt-3 font-semibold text-slate-900">{voidingInvoice.invoice_number}</p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setVoidingInvoice(null)}
                className="min-h-11 rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmVoid()}
                disabled={voiding}
                className="min-h-11 rounded-xl bg-amber-600 px-4 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-60"
              >
                {voiding ? 'Voiding...' : 'Confirm Void'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deletingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-bold">{t.invoice.confirmDelete}</h2>
            <p className="mt-2 text-sm text-slate-500">{t.invoice.confirmDeleteDescription}</p>
            <p className="mt-3 font-semibold">{deletingInvoice.invoice_number}</p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingInvoice(null)}
                className="min-h-11 rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-700"
              >
                {t.customer.cancel}
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={deleting}
                className="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-bold text-white disabled:opacity-60"
              >
                {deleting ? t.invoice.deleting : t.invoice.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}