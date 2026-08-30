import { Add } from '@mui/icons-material';
import EntityFormDialog, { type EntityField } from './EntityFormDialog.tsx';
import { Button } from '@mui/material';
import { useState } from 'react';

export default function QuickCreateDialog({ title, buttonLabel = 'ایجاد مورد جدید', fields = ['عنوان'], onSave }: { title: string; buttonLabel?: string; fields?: string[]; onSave?: (values: Record<string, string>) => void }) {
  const [open, setOpen] = useState(false);
  const schema: EntityField[] = fields.map((label, index) => ({ name: label, label, required: index === 0, type: label.includes('توضیحات') || label.includes('شرح') ? 'textarea' : 'text' }));
  return <><Button variant="contained" startIcon={<Add />} onClick={() => setOpen(true)}>{buttonLabel}</Button><EntityFormDialog open={open} onClose={() => setOpen(false)} title={title} fields={schema} onSubmit={(values) => onSave?.(values)} /></>;
}
