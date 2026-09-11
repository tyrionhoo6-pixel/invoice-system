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

  // 1. 加载发票和公司数据（带组件卸载防护）
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
            setErrorMessage('Invoice not found.');
          }
          setInvoice(result);
          setCompany(companySettings);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load invoice.');
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
  }, [params.id]);

  // 2. 自动触发打印 Query 参数处理
  useEffect(() => {
    if (!loading && invoice && searchParams.get('print') === '1') {
      const printTimer = window.setTimeout(() => window.print(), 250);
      return () => window.clearTimeout(printTimer);
    }
    return undefined;
  }, [invoice, loading, searchParams]);

  // 3. 快捷更改发票状态
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

  // 4. WhatsApp 分享并导出 PDF
  const shareViaWhatsApp = async () => {
    if (!invoice) return;

    setGeneratingPdf(true);
    const customerName = invoice.customer?.company_name || invoice.customer?.name || 'Customer';
    const amount = formatMoney(invoice.total_amount);
    const link = `${window.location.origin}/invoices/${invoice.id}`;

    const element = document.querySelector('article.invoice-paper');
    if (element) {
      try {
        // @ts-expect-error html2pdf.js does not provide native TS declarations
        const html2pdf = (await import('html2pdf.js')).default;
        const opt = {
          margin: 0.3,
          filename: `${buildInvoiceFileBaseName(invoice)}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, logging: false },
          jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
        };
        await html2pdf().set(opt).from(element).save();
      } catch (err) {
        console.error('Failed to generate PDF:', err);
      } finally {
        setGeneratingPdf(false);
      }
    } else {
      setGeneratingPdf(false);
    }

    const isProforma = invoice.invoice_type === 'proforma';
    const docTypeName = isProforma ? 'proforma invoice' : 'invoice';

    const message = `Hello ${customerName}, here is your ${docTypeName} ${invoice.invoice_number} for total ${amount}.\n\nYou can also view it online: ${link}`;
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;

    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  // 5. 打印发票（自动修改并还原 document.title 以改变浏览器保存文件名）
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

  // 6. 复制发票草稿并跳转
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
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      {/* 顶部按钮区域 (打印时自动隐藏) */}
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
            {generatingPdf ? 'Generating PDF...' : t.actions.shareWhatsApp}
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
            Edit
          </Link>
          <button
            type="button"
            onClick={printInvoice}
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

      {/* 发票单据主体 */}
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
              <h1 className="mt-2 text-3xl font-bold tracking-tight">
                {invoice.invoice_type === 'proforma' ? 'PROFORMA INVOICE' : 'INVOICE'}
              </h1>
              <p className="mt-1 text-sm text-slate-500">Professional billing statement</p>
              <p className="mt-1 text-xs text-slate-500">
                {companyRegNo}
                {company?.sst_no ? ` | SST: ${company.sst_no}` : ''}
              </p>
            </div>
          </div>
          <div className="sm:text-right">
            <p className="text-sm font-bold text-slate-500">Invoice Number</p>
            <p className="mt-1 text-2xl font-bold">{invoice.invoice_number}</p>
            <p className="mt-2 text-sm text-slate-500">Issued: {formatDate(invoice.created_at)}</p>
            {invoiceStatus === 'paid' && (
              <span className="mt-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                PAID
              </span>
            )}
          </div>
        </header>

        <section className="grid gap-6 border-b border-slate-200 py-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">From</p>
            <p className="mt-2 font-bold">{company?.company_name || 'InvoiceSys'}</p>
            <p className="whitespace-pre-line text-sm text-slate-500">
              {company?.address || 'Billing Department'}
            </p>
            <p className="text-sm text-slate-500">
              {company?.phone || ''} {company?.email ? `| ${company.email}` : ''}
            </p>
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Bill To</p>
            <p className="mt-2 font-bold">
              {invoice.customer?.company_name || invoice.customer?.name || 'Customer'}
            </p>
            {invoice.customer?.name &&
              invoice.customer?.company_name &&
              invoice.customer.name.trim().toLowerCase() !==
                invoice.customer.company_name.trim().toLowerCase() && (
                <p className="text-sm text-slate-500">Attn: {invoice.customer.name}</p>
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

        {/* 明细表格 */}
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

        {/* 费用结算 */}
        <section className="ml-auto max-w-sm border-t border-slate-200 pt-4">
          <div className="flex justify-between py-1.5 text-sm">
            <span className="text-slate-500">Subtotal</span>
            <span className="font-semibold">{formatMoney(invoice.subtotal_amount)}</span>
          </div>
          <div className="flex justify-between py-1.5 text-sm">
            <span className="text-slate-500">Discount</span>
            <span className="font-semibold">-{formatMoney(invoice.less_amount)}</span>
          </div>
          <div className="mt-2 flex justify-between border-t-2 border-slate-900 pt-3 text-lg">
            <span className="font-bold">Total Payable</span>
            <span className="font-bold">{formatMoney(invoice.total_amount)}</span>
          </div>
        </section>

        {/* 页脚与签名区域 */}
        <footer className="mt-8 border-t border-slate-200 pt-4 text-sm text-slate-500">
          <p>Thank you for your business.</p>
          <p className="mt-1 font-medium text-slate-700">
            Payment Terms: {invoice.payment_terms || company?.payment_terms || '30 Days'}
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

          <div className="mt-10 flex items-end justify-between gap-8">
            {invoice.requires_customer_signature ? (
              <div className="flex flex-col items-start">
                <p className="text-xs font-bold uppercase text-slate-600">
                  {invoice.customer?.company_name || invoice.customer?.name || 'Customer Signature'}
                </p>
                <div className="mt-2 h-16 w-48" />
                <div className="w-48 border-b border-slate-300" />
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Customer Acceptance / Stamp
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
              <p className="mt-1 text-xs font-semibold text-slate-500">Authorized Signature</p>
            </div>
          </div>
        </footer>
      </article>

      <div className="no-print mx-auto mt-5 max-w-4xl text-center text-xs text-slate-500">
        Use your browser&apos;s print dialog to save this invoice as a PDF.
      </div>
    </main>
  );
}