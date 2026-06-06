module.exports = (req, res, next) => {
  if (req.user && req.user.role === 'seller') {
    if (!req.user.sellerApproved) {
      req.flash('error', 'Your seller account is pending admin approval. Please wait for confirmation.');
      return res.redirect('/auth/login');
    }
    return next();
  }
  req.flash('error', 'Seller access required');
  res.status(403).redirect('/');
};
