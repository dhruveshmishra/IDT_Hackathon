module.exports = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  req.flash('error', 'Admin access required');
  res.status(403).redirect('/');
};
