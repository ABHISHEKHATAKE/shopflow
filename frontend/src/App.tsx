import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { api, Cart } from './api';
import { useAuth } from './auth';
import Admin from './pages/Admin';
import CartPage from './pages/Cart';
import Login from './pages/Login';
import Orders from './pages/Orders';
import Products from './pages/Products';

export default function App() {
  const { user, ready, logout } = useAuth();
  const cart = useQuery({ queryKey: ['cart'], queryFn: () => api<Cart>('/cart'), enabled: !!user });
  const count = cart.data?.items.reduce((n, i) => n + i.quantity, 0) ?? 0;

  if (!ready) return null;
  return (
    <>
      <header className="bar">
        <Link to="/" className="brand">ShopFlow</Link>
        <nav>
          <NavLink to="/">Shop</NavLink>
          {user && <NavLink to="/cart">Cart{count > 0 && <span className="pill">{count}</span>}</NavLink>}
          {user && <NavLink to="/orders">My orders</NavLink>}
          {user?.role === 'ADMIN' && <NavLink to="/admin">Admin</NavLink>}
        </nav>
        <div className="who">
          {user ? (<><span>{user.name}</span><button className="link" onClick={logout}>Log out</button></>) : <Link to="/login">Log in</Link>}
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Products />} />
          <Route path="/login" element={<Login />} />
          <Route path="/cart" element={user ? <CartPage /> : <Navigate to="/login" />} />
          <Route path="/orders" element={user ? <Orders /> : <Navigate to="/login" />} />
          <Route path="/admin" element={user?.role === 'ADMIN' ? <Admin /> : <Navigate to="/" />} />
        </Routes>
      </main>
    </>
  );
}
