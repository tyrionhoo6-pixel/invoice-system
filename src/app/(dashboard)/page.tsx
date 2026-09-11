'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { InvoiceService } from '@/services/invoice.service';
import { QuotationService } from '@/services/quotation.service';
import type { Invoice } from '@/types/invoice';
import type { Quotation } from '@/types/quotation';
import { useLanguage } from '@/context/LanguageContext';
import { formatMoney } from '@/lib/utils';
import { formatDate } from '@/utils/format';

export default function DashboardPage() {
  const { t } = useLanguage();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const [loadedInvoices, loadedQuotations] = await Promise.all([
          InvoiceService.getInvoices(),
          QuotationService.getQuotations(),
        ]);
        setInvoices(loadedInvoices);
        setQuotations(loadedQuotations);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load dashboard data.');
      } finally {
        setLoading(false);
      }
    };
    void loadDashboardData();
  }, []);

  // Invoice 统计
  const unpaidAmount = useMemo(
    () =>
      invoices
        .filter((invoice) => (invoice.status ?? 'unpaid').toLowerCase() !== 'paid')
        .reduce((sum, invoice) => sum + (Number(invoice.total_amount) || 0), 0),
    [invoices]
  );
  const paidCount = useMemo(
    () => invoices.filter((invoice) => (invoice.status ?? 'unpaid').toLowerCase() === 'paid').length,
    [invoices]
  );
  const recentInvoices = invoices.slice(0, 5);

  // Quotation 统计与最新 5 条
  const activeQuotationsCount = useMemo(() => quotations.length, [quotations]);
  const activeQuotationsAmount = useMemo(
    () => quotations.reduce((sum, item) => sum + (Number(item.total_amount) || 0), 0),
    [quotations]
  );
  const recentQuotations = quotations.slice(0, 5);

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 lg:px-8 lg:py-10">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <section className="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-700">{t.navigation.dashboard}</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{t.navigation.dashboard}</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-500">{t.invoice.latestActivity}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/quotations/new"
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-slate-200 px-5 text-sm font-bold text-slate-800 transition hover:bg-slate-300"
            >
              + Create quotation
            </Link>
            <Link
              href="/invoices/new"
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800"
            >
              + {t.invoice.createInvoice}
            </Link>
          </div>
        </section>

        {errorMessage && <p className="mb-5 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{errorMessage}</p>}

        {/* 顶部统计卡片 */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl bg-slate-900 p-5 text-white shadow-sm">
            <p className="text-sm font-semibold text-slate-300">{t.invoice.totalUnpaid}</p>
            <p className="mt-3 text-2xl font-bold">{formatMoney(unpaidAmount)}</p>
            <p className="mt-2 text-xs text-slate-400">{t.invoice.outstandingBalance}</p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm font-semibold text-slate-500">{t.invoice.paidInvoices}</p>
            <p className="mt-3 text-2xl font-bold text-slate-900">{paidCount}</p>
            <p className="mt-2 text-xs text-slate-500">{t.invoice.completedPayments}</p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm font-semibold text-slate-500">Quotations</p>
            <p className="mt-3 text-2xl font-bold text-slate-900">{activeQuotationsCount}</p>
            <p className="mt-2 text-xs font-semibold text-blue-700">{formatMoney(activeQuotationsAmount)} Total</p>
          </div>

          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
            <p className="text-sm font-semibold text-blue-800">{t.invoice.quickAction}</p>
            <div className="mt-3 flex flex-col gap-1">
              <Link href="/customers" className="inline-flex font-bold text-blue-700 hover:text-blue-900">
                {t.invoice.manageCustomers} <span aria-hidden="true">-&gt;</span>
              </Link>
              <Link href="/quotations" className="inline-flex text-xs font-bold text-blue-600 hover:text-blue-800">
                View all quotations -&gt;
              </Link>
            </div>
          </div>
        </section>

        {/* 下方双列列表：Recent Quotations 与 Recent Invoices 并列 */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* 左侧：Recent Quotations */}
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">Recent quotations</h2>
                <p className="mt-1 text-sm text-slate-500">Your latest quotation activity</p>
              </div>
              <Link href="/quotations" className="text-sm font-bold text-blue-700 hover:text-blue-900">
                View all
              </Link>
            </div>

            <div className="mt-5 divide-y divide-slate-100">
              {loading && <p className="py-8 text-center text-sm text-slate-500">Loading quotations...</p>}
              {!loading && recentQuotations.length === 0 && (
                <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">No quotations found.</p>
              )}
              {recentQuotations.map((quotation) => (
                <Link
                  key={quotation.id}
                  href={`/quotations/${quotation.id}`}
                  className="flex flex-col gap-3 py-4 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between sm:px-3"
                >
                  <div>
                    <p className="font-bold text-blue-700">{quotation.quotation_number}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {quotation.customer?.company_name || quotation.customer?.name || t.invoice.customer}{' '}
                      <span className="text-slate-400">-</span> {formatDate(quotation.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-4">
                    <span className="min-w-24 text-right font-bold text-slate-900">
                      {formatMoney(quotation.total_amount)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* 右侧：Recent Invoices */}
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">{t.invoice.recent}</h2>
                <p className="mt-1 text-sm text-slate-500">{t.invoice.latestActivity}</p>
              </div>
              <Link href="/invoices" className="text-sm font-bold text-blue-700 hover:text-blue-900">
                {t.invoice.viewAll}
              </Link>
            </div>

            <div className="mt-5 divide-y divide-slate-100">
              {loading && <p className="py-8 text-center text-sm text-slate-500">{t.invoice.loadingInvoices}</p>}
              {!loading && recentInvoices.length === 0 && (
                <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">{t.invoice.noInvoices}</p>
              )}
              {recentInvoices.map((invoice) => {
                const paid = (invoice.status ?? 'unpaid').toLowerCase() === 'paid';
                return (
                  <Link
                    key={invoice.id}
                    href={`/invoices/${invoice.id}`}
                    className="flex flex-col gap-3 py-4 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between sm:px-3"
                  >
                    <div>
                      <p className="font-bold text-blue-700">{invoice.invoice_number}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {invoice.customer?.name ?? t.invoice.customer} <span className="text-slate-400">-</span>{' '}
                        {formatDate(invoice.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-4 sm:justify-end">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          paid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {paid ? t.status.paid : t.status.unpaid}
                      </span>
                      <span className="min-w-24 text-right font-bold text-slate-900">
                        {formatMoney(invoice.total_amount)}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}