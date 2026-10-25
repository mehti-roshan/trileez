import { Chip } from '@mui/material';

/** Shared, Persian indicator for the canonical customerVisible flag. */
export default function CustomerVisibilityBadge({ visible }: { visible?: boolean }) {
  return <Chip size="small" color={visible ? 'success' : 'default'} variant={visible ? 'filled' : 'outlined'} label={visible ? 'قابل مشاهده برای مشتری' : 'داخلی'} />;
}
