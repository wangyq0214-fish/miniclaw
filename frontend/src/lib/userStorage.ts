/**
 * User-scoped localStorage helpers.
 *
 * All learning-progress keys are suffixed with the current user ID
 * so that different users sharing the same browser don't see each
 * other's data.
 */

function userSuffix(): string {
  if (typeof window === 'undefined') return '';
  const uid = localStorage.getItem('miniclaw_user_id');
  return uid ? `_${uid}` : '';
}

export function userKey(key: string): string {
  return key + userSuffix();
}

export function getUserItem(key: string): string | null {
  return localStorage.getItem(userKey(key));
}

export function setUserItem(key: string, value: string): void {
  localStorage.setItem(userKey(key), value);
}

export function removeUserItem(key: string): void {
  localStorage.removeItem(userKey(key));
}
