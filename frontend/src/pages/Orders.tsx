import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, money, Order } from '../api';

export default function Orders() {
  const qc = useQueryClient();
  const orders = useQuery({ queryKey: ['orders'], queryFn: () => api<Order[]>('/orders'), refetchInterval: 10000 });
  const cancel = useMutation({
    mutationFn: (id: number) => api(`/orders/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });

  if (orders.isLoading) return <p className="muted">Loading orders...</p>;
  if (!orders.data?.length) return <div className="panel"><h1>No orders yet</h1><p className="muted">Your orders will show up here after checkout.</p></div>;

  return (
    <>
      <h1>My orders</h1>
      {orders.data.map((o) => (
        <div className="panel" key={o.id}>
          <div className="row">
            <strong>Order #{o.id}</strong>
            <span className={`status ${o.status}`}>{o.status.replace('_', ' ').toLowerCase()}</span>
          </div>
          {o.items.map((i) => <div className="muted" key={i.id}>{i.quantity} x {i.product.name}</div>)}
          <div className="row"><strong>{money(o.totalCents)}</strong><span className="muted">{new Date(o.createdAt).toLocaleString()}</span></div>
          {['PENDING_PAYMENT', 'PAID'].includes(o.status) && (
            <button className="ghost" onClick={() => cancel.mutate(o.id)}>Cancel order</button>
          )}
        </div>
      ))}
      {cancel.error && <p className="error">{(cancel.error as Error).message}</p>}
    </>
  );
}
