import { Download, Upload } from '@mui/icons-material';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { useRef, useState } from 'react';
import { exportCsv, parseCsv, type CsvColumn } from '../../services/csv.ts';

type ImportResult = { created: number; updated?: number; errors: string[] };
type Props<T> = { rows: T[]; columns: CsvColumn<T>[]; filename: string; onImport?: (rows: Record<string, string>[]) => ImportResult | Promise<ImportResult>; entityLabel: string };
export default function CsvToolbar<T>({ rows, columns, filename, onImport, entityLabel }: Props<T>) {
  const input = useRef<HTMLInputElement>(null); const [preview, setPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null); const [result, setResult] = useState<ImportResult | null>(null); const [submitting, setSubmitting] = useState(false); const [error, setError] = useState('');
  const choose = (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setPreview(parseCsv(String(reader.result))); reader.readAsText(file, 'UTF-8'); event.target.value = ''; };
  const commit = async () => {
    if (!preview || !onImport || submitting) return;
    setSubmitting(true); setError('');
    try {
      const mapped = preview.rows.map((row) => Object.fromEntries(preview.headers.map((header, index) => [header, row[index] ?? ''])));
      setResult(await onImport(mapped));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'ورود اطلاعات در سرور انجام نشد.');
    } finally { setSubmitting(false); }
  };
  const close = () => { if (submitting) return; setPreview(null); setResult(null); setError(''); };
  return <><Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}><Button size="small" variant="outlined" startIcon={<Download />} onClick={() => exportCsv(rows, columns, filename)}>خروجی CSV</Button>{onImport && <><input ref={input} hidden type="file" accept=".csv,text/csv" onChange={choose} /><Button size="small" variant="outlined" startIcon={<Upload />} onClick={() => input.current?.click()}>ورود CSV</Button></>}</Stack><Dialog open={Boolean(preview)} onClose={close} fullWidth maxWidth="md"><DialogTitle>پیش‌نمایش ورود {entityLabel}</DialogTitle><DialogContent><Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>تعداد ردیف‌ها: {preview?.rows.length.toLocaleString('fa-IR')} • ستون‌ها بر اساس سطر اول فایل شناسایی شده‌اند.</Typography>{error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}{result && <Alert severity={result.errors.length ? 'warning' : 'success'} sx={{ mb: 1.5 }}>ایجاد: {result.created} {result.updated ? `• بروزرسانی: ${result.updated}` : ''}{result.errors.length ? ` • خطا: ${result.errors.length}` : ''}</Alert>}{result?.errors.map((item) => <Typography key={item} variant="caption" color="error" sx={{ display: 'block' }}>{item}</Typography>)}<Table size="small"><TableHead><TableRow>{preview?.headers.map((header) => <TableCell key={header}>{header}</TableCell>)}</TableRow></TableHead><TableBody>{preview?.rows.slice(0, 8).map((row, index) => <TableRow key={index}>{preview.headers.map((_, cell) => <TableCell key={cell}>{row[cell] || '—'}</TableCell>)}</TableRow>)}</TableBody></Table></DialogContent><DialogActions><Button onClick={close} disabled={submitting}>بستن</Button>{!result && <Button variant="contained" onClick={() => void commit()} disabled={submitting}>{submitting ? 'در حال ثبت…' : 'تایید و ورود'}</Button>}</DialogActions></Dialog></>;
}
