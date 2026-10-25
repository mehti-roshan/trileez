import { CreateNewFolder, DeleteOutlined, Download, Edit, Favorite, FavoriteBorder, Folder, GridView, RestoreFromTrash, UploadFile, ViewList, Visibility } from '@mui/icons-material';
import { Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import CsvToolbar from '../components/common/CsvToolbar.tsx';
import CustomerVisibilityBadge from '../components/common/CustomerVisibilityBadge.tsx';
import DataTable from '../components/common/DataTable.tsx';
import PageHeader from '../components/common/PageHeader.tsx';
import { fileFolderRepository, projects, users } from '../services/repositories.ts';
import { downloadStoredFile, hydrateFiles, listFiles, persistFileUpdate, uploadStoredFile, type FileMetadata } from '../services/fileService.ts';
import { formatDateTime } from '../utils/format.ts';

const iconFor = (file: FileMetadata) => file.mimeType?.startsWith('image') || file.type?.startsWith('image') ? '🖼️' : file.type?.includes('pdf') ? '📄' : '📎';

export default function FileManagerPage() {
  const [params] = useSearchParams();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileMetadata[]>(() => listFiles().filter((file) => !file.deletedAt));
  const [folders, setFolders] = useState(() => fileFolderRepository.list());
  const [folderId, setFolderId] = useState(params.get('folder') ?? 'root');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'grid' | 'list'>('grid');
  const [selected, setSelected] = useState<FileMetadata | null>(null);
  const [newFolder, setNewFolder] = useState('');
  const [rename, setRename] = useState<FileMetadata | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [trash, setTrash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    const hydrated = await hydrateFiles();
    setFiles(hydrated.filter((file) => !file.deletedAt));
  };

  useEffect(() => {
    refresh().catch((cause) => setError(cause instanceof Error ? cause.message : 'دریافت فایل‌ها ناموفق بود.'));
    return fileFolderRepository.subscribe(setFolders);
  }, []);

  const currentFolder = folders.find((folder) => folder.id === folderId);
  const childFolders = folders.filter((folder) => (folder.parentId ?? 'root') === folderId && !folder.deletedAt);
  const projectFilter = params.get('project');
  const folderFiles = useMemo(
    () => files.filter((file) => (file.folderId ?? 'root') === folderId && (!projectFilter || file.projectId === projectFilter)),
    [files, folderId, projectFilter],
  );
  const visible = useMemo(
    () => folderFiles.filter((file) => `${file.name} ${file.tags?.join(' ') ?? ''}`.toLowerCase().includes(query.toLowerCase())),
    [folderFiles, query],
  );

  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!selectedFiles.length) return;
    setBusy(true);
    setError('');
    try {
      for (const file of selectedFiles) {
        await uploadStoredFile(file, { folderId, projectId: projectFilter ?? undefined, visibility: 'workspace', customerVisible: false });
      }
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'بارگذاری فایل ناموفق بود.');
    } finally {
      setBusy(false);
    }
  };

  const createFolder = async () => {
    if (!newFolder.trim()) return;
    try {
      await fileFolderRepository.create({ name: newFolder.trim(), parentId: folderId, createdAt: new Date().toISOString() });
      setNewFolder('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ایجاد پوشه ناموفق بود.');
    }
  };

  const download = async (file: FileMetadata) => {
    try {
      await downloadStoredFile(file);
      setFiles((current) => current.map((item) => item.id === file.id ? { ...item, downloadCount: (item.downloadCount ?? 0) + 1 } : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'دریافت فایل ناموفق بود.');
    }
  };

  const softDelete = async (file: FileMetadata) => {
    try {
      await persistFileUpdate(file.id, { deletedAt: new Date().toISOString() });
      setFiles((current) => current.filter((item) => item.id !== file.id));
      setSelected(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'انتقال فایل به سطل زباله ناموفق بود.');
    }
  };

  const toggleFavorite = async (file: FileMetadata) => {
    try {
      const updated = await persistFileUpdate(file.id, { favorite: !file.favorite });
      setFiles((current) => current.map((item) => item.id === file.id ? updated : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ویرایش فایل ناموفق بود.');
    }
  };

  const saveRename = async () => {
    if (!rename || !renameValue.trim()) return;
    try {
      const updated = await persistFileUpdate(rename.id, { name: renameValue.trim() });
      setFiles((current) => current.map((item) => item.id === updated.id ? updated : item));
      setRename(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تغییر نام فایل ناموفق بود.');
    }
  };

  const restore = async (file: FileMetadata) => {
    await persistFileUpdate(file.id, { deletedAt: null as unknown as string });
    await refresh();
  };

  const csvColumns = [
    { key: 'name', label: 'نام فایل', value: (file: FileMetadata) => file.name },
    { key: 'type', label: 'نوع', value: (file: FileMetadata) => file.type },
    { key: 'size', label: 'حجم', value: (file: FileMetadata) => file.size },
    { key: 'project', label: 'پروژه', value: (file: FileMetadata) => projects.find((item) => item.id === file.projectId)?.name ?? '' },
    { key: 'visibility', label: 'نمایش به مشتری', value: (file: FileMetadata) => file.customerVisible ? 'بله' : 'خیر' },
  ];

  return <Box>
    <PageHeader title="فایل منیجر" subtitle="فایل‌های ذخیره‌شده در فضای شیء امن SeaweedFS" crumbs={['تری‌لیز', 'فایل منیجر']} actions={<Stack direction="row" spacing={1}><Button component="label" disabled={busy} variant="contained" startIcon={<UploadFile />}>{busy ? 'در حال بارگذاری…' : 'بارگذاری فایل'}<input ref={input} hidden multiple type="file" onChange={upload} /></Button><Button variant="outlined" startIcon={<CreateNewFolder />} onClick={() => void createFolder()}>پوشه جدید</Button></Stack>} />
    {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
    <Card><CardContent>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        {mode === 'grid' && <TextField fullWidth placeholder="جستجو در نام و برچسب فایل‌ها..." value={query} onChange={(event) => setQuery(event.target.value)} />}
        <TextField size="small" placeholder="نام پوشه جدید" value={newFolder} onChange={(event) => setNewFolder(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void createFolder(); }} />
        <Button variant="outlined" onClick={() => setTrash(!trash)} startIcon={<DeleteOutlined />}>سطل زباله</Button>
        <IconButton onClick={() => setMode('grid')} color={mode === 'grid' ? 'primary' : 'default'}><GridView /></IconButton>
        <IconButton onClick={() => setMode('list')} color={mode === 'list' ? 'primary' : 'default'}><ViewList /></IconButton>
        <CsvToolbar rows={folderFiles} entityLabel="فایل‌ها" filename="files.csv" columns={csvColumns} />
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>{currentFolder ? `پوشه: ${currentFolder.name}` : 'ریشه فایل‌ها'}</Typography>
      {trash ? <TrashView onRestore={restore} /> : <>
        {mode === 'list' ? <DataTable rows={folderFiles} getRowId={(file) => file.id} searchPlaceholder="جستجوی فایل..." columns={[
          { key: 'name', label: 'نام', value: (file) => file.name, render: (file) => <Stack direction="row" spacing={1}><Typography>{iconFor(file)}</Typography><Typography sx={{ fontWeight: 700 }}>{file.name}</Typography></Stack> },
          { key: 'type', label: 'نوع', value: (file) => file.type },
          { key: 'size', label: 'حجم', value: (file) => file.size },
          { key: 'project', label: 'پروژه', value: (file) => projects.find((item) => item.id === file.projectId)?.name ?? '—' },
          { key: 'owner', label: 'بارگذاری‌کننده', value: (file) => users.find((item) => item.id === file.uploadedBy)?.name ?? '—' },
          { key: 'visibility', label: 'نمایش به مشتری', value: (file) => file.customerVisible ? 'بله' : 'خیر', render: (file) => <CustomerVisibilityBadge visible={file.customerVisible} /> },
          { key: 'actions', label: 'عملیات', sortable: false, searchable: false, render: (file) => <Stack direction="row"><IconButton onClick={() => setSelected(file)}><Visibility /></IconButton><IconButton onClick={() => download(file)}><Download /></IconButton><IconButton onClick={() => { setRename(file); setRenameValue(file.name); }}><Edit /></IconButton><IconButton color="error" onClick={() => softDelete(file)}><DeleteOutlined /></IconButton></Stack> },
        ]} /> : <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'repeat(2,1fr)', sm: 'repeat(3,1fr)', lg: 'repeat(5,1fr)' } }}>
          {childFolders.map((folder) => <Card key={folder.id} variant="outlined" onDoubleClick={() => setFolderId(folder.id)} sx={{ p: 1.5, cursor: 'pointer' }}><Folder color="warning" sx={{ fontSize: 42 }} /><Typography noWrap sx={{ fontWeight: 700 }}>{folder.name}</Typography><Typography variant="caption">پوشه</Typography></Card>)}
          {visible.map((file) => <Card key={file.id} variant="outlined" sx={{ p: 1.5, cursor: 'pointer' }} onClick={() => setSelected(file)}><Typography sx={{ fontSize: 40 }}>{iconFor(file)}</Typography><Typography noWrap sx={{ fontWeight: 700 }}>{file.name}</Typography><Typography variant="caption" color="text.secondary">{file.size}</Typography><Stack direction="row" spacing={0.25} sx={{ mt: 0.5 }}><IconButton size="small" onClick={(event) => { event.stopPropagation(); void download(file); }}><Download fontSize="small" /></IconButton><IconButton size="small" onClick={(event) => { event.stopPropagation(); void toggleFavorite(file); }}>{file.favorite ? <Favorite fontSize="small" color="error" /> : <FavoriteBorder fontSize="small" />}</IconButton><IconButton size="small" color="error" onClick={(event) => { event.stopPropagation(); void softDelete(file); }}><DeleteOutlined fontSize="small" /></IconButton></Stack></Card>)}
        </Box>}
        {((mode === 'grid' ? !visible.length : !folderFiles.length) && !childFolders.length) && <Alert severity="info">فایلی در این پوشه پیدا نشد. برای شروع فایل یا پوشه جدید اضافه کنید.</Alert>}
      </>}
    </CardContent></Card>
    <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} fullWidth maxWidth="sm"><DialogTitle>{selected?.name}</DialogTitle><DialogContent>{selected && <Stack spacing={0.5} sx={{ mt: 1 }}><Typography>نوع: {selected.type}</Typography><Typography>حجم: {selected.size}</Typography><Typography>بارگذاری‌کننده: {users.find((item) => item.id === selected.uploadedBy)?.name ?? '—'}</Typography><Typography>آخرین تغییر: {formatDateTime(selected.uploadedAt ?? '')}</Typography><CustomerVisibilityBadge visible={selected.customerVisible} /></Stack>}</DialogContent><DialogActions><Button onClick={() => setSelected(null)}>بستن</Button>{selected && <Button variant="contained" startIcon={<Download />} onClick={() => download(selected)}>دریافت</Button>}</DialogActions></Dialog>
    <Dialog open={Boolean(rename)} onClose={() => setRename(null)}><DialogTitle>تغییر نام فایل</DialogTitle><DialogContent><TextField autoFocus fullWidth value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void saveRename(); }} /></DialogContent><DialogActions><Button onClick={() => setRename(null)}>انصراف</Button><Button variant="contained" onClick={saveRename}>ذخیره</Button></DialogActions></Dialog>
  </Box>;
}

function TrashView({ onRestore }: { onRestore: (file: FileMetadata) => Promise<void> }) {
  const deleted = listFiles().filter((file) => file.deletedAt);
  return deleted.length ? <Stack spacing={1}>{deleted.map((file) => <Card key={file.id} variant="outlined"><CardContent><Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}><Typography>{file.name}</Typography><Button startIcon={<RestoreFromTrash />} onClick={() => onRestore(file)}>بازیابی</Button></Stack></CardContent></Card>)}</Stack> : <Alert severity="info">سطل زباله خالی است.</Alert>;
}
