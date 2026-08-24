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
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'flex-start', mb: 3, flexWrap: 'wrap' }}>
      <Box>
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
      {actions}
    </Box>
  );
}
