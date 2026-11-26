import type { Customer, Invoice } from './invoice';
import type { CreditNote } from './creditNote';

export interface StatementSource {
  invoices: Invoice[];
  creditNotes: CreditNote[];
  customers: Customer[];
}

export interface StatementFilters {
  customerId: string;
  outlet: string;
  state: string;
  startDate: string;
  endDate: string;
}

export interface StatementRow {
  id: string;
  kind: 'invoice' | 'credit_note';
  documentDate: string | null;
  documentNo: string;
  customerId: string;
  customerName: string;
  outlet: string;
  state: string;
  dueDate: string | null;
  originalAmount: number;
  paidAmount: number;
  balanceDue: number;
  invoiceId?: string;
}

export interface StatementAging {
  current: number;
  days1To30: number;
  days31To60: number;
  days61To90: number;
  over90Days: number;
  overdueAmount: number;
  maxDaysOverdue: number;
}

export interface StatementResult {
  rows: StatementRow[];
  totalOriginalAmount: number;
  totalPaidAmount: number;
  netBalanceDue: number;
  totalAmountDue: number;
  availableCredit: number;
  aging: StatementAging;
}
