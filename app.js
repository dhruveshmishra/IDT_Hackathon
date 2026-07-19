require('dotenv').config();
if (process.stdout._handle && typeof process.stdout._handle.setBlocking === 'function') {
  process.stdout._handle.setBlocking(true);
}
if (process.stderr._handle && typeof process.stderr._handle.setBlocking === 'function') {
  process.stderr._handle.setBlocking(true);
}
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
const compression = require('compression');
const { RedisStore } = require('connect-redis');
const { createClient } = require('redis');


// Port & deployment mode
const APP_MODE = process.env.APP_MODE || 'all'; // 'user' | 'seller' | 'admin' | 'all'
const PORT = process.env.PORT;                   // Railway injects PORT automatically
const USER_PORT = PORT && APP_MODE === 'user'   ? PORT : (process.env.USER_PORT   || 3000);
const ADMIN_PORT  = PORT && APP_MODE === 'admin'  ? PORT : (process.env.ADMIN_PORT  || 3001);
const SELLER_PORT = PORT && APP_MODE === 'seller' ? PORT : (process.env.SELLER_PORT || 3002);

// Public-facing URLs (used in email links & EJS templates)
const USER_APP_URL   = process.env.USER_APP_URL   || (process.env.VERCEL ? '' : `http://localhost:${USER_PORT}`);
const SELLER_APP_URL = process.env.SELLER_APP_URL || (process.env.VERCEL ? '/seller' : `http://localhost:${SELLER_PORT}`);

// Export for use in other modules (admin.js email links etc.)
module.exports = { USER_APP_URL, SELLER_APP_URL, bootstrap };

// Database details
const localMongoUrl = process.env.LOCAL_MONGO_URL || 'mongodb://127.0.0.1:27017/rentapp';

const dns = require('dns').promises;

