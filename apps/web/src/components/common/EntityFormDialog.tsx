import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, InputLabel, MenuItem, Select, Snackbar, Stack, TextField } from '@mui/material';
import { useState, type ReactNode } from 'react';
import JalaliDatePicker from './JalaliDatePicker.tsx';

export type EntityField = {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'checkbox';
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
    if (field.type === 'checkbox') return <FormControlLabel key={field.name} control={<Checkbox checked={values[field.name] === 'true'} onChange={(event) => setValues((current) => ({ ...current, [field.name]: String(event.target.checked) }))} />} label={field.label} sx={{ m: 0, direction: 'rtl', justifyContent: 'flex-start' }} />;
    if (field.type === 'date') return <JalaliDatePicker key={field.name} required={field.required} label={field.label} value={values[field.name] ?? ''} onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))} />;
    const inferredDirection = field.direction ?? (/email|url|website|phone|mobile|fax|code|slug|ip|identifier|number/i.test(field.name) ? 'ltr' : 'rtl');
    return <TextField key={field.name} required={field.required} fullWidth type={field.type === 'number' ? 'number' : 'text'} label={field.label} placeholder={field.placeholder} multiline={field.type === 'textarea'} minRows={field.type === 'textarea' ? 3 : undefined} slotProps={{ htmlInput: { dir: inferredDirection } }} sx={{ '& .MuiInputBase-input': { direction: inferredDirection, textAlign: inferredDirection === 'ltr' ? 'left' : 'right' }, '& textarea': { direction: inferredDirection, textAlign: inferredDirection === 'ltr' ? 'left' : 'right' } }} value={values[field.name] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} />;
  })}{children}</Stack></DialogContent><DialogActions sx={{ flexWrap: 'wrap', gap: 1, px: 3, pb: 2, direction: 'rtl' }}>{<Button onClick={onClose} disabled={submitting}>انصراف</Button>}<Button variant="contained" onClick={submit} disabled={!valid || submitting}>{submitting ? 'در حال ذخیره…' : submitLabel}</Button></DialogActions></Dialog><Snackbar open={saved} autoHideDuration={3000} onClose={() => setSaved(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}><Alert severity="success" onClose={() => setSaved(false)}>مورد با موفقیت ذخیره شد.</Alert></Snackbar></>;
}
