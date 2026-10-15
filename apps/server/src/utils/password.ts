import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { RequestValidationError } from '../middleware/validate.js';

export const passwordPolicy = {
  minLength: 12,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSymbol: true,
} as const;

const commonPasswords = new Set(['password', 'password123', 'admin123', 'qwerty123', '123456789', 'letmein123']);

export function passwordPolicyIssues(password: string, context: { email?: string; name?: string } = {}): string[] {
  const issues: string[] = [];
  if (password.length < passwordPolicy.minLength) issues.push(`Must contain at least ${passwordPolicy.minLength} characters`);
  if (password.length > passwordPolicy.maxLength) issues.push(`Must contain at most ${passwordPolicy.maxLength} characters`);
  if (!/[A-Z]/.test(password)) issues.push('Must contain an uppercase letter');
  if (!/[a-z]/.test(password)) issues.push('Must contain a lowercase letter');
  if (!/\d/.test(password)) issues.push('Must contain a number');
  if (!/[^A-Za-z0-9]/.test(password)) issues.push('Must contain a symbol');
  if (/\s/.test(password)) issues.push('Must not contain whitespace');
  if (commonPasswords.has(password.toLowerCase())) issues.push('Password is too common');
  const emailPrefix = context.email?.split('@')[0]?.toLowerCase();
  if (emailPrefix && emailPrefix.length >= 4 && password.toLowerCase().includes(emailPrefix)) issues.push('Must not contain the email name');
  const nameParts = context.name?.toLowerCase().split(/\s+/).filter((part) => part.length >= 4) || [];
  if (nameParts.some((part) => password.toLowerCase().includes(part))) issues.push('Must not contain the user name');
  return issues;
}

export function assertPasswordPolicy(password: string, context: { email?: string; name?: string } = {}, path = 'body.password'): void {
  const issues = passwordPolicyIssues(password, context);
  if (issues.length) throw new RequestValidationError(issues.map((message) => ({ location: 'body', path, code: 'password_policy', message })));
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

const categories = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%^&*_-+='];
const alphabet = categories.join('');
export function generatePassword(length = 24): string {
  if (length < passwordPolicy.minLength) throw new Error(`Generated passwords must contain at least ${passwordPolicy.minLength} characters`);
  const characters = categories.map((category) => category[randomInt(category.length)]!);
  while (characters.length < length) characters.push(alphabet[randomInt(alphabet.length)]!);
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex]!, characters[index]!];
  }
  return characters.join('');
}
