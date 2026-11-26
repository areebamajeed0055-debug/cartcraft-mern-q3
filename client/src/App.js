import React, { useState, useEffect } from 'react';

const API = 'http://localhost:5000/api';
// Personal Shipping Constants (N = 933)
const FLAT_SHIPPING = 983;
const FREE_SHIPPING_MIN = 1933;

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'));
  const [page, setPage] = useState('products');
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState({ items: [], subtotal: 0, shipping: 0, total: 0 });
  const [orders, setOrders] = useState([]);
  const [msg, setMsg] = useState('');

  const [authMode, setAuthMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'customer' });
  const [newProd, setNewProd] = useState({ name: '', price: '', stock: '' });

  const [checkingOut, setCheckingOut] = useState(false);
  const [idempKey, setIdempKey] = useState(() => 'key-' + Date.now() + '-' + Math.random().toString(36).slice(2));

  const headers = token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : { 'Content-Type': 'application/json' };

  const loadProducts = async () => {
    const data = await fetch(`${API}/products`).then(r => r.json());
    setProducts(Array.isArray(data) ? data : []);
  };

  const loadCart = async () => {
    if (!token) return;
    const data = await fetch(`${API}/cart`, { headers }).then(r => r.json());
    if (data.items) setCart(data);
  };

  const loadOrders = async () => {
    if (!token) return;
    const data = await fetch(`${API}/orders`, { headers }).then(r => r.json());
    if (Array.isArray(data)) setOrders(data);
  };

  useEffect(() => {
    loadProducts();
    if (token) {
      loadCart();
      loadOrders();
    }
  }, [token]);

  const handleAuth = async (e) => {
    e.preventDefault();
    setMsg('');
    const endpoint = authMode === 'login' ? 'login' : 'register';
    const res = await fetch(`${API}/auth/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    const data = await res.json();
    if (!res.ok) return setMsg(data.message || 'Auth failed');
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
  };

  const logout = () => {
    localStorage.clear();
    setToken('');
    setUser(null);
    setCart({ items: [], subtotal: 0, shipping: 0, total: 0 });
    setOrders([]);
  };

  const createProduct = async (e) => {
    e.preventDefault();
    const res = await fetch(`${API}/products`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: newProd.name, price: Number(newProd.price), stock: Number(newProd.stock) })
    });
    const data = await res.json();
    if (!res.ok) return setMsg(data.message);
    setNewProd({ name: '', price: '', stock: '' });
    setMsg('Product created!');
    loadProducts();
  };

  const addToCart = async (productId) => {
    setMsg('');
    const res = await fetch(`${API}/cart`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ productId, qty: 1 })
    });
    const data = await res.json();
    if (!res.ok) return setMsg(data.message);
    setCart(data);
    setMsg('Added to cart');
  };

  const updateQty = async (productId, qty) => {
    if (qty < 1) return removeFromCart(productId);
    const res = await fetch(`${API}/cart/${productId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ qty })
    });
    const data = await res.json();
    if (!res.ok) return setMsg(data.message);
    setCart(data);
  };

  const removeFromCart = async (productId) => {
    const res = await fetch(`${API}/cart/${productId}`, { method: 'DELETE', headers });
    const data = await res.json();
    if (res.ok) setCart(data);
  };

  const handleCheckout = async () => {
    if (checkingOut) return;
    setCheckingOut(true);
    setMsg('');
    try {
      const res = await fetch(`${API}/checkout`, {
        method: 'POST',
        headers: { ...headers, 'Idempotency-Key': idempKey }
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.message || 'Checkout failed');
      } else {
        setMsg(`Order placed! ID: ${data._id}`);
        setIdempKey('key-' + Date.now() + '-' + Math.random().toString(36).slice(2));
        await loadCart();
        await loadProducts();
        await loadOrders();
        setPage('orders');
      }
    } catch {
      setMsg('Network error - click Checkout again to safely retry with same key.');
    } finally {
      setCheckingOut(false);
    }
  };

  const cancelOrder = async (orderId) => {
    const res = await fetch(`${API}/orders/${orderId}/cancel`, { method: 'POST', headers });
    const data = await res.json();
    if (!res.ok) return setMsg(data.message);
    setMsg('Order cancelled and stock restored once.');
    loadOrders();
    loadProducts();
  };

  return (
    <div style={{ maxWidth: 900, margin: '20px auto', fontFamily: 'sans-serif', padding: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ccc', paddingBottom: 10 }}>
        <div>
          <h2 style={{ margin: 0 }}>CartCraft Store</h2>
          <small>Candidate: Areeba | Roll No: HM-B2-2026-1017-933 | Flat Shipping: {FLAT_SHIPPING} (Free &ge; {FREE_SHIPPING_MIN})</small>
        </div>
        {user && (
          <div>
            <button onClick={() => setPage('products')}>Products</button>{' '}
            <button onClick={() => setPage('cart')}>Cart ({cart.items.reduce((s, i) => s + i.qty, 0)})</button>{' '}
            <button onClick={() => setPage('orders')}>Orders ({orders.length})</button>{' '}
            <button onClick={logout}>Logout ({user.name} - {user.role})</button>
          </div>
        )}
      </header>

      {msg && <p style={{ background: '#eef', padding: 10, borderRadius: 4 }}>{msg}</p>}

      {!user ? (
        <form onSubmit={handleAuth} style={{ maxWidth: 360, marginTop: 20 }}>
          <h3>{authMode === 'login' ? 'Login' : 'Register'}</h3>
          {authMode === 'register' && (
            <>
              <input placeholder="Name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={{ display: 'block', width: '100%', marginBottom: 8 }} />
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={{ display: 'block', width: '100%', marginBottom: 8 }}>
                <option value="customer">Customer</option>
                <option value="admin">Admin</option>
              </select>
            </>
          )}
          <input type="email" placeholder="Email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={{ display: 'block', width: '100%', marginBottom: 8 }} />
          <input type="password" placeholder="Password" required value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} style={{ display: 'block', width: '100%', marginBottom: 8 }} />
          <button type="submit">{authMode === 'login' ? 'Login' : 'Register'}</button>{' '}
          <button type="button" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
            Switch to {authMode === 'login' ? 'Register' : 'Login'}
          </button>
        </form>
      ) : (
        <>
          {page === 'products' && (
            <div style={{ marginTop: 20 }}>
              {user.role === 'admin' && (
                <form onSubmit={createProduct} style={{ marginBottom: 20, padding: 12, border: '1px solid #ddd' }}>
                  <h4>Admin: Add Product</h4>
                  <input placeholder="Name" required value={newProd.name} onChange={e => setNewProd({ ...newProd, name: e.target.value })} />{' '}
                  <input type="number" placeholder="Price" required value={newProd.price} onChange={e => setNewProd({ ...newProd, price: e.target.value })} />{' '}
                  <input type="number" placeholder="Stock" required value={newProd.stock} onChange={e => setNewProd({ ...newProd, stock: e.target.value })} />{' '}
                  <button type="submit">Add Product</button>
                </form>
              )}
              <h3>Products</h3>
              {products.map(p => (
                <div key={p._id} style={{ display: 'flex', justifyContent: 'space-between', padding: 10, borderBottom: '1px solid #eee' }}>
                  <div>
                    <strong>{p.name}</strong> — Price: {p.price} | Stock: {p.stock}
                  </div>
                  <button disabled={p.stock < 1} onClick={() => addToCart(p._id)}>
                    {p.stock < 1 ? 'Out of Stock' : 'Add to Cart'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {page === 'cart' && (
            <div style={{ marginTop: 20 }}>
              <h3>Your Cart</h3>
              {cart.items.length === 0 ? <p>Cart is empty.</p> : (
                <>
                  {cart.items.map(i => (
                    <div key={i.product._id} style={{ display: 'flex', justifyContent: 'space-between', padding: 8, borderBottom: '1px solid #eee' }}>
                      <span>{i.product.name} ({i.product.price} each)</span>
                      <div>
                        <button onClick={() => updateQty(i.product._id, i.qty - 1)}>-</button>
                        <span style={{ margin: '0 8px' }}>{i.qty}</span>
                        <button onClick={() => updateQty(i.product._id, i.qty + 1)}>+</button>{' '}
                        <button onClick={() => removeFromCart(i.product._id)}>Remove</button>
                      </div>
                    </div>
                  ))}
                  <div style={{ marginTop: 16, padding: 12, background: '#f9f9f9' }}>
                    <p>Subtotal: <strong>{cart.subtotal}</strong></p>
                    <p>Shipping (Flat {FLAT_SHIPPING}, Free &ge; {FREE_SHIPPING_MIN}): <strong>{cart.shipping}</strong></p>
                    <p>Total: <strong>{cart.total}</strong></p>
                    <p><small>Active Idempotency-Key: <code>{idempKey}</code></small></p>
                    <button disabled={checkingOut} onClick={handleCheckout}>
                      {checkingOut ? 'Processing...' : 'Checkout'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {page === 'orders' && (
            <div style={{ marginTop: 20 }}>
              <h3>Your Orders</h3>
              {orders.map(o => (
                <div key={o._id} style={{ border: '1px solid #ddd', padding: 12, marginBottom: 10 }}>
                  <div><strong>Order ID:</strong> {o._id} | <strong>Status:</strong> {o.status.toUpperCase()}</div>
                  <div>Subtotal: {o.subtotal} | Shipping: {o.shipping} | Total: {o.total}</div>
                  <ul>
                    {o.items.map((it, idx) => (
                      <li key={idx}>{it.name} x {it.qty} @ {it.price}</li>
                    ))}
                  </ul>
                  {o.status === 'placed' && (
                    <button onClick={() => cancelOrder(o._id)}>Cancel Order</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
