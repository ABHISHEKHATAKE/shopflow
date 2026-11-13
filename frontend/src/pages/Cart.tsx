import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, Cart, money, Order, post } from '../api';

declare global { interface Window { Razorpay?: new (opts: Record<string, unknown>) => { open: () => void } } }

function loadRazorpay() {
  return new Promise<void>((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Razorpay'));
    document.body.appendChild(s);
  });
}

interface PayInit { mock: boolean; keyId: string | null; gatewayOrderId: string; amount: number; currency: string }

export default function CartPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const cart = useQuery({ queryKey: ['cart'], queryFn: () => api<Cart>('/cart') });
  const [error, setError] = useState('');

  const setQty = useMutation({
    mutationFn: (v: { productId: number; quantity: number }) => api('/cart/items', { method: 'PUT', body: JSON.stringify(v) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cart'] }),
  });

  const checkout = useMutation({
    mutationFn: async () => {
      setError('');
      // One key per click-intent: a double click or network retry returns the same order instead of a duplicate.
      const order = await post<Order>('/orders', undefined, { 'Idempotency-Key': crypto.randomUUID() });
      const pay = await post<PayInit>(`/payments/${order.id}/create`);
      if (pay.mock) {
        await post(`/payments/${order.id}/mock-pay`);
      } else {
        await loadRazorpay();
        await new Promise<void>((resolve, reject) => {
          const rz = new window.Razorpay!({
            key: pay.keyId, amount: pay.amount, currency: pay.currency, order_id: pay.gatewayOrderId, name: 'ShopFlow',
            handler: async (r: Record<string, string>) => { try { await post('/payments/verify', r); resolve(); } catch (e) { reject(e); } },
            modal: { ondismiss: () => reject(new Error('Payment cancelled. Your items are held for a few minutes.')) },
          });
          rz.open();
        });
      }
    },
    onSuccess: () => { qc.invalidateQueries(); nav('/orders'); },
    onError: (e) => { setError((e as Error).message); qc.invalidateQueries(); },
  });

  if (cart.isLoading) return <p className="muted">Loading cart...</p>;
  const items = cart.data?.items ?? [];
  if (items.length === 0) return <div className="panel"><h1>Your cart is empty</h1><p className="muted">Pick something from the shop to get started.</p></div>;

  return (
    <div className="panel">
      <h1>Cart</h1>
      {items.map((i) => (
        <div className="line" key={i.id}>
          <div><strong>{i.product.name}</strong><div className="muted">{money(i.product.priceCents)} each</div></div>
          <div className="qty">
            <button className="ghost" onClick={() => setQty.mutate({ productId: i.product.id, quantity: i.quantity - 1 })}>-</button>
            <span>{i.quantity}</span>
            <button className="ghost" disabled={i.quantity >= 20} onClick={() => setQty.mutate({ productId: i.product.id, quantity: i.quantity + 1 })}>+</button>
          </div>
          <strong>{money(i.product.priceCents * i.quantity)}</strong>
        </div>
      ))}
      <div className="line total"><span>Total</span><strong>{money(cart.data!.totalCents)}</strong></div>
      {error && <p className="error">{error}</p>}
      <button disabled={checkout.isPending} onClick={() => checkout.mutate()}>{checkout.isPending ? 'Processing...' : 'Pay now'}</button>
    </div>
  );
}
