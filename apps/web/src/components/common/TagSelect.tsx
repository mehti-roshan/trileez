import { Autocomplete, Chip, TextField } from '@mui/material';

export type TagOption = { id: string; name: string; color?: string };

export function TagSelect({ options, value, onChange, label = 'برچسب‌ها' }: { options: TagOption[]; value: string[]; onChange: (ids: string[]) => void; label?: string }) {
  return <Autocomplete multiple options={options} value={options.filter((option) => value.includes(option.id))} getOptionLabel={(option) => option.name} onChange={(_, next) => onChange(next.map((option) => option.id))} renderValue={(selected, getItemProps) => selected.map((option, index) => <Chip {...getItemProps({ index })} key={option.id} label={option.name} sx={{ bgcolor: option.color, color: option.color ? 'white' : undefined }} />)} renderInput={(params) => <TextField {...params} label={label} placeholder="جستجوی برچسب..." />} />;
}

export function TagChip({ tag, onDelete }: { tag: TagOption; onDelete?: () => void }) {
  return <Chip size="small" label={tag.name} onDelete={onDelete} sx={{ bgcolor: tag.color, color: tag.color ? 'white' : undefined }} />;
}
