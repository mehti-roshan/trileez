import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, Snackbar, Stack, TextField } from '@mui/material';
import { useState, type ReactNode } from 'react';

export type EntityField = {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'select' | 'textarea';
  direction?: 'rtl' | 'ltr';
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  fields: EntityField[];
  initialValues?: Record<string, string>;
  onSubmit: (values: Record<string, string>) => void | Promise<void>;
  submitLabel?: string;
  children?: ReactNode;
};

export default function EntityFormDialog({ open, onClose, title, fields, initialValues = {}, onSubmit, submitLabel = 'ذخیره', children }: Props) {
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const requiredFields = fields.filter((field) => field.required);
  const valid = requiredFields.every((field) => values[field.name]?.trim());
  const submit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    try { await onSubmit(values); setSaved(true); onClose(); } finally { setSubmitting(false); }
  };
  return <><Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="sm" slotProps={{ paper: { sx: { width: 'calc(100% - 16px)', maxHeight: 'calc(100vh - 24px)', m: 1, direction: 'rtl' } } }}><DialogTitle sx={{ overflowWrap: 'anywhere', textAlign: 'right' }}>{title}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1, minWidth: 0 }}>{fields.map((field) => {
    if (field.type === 'select') return <FormControl key={field.name} required={field.required} fullWidth><InputLabel>{field.label}</InputLabel><Select label={field.label} value={values[field.name] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}>{field.options?.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}</Select></FormControl>;
    const inferredDirection = field.direction ?? (/email|url|website|phone|mobile|fax|code|slug|ip|identifier|number/i.test(field.name) ? 'ltr' : 'rtl');
    return <TextField key={field.name} required={field.required} fullWidth type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} label={field.label} placeholder={field.placeholder} multiline={field.type === 'textarea'} minRows={field.type === 'textarea' ? 3 : undefined} slotProps={{ ...(field.type === 'date' ? { inputLabel: { shrink: true } } : {}), htmlInput: { dir: inferredDirection } }} sx={{ '& .MuiInputBase-input': { direction: inferredDirection, textAlign: inferredDirection === 'ltr' ? 'left' : 'right' }, '& textarea': { direction: inferredDirection, textAlign: inferredDirection === 'ltr' ? 'left' : 'right' } }} value={values[field.name] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} />;
  })}{children}</Stack></DialogContent><DialogActions sx={{ flexWrap: 'wrap', gap: 1, px: 3, pb: 2, direction: 'rtl' }}>{<Button onClick={onClose} disabled={submitting}>انصراف</Button>}<Button variant="contained" onClick={submit} disabled={!valid || submitting}>{submitting ? 'در حال ذخیره…' : submitLabel}</Button></DialogActions></Dialog><Snackbar open={saved} autoHideDuration={3000} onClose={() => setSaved(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}><Alert severity="success" onClose={() => setSaved(false)}>مورد با موفقیت ذخیره شد.</Alert></Snackbar></>;
}
