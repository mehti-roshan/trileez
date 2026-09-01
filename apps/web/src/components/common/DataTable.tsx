import { ArrowDownward, ArrowUpward, Check, Clear, Download, FilterAltOutlined, UnfoldMore, Upload, ViewColumn } from '@mui/icons-material';
import { Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, IconButton, InputAdornment, InputLabel, Menu, MenuItem, Select, Stack, Table, TableBody, TableCell, TableHead, TablePagination, TableRow, TextField, Tooltip, Typography } from '@mui/material';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { exportCsv, parseCsv } from '../../services/csv.ts';

export type DataTableColumn<T> = {
  key: string;
  label: string;
  sortable?: boolean;
  searchable?: boolean;
  align?: 'left' | 'right' | 'center';
  render?: (row: T) => ReactNode;
  value?: (row: T) => string | number | null | undefined;
  aggregate?: 'count' | 'sum' | 'average' | 'min' | 'max';
  groupable?: boolean;
};
export type DataTableFilter<T> = { key: string; label: string; options: { value: string; label: string }[]; value: (row: T) => string };
/** CsvToolbar uses this marker to avoid rendering a second CSV toolbar inside a DataTable. */

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
  selectable?: boolean;
  onSelectionChange?: (rows: T[]) => void;
  bulkActions?: ReactNode;
  groupBy?: string;
  onGroupByChange?: (key: string) => void;
  csvFilename?: string;
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
  selectable = false,
  onSelectionChange,
  bulkActions,
  groupBy = '',
  onGroupByChange,
  csvFilename = 'export.csv',
}: Props<T>) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(pageSize);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [columnFilterValues, setColumnFilterValues] = useState<Record<string, string[]>>({});
  const [columnFilterSearch, setColumnFilterSearch] = useState('');
  const [hiddenColumns, setHiddenColumns] = useState<string[]>(initialHiddenColumns);
  const [columnAnchor, setColumnAnchor] = useState<HTMLElement | null>(null);
  const [columnFilterKey, setColumnFilterKey] = useState<string | null>(null);
  const [filterAnchor, setFilterAnchor] = useState<HTMLElement | null>(null);
  const [importPreview, setImportPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [importedRows, setImportedRows] = useState<T[]>([]);
  const importInput = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const sourceRows = useMemo(() => importedRows.length ? [...importedRows, ...rows] : rows, [importedRows, rows]);
  const visibleColumns = columns.filter((column) => !hiddenColumns.includes(column.key));
  const searchable = columns.filter((column) => column.searchable !== false);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const result = normalized
      ? sourceRows.filter((row) => searchable.some((column) => String(column.value?.(row) ?? column.render?.(row) ?? '').toLocaleLowerCase().includes(normalized)))
      : sourceRows;
    const filteredByColumns = result
      .filter((row) => filters.every((filter) => !filterValues[filter.key] || filterValues[filter.key] === filter.value(row)))
      .filter((row) => columns.every((column) => {
        const selected = columnFilterValues[column.key];
        if (!selected?.length) return true;
        const raw = column.value?.(row);
        const value = raw === null || raw === undefined || raw === '' ? '__empty__' : String(raw);
        return selected.includes(value);
      }));
    if (!sort) return filteredByColumns;
    const column = columns.find((item) => item.key === sort.key);
    if (!column) return filteredByColumns;
    return [...filteredByColumns].sort((a, b) => {
      const av = column.value?.(a) ?? '';
      const bv = column.value?.(b) ?? '';
      const comparison = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), 'fa');
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  }, [columnFilterValues, columns, filterValues, filters, query, searchable, sort, sourceRows]);
  const visible = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  const selectedRows = sourceRows.filter((row, index) => selectedIds.includes(getRowId(row, index)));
  const toggleSelection = (row: T, index: number) => {
    const id = getRowId(row, index);
    setSelectedIds((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      onSelectionChange?.(sourceRows.filter((item, itemIndex) => next.includes(getRowId(item, itemIndex))));
      return next;
    });
  };
  const groupedRows = groupBy
    ? visible.reduce<Array<{ group: string; rows: T[] }>>((groups, row) => {
      const column = columns.find((item) => item.key === groupBy);
      const value = String(column?.value?.(row) ?? '—');
      const existing = groups.find((item) => item.group === value);
      if (existing) existing.rows.push(row);
      else groups.push({ group: value, rows: [row] });
      return groups;
    }, [])
    : [{ group: '', rows: visible }];
  const aggregateValue = (column: DataTableColumn<T>) => {
    if (!column.aggregate) return null;
    const values = filtered.map((row) => Number(column.value?.(row))).filter((value) => Number.isFinite(value));
    if (column.aggregate === 'count') return filtered.length;
    if (!values.length) return 0;
    if (column.aggregate === 'sum') return values.reduce((sum, value) => sum + value, 0);
    if (column.aggregate === 'average') return values.reduce((sum, value) => sum + value, 0) / values.length;
    return column.aggregate === 'min' ? Math.min(...values) : Math.max(...values);
  };
  const activeFilterCount = Object.values(columnFilterValues).filter((values) => values.length > 0).length;
  const filterColumn = columnFilterKey ? columns.find((column) => column.key === columnFilterKey) : undefined;
  const columnOptions = useMemo(() => {
    if (!filterColumn) return [];
    const values = new Set<string>();
    sourceRows.forEach((row) => {
      const raw = filterColumn.value?.(row);
      values.add(raw === null || raw === undefined || raw === '' ? '__empty__' : String(raw));
    });
    return Array.from(values).sort((a, b) => (a === '__empty__' ? -1 : b === '__empty__' ? 1 : a.localeCompare(b, 'fa')));
  }, [filterColumn, sourceRows]);
  const visibleColumnOptions = columnOptions.filter((value) => (value === '__empty__' ? 'خالی' : value).toLocaleLowerCase().includes(columnFilterSearch.trim().toLocaleLowerCase()));
  const selectedColumnValues = columnFilterKey ? (columnFilterValues[columnFilterKey] ?? []) : [];
  const setColumnSelection = (values: string[]) => {
    if (!columnFilterKey) return;
    setColumnFilterValues((current) => ({ ...current, [columnFilterKey]: values }));
    setPage(0);
  };

  return <Box>
    {(showSearch || toolbar || columns.length > 1) && <Box sx={{ display: 'flex', gap: { xs: 1, sm: 1.5 }, alignItems: 'center', mb: 1.5, flexWrap: 'wrap', minWidth: 0, direction: 'rtl' }}>
      {showSearch && <TextField value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder={searchPlaceholder} slotProps={{ htmlInput: { 'aria-label': searchPlaceholder }, input: { startAdornment: <InputAdornment position="start">⌕</InputAdornment>, endAdornment: query ? <InputAdornment position="end"><IconButton size="small" aria-label="پاک کردن جستجو" onClick={() => { setQuery(''); setPage(0); }}><Clear fontSize="small" /></IconButton></InputAdornment> : undefined } }} sx={{ flex: '1 1 240px', minWidth: { xs: '100%', sm: 220 }, maxWidth: '100%' }} />}
      {filters.map((filter) => <FormControl key={filter.key} size="small" sx={{ minWidth: { xs: 0, sm: 150 }, flex: { xs: '1 1 140px', sm: '0 1 auto' }, maxWidth: '100%' }}><InputLabel>{filter.label}</InputLabel><Select label={filter.label} value={filterValues[filter.key] ?? ''} onChange={(event) => { setFilterValues((current) => ({ ...current, [filter.key]: event.target.value })); setPage(0); }}><MenuItem value="">همه</MenuItem>{filter.options.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}</Select></FormControl>)}{onGroupByChange && <FormControl size="small" sx={{ minWidth: 150 }}><InputLabel>گروه‌بندی</InputLabel><Select label="گروه‌بندی" size="small" value={groupBy} onChange={(event) => onGroupByChange(event.target.value)}><MenuItem value="">بدون گروه‌بندی</MenuItem>{columns.filter((column) => column.groupable).map((column) => <MenuItem key={column.key} value={column.key}>{column.label}</MenuItem>)}</Select></FormControl>}{(query || Object.values(filterValues).some(Boolean) || activeFilterCount > 0) && <Button size="small" startIcon={<Clear />} onClick={() => { setQuery(''); setFilterValues({}); setColumnFilterValues({}); setPage(0); }}>پاک کردن فیلترها</Button>}{toolbar ?? <Button size="small" variant="outlined" startIcon={<Download />} onClick={() => exportCsv(filtered, columns.map((column) => ({ key: column.key, label: column.label, value: column.value ?? (() => '') })), csvFilename)}>خروجی CSV</Button>}{!toolbar && <><input ref={importInput} hidden type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onload = () => setImportPreview(parseCsv(String(reader.result))); reader.readAsText(file, 'UTF-8'); } event.target.value = ''; }} /><Button size="small" variant="outlined" startIcon={<Upload />} onClick={() => importInput.current?.click()}>ورود CSV</Button></>}{bulkActions}
      {columns.length > 1 && <><Tooltip title="ستون‌ها"><IconButton size="small" onClick={(event) => { event.stopPropagation(); setColumnAnchor(event.currentTarget); }} aria-label="انتخاب ستون‌ها"><ViewColumn fontSize="small" /></IconButton></Tooltip><Menu anchorEl={columnAnchor} open={Boolean(columnAnchor)} onClose={() => setColumnAnchor(null)}>{columns.map((column) => <MenuItem key={column.key} dense onClick={() => setHiddenColumns((current) => current.includes(column.key) ? current.filter((key) => key !== column.key) : current.length >= columns.length - 1 ? current : [...current, column.key])}><Checkbox size="small" checked={!hiddenColumns.includes(column.key)} tabIndex={-1} icon={<Check sx={{ opacity: 0 }} />} checkedIcon={<Check fontSize="small" />} />{column.label}</MenuItem>)}<Divider /><MenuItem dense onClick={() => setHiddenColumns([])}>بازنشانی ستون‌ها</MenuItem></Menu></>}
    </Box>}
    <Box sx={{ overflowX: 'auto', width: '100%' }}><Table sx={{ minWidth: Math.max(620, visibleColumns.length * 130) }}>
      <TableHead><TableRow>{selectable && <TableCell padding="checkbox"><Checkbox checked={Boolean(filtered.length) && selectedRows.length === filtered.length} indeterminate={selectedRows.length > 0 && selectedRows.length < filtered.length} onChange={(event) => { const next = event.target.checked ? filtered.map((row, index) => getRowId(row, index)) : []; setSelectedIds(next); onSelectionChange?.(event.target.checked ? filtered : []); }} slotProps={{ input: { 'aria-label': 'انتخاب همه ردیف‌ها' } }} /></TableCell>}{visibleColumns.map((column) => <TableCell key={column.key} align={column.align} sx={{ whiteSpace: 'nowrap' }}>
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: .25 }}>{column.label}{column.sortable !== false && <IconButton size="small" aria-label={`مرتب‌سازی بر اساس ${column.label}`} onClick={(event) => { event.stopPropagation(); setSort((current) => current?.key === column.key && current.direction === 'asc' ? { key: column.key, direction: 'desc' } : { key: column.key, direction: 'asc' }); }}>{sort?.key === column.key ? (sort.direction === 'asc' ? <ArrowUpward sx={{ fontSize: 15 }} /> : <ArrowDownward sx={{ fontSize: 15 }} />) : <UnfoldMore sx={{ fontSize: 15 }} />}</IconButton>}<Tooltip title={`فیلتر ستون ${column.label}`}><IconButton size="small" aria-label={`فیلتر ستون ${column.label}`} color={columnFilterValues[column.key]?.length ? 'primary' : 'default'} onClick={(event) => { event.stopPropagation(); setColumnFilterKey(column.key); setColumnFilterSearch(''); setFilterAnchor(event.currentTarget); }}><FilterAltOutlined sx={{ fontSize: 15 }} /></IconButton></Tooltip></Box>
      </TableCell>)}</TableRow></TableHead>
      <TableBody>
        {loading ? <TableRow><TableCell colSpan={visibleColumns.length + (selectable ? 1 : 0)} align="center"><CircularProgress size={26} sx={{ my: 3 }} /></TableCell></TableRow>
          : error ? <TableRow><TableCell colSpan={visibleColumns.length + (selectable ? 1 : 0)} align="center"><Typography color="error" sx={{ py: 3 }}>{error}</Typography></TableCell></TableRow>
          : visible.length ? <>{groupedRows.flatMap((group) => [
            ...(groupBy ? [<TableRow key={`group-${group.group}`} sx={{ bgcolor: '#F8FAFC' }}><TableCell colSpan={visibleColumns.length + (selectable ? 1 : 0)} sx={{ fontWeight: 800 }}>{group.group} ({group.rows.length})</TableCell></TableRow>] : []),
            ...group.rows.map((row, index) => <TableRow hover key={getRowId(row, index)} onClick={() => onRowClick?.(row)} sx={{ cursor: onRowClick ? 'pointer' : undefined }}>{selectable && <TableCell padding="checkbox" onClick={(event) => event.stopPropagation()}><Checkbox checked={selectedIds.includes(getRowId(row, index))} onChange={() => toggleSelection(row, index)} /></TableCell>}{visibleColumns.map((column) => <TableCell key={column.key} align={column.align}>{column.render ? column.render(row) : String(column.value?.(row) ?? '—')}</TableCell>)}</TableRow>),
          ])}
            {columns.some((column) => column.aggregate) && <TableRow sx={{ bgcolor: '#F8FAFC' }}>{selectable && <TableCell />}{visibleColumns.map((column) => <TableCell key={column.key} sx={{ fontWeight: 700 }}>{aggregateValue(column) ?? ''}</TableCell>)}</TableRow>}</>
          : <TableRow><TableCell colSpan={visibleColumns.length + (selectable ? 1 : 0)} align="center"><Typography sx={{ py: 3, fontWeight: 700 }}>{emptyTitle}</Typography><Typography variant="body2" color="text.secondary">{emptyDescription}</Typography></TableCell></TableRow>}
      </TableBody>
    </Table></Box>
    <TablePagination component="div" sx={{ direction: 'rtl' }} count={filtered.length} page={page} onPageChange={(_, nextPage) => setPage(nextPage)} rowsPerPage={rowsPerPage} onRowsPerPageChange={(event) => { setRowsPerPage(Number(event.target.value)); setPage(0); }} rowsPerPageOptions={[5, 10, 25, 50, 100]} labelRowsPerPage="تعداد در صفحه" />
    {columnFilterKey && <Menu anchorEl={filterAnchor} open={Boolean(filterAnchor)} onClose={() => { setFilterAnchor(null); setColumnFilterKey(null); setColumnFilterSearch(''); }}><Box sx={{ p: 1.25, width: 280, maxHeight: 430, direction: 'rtl' }} onClick={(event) => event.stopPropagation()}><Typography variant="caption" color="text.secondary">فیلتر بر اساس</Typography><Typography sx={{ fontWeight: 800, mb: 1 }}>{filterColumn?.label}</Typography><TextField autoFocus fullWidth size="small" placeholder="جستجو در مقادیر..." value={columnFilterSearch} onChange={(event) => setColumnFilterSearch(event.target.value)} sx={{ mb: 1 }} slotProps={{ input: { startAdornment: <InputAdornment position="start">⌕</InputAdornment> } }} /><Stack direction="row" sx={{ mb: .5, justifyContent: 'space-between', alignItems: 'center' }}><Button size="small" onClick={() => setColumnSelection(columnOptions)}>انتخاب همه</Button><Button size="small" color="inherit" onClick={() => setColumnSelection([])}>پاک کردن همه</Button></Stack><Divider />{visibleColumnOptions.length ? <Box sx={{ maxHeight: 245, overflowY: 'auto', py: .5 }}>{visibleColumnOptions.map((value) => { const checked = selectedColumnValues.includes(value); return <MenuItem key={value} dense sx={{ borderRadius: 1 }} onClick={() => setColumnSelection(checked ? selectedColumnValues.filter((item) => item !== value) : [...selectedColumnValues, value])}><Checkbox size="small" checked={checked} tabIndex={-1} />{value === '__empty__' ? 'خالی' : value}</MenuItem>; })}</Box> : <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>مقداری برای نمایش وجود ندارد</Typography>}<Divider sx={{ mt: .5 }} /><Button fullWidth size="small" color="inherit" onClick={() => setColumnSelection([])}>بازنشانی فیلتر ستون</Button></Box></Menu>}
    <Dialog open={Boolean(importPreview)} onClose={() => setImportPreview(null)} fullWidth maxWidth="md"><DialogTitle>پیش‌نمایش ورود CSV</DialogTitle><DialogContent><Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>ستون‌های شناسایی‌شده: {importPreview?.headers.join('، ')} • {importPreview?.rows.length.toLocaleString('fa-IR')} رکورد</Typography><Table size="small"><TableHead><TableRow>{importPreview?.headers.map((header) => <TableCell key={header}>{header}</TableCell>)}</TableRow></TableHead><TableBody>{importPreview?.rows.slice(0, 6).map((row, index) => <TableRow key={index}>{importPreview.headers.map((_, cell) => <TableCell key={cell}>{row[cell] || '—'}</TableCell>)}</TableRow>)}</TableBody></Table></DialogContent><DialogActions><Button onClick={() => setImportPreview(null)}>انصراف</Button><Button variant="contained" onClick={() => { if (!importPreview) return; const mapped = importPreview.rows.map((row) => Object.fromEntries(columns.map((column, cell) => [column.key, row[importPreview.headers.indexOf(column.label)] ?? row[cell] ?? ''])) as T); setImportedRows((current) => [...mapped, ...current]); setImportPreview(null); }}>تایید ورود</Button></DialogActions></Dialog>
  </Box>;
}
