import { Avatar } from '@mui/material';
import type { User } from '../../types/index.ts';

const palette = ['#1E3A8A', '#047857', '#B45309', '#7C3AED', '#0E7490'];

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
}

export default function UserAvatar({ user, size = 36 }: { user?: Pick<User, 'name' | 'avatar'> | null; size?: number }) {
  if (!user) {
    return <Avatar sx={{ width: size, height: size, fontSize: size * 0.36 }}>؟</Avatar>;
  }

  const color = palette[user.name.length % palette.length];

  return (
    <Avatar src={user.avatar} sx={{ width: size, height: size, bgcolor: color, fontSize: size * 0.36, fontWeight: 700 }}>
      {initials(user.name)}
    </Avatar>
  );
}
