import { supabase } from '@/lib/supabase/client';
import type { Customer, Invoice, Product, InvoiceWithItems, InvoiceType, InvoiceStatus } from '@/types/invoice';
import type { CompanySettings } from '@/types/company';

export interface CreateInvoiceItemInput {
  product_id?: string | null;
  description: string;
  qty: number;
  unit?: string;
  unit_price: number;
  subtotal: number;
}

export interface CreateInvoiceInput {
  invoice_number?: string;
  invoice_type?: InvoiceType;
  customer_id: string;
  payment_terms?: string;
  requires_customer_signature?: boolean;
  total_qty: number;
  subtotal_amount: number;
  less_amount: number;
  total_amount: number;
  items: CreateInvoiceItemInput[];
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

export async function saveCompanySettings(settings: CompanySettings): Promise<CompanySettings> {
  const userId = await getAppUserId();
  const baseSettings = {
    company_name: settings.company_name,
    sst_no: settings.sst_no,
    address: settings.address,
    phone: settings.phone,
    email: settings.email,
    bank_name: settings.bank_name,
    bank_account_no: settings.bank_account_no,
    bank_account_holder: settings.bank_account_holder,
    payment_terms: settings.payment_terms,
    logo_url: settings.logo_url,
    signature_url: settings.signature_url,
    user_id: userId,
  };

  let result = await supabase
    .from('company_settings')
    .upsert({ ...baseSettings, reg_no: settings.reg_no }, { onConflict: 'user_id' })
    .select()
    .single();

  if (result.error?.message.includes("'reg_no' column") || result.error?.message.includes('reg_no')) {
    result = await supabase
      .from('company_settings')
      .upsert({ ...baseSettings, registration_no: settings.reg_no }, { onConflict: 'user_id' })
      .select()
      .single();
  }

  if (result.error) throw new Error(`Unable to save company settings: ${result.error.message}`);
  const row = result.data as CompanySettings & { registration_no?: string };
  return { ...row, reg_no: row.reg_no ?? row.registration_no ?? settings.reg_no };
}

export async function uploadCompanyLogo(file: File): Promise<string> {
  const userId = await getAppUserId();
  const extension = file.name.split('.').pop()?.toLowerCase() || 'png';
  const path = `${userId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from('logos')
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) throw new Error(`Unable to upload logo: ${uploadError.message}`);
  const { data } = supabase.storage.from('logos').getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadCompanySignature(file: File): Promise<string> {
  const userId = await getAppUserId();
  const extension = file.name.split('.').pop()?.toLowerCase() || 'png';
  const path = `${userId}/signature-${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from('logos')
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) throw new Error(`Unable to upload signature: ${uploadError.message}`);
  const { data } = supabase.storage.from('logos').getPublicUrl(path);
  return data.publicUrl;
}

function toMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function generateNextInvoiceNumber(): Promise<string> {
  const userId = await getAppUserId();
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `IV${yy}${mm}-`;

  const { data, error } = await supabase
    .from('invoices')
    .select('invoice_number')
    .eq('user_id', userId)
    .like('invoice_number', `${prefix}%`)
    .or('is_deleted.eq.false,is_deleted.is.null')
    .order('invoice_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Unable to read latest invoice number: ${error.message}`);

  let nextSequence = 1;
  if (data?.invoice_number) {
    const parts = data.invoice_number.split('-');
    if (parts.length === 2 && !isNaN(Number(parts[1]))) {
      nextSequence = parseInt(parts[1], 10) + 1;
    }
  }

  return `${prefix}${String(nextSequence).padStart(3, '0')}`;
}

export async function generateNextProformaNumber(): Promise<string> {
  const userId = await getAppUserId();
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `PI${yy}${mm}-`;

  const { data, error } = await supabase
    .from('invoices')
    .select('invoice_number')
    .eq('user_id', userId)
    .like('invoice_number', `${prefix}%`)
    .or('is_deleted.eq.false,is_deleted.is.null')
    .order('invoice_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Unable to read latest proforma number: ${error.message}`);

  let nextSequence = 1;
  if (data?.invoice_number) {
    const parts = data.invoice_number.split('-');
    if (parts.length === 2 && !isNaN(Number(parts[1]))) {
      nextSequence = parseInt(parts[1], 10) + 1;
    }
  }

  return `${prefix}${String(nextSequence).padStart(3, '0')}`;
}

export async function createInvoice(invoiceData: CreateInvoiceInput): Promise<InvoiceWithItems> {
  const userId = await getAppUserId();
  const invoiceType = invoiceData.invoice_type || 'standard';
  
  let invoiceNumber = invoiceData.invoice_number;
  if (!invoiceNumber) {
    invoiceNumber = invoiceType === 'proforma' 
      ? await generateNextProformaNumber() 
      : await generateNextInvoiceNumber();
  }

  const items = invoiceData.items.map((item) => ({
    product_id: item.product_id ?? null,
    product_name: item.description.trim(),
    quantity: item.qty,
    unit: item.unit || 'pcs',
    unit_price: toMoney(item.unit_price),
    subtotal: toMoney(item.subtotal),
  }));

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .insert({
      user_id: userId,
      invoice_number: invoiceNumber,
      invoice_type: invoiceType,
      customer_id: invoiceData.customer_id,
      payment_terms: invoiceData.payment_terms || null,
      requires_customer_signature: invoiceData.requires_customer_signature ?? false,
      total_qty: invoiceData.total_qty,
      subtotal_amount: toMoney(invoiceData.subtotal_amount),
      less_amount: toMoney(invoiceData.less_amount),
      total_amount: toMoney(invoiceData.total_amount),
      status: 'unpaid',
    })
    .select()
    .single();

  if (invoiceError) throw new Error(`Unable to create invoice: ${invoiceError.message}`);

  const { error: itemsError } = await supabase
    .from('invoice_items')
    .insert(items.map((item) => ({ ...item, invoice_id: invoice.id })));

  if (itemsError) {
    await supabase.from('invoices').update({ is_deleted: true }).eq('id', invoice.id);
    throw new Error(`Unable to create invoice items: ${itemsError.message}`);
  }

  return {
    ...invoice,
    invoice_items: items,
  } as InvoiceWithItems;
}

export async function updateInvoice(id: string, invoiceData: CreateInvoiceInput): Promise<InvoiceWithItems> {
  const userId = await getAppUserId();

  const items = invoiceData.items.map((item) => ({
    invoice_id: id,
    product_id: item.product_id ?? null,
    product_name: item.description.trim(),
    quantity: item.qty,
    unit: item.unit || 'pcs',
    unit_price: toMoney(item.unit_price),
    subtotal: toMoney(item.subtotal),
  }));

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .update({
      customer_id: invoiceData.customer_id,
      payment_terms: invoiceData.payment_terms || null,
      requires_customer_signature: invoiceData.requires_customer_signature ?? false,
      total_qty: invoiceData.total_qty,
      subtotal_amount: toMoney(invoiceData.subtotal_amount),
      less_amount: toMoney(invoiceData.less_amount),
      total_amount: toMoney(invoiceData.total_amount),
    })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (invoiceError) throw new Error(`Unable to update invoice: ${invoiceError.message}`);

  const { error: deleteError } = await supabase.from('invoice_items').delete().eq('invoice_id', id);
  if (deleteError) throw new Error(`Unable to clear previous invoice items: ${deleteError.message}`);

  const { error: insertError } = await supabase.from('invoice_items').insert(items);
  if (insertError) throw new Error(`Unable to save updated invoice items: ${insertError.message}`);

  return {
    ...invoice,
    invoice_items: items,
  } as InvoiceWithItems;
}

export async function convertProformaToInvoice(proformaId: string): Promise<InvoiceWithItems> {
  const proforma = await getInvoiceById(proformaId);
  if (!proforma) throw new Error('Proforma invoice not found');

  const newInvoiceNumber = await generateNextInvoiceNumber();

  const createInput: CreateInvoiceInput = {
    invoice_number: newInvoiceNumber,
    invoice_type: 'standard',
    customer_id: proforma.customer_id,
    payment_terms: proforma.payment_terms || undefined,
    requires_customer_signature: proforma.requires_customer_signature ?? false,
    total_qty: proforma.total_qty,
    subtotal_amount: proforma.subtotal_amount,
    less_amount: proforma.less_amount,
    total_amount: proforma.total_amount,
    items: (proforma.invoice_items || []).map((item) => ({
      product_id: item.product_id,
      description: item.product_name,
      qty: item.quantity,
      unit: item.unit,
      unit_price: item.unit_price,
      subtotal: item.subtotal,
    })),
  };

  const newInvoice = await createInvoice(createInput);

  await supabase
    .from('invoices')
    .update({ status: 'converted' })
    .eq('id', proformaId);

  return newInvoice;
}

export async function getInvoices(): Promise<Invoice[]> {
  const userId = await getAppUserId();
  const { data, error } = await supabase
    .from('invoices')
    .select('*, customer:customers(*)')
    .eq('user_id', userId)
    .or('is_deleted.eq.false,is_deleted.is.null')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Unable to load invoices: ${error.message}`);
  return (data ?? []) as Invoice[];
}

export async function getInvoiceById(id: string): Promise<InvoiceWithItems | null> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, customer:customers(*), invoice_items(*)')
    .eq('id', id)
    .or('is_deleted.eq.false,is_deleted.is.null')
    .maybeSingle();

  if (error) throw new Error(`Unable to load invoice: ${error.message}`);
  return data as InvoiceWithItems | null;
}

export async function updateInvoiceStatus(id: string, status: InvoiceStatus): Promise<Invoice> {
  const { data, error } = await supabase
    .from('invoices')
    .update({ status })
    .eq('id', id)
    .select('*, customer:customers(*)')
    .single();

  if (error) throw new Error(`Unable to update invoice status: ${error.message}`);
  return data as Invoice;
}

export async function voidInvoice(id: string): Promise<Invoice> {
  return updateInvoiceStatus(id, 'VOID');
}

export async function deleteInvoice(id: string): Promise<void> {
  const { error } = await supabase
    .from('invoices')
    .update({ is_deleted: true })
    .eq('id', id);

  if (error) throw new Error(`Unable to delete invoice: ${error.message}`);
}

export type CustomerInput = Pick<
  Customer,
  'name' | 'company_name' | 'contact_person' | 'email' | 'phone' | 'address' | 'registration_no' | 'reg_no' | 'sst_no'
>;

function optionalCustomerValue(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function customerPayload(customer: CustomerInput, userId: string) {
  return {
    user_id: userId,
    name: optionalCustomerValue(customer.name) ?? '',
    company_name: optionalCustomerValue(customer.company_name),
    contact_person: optionalCustomerValue(customer.contact_person),
    email: optionalCustomerValue(customer.email),
    phone: optionalCustomerValue(customer.phone),
    address: optionalCustomerValue(customer.address),
    registration_no: optionalCustomerValue(customer.registration_no ?? customer.reg_no),
    sst_no: optionalCustomerValue(customer.sst_no),
  };
}

export async function getCustomers(): Promise<Customer[]> {
  const userId = await getAppUserId();
  const { data, error } = await supabase.from('customers').select('*').eq('user_id', userId).order('name');
  if (error) throw new Error(`Unable to load customers: ${error.message}`);
  return (data ?? []) as Customer[];
}

export async function createCustomer(customer: CustomerInput): Promise<Customer> {
  const userId = await getAppUserId();
  const payload = customerPayload(customer, userId);
  let result = await supabase.from('customers').insert(payload).select().single();

  if (result.error?.message.includes('registration_no')) {
    const { registration_no: registrationNumber, ...fallbackPayload } = payload;
    result = await supabase
      .from('customers')
      .insert({ ...fallbackPayload, reg_no: registrationNumber })
      .select()
      .single();
  }
  if (result.error) throw new Error(`Unable to create customer: ${result.error.message}`);
  return result.data as Customer;
}

export async function updateCustomer(id: string, customer: CustomerInput): Promise<Customer> {
  const userId = await getAppUserId();
  const payload = customerPayload(customer, userId);
  const { user_id: _userId, ...updatePayload } = payload;
  let result = await supabase
    .from('customers')
    .update(updatePayload)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (result.error?.message.includes('registration_no')) {
    const { registration_no: registrationNumber, ...fallbackPayload } = updatePayload;
    result = await supabase
      .from('customers')
      .update({ ...fallbackPayload, reg_no: registrationNumber })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();
  }
  if (result.error) throw new Error(`Unable to update customer: ${result.error.message}`);
  return result.data as Customer;
}

export async function deleteCustomer(id: string): Promise<void> {
  const userId = await getAppUserId();
  const { count, error: invoiceError } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', id)
    .eq('user_id', userId)
    .or('is_deleted.eq.false,is_deleted.is.null');

  if (invoiceError) throw new Error(`Unable to check customer invoices: ${invoiceError.message}`);
  if ((count ?? 0) > 0) throw new Error('This customer has invoice records and cannot be deleted directly.');

  const { error } = await supabase.from('customers').delete().eq('id', id).eq('user_id', userId);
  if (error) throw new Error(`Unable to delete customer: ${error.message}`);
}

export async function getProducts(): Promise<Product[]> {
  const { data, error } = await supabase.from('products').select('*').order('name');
  if (error) throw new Error(`Unable to load products: ${error.message}`);
  return (data ?? []) as Product[];
}

export const InvoiceService = {
  generateNextInvoiceNumber,
  generateNextProformaNumber,
  createInvoice,
  updateInvoice,
  convertProformaToInvoice,
  getInvoices,
  getInvoiceById,
  updateInvoiceStatus,
  voidInvoice,
  deleteInvoice,
  getCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getProducts,
  getCurrentUser,
  getCompanySettings,
  saveCompanySettings,
  uploadCompanyLogo,
  uploadCompanySignature,
};