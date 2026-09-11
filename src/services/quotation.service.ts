import { supabase } from '@/lib/supabase/client';
import type { Quotation, QuotationWithItems, QuotationStatus } from '@/types/quotation';
import type { Customer, Product } from '@/types/invoice';
import type { CompanySettings } from '@/types/company';
import { InvoiceService, type CreateInvoiceItemInput } from './invoice.service';

export interface CreateQuotationItemInput {
  product_id?: string | null;
  description: string;
  qty: number;
  unit?: string;
  unit_price: number;
  subtotal: number;
}

export interface CreateQuotationInput {
  quotation_number?: string;
  customer_id: string;
  payment_terms?: string;
  valid_until?: string | null;
  total_qty: number;
  subtotal_amount: number;
  less_amount: number;
  total_amount: number;
  items: CreateQuotationItemInput[];
}

const LOCAL_DEVELOPMENT_USER_ID = '00000000-0000-0000-0000-000000000001';

async function getAppUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (data.user) return data.user.id;
  if (error && error.message !== 'Auth session missing!') {
    throw new Error(`Unable to verify your Supabase session: ${error.message}`);
  }
  return LOCAL_DEVELOPMENT_USER_ID;
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(`Unable to read your session: ${error.message}`);
  return data.user;
}

export async function getCompanySettings(): Promise<CompanySettings | null> {
  const userId = await getAppUserId();
  const { data, error } = await supabase
    .from('company_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(`Unable to load company settings: ${error.message}`);
  if (!data) return null;
  const row = data as CompanySettings & { registration_no?: string };
  return { ...row, reg_no: row.reg_no ?? row.registration_no ?? '' };
}

function toMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function generateNextQuotationNumber(): Promise<string> {
  const userId = await getAppUserId();
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `QT${yy}${mm}-`;

  const { data, error } = await supabase
    .from('quotations')
    .select('quotation_number')
    .eq('user_id', userId)
    .like('quotation_number', `${prefix}%`)
    .or('is_deleted.eq.false,is_deleted.is.null')
    .order('quotation_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Unable to read latest quotation number: ${error.message}`);

  let nextSequence = 1;
  if (data?.quotation_number) {
    const parts = data.quotation_number.split('-');
    if (parts.length === 2 && !isNaN(Number(parts[1]))) {
      nextSequence = parseInt(parts[1], 10) + 1;
    }
  }

  return `${prefix}${String(nextSequence).padStart(3, '0')}`;
}

export async function createQuotation(quotationData: CreateQuotationInput): Promise<QuotationWithItems> {
  const userId = await getAppUserId();
  const quotationNumber = quotationData.quotation_number || (await generateNextQuotationNumber());

  const items = quotationData.items.map((item) => ({
    product_id: item.product_id ?? null,
    product_name: item.description.trim(),
    quantity: item.qty,
    unit: item.unit || 'pcs',
    unit_price: toMoney(item.unit_price),
    subtotal: toMoney(item.subtotal),
  }));

  const { data: quotation, error: quotationError } = await supabase
    .from('quotations')
    .insert({
      user_id: userId,
      quotation_number: quotationNumber,
      customer_id: quotationData.customer_id,
      payment_terms: quotationData.payment_terms || null,
      valid_until: quotationData.valid_until || null,
      total_qty: quotationData.total_qty,
      subtotal_amount: toMoney(quotationData.subtotal_amount),
      less_amount: toMoney(quotationData.less_amount),
      total_amount: toMoney(quotationData.total_amount),
      status: 'pending',
    })
    .select()
    .single();

  if (quotationError) throw new Error(`Unable to create quotation: ${quotationError.message}`);

  const { error: itemsError } = await supabase
    .from('quotation_items')
    .insert(items.map((item) => ({ ...item, quotation_id: quotation.id })));

  if (itemsError) {
    await supabase.from('quotations').update({ is_deleted: true }).eq('id', quotation.id);
    throw new Error(`Unable to create quotation items: ${itemsError.message}`);
  }

  return {
    ...quotation,
    quotation_items: items,
  } as QuotationWithItems;
}

export async function updateQuotation(id: string, quotationData: CreateQuotationInput): Promise<QuotationWithItems> {
  const userId = await getAppUserId();

  const items = quotationData.items.map((item) => ({
    quotation_id: id,
    product_id: item.product_id ?? null,
    product_name: item.description.trim(),
    quantity: item.qty,
    unit: item.unit || 'pcs',
    unit_price: toMoney(item.unit_price),
    subtotal: toMoney(item.subtotal),
  }));

  const { data: quotation, error: quotationError } = await supabase
    .from('quotations')
    .update({
      customer_id: quotationData.customer_id,
      payment_terms: quotationData.payment_terms || null,
      valid_until: quotationData.valid_until || null,
      total_qty: quotationData.total_qty,
      subtotal_amount: toMoney(quotationData.subtotal_amount),
      less_amount: toMoney(quotationData.less_amount),
      total_amount: toMoney(quotationData.total_amount),
    })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (quotationError) throw new Error(`Unable to update quotation: ${quotationError.message}`);

  const { error: deleteError } = await supabase.from('quotation_items').delete().eq('quotation_id', id);
  if (deleteError) throw new Error(`Unable to clear previous quotation items: ${deleteError.message}`);

  const { error: insertError } = await supabase.from('quotation_items').insert(items);
  if (insertError) throw new Error(`Unable to save updated quotation items: ${insertError.message}`);

  return {
    ...quotation,
    quotation_items: items,
  } as QuotationWithItems;
}

export async function getQuotations(): Promise<Quotation[]> {
  const userId = await getAppUserId();
  const { data, error } = await supabase
    .from('quotations')
    .select('*, customer:customers(*)')
    .eq('user_id', userId)
    .or('is_deleted.eq.false,is_deleted.is.null')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Unable to load quotations: ${error.message}`);
  return (data ?? []) as Quotation[];
}

export async function getQuotationById(id: string): Promise<QuotationWithItems | null> {
  const { data, error } = await supabase
    .from('quotations')
    .select('*, customer:customers(*), quotation_items(*)')
    .eq('id', id)
    .or('is_deleted.eq.false,is_deleted.is.null')
    .maybeSingle();

  if (error) throw new Error(`Unable to load quotation: ${error.message}`);
  return data as QuotationWithItems | null;
}

export async function updateQuotationStatus(id: string, status: QuotationStatus): Promise<Quotation> {
  const { data, error } = await supabase
    .from('quotations')
    .update({ status })
    .eq('id', id)
    .select('*, customer:customers(*)')
    .single();

  if (error) throw new Error(`Unable to update quotation status: ${error.message}`);
  return data as Quotation;
}

export async function convertToInvoice(quotationId: string) {
  const quotation = await getQuotationById(quotationId);
  if (!quotation) throw new Error('Quotation not found');

  const invoiceItems: CreateInvoiceItemInput[] = (quotation.quotation_items || []).map((item) => ({
    product_id: item.product_id,
    description: item.product_name,
    qty: item.quantity,
    unit: item.unit,
    unit_price: item.unit_price,
    subtotal: item.subtotal,
  }));

  const createdInvoice = await InvoiceService.createInvoice({
    invoice_type: 'standard',
    customer_id: quotation.customer_id,
    payment_terms: quotation.payment_terms || undefined,
    total_qty: quotation.total_qty,
    subtotal_amount: quotation.subtotal_amount,
    less_amount: quotation.less_amount,
    total_amount: quotation.total_amount,
    items: invoiceItems,
  });

  await updateQuotationStatus(quotationId, 'converted');
  return createdInvoice;
}

export async function convertToProforma(quotationId: string) {
  const quotation = await getQuotationById(quotationId);
  if (!quotation) throw new Error('Quotation not found');

  const invoiceItems: CreateInvoiceItemInput[] = (quotation.quotation_items || []).map((item) => ({
    product_id: item.product_id,
    description: item.product_name,
    qty: item.quantity,
    unit: item.unit,
    unit_price: item.unit_price,
    subtotal: item.subtotal,
  }));

  const createdProforma = await InvoiceService.createInvoice({
    invoice_type: 'proforma',
    customer_id: quotation.customer_id,
    payment_terms: quotation.payment_terms || undefined,
    total_qty: quotation.total_qty,
    subtotal_amount: quotation.subtotal_amount,
    less_amount: quotation.less_amount,
    total_amount: quotation.total_amount,
    items: invoiceItems,
  });

  await updateQuotationStatus(quotationId, 'converted');
  return createdProforma;
}

export async function deleteQuotation(id: string): Promise<void> {
  const userId = await getAppUserId();
  const { error } = await supabase
    .from('quotations')
    .update({ is_deleted: true })
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw new Error(`Unable to delete quotation: ${error.message}`);
}

export async function getCustomers(): Promise<Customer[]> {
  return InvoiceService.getCustomers();
}

export async function createCustomer(
  customer: Parameters<typeof InvoiceService.createCustomer>[0]
): Promise<Customer> {
  return InvoiceService.createCustomer(customer);
}

export async function getProducts(): Promise<Product[]> {
  return InvoiceService.getProducts();
}

export const QuotationService = {
  generateNextQuotationNumber,
  createQuotation,
  updateQuotation,
  getQuotations,
  getQuotationById,
  updateQuotationStatus,
  convertToInvoice,
  convertToProforma,
  deleteQuotation,
  getCustomers: () => InvoiceService.getCustomers(),
  createCustomer: (customer: Parameters<typeof InvoiceService.createCustomer>[0]) => 
    InvoiceService.createCustomer(customer),
  getProducts: () => InvoiceService.getProducts(),
  getCurrentUser,
  getCompanySettings,
};