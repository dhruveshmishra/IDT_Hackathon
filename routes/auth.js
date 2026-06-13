const express = require('express');
const router = express.Router();
const passport = require('passport');
const User = require('../models/User');
const upload = require('../middleware/upload');
const cloudinary = require('../config/cloudinary');
const sendEmail = require('../utils/sendEmail');
const sendSMS = require('../utils/sendSMS');

// Helper to upload buffer to Cloudinary
function uploadToCloudinary(fileBuffer, folderName = 'rentapp') {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: folderName },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    uploadStream.end(fileBuffer);
  });
}

// GET Login
router.get('/login', (req, res) => {
  const host = req.headers.host || '';
  const isSellerPort = host.includes('3002');
  const isAdminPort = host.includes('3001');
  const role = req.query.role;

  if (isAdminPort || role === 'admin') {
    res.render('auth/admin-login');
  } else if (isSellerPort || role === 'seller') {
    res.render('auth/seller-login');
  } else if (role === 'user') {
    res.render('auth/login');
  } else {
    res.render('auth/login-select');
  }
});

// POST Login — manual flow to intercept unapproved sellers
router.post('/login', (req, res, next) => {
  passport.authenticate('local', async (err, user, info) => {
    if (err) return next(err);
    
    if (!user) {
      req.flash('error', info ? info.message : 'Incorrect email or password.');
      return res.redirect('/auth/login');
    }

    // Seller-specific approval gate
    if (user.role === 'seller' && !user.sellerApproved) {
      req.flash('error', 'Your seller account is pending admin approval. You will be notified once approved.');
      return res.redirect('/auth/login');
    }

    // User/Renter-specific Aadhaar verification gate
    if (user.role === 'user' && !user.aadhaarVerified) {
      req.flash('error', 'Your account is pending admin Aadhaar verification and approval. You will be notified once approved.');
      return res.redirect('/auth/login');
    }

    req.login(user, (loginErr) => {
      if (loginErr) return next(loginErr);

      req.flash('success', `Welcome back, ${user.name}!`);
      const userPort  = process.env.USER_PORT   || 3000;
      const adminPort = process.env.ADMIN_PORT  || 3001;
      const sellerPort= process.env.SELLER_PORT || 3002;

      if (user.role === 'admin') {
        return res.redirect(`http://localhost:${adminPort}/admin/dashboard`);
      } else if (user.role === 'seller') {
        return res.redirect(`http://localhost:${sellerPort}/seller/dashboard`);
      } else {
        return res.redirect(`http://localhost:${userPort}/user/home`);
      }
    });
  })(req, res, next);
});

// GET Signup
router.get('/signup', (req, res) => {
  const host = req.headers.host || '';
  const isSellerPort = host.includes('3002');
  const isAdminPort = host.includes('3001');
  const role = req.query.role;
  const phone = req.query.phone || '';

  if (isAdminPort) {
    req.flash('error', 'Admin registration is not allowed.');
    return res.redirect('/auth/login');
  }

  if (isSellerPort || role === 'seller') {
    res.render('auth/seller-signup', { phone });
  } else {
    res.render('auth/signup', { preRole: 'user', phone });
  }
});

