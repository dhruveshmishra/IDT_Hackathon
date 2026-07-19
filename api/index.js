const express = require('express');
const ejs = require('ejs'); // Explicitly required for Vercel's file-trace bundling
const { bootstrap } = require('../app');

const mainApp = express();
let bootedPromise = null;

function getApps() {
  if (!bootedPromise) {
    bootedPromise = bootstrap();
  }
  return bootedPromise;
}

mainApp.use(async (req, res, next) => {
  try {
    const { userApp, adminApp, sellerApp } = await getApps();
    const host = req.headers.host || '';

    // Route based on subdomains (Recommended for production on Vercel)
    if (host.startsWith('admin.')) {
      return adminApp(req, res, next);
    } else if (host.startsWith('seller.')) {
      return sellerApp(req, res, next);
    }

    // Path-based routing fallback (e.g. /admin -> adminApp, /seller -> sellerApp)
    if (req.path.startsWith('/admin')) {
      return adminApp(req, res, next);
    } else if (req.path.startsWith('/seller')) {
      return sellerApp(req, res, next);
    }

    // Default to the Marketplace (userApp)
    return userApp(req, res, next);
  } catch (err) {
    console.error('Routing error in serverless entrypoint:', err);
    next(err);
  }
});

module.exports = mainApp;
