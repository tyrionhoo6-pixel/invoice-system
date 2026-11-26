import { InvoiceService } from '@/services/invoice.service';
import type { Customer, Invoice } from '@/types/invoice';
import type { CreditNote } from '@/types/creditNote';
import type {
  StatementAging,
  StatementFilters,
  StatementResult,
  StatementRow,
  StatementSource,
} from '@/types/statement';

export async function getStatementSource(): Promise<StatementSource> {
  const [invoices, creditNotes, customers] = await Promise.all([
    InvoiceService.getInvoices(),
    InvoiceService.getCreditNotes(),
    InvoiceService.getCustomers(),
  ]);
  return { invoices, creditNotes, customers };
}

function dateKey(value?: string | null): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function matchesDateRange(value: string | null, filters: StatementFilters): boolean {
  if (!filters.startDate && !filters.endDate) return true;
  const key = dateKey(value);
  return !!key && (!filters.startDate || key >= filters.startDate) && (!filters.endDate || key <= filters.endDate);
}

function effectiveLocation(invoice?: Invoice, customer?: Customer) {
  return {
    outlet: invoice?.outlet?.trim() || customer?.outlet?.trim() || '',
    state: invoice?.state?.trim() || customer?.state?.trim() || '',
  };
}

function getInvoiceDueDate(invoice: Invoice, defaultPaymentTerms?: string): string | null {
  if (invoice.due_date) return dateKey(invoice.due_date) || null;
  const issuedDate = dateKey(invoice.created_at);
  if (!issuedDate) return null;

  const terms = invoice.payment_terms?.trim() || defaultPaymentTerms?.trim() || '';
  const daysMatch = terms.match(/(\d+)\s*days?/i);
  const days = daysMatch ? Number(daysMatch[1]) : /cash|cod/i.test(terms) ? 0 : null;
  if (days === null || !Number.isFinite(days)) return null;

  const dueDate = new Date(`${issuedDate}T12:00:00`);
  dueDate.setDate(dueDate.getDate() + days);
  return dateKey(dueDate.toISOString()) || null;
}

