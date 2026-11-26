// Run with: node test_idempotency.js (requires server running on localhost:5000)
const BASE = 'http://localhost:5000/api';

async function run() {
  const suffix = Date.now();
  const adminRes = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Admin', email: `admin_${suffix}@test.com`, password: 'pass', role: 'admin' })
  }).then(r => r.json());

  const custRes = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Areeba', email: `areeba_${suffix}@test.com`, password: 'pass', role: 'customer' })
  }).then(r => r.json());

  const prod = await fetch(`${BASE}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminRes.token}` },
    body: JSON.stringify({ name: 'Wireless Headphones', price: 1200, stock: 5 })
  }).then(r => r.json());

  await fetch(`${BASE}/cart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${custRes.token}` },
    body: JSON.stringify({ productId: prod._id, qty: 1 })
  });

  const key = `idem-key-${suffix}`;
  const [res1, res2] = await Promise.all([
    fetch(`${BASE}/checkout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${custRes.token}`, 'Idempotency-Key': key }
    }).then(r => r.json()),
    fetch(`${BASE}/checkout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${custRes.token}`, 'Idempotency-Key': key }
    }).then(r => r.json())
  ]);

  console.log('Order 1 ID:', res1._id, '| Subtotal:', res1.subtotal, '| Shipping:', res1.shipping, '| Total:', res1.total);
  console.log('Order 2 ID:', res2._id, '| Same Order?', res1._id === res2._id);

  const products = await fetch(`${BASE}/products`).then(r => r.json());
  const updated = products.find(p => p._id === prod._id);
  console.log('Remaining Stock (expected 4):', updated.stock);
}

run().catch(console.error);
