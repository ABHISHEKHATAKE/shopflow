import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, Cart, money, Product } from '../api';
import { useAuth } from '../auth';

export default function Products() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ['products', search, page],
    queryFn: () => api<{ items: Product[]; pages: number }>(`/products?page=${page}&limit=9&search=${encodeURIComponent(search)}`),
  });
  const add = useMutation({
    mutationFn: async (p: Product) => {
      const cart = qc.getQueryData<Cart>(['cart']);
      const current = cart?.items.find((i) => i.product.id === p.id)?.quantity ?? 0;
      return api('/cart/items', { method: 'PUT', body: JSON.stringify({ productId: p.id, quantity: current + 1 }) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cart'] }),
  });

  return (
    <>
      <div className="toolbar">
        <h1>Shop</h1>
        <input placeholder="Search products" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </div>
      {list.isLoading && <p className="muted">Loading products...</p>}
      {list.data?.items.length === 0 && <p className="muted">No products match "{search}".</p>}
      <div className="grid">
        {list.data?.items.map((p) => (
          <article key={p.id} className="card">
            <h3>{p.name}</h3>
            <p className="muted">{p.description}</p>
            <div className="row">
              <strong>{money(p.priceCents)}</strong>
              <span className={p.stock <= 5 ? 'warn' : 'muted'}>{p.stock === 0 ? 'Sold out' : `${p.stock} in stock`}</span>
            </div>
            <button disabled={p.stock === 0 || add.isPending} onClick={() => (user ? add.mutate(p) : nav('/login'))}>
              Add to cart
            </button>
          </article>
        ))}
      </div>
      {add.error && <p className="error">{(add.error as Error).message}</p>}
      {(list.data?.pages ?? 1) > 1 && (
        <div className="pager">
          <button className="ghost" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="muted">Page {page} of {list.data?.pages}</span>
          <button className="ghost" disabled={page === list.data?.pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </>
  );
}
