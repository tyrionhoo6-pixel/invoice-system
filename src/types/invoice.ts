export interface Customer {
  id: string;
  user_id?: string;
  name?: string;
  company_name?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  registration_no?: string;
  reg_no?: string;
  sst_no?: string;
  [key: string]: unknown;
}

export interface Product {
  id: string;
  user_id?: string;
  name?: string;
  description?: string;
  sku?: string;
  unit_price?: number;
  price?: number;
  [key: string]: unknown;
}

export type InvoiceType = 'standard' | 'proforma';

export type InvoiceStatus = 'paid' | 'unpaid' | 'converted' | 'VOID';

export interface Invoice {
  id: string;
  user_id?: string;
  invoice_number: string;
  invoice_type?: InvoiceType; 
  customer_id: string;
  total_qty: number;
  subtotal_amount: number;
  less_amount: number;
  total_amount: number;
  status: InvoiceStatus;
  payment_terms?: string | null;
  requires_customer_signature?: boolean;
  created_at?: string;
  customer?: Customer;
  is_deleted?: boolean;
  [key: string]: unknown;
}

export interface InvoiceItem {
  id?: string;
  invoice_id?: string;
  product_id?: string | null;
  product_name: string;
  quantity: number;
  unit?: string;
  unit_price: number;
  subtotal: number;
}

export interface InvoiceWithItems extends Invoice {
  invoice_items?: InvoiceItem[];
}