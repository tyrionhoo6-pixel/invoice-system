'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { formatMoney } from '@/lib/utils';
import { InvoiceService } from '@/services/invoice.service';
import type { CompanySettings } from '@/types/company';
import { formatDate } from '@/utils/format';

function buildCreditNoteFileBaseName(creditNote: any, customer: any): string {
  const customerNameForFile = (customer?.company_name || customer?.name || creditNote?.customer_name || 'Customer')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ');

  return `${customerNameForFile} - ${creditNote.cn_number}`;
}

export default function CreditNoteDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLanguage();

  const [creditNote, setCreditNote] = useState<any | null>(null);
  const [customer, setCustomer] = useState<any | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isMounted = true;

    const loadCreditNote = async () => {
      if (!params.id) return;
      try {
        setLoading(true);
        const [cnData, companySettings, customersData] = await Promise.all([
          InvoiceService.getCreditNoteById(params.id),
          InvoiceService.getCompanySettings().catch(() => null),
          InvoiceService.getCustomers().catch(() => []),
        ]);

        if (isMounted) {
          if (!cnData) {
            setErrorMessage('Credit note not found.');
            return;
          }
          setCreditNote(cnData);
          setCompany(companySettings);

          if (cnData.customer_id && Array.isArray(customersData)) {
            const cust = customersData.find((c: any) => c.id === cnData.customer_id);
            if (cust) setCustomer(cust);
          }
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load credit note details.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadCreditNote();

    return () => {
      isMounted = false;
    };
  }, [params.id]);

  useEffect(() => {
    if (!loading && creditNote && searchParams.get('print') === '1') {
      const printTimer = window.setTimeout(() => window.print(), 250);
      return () => window.clearTimeout(printTimer);
    }
    return undefined;
  }, [creditNote, loading, searchParams]);

  const shareViaWhatsApp = async () => {
    if (!creditNote) return;

    setGeneratingPdf(true);
    const fileName = `${buildCreditNoteFileBaseName(creditNote, customer)}.pdf`;
    const element = document.querySelector<HTMLElement>('article.credit-note-paper');

    if (!element) {
      setGeneratingPdf(false);
      return;
    }

    const originalWidth = element.style.width;
    element.style.width = '794px';

    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const opt: Record<string, unknown> = {
        margin: [0.2, 0.2, 0.2, 0.2],
        filename: fileName,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          windowWidth: 1200,
        },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      };

      const pdfBlob: Blob = await html2pdf().set(opt).from(element).output('blob');
      const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

      const customerName = customer?.company_name || customer?.name || creditNote.customer_name || 'Customer';
      const shareMessage = `Hello ${customerName}, here is your credit note ${creditNote.cn_number}.`;

      if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
        await navigator.share({
          files: [pdfFile],
          title: fileName,
          text: shareMessage,
        });
      } else {
        const downloadUrl = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(downloadUrl);

        const rawPhone = customer?.phone || '';
        const cleanPhone = rawPhone.replace(/[^0-9]/g, '');
        const onlineLink = `${window.location.origin}/credit-notes/${creditNote.id}`;
        const fallbackMessage = `${shareMessage}\n\nView online: ${onlineLink}`;

        const whatsappUrl = cleanPhone
          ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(fallbackMessage)}`
          : `https://api.whatsapp.com/send?text=${encodeURIComponent(fallbackMessage)}`;

        window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Failed to share PDF:', err);
      }
    } finally {
      element.style.width = originalWidth;
      setGeneratingPdf(false);
    }
  };

  const printCreditNote = () => {
    if (!creditNote) {
      window.print();
      return;
    }
    const previousTitle = document.title;
    document.title = buildCreditNoteFileBaseName(creditNote, customer);
    window.print();
    window.setTimeout(() => {
      document.title = previousTitle;
    }, 500);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 text-center text-slate-500">
        Loading credit note details...
      </main>
    );
  }

  if (!creditNote) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 text-center">
        <p className="font-semibold text-red-700">{errorMessage || 'Credit note not found.'}</p>
        <Link href="/credit-notes" className="mt-4 inline-flex font-bold text-blue-700">
          Back to Credit Notes
        </Link>
      </main>
    );
  }

  const items = creditNote.credit_note_items || creditNote.items || [];
  const companyRegNo = company?.reg_no || (company as { registration_no?: string })?.registration_no || '';
  const customerRegNo = customer?.reg_no || customer?.registration_no || '';

  const refInvoiceNo = creditNote.invoice_no || creditNote.invoice_number || creditNote.ref_no || '-';
  const terms = creditNote.terms || customer?.terms || 'Net 30 days';
  const cnType = creditNote.cn_type || creditNote.type || 'RETURN';

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-slate-100 px-3 py-6 text-slate-900 sm:px-6 lg:px-8">
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 0;
          }

          body * {
            visibility: hidden !important;
          }

          .credit-note-paper,
          .credit-note-paper * {
            visibility: visible !important;
          }

          .credit-note-paper {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 24px !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            background: white !important;
          }

          .no-print {
            display: none !important;
          }

          section, table, tr, footer {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      {/* Header Actions */}
      <div className="no-print mx-auto mb-5 flex max-w-4xl flex-wrap items-center justify-between gap-3">
        <Link href="/credit-notes" className="text-sm font-bold text-slate-600 hover:text-blue-700">
          ← Back to Credit Notes
        </Link>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void shareViaWhatsApp()}
            disabled={generatingPdf}
            className="min-h-11 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
          >
            {generatingPdf ? 'Generating PDF...' : 'Share via WhatsApp'}
          </button>
          <button
            type="button"
            onClick={printCreditNote}
            className="min-h-11 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white shadow-sm hover:bg-slate-800"
          >
            Print
          </button>
        </div>
      </div>

      {errorMessage && (
        <p className="no-print mx-auto mb-4 max-w-4xl rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
          {errorMessage}
        </p>
      )}

      {/* Main Credit Note Document */}
      <article className="credit-note-paper mx-auto w-full max-w-4xl overflow-hidden rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-10">
        <div className="flex flex-col justify-between gap-6 border-b border-slate-200 pb-6 sm:flex-row">
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
              <h1 className="mt-2 text-3xl font-bold tracking-tight">CREDIT NOTE</h1>
              <p className="mt-1 text-xs text-slate-500">
                {companyRegNo}
                {company?.sst_no ? ` | SST: ${company.sst_no}` : ''}
              </p>
            </div>
          </div>

          <div className="text-left text-sm sm:text-right">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:flex sm:flex-col sm:items-end">
              <div><span className="font-semibold text-slate-500">No: </span><span className="font-bold text-slate-900">{creditNote.cn_number}</span></div>
              <div><span className="font-semibold text-slate-500">Date: </span><span>{formatDate(creditNote.created_at)}</span></div>
              <div><span className="font-semibold text-slate-500">Invoice No.: </span><span>{refInvoiceNo}</span></div>
              <div><span className="font-semibold text-slate-500">Terms: </span><span>{terms}</span></div>
              <div><span className="font-semibold text-slate-500">C/N Type: </span><span className="font-semibold">{cnType}</span></div>
            </div>
            <span className="mt-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 uppercase">
              {creditNote.status || 'ISSUED'}
            </span>
          </div>
        </div>

        {/* Address Details */}
        <section className="grid gap-6 border-b border-slate-200 py-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">FROM</p>
            <p className="mt-2 font-bold">{company?.company_name || 'InvoiceSys'}</p>
            <p className="whitespace-pre-line text-sm text-slate-500">{company?.address || ''}</p>
            <p className="text-sm text-slate-500">
              Tel: {company?.phone || '-'} {company?.email ? `| Email: ${company.email}` : ''}
            </p>
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">TO</p>
            <p className="mt-2 font-bold">
              {customer?.company_name || customer?.name || creditNote.customer_name || 'Customer'}
            </p>
            {customerRegNo && <p className="text-xs text-slate-500">{customerRegNo}</p>}
            {customer?.name &&
              customer?.company_name &&
              customer.name.trim().toLowerCase() !== customer.company_name.trim().toLowerCase() && (
                <p className="text-sm text-slate-500">Attn: {customer.name}</p>
              )}
            {customer?.address && (
              <p className="whitespace-pre-line text-sm text-slate-500">{customer.address}</p>
            )}
            <p className="text-sm text-slate-500">
              {customer?.phone ? `Tel: ${customer.phone}` : ''} {customer?.email ? `| Email: ${customer.email}` : ''}
            </p>
          </div>
        </section>

        {/* Goods / Items Table */}
        <section className="py-6">
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[500px] text-left text-sm">
              <thead className="border-b-2 border-slate-900">
                <tr>
                  <th className="w-12 pb-3 font-bold">NO</th>
                  <th className="pb-3 font-bold">DESCRIPTION</th>
                  <th className="pb-3 text-right font-bold">QTY</th>
                  <th className="pb-3 text-right font-bold">UNIT PRICE</th>
                  <th className="pb-3 text-right font-bold">AMOUNT (RM)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.length > 0 ? (
                  items.map((item: any, index: number) => {
                    const qty = Number(item.quantity || item.qty || 1);
                    const unitPrice = Number(item.unit_price || item.price || 0);
                    const subtotal = Number(item.subtotal || item.amount || qty * unitPrice);

                    return (
                      <tr key={item.id ?? `${item.description}-${index}`}>
                        <td className="py-3 text-slate-500">{index + 1}</td>
                        <td className="py-3 font-medium">{item.description || item.product_name || '-'}</td>
                        <td className="py-3 text-right">{qty}</td>
                        <td className="py-3 text-right">{formatMoney(unitPrice)}</td>
                        <td className="py-3 text-right font-semibold">{formatMoney(subtotal)}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-400">
                      No items recorded
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Offsetting Section */}
        {refInvoiceNo !== '-' && (
          <section className="my-4 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200/60">
            <p className="text-xs font-bold text-slate-500">
              This following are the knock-off documents:
            </p>
            <div className="mt-2 w-full overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="pb-2 font-semibold">Type</th>
                    <th className="pb-2 font-semibold">Doc. No.</th>
                    <th className="pb-2 font-semibold">Date</th>
                    <th className="pb-2 text-right font-semibold">Original Amt</th>
                    <th className="pb-2 text-right font-semibold">K/Off Amt</th>
                    <th className="pb-2 text-right font-semibold">Outstanding Amt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="py-2 font-bold text-slate-700">I</td>
                    <td className="py-2 font-medium">{refInvoiceNo}</td>
                    <td className="py-2">{formatDate(creditNote.created_at)}</td>
                    <td className="py-2 text-right">{formatMoney(creditNote.total_amount)}</td>
                    <td className="py-2 text-right font-semibold">{formatMoney(creditNote.total_amount)}</td>
                    <td className="py-2 text-right">0.00</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Remarks / Reason */}
        {creditNote.reason && (
          <section className="border-t border-slate-200 pt-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Reason / Remarks</p>
            <p className="mt-1 text-sm text-slate-700">{creditNote.reason}</p>
          </section>
        )}

        {/* Totals */}
        <section className="ml-auto max-w-sm border-t border-slate-200 pt-4">
          <div className="mt-2 flex justify-between border-t-2 border-slate-900 pt-3 text-lg">
            <span className="font-bold">TOTAL</span>
            <span className="font-bold">{formatMoney(creditNote.total_amount)}</span>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-12 border-t border-slate-200 pt-4 text-xs text-slate-500">
          <div className="flex items-center justify-between">
            <div className="italic text-slate-500">
              Note: This is a computer generated document. No signature required.
            </div>
            <p className="text-xs font-bold uppercase text-slate-600">
              {company?.company_name || 'InvoiceSys'}
            </p>
          </div>
        </footer>
      </article>

      <div className="no-print mx-auto mt-5 max-w-4xl text-center text-xs text-slate-500">
        To save as PDF, select "Save as PDF" in the printer options.
      </div>
    </main>
  );
}