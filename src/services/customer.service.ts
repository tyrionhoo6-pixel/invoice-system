import { InvoiceService, type CustomerInput } from '@/services/invoice.service';
import type { Customer } from '@/types/invoice';

export const CustomerService = {
  list: (): Promise<Customer[]> => InvoiceService.getCustomers(),
  create: (customer: CustomerInput): Promise<Customer> => InvoiceService.createCustomer(customer),
  update: (id: string, customer: CustomerInput): Promise<Customer> => InvoiceService.updateCustomer(id, customer),
  remove: (id: string): Promise<void> => InvoiceService.deleteCustomer(id),
};
