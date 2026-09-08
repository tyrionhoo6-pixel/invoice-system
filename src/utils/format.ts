export function formatMoney(value: number | string | null | undefined): string {
  const amount = Number(value) || 0;
  return `RM ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(value?: string | null, style: 'short' | 'long' | 'medium' = 'medium'): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-US', { dateStyle: style }).format(new Date(value));
}

export function monthKey(value?: string | null): string {
  return value ? value.slice(0, 7) : '';
}
