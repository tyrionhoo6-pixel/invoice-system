export const invoiceExportHeaders = [
  'Invoice Number',
  'Issue Date',
  'Due Date',
  'Client Name',
  'Client Email',
  'Subtotal',
  'Tax/SST',
  'Total Amount',
  'Status',
  'Payment Terms',
];

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export function downloadCsv(rows: unknown[][], fileName: string): void {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }));
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}
