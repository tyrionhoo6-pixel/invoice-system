'use client';

import Link from 'next/link';
import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { CompanyService } from '@/services/company.service';
import { emptyCompanySettings, type CompanySettings } from '@/types/company';
import { useLanguage } from '@/context/LanguageContext';

export default function SettingsPage() {
  const { t } = useLanguage();
  const [form, setForm] = useState<CompanySettings>(emptyCompanySettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);

  const fields: Array<[keyof CompanySettings, string, string]> = [
    ['company_name', t.settings?.companyName ?? 'Company Name', 'Acme Trading Sdn. Bhd.'],
    ['reg_no', t.settings?.regNo ?? 'Reg No', 'Company registration number'],
    ['sst_no', t.settings?.sstNo ?? 'SST No', 'SST registration number'],
    ['address', t.settings?.address ?? 'Address', 'Registered company address'],
    ['phone', t.settings?.phone ?? 'Phone', '+60 3 0000 0000'],
    ['email', t.settings?.email ?? 'Email', 'billing@example.com'],
    ['bank_name', t.settings?.bankName ?? 'Bank Name', 'Bank name'],
    ['bank_account_no', t.settings?.bankAccountNo ?? 'Bank Account No', 'Account number'],
    ['bank_account_holder', t.settings?.bankAccountHolder ?? 'Bank Account Holder', 'Account holder name'],
    ['payment_terms', t.settings?.paymentTerms ?? 'Payment Terms', 'e.g. Payment due within 30 days'],
  ];

  useEffect(() => {
    const load = async () => {
      try {
        const settings = await CompanyService.get();
        if (settings) setForm({ ...emptyCompanySettings, ...settings });
      } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Unable to load settings.'); }
      finally { setLoading(false); }
    };
    void load();
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setMessage(''); setErrorMessage('');
    try { setForm({ ...form, ...(await CompanyService.save(form)) }); setMessage(t.settings?.savedSuccess ?? 'Saved successfully.'); }
    catch (error) { setErrorMessage(error instanceof Error ? error.message : (t.settings?.saveError ?? 'Unable to save.')); }
    finally { setSaving(false); }
  };

  const uploadFile = async (event: ChangeEvent<HTMLInputElement>, type: 'logo' | 'signature') => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) return setErrorMessage(t.settings?.invalidImageFormat ?? 'Please choose a PNG or JPG.');
    if (file.size > 5 * 1024 * 1024) return setErrorMessage(t.settings?.imageSizeExceeded ?? 'File must be smaller than 5 MB.');
    
    const isLogo = type === 'logo';
    isLogo ? setUploadingLogo(true) : setUploadingSignature(true);
    setErrorMessage(''); setMessage('');

    try {
      const url = isLogo ? await CompanyService.uploadLogo(file) : await CompanyService.uploadSignature(file);
      setForm((cur) => ({ ...cur, [isLogo ? 'logo_url' : 'signature_url']: url }));
      setMessage(isLogo ? (t.settings?.logoSavedNotice ?? 'Logo uploaded.') : (t.settings?.signatureSavedNotice ?? 'Signature uploaded.'));
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Upload failed.'); }
    finally { isLogo ? setUploadingLogo(false) : setUploadingSignature(false); event.target.value = ''; }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-700">{t.settings?.workspace ?? 'Workspace'}</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">{t.settings?.title ?? 'Company Settings'}</h1>
            <p className="mt-2 text-sm text-slate-500">{t.settings?.description ?? 'These details appear on your invoices and payment instructions.'}</p>
          </div>
          <Link href="/" className="text-sm font-bold text-blue-700">← {t.settings?.backToDashboard ?? 'Back to dashboard'}</Link>
        </header>

        {errorMessage && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{errorMessage}</p>}
        {message && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</p>}

        <form onSubmit={submit} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-8">
          <div className="grid gap-5 sm:grid-cols-2">
            {fields.map(([key, label, placeholder]) => (
              <label key={key} className={`block text-sm font-bold ${key === 'address' ? 'sm:col-span-2' : ''}`}>
                {label}
                {key === 'address' ? (
                  <textarea value={form[key] ?? ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={placeholder} rows={3} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
                ) : (
                  <input required={key === 'company_name'} type={key === 'email' ? 'email' : 'text'} value={form[key] ?? ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={placeholder} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-3 font-normal outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
                )}
              </label>
            ))}
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
              <p className="text-sm font-bold">{t.settings?.companyLogo ?? 'Company Logo'}</p>
              <p className="mt-1 text-xs text-slate-500">{t.settings?.logoNotice ?? 'Upload a PNG or JPG image, up to 5 MB.'}</p>
              <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
                <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl bg-white px-4 text-sm font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100">
                  {uploadingLogo ? (t.settings?.uploading ?? 'Uploading...') : (t.settings?.chooseImage ?? 'Choose image')}
                  <input type="file" accept="image/png,image/jpeg" onChange={(e) => uploadFile(e, 'logo')} disabled={uploadingLogo} className="sr-only" />
                </label>
                {form.logo_url && <img src={form.logo_url} alt="Logo" className="h-20 w-20 rounded-xl bg-white object-contain p-2 ring-1 ring-slate-200" />}
              </div>
            </div>

            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
              <p className="text-sm font-bold">{t.settings?.digitalSignature ?? 'Digital Signature'}</p>
              <p className="mt-1 text-xs text-slate-500">{t.settings?.signatureNotice ?? 'Upload signature image, up to 5 MB.'}</p>
              <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
                <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl bg-white px-4 text-sm font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100">
                  {uploadingSignature ? (t.settings?.uploading ?? 'Uploading...') : (t.settings?.chooseImage ?? 'Choose image')}
                  <input type="file" accept="image/png,image/jpeg" onChange={(e) => uploadFile(e, 'signature')} disabled={uploadingSignature} className="sr-only" />
                </label>
                {form.signature_url && <img src={form.signature_url} alt="Signature" className="h-20 w-32 rounded-xl bg-white object-contain p-2 ring-1 ring-slate-200" />}
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button disabled={loading || saving || uploadingLogo || uploadingSignature} className="min-h-12 rounded-xl bg-blue-700 px-6 font-bold text-white hover:bg-blue-800 disabled:opacity-60">
              {saving ? (t.settings?.saving ?? 'Saving...') : (t.settings?.saveSettings ?? 'Save Company Settings')}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}