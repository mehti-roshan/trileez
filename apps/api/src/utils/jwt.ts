import jwt from 'jsonwebtoken';
import type { JwtPayload, SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { UserRecord } from '../types/entities.js';

export interface UserTokenPayload extends JwtPayload {
  sub: string;
  role: UserRecord['role'];
  sid: string;
  type: 'access';
}

export function signUserToken(user: Pick<UserRecord, 'id' | 'role'>, sessionId: string, expiresIn = env.jwtExpiresIn): string {
  const options: SignOptions = {
    expiresIn: expiresIn as NonNullable<SignOptions['expiresIn']>,
  };
  return jwt.sign(
    { sub: user.id, role: user.role, sid: sessionId, type: 'access' },
    env.jwtSecret,
    options,
  );
}

export function verifyUserToken(token: string): UserTokenPayload {
  const payload = jwt.verify(token, env.jwtSecret);
  if (typeof payload === 'string' || typeof payload.sub !== 'string' || typeof payload.role !== 'string' || typeof payload.sid !== 'string' || payload.type !== 'access') {
    throw new Error('Invalid token payload');
  }
  return payload as UserTokenPayload;
}
