export interface CompanySettings {
  id?: string;
  user_id?: string;
  company_name: string;
  reg_no: string;
  registration_no?: string;
  sst_no: string;
  address: string;
  phone: string;
  email: string;
  bank_name: string;
  bank_account_no: string;
  bank_account_holder: string;
  payment_terms: string;
  logo_url: string;
}

export const emptyCompanySettings: CompanySettings = {
  company_name: '',
  reg_no: '',
  sst_no: '',
  address: '',
  phone: '',
  email: '',
  bank_name: '',
  bank_account_no: '',
  bank_account_holder: '',
  payment_terms: '',
  logo_url: '',
};