async function bootstrap() {
  // MONGO_URL will be verified and resolved dynamically inside config/db.js

  const sessionMongoUrl = process.env.MONGO_URL || localMongoUrl;

  // Configs
  require('./config/db');
  require('./config/passport');

  // ----------------------------------------------------
  // Isolated Session Configurations (to prevent cookie collisions on different localhost ports)
  // ----------------------------------------------------
  let redisClient;
  let useRedis = false;

  if (process.env.REDIS_URL) {
    console.log(`Connecting to Redis: ${process.env.REDIS_URL}`);
    redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.connect().catch(err => {
      console.error('Redis connection failed:', err.message);
    });
    useRedis = true;
  }

  const userSessionStore = useRedis
    ? new RedisStore({ client: redisClient, prefix: 'rentit:user:' })
    : MongoStore.create({ mongoUrl: sessionMongoUrl });

  const adminSessionStore = useRedis
    ? new RedisStore({ client: redisClient, prefix: 'rentit:admin:' })
    : MongoStore.create({ mongoUrl: sessionMongoUrl });

  const sellerSessionStore = useRedis
    ? new RedisStore({ client: redisClient, prefix: 'rentit:seller:' })
    : MongoStore.create({ mongoUrl: sessionMongoUrl });

  const userSession = session({
    name: 'rentit.user.sid',
    secret: process.env.SESSION_SECRET || 'rentit_user_secret_key',
    resave: false,
    saveUninitialized: false,
    store: userSessionStore,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true }
  });

  const adminSession = session({
    name: 'rentit.admin.sid',
    secret: process.env.SESSION_SECRET || 'rentit_admin_secret_key',
    resave: false,
    saveUninitialized: false,
    store: adminSessionStore,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true }
  });

  const sellerSession = session({
    name: 'rentit.seller.sid',
    secret: process.env.SESSION_SECRET || 'rentit_seller_secret_key',
    resave: false,
    saveUninitialized: false,
    store: sellerSessionStore,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true }
  });

  // Helper function to apply core middleware to Express sub-apps
  function applyBaseMiddleware(appInstance, sessionMiddleware) {
    appInstance.use(compression());
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

    // Global locals (available in all EJS templates)
    appInstance.use((req, res, next) => {
      res.locals.currentUser = req.user;
      res.locals.currentPath = req.originalUrl.split('?')[0]; // full path, no query string
      res.locals.success = req.flash('success');
      res.locals.error = req.flash('error');
      // Expose public URLs so EJS templates never need hardcoded localhost
      res.locals.USER_APP_URL   = USER_APP_URL;
      res.locals.SELLER_APP_URL = SELLER_APP_URL;
      next();
    });
  }

  // ----------------------------------------------------
  // PORT 3000: User Marketplace (Renter App)
  // ----------------------------------------------------
  const userApp = express();
  applyBaseMiddleware(userApp, userSession);
  userApp.locals.APP_MODE = 'user'; // lets auth routes detect context on Railway

  userApp.use('/auth', require('./routes/auth'));
  userApp.use('/user', require('./routes/user'));
  userApp.use('/items', require('./routes/items'));
  userApp.use('/bookings', require('./routes/bookings'));
  userApp.use('/payments', require('./routes/payments'));
  userApp.use('/chat', require('./routes/chat'));
  userApp.use('/ai', require('./routes/ai'));

  userApp.get('/', (req, res, next) => {
    res.set('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
    next();
  }, async (req, res) => {
    if (req.isAuthenticated()) {
      return req.logout((err) => {
        res.redirect('/');
      });
    }
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
  applyBaseMiddleware(adminApp, adminSession);
  adminApp.locals.APP_MODE = 'admin'; // lets auth routes detect context on Railway
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
      return res.redirect(`${USER_APP_URL}/auth/login`);
    }
    next();
  });

  console.log('Registering adminApp routes...');
  adminApp.use('/admin', require('./routes/admin'));
  adminApp.use('/auth', require('./routes/auth'));

  // Redirect root to dashboard
  adminApp.get('/', (req, res) => {
    res.redirect('/admin/dashboard');
  });

  // ----------------------------------------------------
  // PORT 3002: Seller Dashboard App
  // ----------------------------------------------------
  console.log('Initializing sellerApp...');
  const sellerApp = express();
  applyBaseMiddleware(sellerApp, sellerSession);
  sellerApp.locals.APP_MODE = 'seller'; // lets auth routes detect context on Railway

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
      return res.redirect(`${USER_APP_URL}/auth/login`);
    }
    next();
  });

  console.log('Registering sellerApp routes...');
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
  console.log('Creating HTTP servers...');
  const userServer = http.createServer(userApp);
  const adminServer = http.createServer(adminApp);
  const sellerServer = http.createServer(sellerApp);

  console.log('Attaching Socket.io...');
  // Mount Socket.io onto ALL three servers so sellers/admins can also use real-time chat
  const io = new Server({ cors: { origin: '*' } });

  if (useRedis) {
    const { createAdapter } = require('@socket.io/redis-adapter');
    const pubClient = redisClient.duplicate();
    const subClient = redisClient.duplicate();
    Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
      io.adapter(createAdapter(pubClient, subClient));
      console.log('Socket.io Redis Adapter successfully attached');
    }).catch(err => {
      console.error('Socket.io Redis Adapter failed to attach:', err.message);
    });
  }

  io.attach(userServer);
  io.attach(adminServer);
  io.attach(sellerServer);

  userApp.set('io', io);
  sellerApp.set('io', io);
  adminApp.set('io', io);

  console.log('Loading socketHandlers...');
  require('./config/socketHandlers')(io);

  // -----------------------------------------------
  // Start the correct server(s) based on APP_MODE
  // -----------------------------------------------
  if (!process.env.VERCEL) {
    if (APP_MODE === 'user') {
      userServer.listen(USER_PORT, () => console.log(`[USER]   Marketplace running on port ${USER_PORT}  → ${USER_APP_URL}`));
    } else if (APP_MODE === 'seller') {
      sellerServer.listen(SELLER_PORT, () => console.log(`[SELLER] Dashboard running on port ${SELLER_PORT} → ${SELLER_APP_URL}`));
    } else if (APP_MODE === 'admin') {
      adminServer.listen(ADMIN_PORT, () => console.log(`[ADMIN]  Portal running on port ${ADMIN_PORT}`));
    } else {
      // APP_MODE=all  — local development (default)
      userServer.listen(USER_PORT,     () => console.log(`[USER]   Marketplace running on port ${USER_PORT}`));
      adminServer.listen(ADMIN_PORT,   () => console.log(`[ADMIN]  Portal running on port ${ADMIN_PORT}`));
      sellerServer.listen(SELLER_PORT, () => console.log(`[SELLER] Dashboard running on port ${SELLER_PORT}`));
    }
  }

  return { userApp, adminApp, sellerApp };
}

if (!process.env.VERCEL) {
  bootstrap().catch(err => {
    console.error('Error bootstrapping application:', err);
    process.exit(1);
  });
}
