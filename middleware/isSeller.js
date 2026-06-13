module.exports = (req, res, next) => {
  // Must be a seller role
  if (!req.user || req.user.role !== 'seller') {
    req.flash('error', 'Seller access required.');
    return res.status(403).redirect('/');
  }

  // Allow access to auth, profile, and verification pages regardless of status
  const alwaysAllowed = [
    '/auth/login', '/auth/logout', '/auth/signup',
    '/seller/verify', '/seller/profile', '/seller/location/update', '/seller/aadhaar'
  ];
  const isAllowed = alwaysAllowed.some(p => req.path === p || req.originalUrl.startsWith(p));
  if (isAllowed) return next();

  // Gate 1: Admin must have approved the seller account
  if (!req.user.sellerApproved) {
    req.flash('error', 'Your seller account is pending admin approval. Please wait for confirmation.');
    return res.redirect('/seller/verify');
  }

  // Gate 2: Seller must have verified Aadhaar (KYC) before accessing dashboard
  if (!req.user.isVerified) {
    req.flash('error', 'Your account is not verified yet. Please submit your business verification documents and wait for admin approval.');
    return res.redirect('/seller/verify');
  }

  return next();
};
