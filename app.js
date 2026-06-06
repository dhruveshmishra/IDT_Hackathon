require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo').default; // Correct connect-mongo v4/v6 import path
const passport = require('passport');
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require('cors');
const override = require('method-override');
const flash = require('connect-flash');
const { Server } = require('socket.io');
const http = require('http');
const path = require('path');

// Configs
require('./config/db');
require('./config/passport');

// Port details loaded from env variables
const USER_PORT = process.env.USER_PORT || 3000;
const ADMIN_PORT = process.env.ADMIN_PORT || 3001;
const SELLER_PORT = process.env.SELLER_PORT || 3002;

// Database details
const localMongoUrl = process.env.LOCAL_MONGO_URL || 'mongodb://127.0.0.1:27017/rentapp';

// ----------------------------------------------------
// Shared session configuration
// ----------------------------------------------------
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'rentit_default_secret_key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: localMongoUrl
  }),
  cookie: { 
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true
  }
});

// Helper function to apply core middleware to Express sub-apps
function applyBaseMiddleware(appInstance) {
  appInstance.set('view engine', 'ejs');
  appInstance.set('views', path.join(__dirname, 'views'));
  
  appInstance.use(express.static(path.join(__dirname, 'public')));
  appInstance.use(express.urlencoded({ extended: true }));
  appInstance.use(express.json());
  appInstance.use(override('_method'));
  appInstance.use(helmet({ contentSecurityPolicy: false }));
  appInstance.use(morgan('dev'));
  appInstance.use(cors());
  
  appInstance.use(sessionMiddleware);
  appInstance.use(flash());
  appInstance.use(passport.initialize());
  appInstance.use(passport.session());

  // Global locals
  appInstance.use((req, res, next) => {
    res.locals.currentUser = req.user;
    res.locals.currentPath = req.path;
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    next();
  });
}

// ----------------------------------------------------
// PORT 3000: User Marketplace (Renter App)
// ----------------------------------------------------
const userApp = express();
applyBaseMiddleware(userApp);

userApp.use('/auth', require('./routes/auth'));
userApp.use('/user', require('./routes/user'));
userApp.use('/items', require('./routes/items'));
userApp.use('/bookings', require('./routes/bookings'));
userApp.use('/payments', require('./routes/payments'));
userApp.use('/chat', require('./routes/chat'));
userApp.use('/ai', require('./routes/ai'));

userApp.get('/', async (req, res) => {
  try {
    const Item = require('./models/Item');
    const items = await Item.find({ status: 'active', isAvailable: true }).limit(4);
    res.render('landing/index', { items });
  } catch(e) {
    res.render('landing/index', { items: [] });
  }
});

// ----------------------------------------------------
// PORT 3001: Admin Portal App
// ----------------------------------------------------
const adminApp = express();
applyBaseMiddleware(adminApp);

// Port-specific login auth guard
adminApp.use((req, res, next) => {
  const publicPaths = ['/auth/login', '/auth/signup', '/auth/logout', '/auth/role-select'];
  if (publicPaths.includes(req.path) || req.path.startsWith('/css') || req.path.startsWith('/js')) {
    return next();
  }
  if (!req.isAuthenticated()) {
    req.flash('error', 'Please log in to access the Admin portal.');
    return res.redirect('/auth/login');
  }
  if (req.user.role !== 'admin') {
    req.flash('error', 'Access denied: Admin credentials required.');
    return res.redirect(`http://localhost:${USER_PORT}/auth/login`);
  }
  next();
});

adminApp.use('/admin', require('./routes/admin'));
adminApp.use('/auth', require('./routes/auth'));

// Redirect root to dashboard
adminApp.get('/', (req, res) => {
  res.redirect('/admin/dashboard');
});

// ----------------------------------------------------
// PORT 3002: Seller Dashboard App
// ----------------------------------------------------
const sellerApp = express();
applyBaseMiddleware(sellerApp);

// Port-specific login auth guard
sellerApp.use((req, res, next) => {
  const publicPaths = ['/auth/login', '/auth/signup', '/auth/logout', '/auth/role-select'];
  if (publicPaths.includes(req.path) || req.path.startsWith('/css') || req.path.startsWith('/js')) {
    return next();
  }
  if (!req.isAuthenticated()) {
    req.flash('error', 'Please log in to access the Seller portal.');
    return res.redirect('/auth/login');
  }
  if (req.user.role !== 'seller') {
    req.flash('error', 'Access denied: Seller profile required.');
    return res.redirect(`http://localhost:${USER_PORT}/auth/login`);
  }
  next();
});

sellerApp.use('/seller', require('./routes/seller'));
sellerApp.use('/auth', require('./routes/auth'));
sellerApp.use('/ai', require('./routes/ai')); // Sellers need access to Gemini descriptions/pricing tools

// Redirect root to dashboard
sellerApp.get('/', (req, res) => {
  res.redirect('/seller/dashboard');
});


// ----------------------------------------------------
// HTTP Servers & Socket.io Handlers Setup
// ----------------------------------------------------
const userServer = http.createServer(userApp);
const adminServer = http.createServer(adminApp);
const sellerServer = http.createServer(sellerApp);

// Mount Socket.io onto the User Server (Port 3000 / USER_PORT)
const io = new Server(userServer);
userApp.set('io', io);
require('./config/socketHandlers')(io);

// Start listeners dynamically from env variables
userServer.listen(USER_PORT, () => {
  console.log(`User Marketplace App running on port ${USER_PORT}`);
});

adminServer.listen(ADMIN_PORT, () => {
  console.log(`Admin Dashboard App running on port ${ADMIN_PORT}`);
});

sellerServer.listen(SELLER_PORT, () => {
  console.log(`Seller Dashboard App running on port ${SELLER_PORT}`);
});
