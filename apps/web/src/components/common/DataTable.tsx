import { ArrowDownward, ArrowUpward, Check, Download, UnfoldMore, ViewColumn } from '@mui/icons-material';
import { Box, Button, Checkbox, CircularProgress, FormControl, IconButton, InputAdornment, InputLabel, Menu, MenuItem, Select, Table, TableBody, TableCell, TableHead, TablePagination, TableRow, TextField, Tooltip, Typography } from '@mui/material';
import { useMemo, useState, type ReactNode } from 'react';
import { exportCsv } from '../../services/csv.ts';

export type DataTableColumn<T> = {
  key: string;
  label: string;
  sortable?: boolean;
  searchable?: boolean;
  align?: 'left' | 'right' | 'center';
  render?: (row: T) => ReactNode;
  value?: (row: T) => string | number | null | undefined;
  aggregate?: 'count' | 'sum' | 'average' | 'min' | 'max';
};
export type DataTableFilter<T> = { key: string; label: string; options: { value: string; label: string }[]; value: (row: T) => string };

type Props<T> = {
  rows: T[];
  columns: DataTableColumn<T>[];
  getRowId?: (row: T, index: number) => string;
  searchPlaceholder?: string;
  toolbar?: ReactNode;
  loading?: boolean;
  error?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  pageSize?: number;
  onRowClick?: (row: T) => void;
  showSearch?: boolean;
  filters?: DataTableFilter<T>[];
  initialHiddenColumns?: string[];
};

