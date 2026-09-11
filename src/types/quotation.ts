import type { Customer } from './invoice';

export type QuotationStatus = 'pending' | 'accepted' | 'rejected' | 'converted' | 'VOID';

export interface Quotation {
  id: string;
  user_id?: string;
  quotation_number: string;
  customer_id: string;
  valid_until?: string | null;
  total_qty: number;
  subtotal_amount: number;
  less_amount: number;
  total_amount: number;
  status: QuotationStatus;
  payment_terms?: string | null;
  created_at?: string;
  customer?: Customer;
  is_deleted?: boolean;
  [key: string]: unknown;
}

export interface QuotationItem {
  id?: string;
  quotation_id?: string;
  product_id?: string | null;
  product_name: string;
  quantity: number;
  unit?: string;
  unit_price: number;
  subtotal: number;
}

export interface QuotationWithItems extends Quotation {
  quotation_items?: QuotationItem[];
}