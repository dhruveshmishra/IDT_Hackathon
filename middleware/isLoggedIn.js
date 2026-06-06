module.exports = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  req.session.returnTo = req.originalUrl;
  req.flash('error', 'Please login to continue');
  res.redirect('/auth/login');
};
