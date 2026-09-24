export interface CreditNoteItem {
  id: string;
  credit_note_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  created_at: string;
}

export interface CreditNote {
  id: string;
  cn_number: string;
  invoice_id?: string;
  invoice_no?: string;
  customer_id: string;
  customer_name: string;
  cn_type?: string;
  reason?: string;
  total_amount: number;
  status: string;
  created_at: string;
  updated_at: string;
  items?: CreditNoteItem[];
}

export interface CreateCreditNoteItemInput {
  description: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface CreateCreditNoteInput {
  invoice_id?: string;
  invoice_no?: string;
  customer_id: string;
  customer_name: string;
  cn_type?: string;
  reason?: string;
  total_amount: number;
  items: CreateCreditNoteItemInput[];
}