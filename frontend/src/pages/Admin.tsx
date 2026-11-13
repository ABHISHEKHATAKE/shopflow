import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { api, money, Order, post, Product } from '../api';

export default function Admin() {
  const qc = useQueryClient();
  const orders = useQuery({ queryKey: ['admin-orders'], queryFn: () => api<Order[]>('/admin/orders') });
  const [form, setForm] = useState({ name: '', description: '', price: '', stock: '' });

  const addProduct = useMutation({
    mutationFn: () => post<Product>('/products', {
      name: form.name, description: form.description,
      priceCents: Math.round(Number(form.price) * 100), stock: Number(form.stock),
    }),
    onSuccess: () => { setForm({ name: '', description: '', price: '', stock: '' }); qc.invalidateQueries({ queryKey: ['products'] }); },
  });
  const setStatus = useMutation({
    mutationFn: (v: { id: number; status: string }) => api(`/admin/orders/${v.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: v.status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-orders'] }),
  });
  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <h1>Admin</h1>
      <form className="panel" onSubmit={(e: FormEvent) => { e.preventDefault(); addProduct.mutate(); }}>
        <h2>Add product</h2>
        <div className="formrow">
          <label>Name<input value={form.name} onChange={f('name')} required /></label>
          <label>Price (₹)<input type="number" min="1" step="0.01" value={form.price} onChange={f('price')} required /></label>
          <label>Stock<input type="number" min="0" value={form.stock} onChange={f('stock')} required /></label>
        </div>
        <label>Description<input value={form.description} onChange={f('description')} /></label>
        <button type="submit" disabled={addProduct.isPending}>Add product</button>
        {addProduct.error && <p className="error">{(addProduct.error as Error).message}</p>}
      </form>

      <h2>Orders</h2>
      {orders.data?.map((o) => (
        <div className="panel" key={o.id}>
          <div className="row">
            <strong>#{o.id} · {o.user?.email}</strong>
            <span className={`status ${o.status}`}>{o.status.replace('_', ' ').toLowerCase()}</span>
          </div>
          <div className="row"><span>{money(o.totalCents)}</span><span className="muted">{o.items.length} item(s)</span></div>
          {o.status === 'PAID' && <button className="ghost" onClick={() => setStatus.mutate({ id: o.id, status: 'SHIPPED' })}>Mark shipped</button>}
          {o.status === 'SHIPPED' && <button className="ghost" onClick={() => setStatus.mutate({ id: o.id, status: 'DELIVERED' })}>Mark delivered</button>}
        </div>
      ))}
      {setStatus.error && <p className="error">{(setStatus.error as Error).message}</p>}
    </>
  );
}
