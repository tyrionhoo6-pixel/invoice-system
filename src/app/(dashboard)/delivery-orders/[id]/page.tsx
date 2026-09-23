'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { InvoiceService } from '@/services/invoice.service';
import type { CompanySettings } from '@/types/company';
import { formatDate } from '@/utils/format';

type DOItem = {
  id: string;
  description: string;
  quantity: number;
  unit: string;
};

type DODetail = {
  id: string;
  do_number: string;
  customer_name: string;
  customer_address: string;
  delivery_date: string;
  status: string;
  delivery_order_items: DOItem[];
};

export default function DeliveryOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [deliveryOrder, setDeliveryOrder] = useState<DODetail | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        const [doData, companySettings] = await Promise.all([
          InvoiceService.getDeliveryOrderById(id),
          InvoiceService.getCompanySettings(),
        ]);
        setDeliveryOrder(doData as DODetail);
        setCompany(companySettings);
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : 'Unable to load delivery order.');
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, [id]);

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading delivery order...</div>;
  }

  if (errorMsg || !deliveryOrder) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600">{errorMsg || 'Delivery Order not found.'}</p>
        <button
          type="button"
          onClick={() => router.push('/delivery-orders')}
          className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white"
        >
          Back to List
        </button>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        {/* Actions Bar */}
        <div className="no-print mb-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push('/delivery-orders')}
            className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold ring-1 ring-slate-200 hover:bg-slate-100"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700"
          >
            Print DO
          </button>
        </div>

        {/* Printable Document Paper */}
        <div className="invoice-paper rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-200 sm:p-10">
          <header className="flex flex-col justify-between gap-6 border-b border-slate-200 pb-6 sm:flex-row">
            <div className="flex items-start gap-4">
              {company?.logo_url && (
                <img src={company.logo_url} alt="Company Logo" className="h-16 w-16 object-contain" />
              )}
              <div>
                <p className="text-sm font-black uppercase tracking-wider text-indigo-700">
                  {company?.company_name || 'Your Company Name'}
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight">DELIVERY ORDER</h1>
              </div>
            </div>
            <div className="sm:text-right">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">DO Number</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{deliveryOrder.do_number}</p>
              <p className="mt-2 text-sm text-slate-500">Date: {formatDate(deliveryOrder.delivery_date)}</p>
            </div>
          </header>

          <section className="border-b border-slate-200 py-6">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Deliver To</p>
            <p className="mt-2 text-lg font-bold">{deliveryOrder.customer_name}</p>
            {deliveryOrder.customer_address && (
              <p className="mt-1 text-sm text-slate-600 whitespace-pre-line">{deliveryOrder.customer_address}</p>
            )}
          </section>

          <div className="overflow-x-auto py-6">
            <table className="w-full text-left text-sm">
              <thead className="border-b-2 border-slate-900">
                <tr>
                  <th className="pb-3 font-bold">No.</th>
                  <th className="pb-3 font-bold">Item Description</th>
                  <th className="pb-3 text-right font-bold">Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deliveryOrder.delivery_order_items.map((item, idx) => (
                  <tr key={item.id || idx}>
                    <td className="w-12 py-3.5 text-slate-500">{idx + 1}</td>
                    <td className="py-3.5 font-medium">{item.description}</td>
                    <td className="py-3.5 text-right font-semibold">
                      {item.quantity} {item.unit || 'pcs'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Signature Columns */}
          <section className="mt-20 grid grid-cols-2 gap-8 border-t border-slate-200 pt-8">
            <div className="text-center">
              <div className="mx-auto h-16 w-48 border-b border-slate-400"></div>
              <p className="mt-2 text-xs font-bold uppercase tracking-wider text-slate-600">Issued By</p>
            </div>
            <div className="text-center">
              <div className="mx-auto h-16 w-48 border-b border-slate-400"></div>
              <p className="mt-2 text-xs font-bold uppercase tracking-wider text-slate-600">Received By (Customer Signature)</p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}