export default function DataTable<T>({
  rows,
  columns,
  getRowId = (_, index) => String(index),
  searchPlaceholder = 'جستجو در جدول...',
  toolbar,
  loading = false,
  error,
  emptyTitle = 'رکوردی یافت نشد',
  emptyDescription = 'با تغییر جستجو یا فیلترها دوباره تلاش کنید.',
  pageSize = 10,
  onRowClick,
  showSearch = true,
  filters = [],
  initialHiddenColumns = [],
}: Props<T>) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(pageSize);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [hiddenColumns, setHiddenColumns] = useState<string[]>(initialHiddenColumns);
  const [columnAnchor, setColumnAnchor] = useState<HTMLElement | null>(null);
  const visibleColumns = columns.filter((column) => !hiddenColumns.includes(column.key));
  const searchable = columns.filter((column) => column.searchable !== false);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const result = normalized
      ? rows.filter((row) => searchable.some((column) => String(column.value?.(row) ?? column.render?.(row) ?? '').toLocaleLowerCase().includes(normalized)))
      : rows;
    const filteredByColumns = filters.length ? result.filter((row) => filters.every((filter) => !filterValues[filter.key] || filterValues[filter.key] === filter.value(row))) : result;
    if (!sort) return filteredByColumns;
    const column = columns.find((item) => item.key === sort.key);
    if (!column) return filteredByColumns;
    return [...filteredByColumns].sort((a, b) => {
      const av = column.value?.(a) ?? '';
      const bv = column.value?.(b) ?? '';
      const comparison = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), 'fa');
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  }, [columns, filterValues, filters, query, rows, searchable, sort]);
  const visible = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  const aggregateValue = (column: DataTableColumn<T>) => {
    if (!column.aggregate) return null;
    const values = filtered.map((row) => Number(column.value?.(row))).filter((value) => Number.isFinite(value));
    if (column.aggregate === 'count') return filtered.length;
    if (!values.length) return 0;
    if (column.aggregate === 'sum') return values.reduce((sum, value) => sum + value, 0);
    if (column.aggregate === 'average') return values.reduce((sum, value) => sum + value, 0) / values.length;
    return column.aggregate === 'min' ? Math.min(...values) : Math.max(...values);
  };

  return <Box>
    {(showSearch || toolbar || columns.length > 1) && <Box sx={{ display: 'flex', gap: { xs: 1, sm: 1.5 }, alignItems: 'center', mb: 1.5, flexWrap: 'wrap', minWidth: 0, direction: 'rtl' }}>
      {showSearch && <TextField value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder={searchPlaceholder} sx={{ flex: '1 1 240px', minWidth: { xs: '100%', sm: 220 }, maxWidth: '100%' }} slotProps={{ input: { startAdornment: <InputAdornment position="start">⌕</InputAdornment> } }} />}
      {filters.map((filter) => <FormControl key={filter.key} size="small" sx={{ minWidth: { xs: 0, sm: 150 }, flex: { xs: '1 1 140px', sm: '0 1 auto' }, maxWidth: '100%' }}><InputLabel>{filter.label}</InputLabel><Select label={filter.label} value={filterValues[filter.key] ?? ''} onChange={(event) => { setFilterValues((current) => ({ ...current, [filter.key]: event.target.value })); setPage(0); }}><MenuItem value="">همه</MenuItem>{filter.options.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}</Select></FormControl>)}{toolbar ?? <Button size="small" variant="outlined" startIcon={<Download />} onClick={() => exportCsv(filtered, columns.map((column) => ({ key: column.key, label: column.label, value: column.value ?? (() => '') })), 'export.csv')}>خروجی CSV</Button>}
      {columns.length > 1 && <><Tooltip title="ستون‌ها"><IconButton size="small" onClick={(event) => setColumnAnchor(event.currentTarget)} aria-label="انتخاب ستون‌ها"><ViewColumn fontSize="small" /></IconButton></Tooltip><Menu anchorEl={columnAnchor} open={Boolean(columnAnchor)} onClose={() => setColumnAnchor(null)}>{columns.map((column) => <MenuItem key={column.key} dense onClick={() => setHiddenColumns((current) => current.includes(column.key) ? current.filter((key) => key !== column.key) : current.length >= columns.length - 1 ? current : [...current, column.key])}><Checkbox size="small" checked={!hiddenColumns.includes(column.key)} tabIndex={-1} icon={<Check sx={{ opacity: 0 }} />} checkedIcon={<Check fontSize="small" />} />{column.label}</MenuItem>)}</Menu></>}
    </Box>}
    <Box sx={{ overflowX: 'auto', width: '100%' }}><Table sx={{ minWidth: Math.max(620, visibleColumns.length * 130) }}>
      <TableHead><TableRow>{visibleColumns.map((column) => <TableCell key={column.key} align={column.align}>
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: .25 }}>{column.label}{column.sortable !== false && <IconButton size="small" onClick={() => setSort((current) => current?.key === column.key && current.direction === 'asc' ? { key: column.key, direction: 'desc' } : { key: column.key, direction: 'asc' })}>{sort?.key === column.key ? (sort.direction === 'asc' ? <ArrowUpward sx={{ fontSize: 15 }} /> : <ArrowDownward sx={{ fontSize: 15 }} />) : <UnfoldMore sx={{ fontSize: 15 }} />}</IconButton>}</Box>
      </TableCell>)}</TableRow></TableHead>
      <TableBody>
        {loading ? <TableRow><TableCell colSpan={visibleColumns.length} align="center"><CircularProgress size={26} sx={{ my: 3 }} /></TableCell></TableRow>
          : error ? <TableRow><TableCell colSpan={visibleColumns.length} align="center"><Typography color="error" sx={{ py: 3 }}>{error}</Typography></TableCell></TableRow>
          : visible.length ? <>{visible.map((row, index) => <TableRow hover key={getRowId(row, index)} onClick={() => onRowClick?.(row)} sx={{ cursor: onRowClick ? 'pointer' : undefined }}>{visibleColumns.map((column) => <TableCell key={column.key} align={column.align}>{column.render ? column.render(row) : String(column.value?.(row) ?? '—')}</TableCell>)}</TableRow>)}
            {columns.some((column) => column.aggregate) && <TableRow sx={{ bgcolor: '#F8FAFC' }}>{visibleColumns.map((column) => <TableCell key={column.key} sx={{ fontWeight: 700 }}>{aggregateValue(column) ?? ''}</TableCell>)}</TableRow>}</>
          : <TableRow><TableCell colSpan={visibleColumns.length} align="center"><Typography sx={{ py: 3, fontWeight: 700 }}>{emptyTitle}</Typography><Typography variant="body2" color="text.secondary">{emptyDescription}</Typography></TableCell></TableRow>}
      </TableBody>
    </Table></Box>
    <TablePagination component="div" sx={{ direction: 'rtl' }} count={filtered.length} page={page} onPageChange={(_, nextPage) => setPage(nextPage)} rowsPerPage={rowsPerPage} onRowsPerPageChange={(event) => { setRowsPerPage(Number(event.target.value)); setPage(0); }} rowsPerPageOptions={[5, 10, 25]} labelRowsPerPage="تعداد در صفحه" />
  </Box>;
}
