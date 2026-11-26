require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Product, Cart, Order } = require('./models');

const app = express();
app.use(cors());
app.use(express.json());

// Personal Rule for Roll No HM-B2-2026-1017-933 (N = 933)
const N = 933;
const FLAT_SHIPPING = 50 + N;       // 983
const FREE_SHIPPING_MIN = 1000 + N; // 1933

function calcShipping(subtotal) {
  if (subtotal === 0) return 0;
  return subtotal >= FREE_SHIPPING_MIN ? 0 : FLAT_SHIPPING;
}

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'areeba_secret_key_933');
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
  next();
};

// 1. Auth
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hash, role: role === 'admin' ? 'admin' : 'customer' });
    const token = jwt.sign({ id: user._id, role: user.role, name: user.name }, process.env.JWT_SECRET || 'areeba_secret_key_933');
    res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(400).json({ message: 'Invalid credentials' });
  }
  const token = jwt.sign({ id: user._id, role: user.role, name: user.name }, process.env.JWT_SECRET || 'areeba_secret_key_933');
  res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
});

// 2. Products
app.get('/api/products', async (req, res) => {
  const products = await Product.find().sort({ _id: -1 });
  res.json(products);
});

app.post('/api/products', auth, adminOnly, async (req, res) => {
  const { name, price, stock } = req.body;
  if (!name || price < 0 || !Number.isInteger(stock) || stock < 0) {
    return res.status(400).json({ message: 'Invalid product data' });
  }
  const product = await Product.create({ name, price: Math.round(price), stock });
  res.status(201).json(product);
});

// 3. Server-Side Cart
async function buildCartResponse(userId) {
  const cart = await Cart.findOne({ user: userId }).populate('items.product');
  if (!cart) return { items: [], subtotal: 0, shipping: 0, total: 0, rules: { FLAT_SHIPPING, FREE_SHIPPING_MIN } };
  const validItems = cart.items.filter(i => i.product);
  const subtotal = validItems.reduce((sum, i) => sum + i.product.price * i.qty, 0);
  const shipping = calcShipping(subtotal);
  return {
    items: validItems.map(i => ({
      product: i.product,
      qty: i.qty,
      lineTotal: i.product.price * i.qty
    })),
    subtotal,
    shipping,
    total: subtotal + shipping,
    rules: { FLAT_SHIPPING, FREE_SHIPPING_MIN }
  };
}

app.get('/api/cart', auth, async (req, res) => {
  res.json(await buildCartResponse(req.user.id));
});

app.post('/api/cart', auth, async (req, res) => {
  const { productId, qty } = req.body;
  if (!Number.isInteger(qty) || qty < 1) return res.status(400).json({ message: 'Quantity must be integer >= 1' });
  const product = await Product.findById(productId);
  if (!product) return res.status(404).json({ message: 'Product not found' });

  let cart = await Cart.findOne({ user: req.user.id });
  if (!cart) cart = new Cart({ user: req.user.id, items: [] });

  const idx = cart.items.findIndex(i => i.product.equals(productId));
  const newQty = (idx > -1 ? cart.items[idx].qty : 0) + qty;
  if (newQty > product.stock) return res.status(400).json({ message: 'Exceeds available stock' });

  if (idx > -1) cart.items[idx].qty = newQty;
  else cart.items.push({ product: productId, qty });

  await cart.save();
  res.json(await buildCartResponse(req.user.id));
});

app.put('/api/cart/:productId', auth, async (req, res) => {
  const { qty } = req.body;
  if (!Number.isInteger(qty) || qty < 1) return res.status(400).json({ message: 'Quantity must be integer >= 1' });
  const product = await Product.findById(req.params.productId);
  if (!product || qty > product.stock) return res.status(400).json({ message: 'Exceeds available stock' });

  const cart = await Cart.findOne({ user: req.user.id });
  if (!cart) return res.status(404).json({ message: 'Cart not found' });
  const item = cart.items.find(i => i.product.equals(req.params.productId));
  if (!item) return res.status(404).json({ message: 'Item not in cart' });

  item.qty = qty;
  await cart.save();
  res.json(await buildCartResponse(req.user.id));
});

