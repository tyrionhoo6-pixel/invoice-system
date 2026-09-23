'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { InvoiceService } from '@/services/invoice.service';
import { formatDate } from '@/utils/format';

type DeliveryOrder = {
  id: string;
  do_number: string;
  customer_name: string;
  delivery_date: string;
  status: string;
  created_at: string;
};

const STATUS_OPTIONS = ['Pending', 'Delivered', 'Cancelled'];

export default function DeliveryOrdersPage() {
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const fetchDOs = async () => {
      try {
        const data = await InvoiceService.getDeliveryOrders();
        setOrders((data as DeliveryOrder[]) || []);
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load Delivery Orders.');
      } finally {
        setLoading(false);
      }
    };

    void fetchDOs();
  }, []);

  // 修改状态逻辑
  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await InvoiceService.updateDeliveryOrderStatus(id, newStatus);
      setOrders((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
      );
    } catch (err: unknown) {
      alert('Failed to update status: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Delivery Orders</h1>
            <p className="mt-1 text-sm text-slate-500">Manage and view generated delivery orders.</p>
          </div>
        </div>

        {errorMessage && (
          <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{errorMessage}</p>
        )}

        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading delivery orders...</div>
          ) : orders.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No delivery orders found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase text-slate-500">
                  <tr>
                    <th className="px-6 py-4">DO Number</th>
                    <th className="px-6 py-4">Customer</th>
                    <th className="px-6 py-4">Delivery Date</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((doItem) => (
                    <tr key={doItem.id} className="hover:bg-slate-50/50">
                      <td className="px-6 py-4 font-bold text-blue-700">{doItem.do_number}</td>
                      <td className="px-6 py-4 font-semibold">{doItem.customer_name}</td>
                      <td className="px-6 py-4 text-slate-500">{formatDate(doItem.delivery_date)}</td>
                      <td className="px-6 py-4">
                        {/* 动态修改状态的下拉框 */}
                        <select
                          value={doItem.status || 'Pending'}
                          onChange={(e) => handleStatusChange(doItem.id, e.target.value)}
                          className={`rounded-full px-3 py-1 text-xs font-bold border-0 ring-1 outline-none cursor-pointer ${
                            doItem.status === 'Delivered'
                              ? 'bg-green-50 text-green-700 ring-green-600/30'
                              : doItem.status === 'Cancelled'
                              ? 'bg-red-50 text-red-700 ring-red-600/30'
                              : 'bg-yellow-50 text-yellow-800 ring-yellow-600/30'
                          }`}
                        >
                          {STATUS_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/delivery-orders/${doItem.id}`}
                          className="inline-flex min-h-9 items-center rounded-lg bg-slate-900 px-3 text-xs font-bold text-white transition hover:bg-slate-800"
                        >
                          View / Print
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}