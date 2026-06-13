const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const User = require('../models/User');

passport.use(new LocalStrategy({
  usernameField: 'email',
  passwordField: 'password',
  passReqToCallback: true
}, async (req, email, password, done) => {
  try {
    const appMode = req.app.locals.APP_MODE || 'user';
    let targetRole = req.body.role || req.query.role || (appMode === 'all' ? 'user' : appMode);

    if (!['user', 'seller', 'admin'].includes(targetRole)) {
      targetRole = 'user';
    }

    const user = await User.findOne({ email: email.toLowerCase(), role: targetRole });
    if (!user) {
      return done(null, false, { message: 'Incorrect email or password.' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return done(null, false, { message: 'Incorrect email or password.' });
    }
    return done(null, user);
  } catch (err) {
    return done(err);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

module.exports = passport;
