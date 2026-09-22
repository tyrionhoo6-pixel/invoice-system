'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { formatMoney } from '@/lib/utils';
import { InvoiceService } from '@/services/invoice.service';
import type { CompanySettings } from '@/types/company';
import type { InvoiceWithItems } from '@/types/invoice';
import { formatDate } from '@/utils/format';

function buildInvoiceFileBaseName(invoice: InvoiceWithItems): string {
  const customerNameForFile = (invoice.customer?.company_name || invoice.customer?.name || 'Customer')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ');

  return `${customerNameForFile} - ${invoice.invoice_number}`;
}

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLanguage();

  const [invoice, setInvoice] = useState<InvoiceWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingStatus, setSavingStatus] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [company, setCompany] = useState<CompanySettings | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadInvoice = async () => {
      if (!params.id) return;
      try {
        const [result, companySettings] = await Promise.all([
          InvoiceService.getInvoiceById(params.id),
          InvoiceService.getCompanySettings(),
        ]);

        if (isMounted) {
          if (!result) {
            setErrorMessage(t.invoice.notFound);
          }
          setInvoice(result);
          setCompany(companySettings);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : t.invoice.notFound);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadInvoice();

    return () => {
      isMounted = false;
    };
  }, [params.id, t.invoice.notFound]);

  useEffect(() => {
    if (!loading && invoice && searchParams.get('print') === '1') {
      const printTimer = window.setTimeout(() => window.print(), 250);
      return () => window.clearTimeout(printTimer);
    }
    return undefined;
  }, [invoice, loading, searchParams]);

  const changeStatus = async (status: 'paid' | 'unpaid') => {
    if (!invoice) return;
    setSavingStatus(true);
    setErrorMessage('');
    try {
      const updatedStatus = await InvoiceService.updateInvoiceStatus(invoice.id, status);
      setInvoice((prev) => (prev ? { ...prev, ...updatedStatus } : null));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update invoice status.');
    } finally {
      setSavingStatus(false);
    }
  };

  // 改进后的原生 PDF 文件分享函数
  const shareViaWhatsApp = async () => {
    if (!invoice) return;

    setGeneratingPdf(true);
    const fileName = `${buildInvoiceFileBaseName(invoice)}.pdf`;
    const element = document.querySelector<HTMLElement>('article.invoice-paper');

    if (!element) {
      setGeneratingPdf(false);
      return;
    }

    const originalWidth = element.style.width;
    element.style.width = '794px';

    try {
      // 1. 使用 html2pdf 生成 PDF 内存 Blob
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

      // 2. 将 Blob 转为真实的 File 对象
      const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

      const customerName = invoice.customer?.company_name || invoice.customer?.name || 'Customer';
      const isProforma = invoice.invoice_type === 'proforma';
      const docTypeName = isProforma ? 'proforma invoice' : 'invoice';
      const shareMessage = `Hello ${customerName}, here is your ${docTypeName} ${invoice.invoice_number}.`;

      // 3. 检查设备是否支持原生文件分享（Android & iOS 手机原生支持）
      if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
        await navigator.share({
          files: [pdfFile],
          title: fileName,
          text: shareMessage,
        });
      } else {
        // 桌面端降级方案：自动下载 PDF，并尝试打开网页版 WhatsApp
        const downloadUrl = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(downloadUrl);

        const onlineLink = `${window.location.origin}/invoices/${invoice.id}`;
        const fallbackMessage = `${shareMessage}\n\nView online: ${onlineLink}`;
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(fallbackMessage)}`, '_blank', 'noopener,noreferrer');
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

  const printInvoice = () => {
    if (!invoice) {
      window.print();
      return;
    }
    const previousTitle = document.title;
    document.title = buildInvoiceFileBaseName(invoice);
    window.print();
    window.setTimeout(() => {
      document.title = previousTitle;
    }, 500);
  };

  const duplicateInvoice = () => {
    if (!invoice) return;
    sessionStorage.setItem(
      'invoice-duplicate-draft',
      JSON.stringify({
        customerId: invoice.customer_id,
        lessAmount: Number(invoice.less_amount) || 0,
        items: (invoice.invoice_items ?? []).map((item) => ({
          product_id: item.product_id ?? null,
          description: item.product_name,
          qty: Number(item.quantity) || 1,
          unit_price: Number(item.unit_price) || 0,
          subtotal: Number(item.subtotal) || 0,
        })),
      })
    );
    router.push('/invoices/new?duplicate=1');
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 text-center text-slate-500">
        {t.invoice.loading}
      </main>
    );
  }

  if (!invoice) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 text-center">
        <p className="font-semibold text-red-700">{errorMessage || t.invoice.notFound}</p>
        <Link href="/invoices" className="mt-4 inline-flex font-bold text-blue-700">
          {t.invoice.backToInvoices}
        </Link>
      </main>
    );
  }

  const invoiceStatus = (invoice.status ?? 'unpaid').toLowerCase();
  const companyRegNo = company?.reg_no || (company as { registration_no?: string })?.registration_no || '';

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-slate-100 px-3 py-6 text-slate-900 sm:px-6 lg:px-8">
      {/* 全局打印/PDF 样式修复 */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 0;
          }

          html, body {
            width: 210mm !important;
            height: auto !important;
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .no-print, nav, header, button {
            display: none !important;
          }

          /* 强制将卡片设为标准的 A4 794px 宽，防止移动端缩窄变形 */
          .invoice-paper {
            width: 794px !important;
            max-width: 794px !important;
            min-width: 794px !important;
            margin: 0 auto !important;
            padding: 32px !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            background: white !important;
          }

          /* 强制解决移动端 flex-col 换行导致的断页问题 */
          .invoice-paper header {
            display: flex !important;
            flex-direction: row !important;
            justify-content: space-between !important;
          }

          .invoice-paper section.grid {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .invoice-paper table {
            width: 100% !important;
            min-width: 0 !important;
            table-layout: fixed !important;
          }

          .invoice-paper footer > div {
            display: flex !important;
            flex-direction: row !important;
            justify-content: space-between !important;
          }

          /* 防止关键节点在中间跨页断开 */
          section, table, tr, footer {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      {/* Header Actions */}
      <div className="no-print mx-auto mb-5 flex max-w-4xl flex-wrap items-center justify-between gap-3">
        <Link href="/invoices" className="text-sm font-bold text-slate-600 hover:text-blue-700">
          ← {t.invoice.backToInvoices}
        </Link>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void shareViaWhatsApp()}
            disabled={generatingPdf}
            className="min-h-11 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
          >
            {generatingPdf ? t.invoice.generatingPdf : t.actions.shareWhatsApp}
          </button>
          <button
            type="button"
            onClick={duplicateInvoice}
            className="min-h-11 rounded-xl bg-white px-4 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
          >
            {t.actions.duplicate}
          </button>
          <button
            type="button"
            onClick={() => void changeStatus(invoiceStatus === 'paid' ? 'unpaid' : 'paid')}
            disabled={savingStatus}
            className="min-h-11 rounded-xl bg-white px-4 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-60"
          >
            {savingStatus
              ? t.actions.saving
              : invoiceStatus === 'paid'
              ? t.actions.markUnpaid
              : t.actions.markPaid}
          </button>
          <Link
            href={`/invoices/new?id=${invoice.id}`}
            className="inline-flex min-h-11 items-center rounded-xl bg-blue-700 px-4 text-sm font-bold text-white shadow-sm hover:bg-blue-800"
          >
            {t.invoice.edit}
          </Link>
          <button
            type="button"
            onClick={printInvoice}
            className="min-h-11 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white shadow-sm hover:bg-slate-800"
          >
            {t.actions.print}
          </button>
        </div>
      </div>

      {errorMessage && (
        <p className="no-print mx-auto mb-4 max-w-4xl rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
          {errorMessage}
        </p>
      )}

      {/* Main Invoice Document */}
      <article className="invoice-paper mx-auto w-full max-w-4xl overflow-hidden rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-10">
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
              <h1 className="mt-2 text-3xl font-bold tracking-tight">
                {invoice.invoice_type === 'proforma' ? t.invoice.proformaInvoice : t.invoice.invoice}
              </h1>
              <p className="mt-1 text-sm text-slate-500">{t.invoice.professionalBilling}</p>
              <p className="mt-1 text-xs text-slate-500">
                {companyRegNo}
                {company?.sst_no ? ` | SST: ${company.sst_no}` : ''}
              </p>
            </div>
          </div>
          <div className="sm:text-right">
            <p className="text-sm font-bold text-slate-500">
              {invoice.invoice_type === 'proforma' ? t.invoice.proformaNumber : t.invoice.invoiceNumber}
            </p>
            <p className="mt-1 text-2xl font-bold">{invoice.invoice_number}</p>
            <p className="mt-2 text-sm text-slate-500">{t.invoice.issued}: {formatDate(invoice.created_at)}</p>
            {invoiceStatus === 'paid' && (
              <span className="mt-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                {t.status.paidUpper}
              </span>
            )}
          </div>
        </header>

        <section className="grid gap-6 border-b border-slate-200 py-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{t.invoice.from}</p>
            <p className="mt-2 font-bold">{company?.company_name || 'InvoiceSys'}</p>
            <p className="whitespace-pre-line text-sm text-slate-500">
              {company?.address || t.invoice.billingDepartment}
            </p>
            <p className="text-sm text-slate-500">
              {company?.phone || ''} {company?.email ? `| ${company.email}` : ''}
            </p>
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{t.invoice.billTo}</p>
            <p className="mt-2 font-bold">
              {invoice.customer?.company_name || invoice.customer?.name || t.invoice.customer}
            </p>
            {invoice.customer?.name &&
              invoice.customer?.company_name &&
              invoice.customer.name.trim().toLowerCase() !==
                invoice.customer.company_name.trim().toLowerCase() && (
                <p className="text-sm text-slate-500">{t.invoice.attn}: {invoice.customer.name}</p>
              )}
            {invoice.customer?.address && (
              <p className="whitespace-pre-line text-sm text-slate-500">
                {invoice.customer.address}
              </p>
            )}
            {invoice.customer?.phone && (
              <p className="text-sm text-slate-500">{invoice.customer.phone}</p>
            )}
          </div>
        </section>

        {/* Item Table */}
        <section className="py-6">
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[500px] text-left text-sm">
              <thead className="border-b-2 border-slate-900">
                <tr>
                  <th className="pb-3 font-bold">{t.invoice.description}</th>
                  <th className="pb-3 text-right font-bold">{t.invoice.qty}</th>
                  <th className="pb-3 text-right font-bold">{t.invoice.unitPrice}</th>
                  <th className="pb-3 text-right font-bold">{t.invoice.subtotal}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(invoice.invoice_items ?? []).map((item, index) => (
                  <tr key={item.id ?? `${item.product_name}-${index}`}>
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

        {/* Totals */}
        <section className="ml-auto max-w-sm border-t border-slate-200 pt-4">
          <div className="flex justify-between py-1.5 text-sm">
            <span className="text-slate-500">{t.invoice.subtotal}</span>
            <span className="font-semibold">{formatMoney(invoice.subtotal_amount)}</span>
          </div>
          <div className="flex justify-between py-1.5 text-sm">
            <span className="text-slate-500">{t.invoice.discount}</span>
            <span className="font-semibold">-{formatMoney(invoice.less_amount)}</span>
          </div>
          <div className="mt-2 flex justify-between border-t-2 border-slate-900 pt-3 text-lg">
            <span className="font-bold">{t.invoice.totalPayable}</span>
            <span className="font-bold">{formatMoney(invoice.total_amount)}</span>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-8 border-t border-slate-200 pt-4 text-sm text-slate-500">
          <p>{t.invoice.thankYou}</p>
          <p className="mt-1 font-medium text-slate-700">
            {t.invoice.paymentTerms}: {invoice.payment_terms || company?.payment_terms || '30 Days'}
          </p>

          {(company?.bank_name || company?.bank_account_no || company?.bank_account_holder) && (
            <div className="mt-3 space-y-0.5 text-sm text-slate-700">
              {company.bank_name && (
                <p>
                  <span className="font-semibold">{t.invoice.bankName}:</span> {company.bank_name}
                </p>
              )}
              {company.bank_account_no && (
                <p>
                  <span className="font-semibold">{t.invoice.bankAccount}:</span> {company.bank_account_no}
                </p>
              )}
              {company.bank_account_holder && (
                <p>
                  <span className="font-semibold">{t.invoice.bankHolder}:</span> {company.bank_account_holder}
                </p>
              )}
            </div>
          )}

          <div className="mt-10 flex items-end justify-between gap-8">
            {invoice.requires_customer_signature ? (
              <div className="flex flex-col items-start">
                <p className="text-xs font-bold uppercase text-slate-600">
                  {invoice.customer?.company_name || invoice.customer?.name || t.invoice.customerSignature}
                </p>
                <div className="mt-2 h-16 w-48" />
                <div className="w-48 border-b border-slate-300" />
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {t.invoice.customerStamp}
                </p>
              </div>
            ) : (
              <div />
            )}

            <div className="flex flex-col items-end text-right">
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
              <p className="mt-1 text-xs font-semibold text-slate-500">{t.invoice.authorizedSignature}</p>
            </div>
          </div>
        </footer>
      </article>

      <div className="no-print mx-auto mt-5 max-w-4xl text-center text-xs text-slate-500">
        {t.invoice.printTip}
      </div>
    </main>
  );
}