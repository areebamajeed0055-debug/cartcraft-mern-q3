# CartCraft - Question 3 (Shopping Cart & Safe Checkout)
- **Candidate:** Areeba
- **Roll Number:** HM-B2-2026-1017-933 (N = 933)
- **Personal Shipping Rules:** Flat fee = 983 (50 + 933), Free shipping when subtotal >= 1933 (1000 + 933)

## Setup & Execution
1. **Backend:**
   ```bash
   cd server
   cp .env.example .env
   npm install
   npm start
   ```
2. **Frontend:**
   ```bash
   cd client
   npm install
   npm start
   ```
3. **Run Idempotency & Concurrency Test:**
   ```bash
   cd server
   node test_idempotency.js
   ```
