export interface DeliveryOrderItem {
  id?: string;
  delivery_order_id?: string;
  description: string;
  quantity: number;
  unit: string;
}

export interface DeliveryOrder {
  id?: string;
  do_number: string;
  invoice_id?: string;
  quotation_id?: string;
  customer_name: string;
  customer_address?: string;
  delivery_date: string;
  status: 'Pending' | 'Delivered' | 'Cancelled';
  notes?: string;
  created_at?: string;
  items: DeliveryOrderItem[];
}