// POST Signup — handles both user and seller, with Aadhaar upload
router.post('/signup', upload.single('aadhaarDoc'), async (req, res, next) => {
  try {
    const { name, email, password, phone, role, address, aadhaarNumber, businessName, businessAddress, bankName, bankHolderName, bankAccount, bankIfsc, upi } = req.body;

    // Validate role
    const selectedRole = ['user', 'seller'].includes(role) ? role : 'user';

    // Check existing
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      req.flash('error', 'Email is already registered.');
      return res.redirect('/auth/signup?role=' + selectedRole);
    }

    // Build user object
    const userData = {
      name,
      email: email.toLowerCase(),
      password,
      phone,
      address: address || '',
      role: selectedRole,
      sellerApproved: selectedRole === 'user' ? true : false, // Users auto-approved; sellers need admin
    };

    // Aadhaar number
    if (aadhaarNumber && aadhaarNumber.trim().length === 12) {
      userData.aadhaarNumber = aadhaarNumber.trim();
    }

    // Aadhaar doc upload
    if (req.file) {
      try {
        const result = await uploadToCloudinary(req.file.buffer, 'rentapp_aadhaar');
        userData.aadhaarDoc = { url: result.secure_url, public_id: result.public_id };
      } catch (uploadErr) {
        console.warn('Aadhaar upload failed:', uploadErr.message);
      }
    }

    // Seller profile extras
    if (selectedRole === 'seller') {
      userData.sellerProfile = {
        businessName: businessName || name,
        address: businessAddress || address || '',
        earnings: 0,
        payoutDetails: {
          upi: upi || '',
          bankAccount: bankAccount || '',
          bankName: bankName || '',
          bankIfsc: bankIfsc || '',
          bankHolderName: bankHolderName || '',
          verified: false
        }
      };
    }

    const newUser = new User(userData);
    await newUser.save();

    // Welcome email notifying that account registration has been received and is pending verification
    try {
      await sendEmail({
        to: newUser.email,
        subject: 'Welcome to RentIt — Registration Received',
        text: `Hi ${newUser.name}, welcome to RentIt! Your account is registered and is currently pending admin verification and approval. We will email you once your account has been verified and approved.`,
        html: `<p>Hi ${newUser.name},</p><p>Welcome to RentIt!</p><p>Your account is registered and is currently <strong>pending admin verification/approval</strong>. We will email you as soon as your account has been verified and approved.</p>`
      });
    } catch (emailErr) {
      console.warn('Welcome email failed:', emailErr.message);
    }

    if (selectedRole === 'seller') {
      // Seller cannot log in yet — show message, don't log in
      req.flash('success', `Seller account created! Please wait for admin approval before logging in. We'll notify you at ${newUser.email}.`);
      return res.redirect('/auth/login');
    }

    // Log the user in for regular users
    req.login(newUser, (err) => {
      if (err) return next(err);
      req.flash('success', 'Welcome to RentIt! Your account is ready.');
      const userPort = process.env.USER_PORT || 3000;
      res.redirect(`http://localhost:${userPort}/user/home`);
    });

  } catch (error) {
    req.flash('error', error.message);
    res.redirect('/auth/signup');
  }
});

// GET Role Select
router.get('/role-select', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/auth/login');
  }
  res.render('auth/role-select');
});

// POST Role Select
router.post('/role-select', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/auth/login');
  }
  try {
    const { role } = req.body;
    if (!['user', 'seller'].includes(role)) {
      req.flash('error', 'Invalid role selected');
      return res.redirect('/auth/role-select');
    }
    
    req.user.role = role;
    if (role === 'seller') {
      req.user.sellerApproved = false; // Needs admin approval
    }
    await req.user.save();

    if (role === 'seller') {
      req.flash('success', 'Seller account created! Admin approval is pending.');
      return res.redirect('/auth/login');
    }

    req.flash('success', `Account configured as USER`);
    const userPort = process.env.USER_PORT || 3000;
    res.redirect(`http://localhost:${userPort}/user/home`);
  } catch (error) {
    req.flash('error', error.message);
    res.redirect('/auth/role-select');
  }
});

// POST Logout
router.post('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.flash('success', 'Logged out successfully');
    const userPort = process.env.USER_PORT || 3000;
    res.redirect(`http://localhost:${userPort}/`);
  });
});

// GET Verify Email Link
router.get('/verify-email/:token', async (req, res) => {
  if (req.user) {
    req.user.isVerified = true;
    await req.user.save();
    req.flash('success', 'Email verified successfully.');
    const userPort  = process.env.USER_PORT   || 3000;
    const sellerPort= process.env.SELLER_PORT || 3002;
    return res.redirect(req.user.role === 'seller' ? `http://localhost:${sellerPort}/seller/dashboard` : `http://localhost:${userPort}/user/home`);
  }
  res.render('auth/login', { message: 'Email verified. Please log in.' });
});

// POST Send OTP (SMS)
router.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    const otp = Math.floor(100000 + Math.random() * 900000);
    req.session.phoneOtp = otp;
    req.session.phoneToVerify = phone;

    await sendSMS({
      to: phone,
      body: `Your RentIt verification code is: ${otp}. Do not share this OTP.`
    });

    res.json({ success: true, message: 'OTP sent successfully. (Mock OTP: ' + otp + ')' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Verify OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { otp } = req.body;
    if (!req.session.phoneOtp || String(req.session.phoneOtp) !== String(otp)) {
      return res.status(400).json({ success: false, error: 'Incorrect OTP' });
    }
    if (req.user) {
      req.user.phone = req.session.phoneToVerify;
      req.user.isVerified = true;
      await req.user.save();
    }
    delete req.session.phoneOtp;
    delete req.session.phoneToVerify;
    res.json({ success: true, message: 'Phone verified successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
