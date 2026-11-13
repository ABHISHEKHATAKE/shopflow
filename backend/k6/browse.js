// Read-path load test showing Redis caching. Run: k6 run browse.js
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [{ duration: '10s', target: 100 }, { duration: '30s', target: 100 }, { duration: '5s', target: 0 }],
  thresholds: { http_req_duration: ['p(95)<100'], http_req_failed: ['rate<0.01'] },
};

export default function () {
  const res = http.get(`${__ENV.BASE || 'http://localhost:4000'}/api/products?page=1&limit=12`);
  check(res, { 'status 200': (r) => r.status === 200 });
}