app.delete('/api/cart/:productId', auth, async (req, res) => {
  const cart = await Cart.findOne({ user: req.user.id });
  if (cart) {
    cart.items = cart.items.filter(i => !i.product.equals(req.params.productId));
    await cart.save();
  }
  res.json(await buildCartResponse(req.user.id));
});

// 4. Atomic & Idempotent Checkout
async function restoreStock(taken) {
  if (!taken.length) return;
  await Product.bulkWrite(taken.map(t => ({
    updateOne: { filter: { _id: t.id }, update: { $inc: { stock: t.qty } } }
  })));
}

app.post('/api/checkout', auth, async (req, res) => {
  const idempKey = req.headers['idempotency-key'];
  if (!idempKey) return res.status(400).json({ message: 'Idempotency-Key header is required' });

  const existingOrder = await Order.findOne({ idempotencyKey: `${req.user.id}:${idempKey}` });
  if (existingOrder) return res.status(200).json(existingOrder);

  const cart = await Cart.findOne({ user: req.user.id });
  if (!cart || cart.items.length === 0) return res.status(400).json({ message: 'Cart is empty' });

  const taken = [];
  const orderItems = [];
  let subtotal = 0;

  try {
    for (const item of cart.items) {
      const updatedProd = await Product.findOneAndUpdate(
        { _id: item.product, stock: { $gte: item.qty } },
        { $inc: { stock: -item.qty } },
        { new: true }
      );
      if (!updatedProd) {
        await restoreStock(taken);
        return res.status(409).json({ message: 'Insufficient stock for one or more items' });
      }
      taken.push({ id: updatedProd._id, qty: item.qty });
      orderItems.push({ product: updatedProd._id, name: updatedProd.name, price: updatedProd.price, qty: item.qty });
      subtotal += updatedProd.price * item.qty;
    }

    const shipping = calcShipping(subtotal);
    const total = subtotal + shipping;

    const order = await Order.create({
      user: req.user.id,
      items: orderItems,
      subtotal,
      shipping,
      total,
      status: 'placed',
      idempotencyKey: `${req.user.id}:${idempKey}`
    });

    cart.items = [];
    await cart.save();
    res.status(201).json(order);
  } catch (err) {
    if (err.code === 11000) {
      await restoreStock(taken);
      const dup = await Order.findOne({ idempotencyKey: `${req.user.id}:${idempKey}` });
      if (dup) return res.status(200).json(dup);
    }
    await restoreStock(taken);
    res.status(500).json({ message: 'Checkout failed' });
  }
});

// 5. Orders & One-Time Cancel Restock
app.get('/api/orders', auth, async (req, res) => {
  const orders = await Order.find({ user: req.user.id }).sort({ createdAt: -1 });
  res.json(orders);
});

app.get('/api/orders/:id', auth, async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found' });
  if (!order.user.equals(req.user.id) && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }
  res.json(order);
});

app.post('/api/orders/:id/cancel', auth, async (req, res) => {
  const filter = { _id: req.params.id, status: 'placed' };
  if (req.user.role !== 'admin') filter.user = req.user.id;

  const order = await Order.findOneAndUpdate(filter, { status: 'cancelled' }, { new: true });
  if (!order) return res.status(409).json({ message: 'Order cannot be cancelled or already cancelled' });

  await Product.bulkWrite(order.items.map(it => ({
    updateOne: { filter: { _id: it.product }, update: { $inc: { stock: it.qty } } }
  })));

  res.json(order);
});

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cartcraft';

mongoose.connect(MONGO_URI).then(() => {
  console.log('MongoDB connected');
  app.listen(PORT, () => console.log(`CartCraft server running on port ${PORT}`));
});
