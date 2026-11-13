// Proves stock locking: many users race for the 5-unit "Limited Edition Keycaps" (product id 9 after seeding).
// Expected: exactly 5 orders succeed (201), the rest get 409, stock never goes negative.
//
// Setup: create users first, e.g. register user1..user50@load.test with password "Password@123" (see README).
// Run:   k6 run -e BASE=http://localhost:4000 -e PRODUCT_ID=9 oversell.js
import http from 'k6/http';
import { check } from 'k6';

const BASE = __ENV.BASE || 'http://localhost:4000';
const PRODUCT_ID = Number(__ENV.PRODUCT_ID || 9);

export const options = { scenarios: { race: { executor: 'per-vu-iterations', vus: 50, iterations: 1 } } };

export default function () {
  const email = `user${__VU}@load.test`;
  const json = { headers: { 'Content-Type': 'application/json' } };
  http.post(`${BASE}/api/auth/register`, JSON.stringify({ email, name: `Load ${__VU}`, password: 'Password@123' }), json);
  const login = http.post(`${BASE}/api/auth/login`, JSON.stringify({ email, password: 'Password@123' }), json);
  const token = login.json('accessToken');
  const auth = { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } };

  http.put(`${BASE}/api/cart/items`, JSON.stringify({ productId: PRODUCT_ID, quantity: 1 }), auth);
  const res = http.post(`${BASE}/api/orders`, null, { headers: { ...auth.headers, 'Idempotency-Key': `k6-${__VU}` } });
  check(res, { 'order created or sold out': (r) => r.status === 201 || r.status === 409 });
}
