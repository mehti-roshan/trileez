import { Box, Breadcrumbs, Typography } from '@mui/material';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  crumbs?: string[];
  actions?: ReactNode;
}

export default function PageHeader({ title, subtitle, crumbs, actions }: PageHeaderProps) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: { xs: 1.5, sm: 2.5 }, alignItems: { xs: 'stretch', sm: 'flex-start' }, mb: { xs: 2, sm: 3 }, flexWrap: 'wrap', minWidth: 0 }}>
      <Box sx={{ minWidth: 0, flex: '1 1 260px' }}>
        {crumbs?.length ? (
          <Breadcrumbs sx={{ mb: 0.75, '& .MuiBreadcrumbs-separator': { mx: 1 } }}>
            {crumbs.map((crumb) => (
              <Typography key={crumb} variant="caption" color="text.secondary">
                {crumb}
              </Typography>
            ))}
          </Breadcrumbs>
        ) : null}
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        {subtitle ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {subtitle}
          </Typography>
        ) : null}
      </Box>
      {actions ? <Box sx={{ minWidth: 0, maxWidth: '100%', flex: '0 1 auto', display: 'flex', flexWrap: 'wrap', justifyContent: { xs: 'flex-start', sm: 'flex-end' }, gap: 1, '& > *': { minWidth: 0, maxWidth: '100%' } }}>{actions}</Box> : null}
    </Box>
  );
}
