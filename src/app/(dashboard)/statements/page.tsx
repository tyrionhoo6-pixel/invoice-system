'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { InvoiceService } from '@/services/invoice.service';
import { StatementService } from '@/services/statement.service';
import type { CompanySettings } from '@/types/company';
import type { Customer } from '@/types/invoice';
import type { StatementFilters, StatementSource } from '@/types/statement';
import { formatDate } from '@/utils/format';
import { formatMoney } from '@/lib/utils';

const initialFilters: StatementFilters = {
  customerId: 'all',
  outlet: 'all',
  state: 'all',
  startDate: '',
  endDate: '',
};

function optionValues(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => !!value))]
    .sort((left, right) => left.localeCompare(right));
}

function customerLabel(customer?: Customer): string {
  return customer?.company_name || customer?.name || 'Customer';
}

export default function StatementsPage() {
  const { t } = useLanguage();
  const [source, setSource] = useState<StatementSource | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [filters, setFilters] = useState<StatementFilters>(initialFilters);
  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;
    const loadStatementData = async () => {
      try {
        const [loadedSource, companySettings] = await Promise.all([
          StatementService.getStatementSource(),
          InvoiceService.getCompanySettings(),
        ]);
        if (active) {
          setSource(loadedSource);
          setCompany(companySettings);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load statement data.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadStatementData();
    return () => {
      active = false;
    };
  }, []);

  const customers = useMemo(
    () => [...(source?.customers ?? [])].sort((left, right) => customerLabel(left).localeCompare(customerLabel(right))),
    [source]
  );
  const outlets = useMemo(() => {
    if (!source) return [];
    return optionValues([
      ...source.customers.map((customer) => customer.outlet),
      ...source.invoices.map((invoice) => invoice.outlet || invoice.customer?.outlet),
    ]);
  }, [source]);
  const states = useMemo(() => {
    if (!source) return [];
    return optionValues([
      ...source.customers.map((customer) => customer.state),
      ...source.invoices.map((invoice) => invoice.state || invoice.customer?.state),
    ]);
  }, [source]);
  const statement = useMemo(
    () => source ? StatementService.calculateStatement(source, filters, company?.payment_terms) : null,
    [source, filters, company?.payment_terms]
  );

  const selectedCustomer = customers.find((customer) => customer.id === filters.customerId);
  const statementFor = filters.customerId === 'all' ? t.statement.allClients : customerLabel(selectedCustomer);
  const statementDate = new Date().toISOString().slice(0, 10);
  const statementNumber = `SOA-${statementDate.replace(/-/g, '')}`;
  const companyRegNo = company?.reg_no || company?.registration_no || '';
  const fileBaseName = `Statement of Account - ${statementFor} - ${statementDate}`
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const updateFilter = <K extends keyof StatementFilters>(key: K, value: StatementFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const createPdfBlob = async (): Promise<Blob> => {
    const element = document.querySelector<HTMLElement>('article.statement-paper');
    if (!element) throw new Error(t.statement.pdfError);

    const originalWidth = element.style.width;
    element.style.width = '794px';
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const options: Record<string, unknown> = {
        margin: [0.2, 0.2, 0.2, 0.2],
        filename: `${fileBaseName}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false, windowWidth: 1200 },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      };
      return await html2pdf().set(options).from(element).output('blob');
    } finally {
      element.style.width = originalWidth;
    }
  };

  const downloadPdf = async () => {
    setGeneratingPdf(true);
    setErrorMessage('');
    try {
      const blob = await createPdfBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileBaseName}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t.statement.pdfError);
    } finally {
      setGeneratingPdf(false);
    }
  };

  const shareViaWhatsApp = async () => {
    if (filters.customerId === 'all' || !statement) return;
    setGeneratingPdf(true);
    setErrorMessage('');
    try {
      const blob = await createPdfBlob();
      const file = new File([blob], `${fileBaseName}.pdf`, { type: 'application/pdf' });
      const shareMessage = `${t.statement.shareMessage} ${statementFor} — ${t.statement.totalAmountDue}: ${formatMoney(statement.totalAmountDue)}.`;

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: fileBaseName, text: shareMessage });
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${fileBaseName}.pdf`;
        link.click();
        URL.revokeObjectURL(url);
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareMessage)}`, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) {
        setErrorMessage(error instanceof Error ? error.message : t.statement.pdfError);
      }
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="no-print mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/" className="text-sm font-bold text-blue-700 hover:text-blue-900">
              ← {t.navigation.dashboard}
            </Link>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{t.statement.title}</h1>
            <p className="mt-1 text-sm text-slate-500">{t.statement.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-11 rounded-xl bg-slate-800 px-4 text-sm font-bold text-white hover:bg-slate-900"
            >
              {t.statement.print}
            </button>
            <button
              type="button"
              onClick={() => void downloadPdf()}
              disabled={generatingPdf || !statement?.rows.length}
              className="min-h-11 rounded-xl bg-blue-700 px-4 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {generatingPdf ? t.statement.generatingPdf : t.statement.downloadPdf}
            </button>
            <button
              type="button"
              onClick={() => void shareViaWhatsApp()}
              disabled={generatingPdf || filters.customerId === 'all' || !statement?.rows.length}
              className="min-h-11 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {t.statement.shareWhatsApp}
            </button>
          </div>
        </header>

        {errorMessage && <p className="no-print mb-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{errorMessage}</p>}

        <section className="no-print mb-6 grid gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block text-xs font-bold text-slate-500">
            {t.statement.client}
            <select
              value={filters.customerId}
              onChange={(event) => updateFilter('customerId', event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900"
            >
              <option value="all">{t.statement.allClients}</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customerLabel(customer)}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-bold text-slate-500">
            {t.statement.outlet}
            <select
              value={filters.outlet}
              onChange={(event) => updateFilter('outlet', event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900"
            >
              <option value="all">{t.statement.allOutlets}</option>
              {outlets.map((outlet) => <option key={outlet} value={outlet}>{outlet}</option>)}
            </select>
          </label>
          <label className="block text-xs font-bold text-slate-500">
            {t.statement.state}
            <select
              value={filters.state}
              onChange={(event) => updateFilter('state', event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900"
            >
              <option value="all">{t.statement.allStates}</option>
              {states.map((state) => <option key={state} value={state}>{state}</option>)}
            </select>
          </label>
          <label className="block text-xs font-bold text-slate-500">
            {t.statement.fromDate}
            <input
              type="date"
              value={filters.startDate}
              max={filters.endDate || undefined}
              onChange={(event) => updateFilter('startDate', event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900"
            />
          </label>
          <label className="block text-xs font-bold text-slate-500">
            {t.statement.toDate}
            <input
              type="date"
              value={filters.endDate}
              min={filters.startDate || undefined}
              onChange={(event) => updateFilter('endDate', event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900"
            />
          </label>
        </section>

        {filters.customerId === 'all' && (
          <p className="no-print mb-4 text-xs text-slate-500">{t.statement.selectClientToShare}</p>
        )}

        {loading ? (
          <p className="rounded-2xl bg-white p-10 text-center text-slate-500">{t.invoice.loading}</p>
        ) : !statement ? (
          <p className="rounded-2xl bg-white p-10 text-center text-slate-500">{t.statement.noRecords}</p>
        ) : (
          <div className="overflow-x-auto pb-2">
            <article className="statement-paper mx-auto w-[794px] max-w-full rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-8">
              <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-5">
                <div className="flex min-w-0 items-start gap-4">
                  {company?.logo_url && (
                    <img src={company.logo_url} alt={t.statement.companyDetails} className="h-16 w-16 shrink-0 object-contain" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-700">{company?.company_name || 'InvoiceSys'}</p>
                    <h2 className="mt-2 text-2xl font-black tracking-tight">{t.statement.title}</h2>
                    {companyRegNo && <p className="mt-1 text-xs text-slate-500">{companyRegNo}{company?.sst_no ? ` | SST: ${company.sst_no}` : ''}</p>}
                    {company?.address && <p className="mt-2 whitespace-pre-line text-xs text-slate-500">{company.address}</p>}
                    <p className="text-xs text-slate-500">
                      {[company?.phone, company?.email].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-bold uppercase text-slate-500">{t.statement.statementNumber}</p>
                  <p className="mt-1 font-bold">{statementNumber}</p>
                  <p className="mt-2 text-xs text-slate-500">{t.statement.generatedOn}: {formatDate(statementDate)}</p>
                </div>
              </header>

              <section className="grid gap-4 border-b border-slate-200 py-5 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{t.statement.statementFor}</p>
                  <p className="mt-2 font-bold">{statementFor}</p>
                  {selectedCustomer?.address && <p className="mt-1 whitespace-pre-line text-sm text-slate-500">{selectedCustomer.address}</p>}
                  {selectedCustomer?.email && <p className="text-sm text-slate-500">{selectedCustomer.email}</p>}
                  {selectedCustomer?.phone && <p className="text-sm text-slate-500">{selectedCustomer.phone}</p>}
                </div>
                <div className="sm:text-right">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{t.statement.title}</p>
                  <p className="mt-2 text-sm text-slate-600">
                    {filters.startDate || filters.endDate
                      ? `${formatDate(filters.startDate)} – ${formatDate(filters.endDate)}`
                      : t.statement.allDates}
                  </p>
                </div>
              </section>

              <section className="my-5 rounded-xl bg-blue-50 p-4 ring-1 ring-blue-100">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-blue-800">{t.statement.totalAmountDue}</p>
                    <p className="mt-1 text-3xl font-black text-blue-950">{formatMoney(statement.totalAmountDue)}</p>
                  </div>
                  <div className="text-sm text-blue-950">
                    <p>{t.statement.overdueAmount}: <strong>{formatMoney(statement.aging.overdueAmount)}</strong></p>
                    {statement.aging.maxDaysOverdue > 0 && (
                      <p className="mt-1">{t.statement.maxDaysOverdue}: <strong>{statement.aging.maxDaysOverdue}</strong></p>
                    )}
                    {statement.availableCredit > 0 && (
                      <p className="mt-1">{t.statement.availableCredit}: <strong>{formatMoney(statement.availableCredit)}</strong></p>
                    )}
                  </div>
                </div>
              </section>

              <section className="mb-5">
                <h3 className="mb-2 text-sm font-bold">{t.statement.agingSummary}</h3>
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                  {[
                    [t.statement.current, statement.aging.current],
                    [t.statement.days1To30, statement.aging.days1To30],
                    [t.statement.days31To60, statement.aging.days31To60],
                    [t.statement.days61To90, statement.aging.days61To90],
                    [t.statement.over90Days, statement.aging.over90Days],
                  ].map(([label, total]) => (
                    <div key={String(label)} className="rounded-lg border border-slate-200 p-2">
                      <p className="font-semibold text-slate-500">{label}</p>
                      <p className="mt-1 font-bold text-slate-900">{formatMoney(Number(total))}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold">{t.statement.balanceDue}</h3>
                  <span className="text-xs text-slate-500">{statement.rows.length} {t.statement.documents}</span>
                </div>
                <table className="statement-table w-full table-fixed border-collapse text-left text-[10px] sm:text-xs">
                  <thead>
                    <tr className="border-y-2 border-slate-900">
                      <th className="w-[9%] py-2 pr-1">{t.statement.documentDate}</th>
                      <th className="w-[15%] py-2 pr-1">{t.statement.documentNo}</th>
                      <th className="w-[14%] py-2 pr-1">{t.statement.client}</th>
                      <th className="w-[15%] py-2 pr-1">{t.statement.outlet}/{t.statement.state}</th>
                      <th className="w-[9%] py-2 pr-1">{t.statement.dueDate}</th>
                      <th className="w-[13%] py-2 pr-1 text-right">{t.statement.originalAmount}</th>
                      <th className="w-[12%] py-2 pr-1 text-right">{t.statement.paidAmount}</th>
                      <th className="w-[13%] py-2 text-right">{t.statement.balanceDue}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.rows.map((row) => (
                      <tr key={row.id} className={`statement-table-row border-b border-slate-200 ${row.kind === 'credit_note' ? 'text-emerald-800' : ''}`}>
                        <td className="py-2 pr-1 align-top">{formatDate(row.documentDate)}</td>
                        <td className="py-2 pr-1 align-top font-semibold">
                          {row.documentNo}
                          <span className="mt-0.5 block text-[9px] font-normal text-slate-500">
                            {row.kind === 'invoice' ? t.statement.invoice : t.statement.creditNote}
                          </span>
                        </td>
                        <td className="py-2 pr-1 align-top">{row.customerName || '—'}</td>
                        <td className="py-2 pr-1 align-top">{[row.outlet, row.state].filter(Boolean).join(' / ') || '—'}</td>
                        <td className="py-2 pr-1 align-top">{formatDate(row.dueDate)}</td>
                        <td className="py-2 pr-1 text-right align-top">{formatMoney(row.originalAmount)}</td>
                        <td className="py-2 pr-1 text-right align-top">{formatMoney(row.paidAmount)}</td>
                        <td className="py-2 text-right align-top font-semibold">{formatMoney(row.balanceDue)}</td>
                      </tr>
                    ))}
                    {statement.rows.length === 0 && (
                      <tr><td colSpan={8} className="py-8 text-center text-slate-500">{t.statement.noRecords}</td></tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-900 font-bold">
                      <td colSpan={5} className="py-3">{t.statement.total}</td>
                      <td className="py-3 pr-1 text-right">{formatMoney(statement.totalOriginalAmount)}</td>
                      <td className="py-3 pr-1 text-right">{formatMoney(statement.totalPaidAmount)}</td>
                      <td className="py-3 text-right">{formatMoney(statement.netBalanceDue)}</td>
                    </tr>
                  </tfoot>
                </table>
              </section>

              {(company?.bank_name || company?.bank_account_no || company?.bank_account_holder) && (
                <footer className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-600">
                  <p className="mb-2 font-bold text-slate-800">{t.statement.paymentDetails}</p>
                  <div className="grid gap-1 sm:grid-cols-3">
                    {company.bank_name && <p>{t.invoice.bankName}: <strong>{company.bank_name}</strong></p>}
                    {company.bank_account_no && <p>{t.invoice.bankAccount}: <strong>{company.bank_account_no}</strong></p>}
                    {company.bank_account_holder && <p>{t.invoice.bankHolder}: <strong>{company.bank_account_holder}</strong></p>}
                  </div>
                </footer>
              )}
            </article>
          </div>
        )}
      </div>
    </main>
  );
}
