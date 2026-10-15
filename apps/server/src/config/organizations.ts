export const DEFAULT_ORGANIZATION_ID = 'org1';

export function requireOrganizationId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Authenticated user is missing an organization');
  return value;
}
