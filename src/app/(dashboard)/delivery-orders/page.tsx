'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { InvoiceService } from '@/services/invoice.service';
import { formatDate } from '@/utils/format';
import { downloadCsv } from '@/utils/csv';
import { useLanguage } from '@/context/LanguageContext';

type DeliveryOrder = {
  id: string;
  do_number: string;
  customer_name: string;
  delivery_date: string;
  status: string;
  created_at: string;
};

export default function DeliveryOrdersPage() {
  const { t } = useLanguage();
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const statusOptions = [
    { value: 'Pending', label: t.deliveryOrder?.statusPending ?? 'Pending' },
    { value: 'Delivered', label: t.deliveryOrder?.statusDelivered ?? 'Delivered' },
    { value: 'Cancelled', label: t.deliveryOrder?.statusCancelled ?? 'Cancelled' },
  ];

  useEffect(() => {
    const fetchDOs = async () => {
      try {
        const data = await InvoiceService.getDeliveryOrders();
        setOrders((data as DeliveryOrder[]) || []);
      } catch (err: unknown) {
        setErrorMessage(
          err instanceof Error ? err.message : 'Failed to load delivery orders.'
        );
      } finally {
        setLoading(false);
      }
    };

    void fetchDOs();
  }, []);

  const exportDeliveryOrders = (rows: DeliveryOrder[], fileName: string) => {
    const rowsForExport = rows.map((doItem) => {
      const formattedDate = doItem.delivery_date ? formatDate(doItem.delivery_date) : '';
      return [
        doItem.do_number,
        doItem.customer_name || (t.customer?.unnamed ?? 'Unnamed customer'),
        formattedDate,
        doItem.status || 'Pending',
      ];
    });

    const headers = [
      t.deliveryOrder?.doNumber ?? 'DO Number',
      t.invoice?.customer ?? 'Customer',
      t.deliveryOrder?.deliveryDate ?? 'Delivery Date',
      t.invoice?.statusHeader ?? 'Status',
    ];
    const summaryRow = [`${t.quotation?.total ?? 'Total'}: ${rows.length}`, '', '', ''];

    downloadCsv([headers, ...rowsForExport, [], summaryRow], fileName);
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      setUpdatingId(id);
      await InvoiceService.updateDeliveryOrderStatus(id, newStatus);
      setOrders((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
      );
    } catch (err: unknown) {
      alert(
        'Failed to update status: ' + (err instanceof Error ? err.message : String(err))
      );
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {t.navigation?.deliveryOrders ?? 'Delivery Orders'}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {t.deliveryOrder?.description ?? 'Manage and view generated delivery orders.'}
            </p>
          </div>

          <div>
            <button
              type="button"
              onClick={() => {
                const today = new Date().toISOString().slice(0, 10);
                exportDeliveryOrders(orders, `delivery_orders_${today}.csv`);
              }}
              disabled={orders.length === 0}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t.invoice?.exportCsv ?? 'Export CSV'}
            </button>
          </div>
        </div>

        {errorMessage && (
          <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{errorMessage}</p>
        )}

        {loading ? (
          <div className="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm ring-1 ring-slate-200">
            {t.invoice?.loadingInvoices ?? 'Loading...'}
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm ring-1 ring-slate-200">
            {t.invoice?.noMatch ?? 'No delivery orders found.'}
          </div>
        ) : (
          <>
            {/* Mobile View */}
            <div className="space-y-3 sm:hidden">
              {orders.map((doItem) => (
                <div key={doItem.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                  <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                    <div>
                      <p className="font-bold text-blue-700">{doItem.do_number}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{formatDate(doItem.delivery_date)}</p>
                    </div>
                    <select
                      value={doItem.status || 'Pending'}
                      disabled={updatingId === doItem.id}
                      onChange={(e) => handleStatusChange(doItem.id, e.target.value)}
                      className={`cursor-pointer rounded-full border-0 px-2.5 py-1 text-xs font-bold outline-none ring-1 disabled:opacity-50 ${
                        doItem.status === 'Delivered'
                          ? 'bg-green-50 text-green-700 ring-green-600/30'
                          : doItem.status === 'Cancelled'
                          ? 'bg-red-50 text-red-700 ring-red-600/30'
                          : 'bg-yellow-50 text-yellow-800 ring-yellow-600/30'
                      }`}
                    >
                      {statusOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="my-3">
                    <p className="text-xs font-semibold text-slate-400">
                      {t.invoice?.customer ?? 'Customer'}
                    </p>
                    <p className="text-sm font-medium text-slate-800">
                      {doItem.customer_name || (t.customer?.unnamed ?? 'Unnamed customer')}
                    </p>
                  </div>

                  <div className="flex items-center justify-end border-t border-slate-100 pt-3">
                    <Link
                      href={`/delivery-orders/${doItem.id}`}
                      className="inline-flex min-h-9 items-center rounded-lg bg-slate-900 px-3.5 text-xs font-bold text-white transition hover:bg-slate-800"
                    >
                      {t.deliveryOrder?.viewPrint ?? 'View / Print'}
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 sm:block">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase text-slate-500">
                    <tr>
                      <th className="px-6 py-4">{t.deliveryOrder?.doNumber ?? 'DO Number'}</th>
                      <th className="px-6 py-4">{t.invoice?.customer ?? 'Customer'}</th>
                      <th className="px-6 py-4">{t.deliveryOrder?.deliveryDate ?? 'Delivery Date'}</th>
                      <th className="px-6 py-4">{t.invoice?.statusHeader ?? 'Status'}</th>
                      <th className="px-6 py-4 text-right">{t.invoice?.actionsHeader ?? 'Actions'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {orders.map((doItem) => (
                      <tr key={doItem.id} className="hover:bg-slate-50/50">
                        <td className="px-6 py-4 font-bold text-blue-700">{doItem.do_number}</td>
                        <td className="px-6 py-4 font-semibold">
                          {doItem.customer_name || (t.customer?.unnamed ?? 'Unnamed customer')}
                        </td>
                        <td className="px-6 py-4 text-slate-500">{formatDate(doItem.delivery_date)}</td>
                        <td className="px-6 py-4">
                          <select
                            value={doItem.status || 'Pending'}
                            disabled={updatingId === doItem.id}
                            onChange={(e) => handleStatusChange(doItem.id, e.target.value)}
                            className={`cursor-pointer rounded-full border-0 px-3 py-1 text-xs font-bold outline-none ring-1 disabled:opacity-50 ${
                              doItem.status === 'Delivered'
                                ? 'bg-green-50 text-green-700 ring-green-600/30'
                                : doItem.status === 'Cancelled'
                                ? 'bg-red-50 text-red-700 ring-red-600/30'
                                : 'bg-yellow-50 text-yellow-800 ring-yellow-600/30'
                            }`}
                          >
                            {statusOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Link
                            href={`/delivery-orders/${doItem.id}`}
                            className="inline-flex min-h-9 items-center rounded-lg bg-slate-900 px-3 text-xs font-bold text-white transition hover:bg-slate-800"
                          >
                            {t.deliveryOrder?.viewPrint ?? 'View / Print'}
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
    </main>
  );
}