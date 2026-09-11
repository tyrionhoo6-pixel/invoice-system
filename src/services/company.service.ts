import { InvoiceService } from '@/services/invoice.service';
import type { CompanySettings } from '@/types/company';

export const CompanyService = {
  get: (): Promise<CompanySettings | null> => InvoiceService.getCompanySettings(),
  save: (settings: CompanySettings): Promise<CompanySettings> => InvoiceService.saveCompanySettings(settings),
  uploadLogo: (file: File): Promise<string> => InvoiceService.uploadCompanyLogo(file),
  uploadSignature: (file: File): Promise<string> => InvoiceService.uploadCompanySignature(file),
};