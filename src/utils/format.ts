export function formatMoney(value: number | string | null | undefined): string {
  const amount = Number(value) || 0;
  return `RM ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (isNaN(date.getTime())) return '-';

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return `${day}/${month}/${year}`; 
}

export function monthKey(value?: string | null): string {
  return value ? value.slice(0, 7) : '';
}