function amount(value: number | string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? roundMoney(Math.max(0, parsed)) : 0;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function daysBetween(start: string, end: string): number {
  const startTime = new Date(`${start}T00:00:00`).getTime();
  const endTime = new Date(`${end}T00:00:00`).getTime();
  return Math.max(0, Math.floor((endTime - startTime) / 86_400_000));
}

export function calculateStatement(
  source: StatementSource,
  filters: StatementFilters,
  defaultPaymentTerms?: string,
  asOf = new Date()
): StatementResult {
  const customerById = new Map(source.customers.map((customer) => [customer.id, customer]));
  const invoiceById = new Map(source.invoices.map((invoice) => [invoice.id, invoice]));
  const today = dateKey(asOf.toISOString());

  const invoices: StatementRow[] = source.invoices.flatMap((invoice) => {
    const status = (invoice.status ?? 'unpaid').toLowerCase();
    if (invoice.invoice_type === 'proforma' || status === 'void' || status === 'converted') return [];

    const customer = invoice.customer ?? customerById.get(invoice.customer_id);
    const location = effectiveLocation(invoice, customer);
    const documentDate = dateKey(invoice.created_at) || null;
    const invoiceAmount = amount(invoice.total_amount);
    const paidAmount = invoice.paid_amount !== undefined && invoice.paid_amount !== null
      ? Math.min(invoiceAmount, amount(invoice.paid_amount))
      : status === 'paid' ? invoiceAmount : 0;
    const balanceDue = Math.max(0, invoiceAmount - paidAmount);

    if (
      balanceDue <= 0 ||
      (filters.customerId !== 'all' && invoice.customer_id !== filters.customerId) ||
      (filters.outlet !== 'all' && location.outlet !== filters.outlet) ||
      (filters.state !== 'all' && location.state !== filters.state) ||
      !matchesDateRange(invoice.created_at ?? null, filters)
    ) return [];

    return [{
      id: `invoice-${invoice.id}`,
      kind: 'invoice',
      documentDate,
      documentNo: invoice.invoice_number,
      customerId: invoice.customer_id,
      customerName: customer?.company_name || customer?.name || '',
      outlet: location.outlet,
      state: location.state,
      dueDate: getInvoiceDueDate(invoice, defaultPaymentTerms),
      originalAmount: invoiceAmount,
      paidAmount,
      balanceDue,
      invoiceId: invoice.id,
    }];
  });

  const creditNotes: StatementRow[] = source.creditNotes.flatMap((creditNote) => {
    if ((creditNote.status ?? '').trim().toLowerCase() !== 'issued') return [];
    const linkedInvoiceCandidate = creditNote.invoice_id ? invoiceById.get(creditNote.invoice_id) : undefined;
    const linkedInvoice = linkedInvoiceCandidate?.customer_id === creditNote.customer_id
      ? linkedInvoiceCandidate
      : undefined;
    const customer = customerById.get(creditNote.customer_id);
    const location = effectiveLocation(linkedInvoice, customer);

    if (
      (filters.customerId !== 'all' && creditNote.customer_id !== filters.customerId) ||
      (filters.outlet !== 'all' && location.outlet !== filters.outlet) ||
      (filters.state !== 'all' && location.state !== filters.state) ||
      !matchesDateRange(creditNote.created_at, filters)
    ) return [];

    const creditAmount = amount(creditNote.total_amount);
    if (creditAmount <= 0) return [];
    return [{
      id: `credit-note-${creditNote.id}`,
      kind: 'credit_note',
      documentDate: dateKey(creditNote.created_at) || null,
      documentNo: creditNote.cn_number,
      customerId: creditNote.customer_id,
      customerName: creditNote.customer_name || customer?.company_name || customer?.name || '',
      outlet: location.outlet,
      state: location.state,
      dueDate: null,
      originalAmount: -creditAmount,
      paidAmount: 0,
      balanceDue: -creditAmount,
      invoiceId: linkedInvoice?.id,
    }];
  });

  const rows = [...invoices, ...creditNotes].sort((left, right) =>
    (left.documentDate ?? '').localeCompare(right.documentDate ?? '') || left.documentNo.localeCompare(right.documentNo)
  );
  const netBalanceDue = roundMoney(rows.reduce((sum, row) => sum + row.balanceDue, 0));
  const creditTotal = roundMoney(creditNotes.reduce((sum, row) => sum - row.balanceDue, 0));

  const creditByInvoice = new Map<string, number>();
  creditNotes.forEach((credit) => {
    if (credit.invoiceId) {
      creditByInvoice.set(
        credit.invoiceId,
        roundMoney((creditByInvoice.get(credit.invoiceId) ?? 0) - credit.balanceDue)
      );
    }
  });

  let unallocatedCredit = creditTotal;
  const agingBalances = invoices.map((invoice) => {
    const linkedCredit = Math.min(invoice.balanceDue, creditByInvoice.get(invoice.invoiceId ?? '') ?? 0);
    unallocatedCredit = roundMoney(unallocatedCredit - linkedCredit);
    return { invoice, balance: roundMoney(invoice.balanceDue - linkedCredit) };
  });
  agingBalances
    .sort((left, right) => (left.invoice.dueDate ?? '9999-12-31').localeCompare(right.invoice.dueDate ?? '9999-12-31'))
    .forEach((item) => {
      const appliedCredit = Math.min(item.balance, Math.max(0, unallocatedCredit));
      item.balance = roundMoney(item.balance - appliedCredit);
      unallocatedCredit = roundMoney(unallocatedCredit - appliedCredit);
    });

  const aging: StatementAging = {
    current: 0,
    days1To30: 0,
    days31To60: 0,
    days61To90: 0,
    over90Days: 0,
    overdueAmount: 0,
    maxDaysOverdue: 0,
  };
  agingBalances.forEach(({ invoice, balance }) => {
    if (balance <= 0 || !today) return;
    if (!invoice.dueDate) {
      aging.current = roundMoney(aging.current + balance);
      return;
    }
    const overdueDays = daysBetween(invoice.dueDate, today);
    if (invoice.dueDate >= today) aging.current = roundMoney(aging.current + balance);
    else {
      aging.overdueAmount = roundMoney(aging.overdueAmount + balance);
      aging.maxDaysOverdue = Math.max(aging.maxDaysOverdue, overdueDays);
      if (overdueDays <= 30) aging.days1To30 = roundMoney(aging.days1To30 + balance);
      else if (overdueDays <= 60) aging.days31To60 = roundMoney(aging.days31To60 + balance);
      else if (overdueDays <= 90) aging.days61To90 = roundMoney(aging.days61To90 + balance);
      else aging.over90Days = roundMoney(aging.over90Days + balance);
    }
  });

  return {
    rows,
    totalOriginalAmount: roundMoney(rows.reduce((sum, row) => sum + row.originalAmount, 0)),
    totalPaidAmount: roundMoney(rows.reduce((sum, row) => sum + row.paidAmount, 0)),
    netBalanceDue,
    totalAmountDue: Math.max(0, netBalanceDue),
    availableCredit: Math.max(0, -netBalanceDue),
    aging,
  };
}

export const StatementService = {
  getStatementSource,
  calculateStatement,
};
