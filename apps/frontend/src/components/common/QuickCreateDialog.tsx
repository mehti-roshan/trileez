import { Add } from '@mui/icons-material';
import EntityFormDialog, { type EntityField } from './EntityFormDialog.tsx';
import { Button, Tooltip } from '@mui/material';
import { useState } from 'react';

export default function QuickCreateDialog({ title, buttonLabel = 'ایجاد مورد جدید', fields = ['عنوان'], onSave }: { title: string; buttonLabel?: string; fields?: string[]; onSave?: (values: Record<string, string>) => unknown | Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const schema: EntityField[] = fields.map((label, index) => ({ name: label, label, required: index === 0, type: label.includes('توضیحات') || label.includes('شرح') ? 'textarea' : 'text' }));
  if (!onSave) {
    return <Tooltip title="این عملیات هنوز به گردش‌کار backend متصل نشده و در نسخه MVP غیرفعال است."><span><Button variant="contained" startIcon={<Add />} disabled>{buttonLabel} — به‌زودی</Button></span></Tooltip>;
  }
  return <><Button variant="contained" startIcon={<Add />} onClick={() => setOpen(true)}>{buttonLabel}</Button><EntityFormDialog open={open} onClose={() => setOpen(false)} title={title} fields={schema} onSubmit={async (values) => { await onSave(values); }} /></>;
}
