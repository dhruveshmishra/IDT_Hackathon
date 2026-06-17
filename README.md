# RentIt — Peer-to-Peer (P2P) Rental Marketplace

RentIt is a modern, feature-rich P2P rental platform built with Node.js and Express. It enables users to rent out underutilized assets (electronics, vehicles, tools, furniture, apparel, etc.) or rent items listed by others. 

The application is split into three main portals running on isolated ports, communicating via a shared database and real-time Socket.io layers, supplemented by Google Gemini AI features.

---

## 🛠️ Tech Stack & Technologies Used

### Backend & Core
* **Runtime Environment:** [Node.js](https://nodejs.org/) (v18 or higher recommended)
* **Framework:** [Express.js](https://expressjs.com/) (using isolated sub-apps for Renter, Seller, and Admin portals)
* **Real-time Engine:** [Socket.io](https://socket.io/) (used for live chat across all portals)
* **Auth & Session Management:** [Passport.js](http://www.passportjs.org/) (Local strategy) with `express-session` and `connect-mongo` for persistent sessions.

### Databases & Cache
* **Primary Database:** [MongoDB](https://www.mongodb.com/) (using Mongoose ODM)
* **Caching & Sessions:** [Redis](https://redis.io/) (with a robust in-memory cache fallback class if Redis is unavailable)

### Third-Party APIs & Services
* **AI Engine:** Google Gemini AI API (`@google/generative-ai`) for smart item descriptions, optimal pricing recommendations, and rental assistant chat.
* **Payments & Escrow:** [Razorpay API](https://razorpay.com/) for secure fee payments and deposit handling.
* **Image/Media Storage:** [Cloudinary CDN](https://cloudinary.com/) for optimized listing images upload.
* **SMS & OTP Verification:** [Twilio Verify API](https://www.twilio.com/) for mobile number verification.
* **Email Service:** [Nodemailer](https://nodemailer.com/) for notifications, receipts, and admin updates.

### Frontend
* **Templating Engine:** EJS (Embedded JavaScript templates)
* **Styling:** Vanilla CSS (Rich aesthetics with glassmorphic cards, custom sidebars, and dark mode UI touches)
* **Interactive Maps:** Leaflet.js (for location picking and radius-based geographic search)
* **Date Picker:** Flatpickr (for hourly/daily range bookings)
* **Analytics Visualization:** Chart.js (for seller earnings and admin platform statistics)

---

## 📋 Prerequisites & Downloads

Before starting the server, ensure you have the following downloaded and installed:

1. **Node.js (LTS v18+)**
   * Download from [nodejs.org](https://nodejs.org/).
2. **MongoDB**
   * Install MongoDB Community Server locally ([Downloads](https://www.mongodb.com/try/download/community)) or set up a free cluster on [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
3. **Redis (Optional)**
   * Install Redis locally or use a cloud provider. *If Redis is not installed/running, RentIt automatically falls back to an in-memory cache class so the server runs smoothly regardless.*

---

## ⚙️ Project Setup & Configuration

### Step 1: Install Dependencies
Navigate to the project directory and install the required packages:
```bash
cd rentapp
npm install
```

### Step 2: Seed the Database
Initialize your database with demo users, 50 pre-populated categorized items, locations in Bangalore, reviews, and test credentials:
```bash
node seed.js
```

---

## 🚀 Running the Server

Start the application using one of the following commands:

* **Development Mode (with auto-reload):**
  ```bash
  npm run dev
  ```
  *(Launches nodemon monitoring `app.js`)*

* **Production Mode:**
  ```bash
  npm start
  ```

Once started:
* 🛒 **Renter Marketplace:** Access on [http://localhost:3000](http://localhost:3000)
* 💼 **Seller Dashboard:** Access on [http://localhost:3002](http://localhost:3002)

*Note: If you change `APP_MODE` to `user`, `seller`, or `admin`, the server will only listen on the single port corresponding to that profile. This is ideal for isolated cloud deployment container replicas.*

---

## 🔄 Complete Website Workflows

RentIt utilizes role-based logic with strict authentication barriers. The platform supports three primary workflows:



### 1. Renter Workflow (Port 3000)
* **Registration & KyC:** Users register and input their profile details. Simulated Aadhaar verification ensures renters provide valid IDs before booking high-value goods.
* **Geographical Search & Browsing:** Renters can browse by categories (Electronics, Vehicles, Tools, Furniture, Sports, Clothing). Renters can enable location permissions to sort listings by distance (utilizing MongoDB Geospatial `$near` queries).
* **Booking Creation:** Renters use Flatpickr to select rental windows (hourly or daily rates). The system calculates the rental cost and the refundable security deposit.
* **Payment Escrow:** The checkout processes payments securely using Razorpay. The funds (rental fee + security deposit) are held securely.
* **Real-time Communication:** Upon a booking request, renters can initiate instant chat with the seller to coordinate handovers, with live messaging powered by Socket.io.
* **Returns & Reviews:** Once the rental period finishes and the seller confirms the return, the renter receives the security deposit back and can rate the experience.

### 2. Seller Workflow (Port 3002)
* **Seller Onboarding:** Sellers complete their profile, including payout credentials (UPI ID or Bank Details) and shop location details.
* **Listing Management:** Sellers can create new item listings, set stock quantities, upload pictures (hosted on Cloudinary), and configure daily/hourly pricing.
* **Gemini AI Tools Integration:** 
  * **AI Description Generator:** Instantly write professional SEO-optimized copy using Gemini from just a title and tags.
  * **AI Pricing Helper:** Get data-driven suggestions for daily/hourly rental prices and security deposits.
* **Booking Approvals & Handovers:** Sellers review pending bookings from renters. They can accept or decline bookings, update inventory status, and mark items as "Handed Over" or "Returned".
* **Earnings Analytics:** Interactive analytics panel built with Chart.js displays monthly earnings, item popularity, and payout reports.
