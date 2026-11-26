ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS outlet text,
  ADD COLUMN IF NOT EXISTS state text;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS outlet text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS internal_remark text;

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS outlet text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS internal_remark text;
