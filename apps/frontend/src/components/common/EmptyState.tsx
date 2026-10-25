import { Box, Typography } from '@mui/material';
import type { ReactNode } from 'react';

export default function EmptyState({ title, description, icon }: { title: string; description: string; icon?: ReactNode }) {
  return (
    <Box sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
      {icon}
      <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary', mt: 1 }}>
        {title}
      </Typography>
      <Typography variant="body2">{description}</Typography>
    </Box>
  );
}
