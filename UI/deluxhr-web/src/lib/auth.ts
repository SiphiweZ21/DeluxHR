type AuthUser = {
  id: string;
  email: string;
  role: string;
  organizationId: string | null;
};

export function saveAuth(token: string, user?: AuthUser) {
  if (typeof window === 'undefined') return;

  localStorage.setItem('token', token);

  if (user) {
    localStorage.setItem('user', JSON.stringify(user));
  }

  document.cookie = `deluxhr_token=${token}; path=/; max-age=${60 * 60}; samesite=lax`;
}

export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

export function getUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;

  const rawUser = localStorage.getItem('user');
  if (!rawUser) return null;

  try {
    return JSON.parse(rawUser) as AuthUser;
  } catch {
    return null;
  }
}

export function logout() {
  if (typeof window === 'undefined') return;

  localStorage.removeItem('token');
  localStorage.removeItem('user');
  document.cookie = 'deluxhr_token=; path=/; max-age=0; samesite=lax';
}

export function isAuthenticated() {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem('token');
}
export function homeForRole(role?: string) { return role === 'PLATFORM_ADMIN' || role === 'SUPER_ADMIN' ? '/platform-admin' : '/dashboard'; }
