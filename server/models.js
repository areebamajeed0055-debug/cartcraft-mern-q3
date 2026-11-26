const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'customer'], default: 'customer' }
});

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  stock: { type: Number, required: true, min: 0 }
});

const cartSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true },
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    qty: { type: Number, required: true, min: 1 }
  }]
});

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: String,
    price: Number,
    qty: Number
  }],
  subtotal: Number,
  shipping: Number,
  total: Number,
  status: { type: String, enum: ['placed', 'cancelled'], default: 'placed' },
  idempotencyKey: { type: String, unique: true, sparse: true }
}, { timestamps: true });

module.exports = {
  User: mongoose.model('User', userSchema),
  Product: mongoose.model('Product', productSchema),
  Cart: mongoose.model('Cart', cartSchema),
  Order: mongoose.model('Order', orderSchema)
};
