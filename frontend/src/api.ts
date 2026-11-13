export interface User { id: number; email: string; name: string; role: 'CUSTOMER' | 'ADMIN' }
export interface Product { id: number; name: string; description: string; priceCents: number; stock: number }
export interface CartItem { id: number; quantity: number; product: Product }
export interface Cart { items: CartItem[]; totalCents: number }
export interface OrderItem { id: number; quantity: number; priceCents: number; product: { name: string } }
export interface Order {
  id: number; status: string; totalCents: number; createdAt: string; expiresAt: string;
  items: OrderItem[]; user?: { email: string };
}

export const money = (cents: number) => '₹' + (cents / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });

let tokens: { accessToken: string; refreshToken: string } | null = JSON.parse(localStorage.getItem('tokens') || 'null');
export const getTokens = () => tokens;
export function setTokens(t: typeof tokens) {
  tokens = t;
  if (t) localStorage.setItem('tokens', JSON.stringify(t));
  else localStorage.removeItem('tokens');
}

async function raw(path: string, init: RequestInit = {}) {
  return fetch('/api' + path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(tokens ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
      ...(init.headers || {}),
    },
  });
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res = await raw(path, init);
  if (res.status === 401 && tokens?.refreshToken && !path.startsWith('/auth/')) {
    // Access token expired: rotate the refresh token once and retry.
    const r = await fetch('/api/auth/refresh', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });
    if (r.ok) {
      const d = await r.json();
      setTokens({ accessToken: d.accessToken, refreshToken: d.refreshToken });
      res = await raw(path, init);
    } else {
      setTokens(null);
    }
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Something went wrong');
  return body as T;
}

export const post = <T,>(path: string, data?: unknown, headers?: Record<string, string>) =>
  api<T>(path, { method: 'POST', body: data ? JSON.stringify(data) : undefined, headers });
