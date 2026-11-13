const bearer = [{ bearerAuth: [] }];
export const openapi = {
  openapi: '3.0.3',
  info: { title: 'ShopFlow API', version: '1.0.0', description: 'E-commerce order and payment backend' },
  components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
  paths: {
    '/api/auth/register': { post: { summary: 'Create account', tags: ['Auth'] } },
    '/api/auth/login': { post: { summary: 'Log in, returns access + refresh tokens', tags: ['Auth'] } },
    '/api/auth/refresh': { post: { summary: 'Rotate refresh token', tags: ['Auth'] } },
    '/api/products': {
      get: { summary: 'List products (search, page, limit). Redis-cached; see X-Cache header', tags: ['Products'] },
      post: { summary: 'Create product (admin)', tags: ['Products'], security: bearer },
    },
    '/api/cart': { get: { summary: 'Get cart', tags: ['Cart'], security: bearer } },
    '/api/cart/items': { put: { summary: 'Set quantity for a product (0 removes)', tags: ['Cart'], security: bearer } },
    '/api/orders': {
      post: { summary: 'Create order from cart. Send Idempotency-Key header. Locks stock.', tags: ['Orders'], security: bearer },
      get: { summary: 'My orders', tags: ['Orders'], security: bearer },
    },
    '/api/orders/{id}/cancel': { post: { summary: 'Cancel an order and restock', tags: ['Orders'], security: bearer } },
    '/api/payments/{orderId}/create': { post: { summary: 'Create gateway order for checkout', tags: ['Payments'], security: bearer } },
    '/api/payments/verify': { post: { summary: 'Verify Razorpay checkout signature', tags: ['Payments'], security: bearer } },
    '/api/payments/{orderId}/mock-pay': { post: { summary: 'Simulate payment (mock mode only)', tags: ['Payments'], security: bearer } },
    '/api/webhooks/razorpay': { post: { summary: 'Razorpay webhook (signature verified, idempotent by event id)', tags: ['Payments'] } },
    '/api/admin/orders': { get: { summary: 'All orders (admin)', tags: ['Admin'], security: bearer } },
    '/api/admin/orders/{id}/status': { patch: { summary: 'Mark SHIPPED / DELIVERED / CANCELLED (admin)', tags: ['Admin'], security: bearer } },
  },
};
