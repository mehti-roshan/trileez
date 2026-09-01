import { currentUser } from '../mock/data.ts';
import type { User } from '../types/index.ts';

/** Replace this provider with the authenticated-user endpoint when the backend is introduced. */
export function getCurrentUser(): User {
  return currentUser;
}
