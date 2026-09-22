'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { formatMoney } from '@/lib/utils';
import { QuotationService } from '@/services/quotation.service';
import type { CompanySettings } from '@/types/company';
import type { QuotationWithItems } from '@/types/quotation';
import { formatDate } from '@/utils/format';

function buildQuotationFileBaseName(quotation: QuotationWithItems): string {
  const customerNameForFile = (quotation.customer?.company_name || quotation.customer?.name || 'Customer')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ');

  return `${customerNameForFile} - ${quotation.quotation_number}`;
}

// Helper: Dismiss mobile soft keyboard
function dismissKeyboard() {
  if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

export default function QuotationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLanguage();

  const [quotation, setQuotation] = useState<QuotationWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingStatus, setSavingStatus] = useState(false);
  const [converting, setConverting] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [company, setCompany] = useState<CompanySettings | null>(null);

  // 1. Fetch initial quotation and company settings with unmount protection
  useEffect(() => {
    let isMounted = true;

    const loadQuotation = async () => {
      if (!params.id) return;
      try {
        const [result, companySettings] = await Promise.all([
          QuotationService.getQuotationById(params.id),
          QuotationService.getCompanySettings(),
        ]);

        if (isMounted) {
          if (!result) {
            setErrorMessage('Quotation not found.');
          }
          setQuotation(result);
          setCompany(companySettings);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load quotation.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadQuotation();

    return () => {
      isMounted = false;
    };
  }, [params.id]);

  // 2. Handle automatic print trigger from query parameters
  useEffect(() => {
    if (!loading && quotation && searchParams.get('print') === '1') {
      const printTimer = window.setTimeout(() => window.print(), 250);
      return () => window.clearTimeout(printTimer);
    }
    return undefined;
  }, [quotation, loading, searchParams]);

  // 3. Update quotation status
  const changeStatus = async (status: 'accepted' | 'rejected' | 'pending') => {
    dismissKeyboard();
    if (!quotation) return;
    setSavingStatus(true);
    setErrorMessage('');
    try {
      const updated = await QuotationService.updateQuotationStatus(quotation.id, status);
      setQuotation((prev) => (prev ? { ...prev, ...updated } : null));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update status.');
    } finally {
      setSavingStatus(false);
    }
  };

  // 4. Convert quotation to invoice
  const handleConvertToInvoice = async () => {
    dismissKeyboard();
    if (!quotation) return;
    setConverting(true);
    setErrorMessage('');
    try {
      const newInvoice = await QuotationService.convertToInvoice(quotation.id);
      router.push(`/invoices/${newInvoice.id}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to convert to Invoice.');
      setConverting(false);
    }
  };

  // 5. Convert quotation to proforma invoice
  const handleConvertToProforma = async () => {
    dismissKeyboard();
    if (!quotation) return;
    setConverting(true);
    setErrorMessage('');
    try {
      const newProforma = await QuotationService.convertToProforma(quotation.id);
      router.push(`/invoices/${newProforma.id}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to convert to Proforma Invoice.');
      setConverting(false);
    }
  };

// 6. Share quotation via WhatsApp with optimized PDF generation
  const shareViaWhatsApp = async () => {
    dismissKeyboard();
    if (!quotation) return;

    setGeneratingPdf(true);
    const customerName = quotation.customer?.company_name || quotation.customer?.name || 'Customer';
    const amount = formatMoney(quotation.total_amount);
    const link = `${window.location.origin}/quotations/${quotation.id}`;

    const element = document.querySelector<HTMLElement>('article.invoice-paper');
    if (element) {
      // Temporarily lock width to standard desktop viewport (794px A4) to prevent mobile layout distortion
      const originalWidth = element.style.width;
      element.style.width = '794px';

      try {
        const html2pdf = (await import('html2pdf.js')).default;
        const opt: Record<string, unknown> = {
          margin: [0.2, 0.2, 0.2, 0.2], // Compact margins to prevent multi-page overflow
          filename: `${buildQuotationFileBaseName(quotation)}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            logging: false,
            windowWidth: 1200, // Simulate desktop browser viewport
          },
          jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
          pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }, // Avoid slicing table rows or elements
        };
        await html2pdf().set(opt).from(element).save();
      } catch (err) {
        console.error('Failed to generate PDF:', err);
      } finally {
        element.style.width = originalWidth; // Restore mobile responsiveness
        setGeneratingPdf(false);
      }
    } else {
      setGeneratingPdf(false);
    }

    const message = `Hello ${customerName}, here is your quotation ${quotation.quotation_number} for total ${amount}.\n\nYou can also view it online: ${link}`;
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;

    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  // 7. Dynamically set document title for printing and open browser print window
  const printQuotation = () => {
    dismissKeyboard();
    if (!quotation) {
      window.print();
      return;
    }
    const previousTitle = document.title;
    document.title = buildQuotationFileBaseName(quotation);
    window.print();
    window.setTimeout(() => {
      document.title = previousTitle;
    }, 500);
  };

  // 8. Duplicate current quotation as a draft
  const duplicateQuotation = () => {
    dismissKeyboard();
    if (!quotation) return;

    sessionStorage.setItem(
      'quotation-duplicate-draft',
      JSON.stringify({
        customerId: quotation.customer_id,
        lessAmount: Number(quotation.less_amount) || 0,
        items: (quotation.quotation_items ?? []).map((item) => ({
          product_id: item.product_id ?? null,
          description: item.product_name,
          qty: Number(item.quantity) || 1,
          unit_price: Number(item.unit_price) || 0,
          subtotal: Number(item.subtotal) || 0,
        })),
      })
    );
    router.push('/quotations/new?duplicate=1');
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 text-center text-slate-500">
        Loading...
      </main>
    );
  }

  if (!quotation) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 text-center">
        <p className="font-semibold text-red-700">{errorMessage || 'Quotation not found.'}</p>
        <Link href="/quotations" className="mt-4 inline-flex font-bold text-blue-700">
          Back to Quotations
        </Link>
      </main>
    );
  }

  const quotationStatus = (quotation.status ?? 'pending').toLowerCase();
  const companyRegNo = company?.reg_no || (company as { registration_no?: string })?.registration_no || '';

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 pb-28 sm:pb-8 text-slate-900 sm:px-6 lg:px-8">
      {/* Top action button toolbar (Desktop) */}
      <div className="no-print mx-auto mb-5 flex max-w-4xl flex-wrap items-center justify-between gap-3">
        <Link href="/quotations" className="text-sm font-bold text-slate-600 hover:text-blue-700">
          ← Back to Quotations
        </Link>
        <div className="hidden sm:flex sm:flex-wrap sm:gap-2">
          <button
            type="button"
            disabled={converting}
            onClick={handleConvertToInvoice}
            className="min-h-11 rounded-xl bg-blue-700 px-4 text-sm font-bold text-white shadow-sm hover:bg-blue-800 disabled:opacity-50"
          >
            {converting ? 'Converting...' : 'Convert to Invoice'}
          </button>
          <button
            type="button"
            disabled={converting}
            onClick={handleConvertToProforma}
            className="min-h-11 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {converting ? 'Converting...' : 'Convert to Proforma'}
          </button>
          <button
            type="button"
            onClick={() => void shareViaWhatsApp()}
            disabled={generatingPdf}
            className="min-h-11 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            {generatingPdf ? 'Generating PDF...' : 'Share WhatsApp'}
          </button>
          <button
            type="button"
            onClick={duplicateQuotation}
            className="min-h-11 rounded-xl bg-white px-4 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
          >
            Duplicate
          </button>
          <Link
            href={`/quotations/new?id=${quotation.id}`}
            className="inline-flex min-h-11 items-center rounded-xl bg-slate-800 px-4 text-sm font-bold text-white shadow-sm hover:bg-slate-900"
          >
            Edit
          </Link>
          <button
            type="button"
            onClick={printQuotation}
            className="min-h-11 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white shadow-sm hover:bg-slate-800"
          >
            Print / PDF
          </button>
        </div>
      </div>

      {errorMessage && (
        <p className="no-print mx-auto mb-4 max-w-4xl rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
          {errorMessage}
        </p>
      )}

      {/* Quotation printable document card */}
      <article className="invoice-paper mx-auto max-w-4xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-10">
        <header className="flex flex-col justify-between gap-6 border-b border-slate-200 pb-6 sm:flex-row">
          <div className="flex items-start gap-4">
            {company?.logo_url && (
              <img
                src={company.logo_url}
                alt="Company logo"
                crossOrigin="anonymous"
                className="h-16 w-16 object-contain"
              />
            )}
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-blue-700">
                {company?.company_name || 'InvoiceSys'}
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight">QUOTATION</h1>
              <p className="mt-1 text-sm text-slate-500">Professional quotation statement</p>
              {companyRegNo && <p className="mt-1 text-xs text-slate-500">Reg No: {companyRegNo}</p>}
            </div>
          </div>
          <div className="sm:text-right">
            <p className="text-sm font-bold text-slate-500">Quotation Number</p>
            <p className="mt-1 text-2xl font-bold">{quotation.quotation_number}</p>
            <p className="mt-2 text-sm text-slate-500">Issued: {formatDate(quotation.created_at)}</p>
          </div>
        </header>

        <section className="grid gap-6 border-b border-slate-200 py-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">From</p>
            <p className="mt-2 font-bold">{company?.company_name || 'InvoiceSys'}</p>
            <p className="whitespace-pre-line text-sm text-slate-500">{company?.address || ''}</p>
            <p className="text-sm text-slate-500">
              {company?.phone || ''} {company?.email ? `| ${company.email}` : ''}
            </p>
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Quotation For</p>
            <p className="mt-2 font-bold">
              {quotation.customer?.company_name || quotation.customer?.name || 'Customer'}
            </p>
            {quotation.customer?.name &&
              quotation.customer?.company_name &&
              quotation.customer.name.trim().toLowerCase() !==
                quotation.customer.company_name.trim().toLowerCase() && (
                <p className="text-sm text-slate-500">Attn: {quotation.customer.name}</p>
              )}
            {quotation.customer?.address && (
              <p className="whitespace-pre-line text-sm text-slate-500">
                {quotation.customer.address}
              </p>
            )}
            {quotation.customer?.phone && (
              <p className="text-sm text-slate-500">{quotation.customer.phone}</p>
            )}
          </div>
        </section>

        {/* Line items section */}
        <section className="py-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="border-b-2 border-slate-900">
                <tr>
                  <th className="pb-3 font-bold">Item Description</th>
                  <th className="pb-3 text-right font-bold">Qty</th>
                  <th className="pb-3 text-right font-bold">Unit Price</th>
                  <th className="pb-3 text-right font-bold">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(quotation.quotation_items ?? []).map((item, index) => (
                  <tr key={item.id ?? `${item.product_name}-${index}`} className="break-inside-avoid">
                    <td className="py-3 font-medium">{item.product_name}</td>
                    <td className="py-3 text-right">{item.quantity}</td>
                    <td className="py-3 text-right">{formatMoney(item.unit_price)}</td>
                    <td className="py-3 text-right font-semibold">{formatMoney(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Summary calculations section */}
        <section className="ml-auto max-w-sm border-t border-slate-200 pt-4 break-inside-avoid">
          <div className="flex justify-between py-1.5 text-sm">
            <span className="text-slate-500">Subtotal</span>
            <span className="font-semibold">{formatMoney(quotation.subtotal_amount)}</span>
          </div>
          <div className="flex justify-between py-1.5 text-sm">
            <span className="text-slate-500">Discount</span>
            <span className="font-semibold">-{formatMoney(quotation.less_amount)}</span>
          </div>
          <div className="mt-2 flex justify-between border-t-2 border-slate-900 pt-3 text-lg">
            <span className="font-bold">Total Amount</span>
            <span className="font-bold">{formatMoney(quotation.total_amount)}</span>
          </div>
        </section>

        {/* Footer and authorization signature section */}
        <footer className="mt-8 border-t border-slate-200 pt-4 text-sm text-slate-500 break-inside-avoid">
          <p>Thank you for your business.</p>
          <p className="mt-1 font-medium text-slate-700">
            Payment Terms: {quotation.payment_terms || company?.payment_terms || '30 Days'}
          </p>

          {(company?.bank_name || company?.bank_account_no || company?.bank_account_holder) && (
            <div className="mt-3 space-y-0.5 text-sm text-slate-700">
              {company.bank_name && (
                <p>
                  <span className="font-semibold">Bank Name:</span> {company.bank_name}
                </p>
              )}
              {company.bank_account_no && (
                <p>
                  <span className="font-semibold">Bank Account:</span> {company.bank_account_no}
                </p>
              )}
              {company.bank_account_holder && (
                <p>
                  <span className="font-semibold">Bank Holder:</span> {company.bank_account_holder}
                </p>
              )}
            </div>
          )}

          <div className="mt-10 grid grid-cols-2 gap-8 pt-4">
            <div className="flex flex-col items-start justify-end">
              <div className="h-16 w-48" />
              <div className="w-48 border-b border-slate-300" />
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Customer Acceptance / Signature
              </p>
            </div>

            <div className="flex flex-col items-end justify-end text-right">
              <p className="text-xs font-bold uppercase text-slate-600">
                {company?.company_name || 'InvoiceSys'}
              </p>

              <div className="mt-2 flex h-16 w-48 items-center justify-center">
                {company?.signature_url ? (
                  <img
                    src={company.signature_url}
                    alt="Authorized Signature"
                    crossOrigin="anonymous"
                    className="max-h-16 max-w-full object-contain"
                  />
                ) : (
                  <div className="h-12" />
                )}
              </div>

              <div className="ml-auto w-48 border-b border-slate-300" />
              <p className="mt-1 text-xs font-semibold text-slate-500">Authorized Signature</p>
            </div>
          </div>
        </footer>

        {/* Status indicator and quick status update controls */}
        <div className="no-print mt-8 flex items-center justify-between border-t border-slate-200 pt-6">
          <div>
            <span className="text-sm font-semibold text-slate-500">Status: </span>
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                quotationStatus === 'accepted'
                  ? 'bg-emerald-50 text-emerald-700'
                  : quotationStatus === 'rejected'
                  ? 'bg-red-50 text-red-700'
                  : quotationStatus === 'converted'
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-amber-50 text-amber-700'
              }`}
            >
              {quotationStatus.toUpperCase()}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={savingStatus || quotationStatus === 'accepted'}
              onClick={() => void changeStatus('accepted')}
              className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              Mark Accepted
            </button>
            <button
              type="button"
              disabled={savingStatus || quotationStatus === 'rejected'}
              onClick={() => void changeStatus('rejected')}
              className="rounded-xl bg-red-700 px-3 py-2 text-xs font-bold text-white hover:bg-red-800 disabled:opacity-50"
            >
              Mark Rejected
            </button>
          </div>
        </div>
      </article>

      <div className="no-print mx-auto mt-5 max-w-4xl text-center text-xs text-slate-500">
        Use your browser&apos;s print dialog to save this quotation as a PDF.
      </div>

      {/* Mobile Sticky Bottom Action Bar (Easy access on phones without keyboard obstruction) */}
      <div className="no-print fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around gap-2 border-t border-slate-200 bg-white/95 p-3 backdrop-blur sm:hidden">
        <button
          type="button"
          onClick={() => void shareViaWhatsApp()}
          disabled={generatingPdf}
          className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-xs font-bold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
        >
          {generatingPdf ? 'PDF...' : 'WhatsApp'}
        </button>
        <button
          type="button"
          disabled={converting}
          onClick={handleConvertToInvoice}
          className="flex-1 rounded-lg bg-blue-700 py-2.5 text-xs font-bold text-white shadow hover:bg-blue-800 disabled:opacity-50"
        >
          {converting ? '...' : 'Invoice'}
        </button>
        <Link
          href={`/quotations/new?id=${quotation.id}`}
          className="flex-1 text-center rounded-lg bg-slate-800 py-2.5 text-xs font-bold text-white shadow hover:bg-slate-900"
        >
          Edit
        </Link>
        <button
          type="button"
          onClick={printQuotation}
          className="flex-1 rounded-lg bg-slate-900 py-2.5 text-xs font-bold text-white shadow hover:bg-slate-800"
        >
          Print
        </button>
      </div>
    </main>
  );
}