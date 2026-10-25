import { Alert, Autocomplete, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, Snackbar, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useState } from 'react';
import { customerRepository } from '../../services/repositories.ts';
import type { Customer, CustomerEntityType } from '../../types/index.ts';
import { customerDisplayName, customerEntityType } from '../../utils/customer.ts';

type Props = {
  open: boolean;
  customer?: Customer;
  onClose: () => void;
  onSaved?: (customer: Customer) => void;
};

type FormState = {
  entityType: CustomerEntityType;
  displayName: string;
  nationalCode: string;
  vatRegistrationNumber: string;
  phone: string;
  website: string;
  groups: string[];
  currency: string;
  address: string;
  province: string;
  city: string;
  postalCode: string;
  country: string;
};

const emptyState = (): FormState => ({ entityType: 'company', displayName: '', nationalCode: '', vatRegistrationNumber: '', phone: '', website: '', groups: [], currency: 'IRR', address: '', province: '', city: '', postalCode: '', country: 'ایران' });

function stateOf(customer?: Customer): FormState {
  if (!customer) return emptyState();
  return {
    entityType: customerEntityType(customer),
    displayName: customerDisplayName(customer),
    nationalCode: customer.nationalCode ?? '',
    vatRegistrationNumber: customer.vatRegistrationNumber ?? '',
    phone: customer.phone ?? '',
    website: customer.website ?? '',
    groups: customer.groups ?? [],
    currency: customer.currency ?? 'IRR',
    address: customer.address ?? '',
    province: customer.province ?? '',
    city: customer.city ?? '',
    postalCode: customer.postalCode ?? '',
    country: customer.country ?? 'ایران',
  };
}

export default function CustomerFormDialog({ open, customer, onClose, onSaved }: Props) {
  const [values, setValues] = useState<FormState>(() => stateOf(customer));
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setValues((current) => ({ ...current, [key]: value }));
  const close = () => { setValues(stateOf(customer)); onClose(); };
  const submit = async () => {
    const displayName = values.displayName.trim();
    if (!displayName || submitting) return;
    setSubmitting(true);
    const shared = {
      entityType: values.entityType,
      name: displayName,
      company: displayName,
      nationalCode: values.nationalCode.trim() || undefined,
      vatRegistrationNumber: values.vatRegistrationNumber.trim() || undefined,
      phone: values.phone.trim(),
      website: values.website.trim() || undefined,
      groups: values.groups.map((group) => group.trim()).filter(Boolean),
      currency: values.currency,
      address: values.address.trim() || undefined,
      province: values.province.trim() || undefined,
      city: values.city.trim() || undefined,
      postalCode: values.postalCode.trim() || undefined,
      country: values.country.trim() || undefined,
    };
    try {
      const result = customer
        ? await customerRepository.update(customer.id, shared)
        : await customerRepository.create({ ...shared, email: '', status: 'active', value: 0, lastContact: new Date().toISOString(), assignedTo: 'u1' });
      if (!result) return;
      setSaved(true);
      onSaved?.(result);
      setValues(customer ? stateOf(result) : emptyState());
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const textField = (key: keyof Pick<FormState, 'displayName' | 'nationalCode' | 'vatRegistrationNumber' | 'phone' | 'website' | 'address' | 'province' | 'city' | 'postalCode' | 'country'>, label: string, ltr = false, multiline = false) => (
    <TextField fullWidth required={key === 'displayName'} label={label} value={values[key]} onChange={(event) => set(key, event.target.value)} multiline={multiline} minRows={multiline ? 3 : undefined} slotProps={{ htmlInput: { dir: ltr ? 'ltr' : 'rtl' } }} sx={{ '& .MuiInputBase-input, & textarea': { direction: ltr ? 'ltr' : 'rtl', textAlign: ltr ? 'left' : 'right' } }} />
  );

  return <>
    <Dialog open={open} onClose={submitting ? undefined : close} fullWidth maxWidth="md" slotProps={{ paper: { sx: { direction: 'rtl', width: 'calc(100% - 16px)', maxHeight: 'calc(100vh - 24px)', m: 1 } } }}>
      <DialogTitle sx={{ textAlign: 'right' }}>{customer ? 'ویرایش مشتری' : 'ایجاد مشتری جدید'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <Stack spacing={1}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>نوع و شناسه مشتری</Typography>
            <ToggleButtonGroup exclusive fullWidth value={values.entityType} onChange={(_, value: CustomerEntityType | null) => value && set('entityType', value)} color="primary">
              <ToggleButton value="person">شخص حقیقی</ToggleButton>
              <ToggleButton value="company">شرکت</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} useFlexGap>
            {textField('displayName', values.entityType === 'company' ? 'نام شرکت' : 'نام شخص')}
            {textField('nationalCode', values.entityType === 'company' ? 'کد اقتصادی' : 'شناسه ملی / کد ملی', true)}
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} useFlexGap>
            {textField('vatRegistrationNumber', 'شماره ثبت مالیات بر ارزش افزوده', true)}
            {textField('phone', 'شماره موبایل', true)}
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} useFlexGap>
            {textField('website', 'وب‌سایت', true)}
            <FormControl fullWidth><InputLabel>ارز</InputLabel><Select label="ارز" value={values.currency} onChange={(event) => set('currency', event.target.value)}>
              <MenuItem value="IRR">ریال ایران (IRR)</MenuItem><MenuItem value="USD">دلار آمریکا (USD)</MenuItem><MenuItem value="EUR">یورو (EUR)</MenuItem><MenuItem value="AED">درهم امارات (AED)</MenuItem>
            </Select></FormControl>
          </Stack>
          <Autocomplete multiple freeSolo options={['مشتریان کلیدی', 'سازمانی', 'همکار تجاری', 'داخلی', 'بین‌المللی']} value={values.groups} onChange={(_, value) => set('groups', value)} renderInput={(params) => <TextField {...params} label="گروه‌ها" placeholder="نام گروه را وارد کنید" />} />
          <Typography variant="subtitle2" sx={{ fontWeight: 800, pt: 0.5 }}>نشانی</Typography>
          {textField('address', 'آدرس', false, true)}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} useFlexGap>
            {textField('province', 'استان')}{textField('city', 'شهر')}
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} useFlexGap>
            {textField('postalCode', 'کد پستی', true)}{textField('country', 'کشور')}
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1, direction: 'rtl' }}><Button onClick={close} disabled={submitting}>انصراف</Button><Button variant="contained" onClick={submit} disabled={!values.displayName.trim() || submitting}>{submitting ? 'در حال ذخیره…' : customer ? 'ذخیره تغییرات' : 'ذخیره مشتری'}</Button></DialogActions>
    </Dialog>
    <Snackbar open={saved} autoHideDuration={3000} onClose={() => setSaved(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}><Alert severity="success" onClose={() => setSaved(false)}>اطلاعات مشتری با موفقیت ذخیره شد.</Alert></Snackbar>
  </>;
}
