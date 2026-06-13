const express = require('express');
const router = express.Router();
const isLoggedIn = require('../middleware/isLoggedIn');
const isAdmin = require('../middleware/isAdmin');
const User = require('../models/User');
const Item = require('../models/Item');
const Booking = require('../models/Booking');
const sendEmail = require('../utils/sendEmail');
const sendSMS = require('../utils/sendSMS');

// Ensure all admin routes are strictly guarded
router.use(isLoggedIn);
router.use(isAdmin);

// GET /admin/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ role: 'user' });
    const totalSellers = await User.countDocuments({ role: 'seller' });
    const activeListings = await Item.countDocuments({ status: 'active' });
    const totalBookings = await Booking.countDocuments();

    // Sellers awaiting approval (not yet approved by admin)
    const pendingApprovalCount = await User.countDocuments({ role: 'seller', sellerApproved: false });

    // Sellers awaiting Aadhaar/doc verification (approved but not verified)
    const pendingVerifications = await User.countDocuments({
      role: 'seller',
      sellerApproved: true,
      isVerified: false,
      'sellerProfile.verificationDoc.url': { $exists: true }
    });
    
    const paidBookings = await Booking.find({ 'payment.status': 'paid' });
    const totalRevenue = paidBookings.reduce((sum, b) => sum + (b.totalAmount - (b.deposit || 0)), 0);

    const pendingSellersList = await User.find({ role: 'seller', sellerApproved: false });
    const pendingVerifyList = await User.find({
      role: 'seller',
      sellerApproved: true,
      isVerified: false,
      'sellerProfile.verificationDoc.url': { $exists: true }
    });

    res.render('admin/dashboard', {
      totalUsers,
      totalSellers,
      activeListings,
      totalBookings,
      totalRevenue,
      pendingVerifications,
      pendingApprovalCount,
      pendingSellersList,
      pendingVerifyList
    });
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/');
  }
});

// GET /admin/users
router.get('/users', async (req, res) => {
  try {
    const users = await User.find({ role: 'user' });
    res.render('admin/users', { users });
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/admin/dashboard');
  }
});

// DELETE /admin/users/:id
router.delete('/users/:id', async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    req.flash('success', 'User removed successfully.');
    res.redirect('/admin/users');
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/admin/users');
  }
});

// GET /admin/sellers (Verification + Approval page)
router.get('/sellers', async (req, res) => {
  try {
    const sellers = await User.find({ role: 'seller' });
    res.render('admin/sellers', { sellers });
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/admin/dashboard');
  }
});

// PUT /admin/sellers/:id/approve — Approve seller login
router.put('/sellers/:id/approve', async (req, res) => {
  try {
    const seller = await User.findById(req.params.id);
    if (!seller) {
      req.flash('error', 'Seller not found.');
      return res.redirect('back');
    }

    seller.sellerApproved = true;
    await seller.save();

    await sendEmail({
      to: seller.email,
      subject: 'RentIt — Your Seller Account is Approved!',
      text: `Congratulations ${seller.name}! Your seller account on RentIt has been approved by admin. You can now log in and start listing items.`,
      html: `<p>Congratulations <strong>${seller.name}</strong>!</p><p>Your seller account on RentIt has been <strong>approved</strong> by our admin team. You can now log in at <a href="${process.env.SELLER_APP_URL || 'http://localhost:3002'}/auth/login">Seller Portal</a> and start earning.</p>`
    });

    req.flash('success', `${seller.name}'s seller login has been approved.`);
    res.redirect('/admin/sellers');
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('back');
  }
});

// PUT /admin/sellers/:id/reject-approval — Reject seller account entirely
router.put('/sellers/:id/reject-approval', async (req, res) => {
  try {
    const { reason } = req.body;
    const seller = await User.findById(req.params.id);
    if (!seller) {
      req.flash('error', 'Seller not found.');
      return res.redirect('back');
    }

    await sendEmail({
      to: seller.email,
      subject: 'RentIt — Seller Account Not Approved',
      text: `Hello ${seller.name}, your seller account could not be approved. Reason: ${reason || 'Please contact support.'}`,
      html: `<p>Hello ${seller.name},</p><p>Unfortunately your seller account was not approved.</p><p><strong>Reason:</strong> ${reason || 'Please contact our support team.'}</p>`
    });

    await User.findByIdAndDelete(seller._id);
    req.flash('success', 'Seller account rejected and removed.');
    res.redirect('/admin/sellers');
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('back');
  }
});

// DELETE /admin/sellers/:id — Delete seller account completely
router.delete('/sellers/:id', async (req, res) => {
  try {
    const seller = await User.findById(req.params.id);
    if (!seller) {
      req.flash('error', 'Seller not found.');
      return res.redirect('/admin/sellers');
    }
    
    // Clean up their associated listings
    await Item.deleteMany({ owner: seller._id });
    
    await User.findByIdAndDelete(seller._id);
    req.flash('success', 'Seller account and their listings deleted successfully.');
    res.redirect('/admin/sellers');
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/admin/sellers');
  }
});

// PUT /admin/sellers/:id/verify (Verify seller docs + email notification)
router.put('/sellers/:id/verify', async (req, res) => {
  try {
    const seller = await User.findById(req.params.id);
    if (!seller) {
      req.flash('error', 'Seller not found.');
      return res.redirect('back');
    }

    seller.isVerified = true;
    seller.sellerProfile.verifiedAt = new Date();
    await seller.save();

    await sendEmail({
      to: seller.email,
      subject: 'RentIt Seller Account Verified!',
      text: `Congratulations ${seller.name}! Your seller profile documents have been verified.`,
      html: `<p>Congratulations ${seller.name}!</p><p>Your seller profile has been <strong>verified</strong>. You can now publish listings and start earning on RentIt.</p>`
    });

    req.flash('success', `${seller.name} document verified successfully.`);
    res.redirect('/admin/sellers');
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('back');
  }
});

// PUT /admin/sellers/:id/reject (Reject docs)
router.put('/sellers/:id/reject', async (req, res) => {
  try {
    const { reason } = req.body;
    const seller = await User.findById(req.params.id);
    if (!seller) {
      req.flash('error', 'Seller not found.');
      return res.redirect('back');
    }

    seller.isVerified = false;
    seller.sellerProfile.verificationDoc = undefined;
    await seller.save();

    await sendEmail({
      to: seller.email,
      subject: 'RentIt Seller Verification Update',
      text: `Hello ${seller.name}, your seller verification could not be completed. Reason: ${reason}.`,
      html: `<p>Hello ${seller.name},</p><p>Your seller verification could not be completed.</p><p><strong>Reason:</strong> ${reason}</p><p>Please log in and update your documents.</p>`
    });

    req.flash('success', `Seller profile verification rejected.`);
    res.redirect('/admin/sellers');
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('back');
  }
});

// GET /admin/items
router.get('/items', async (req, res) => {
  try {
    const items = await Item.find().populate('owner', 'name email');
    res.render('admin/items', { items });
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/admin/dashboard');
  }
});

// PUT /admin/items/:id/status
router.put('/items/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const item = await Item.findById(req.params.id);
    item.status = status;
    if (status === 'active') item.flagged = false;
    await item.save();
    req.flash('success', `Listing status updated to: ${status}`);
    res.redirect('back');
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('back');
  }
});

// DELETE /admin/items/:id
router.delete('/items/:id', async (req, res) => {
  try {
    await Item.findByIdAndDelete(req.params.id);
    req.flash('success', 'Listing removed from platform.');
    res.redirect('/admin/items');
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/admin/items');
  }
});

// GET /admin/bookings
router.get('/bookings', async (req, res) => {
  try {
    const { sellerId } = req.query;
    const filter = {};
    if (sellerId) {
      filter.seller = sellerId;
    }
    const bookings = await Booking.find(filter)
      .populate('item')
      .populate('renter', 'name email')
      .populate('seller', 'name email')
      .sort({ createdAt: -1 });

    const sellers = await User.find({ role: 'seller' }).select('name email avatar');
    res.render('admin/bookings', { bookings, sellers, selectedSellerId: sellerId });
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/admin/dashboard');
  }
});

// GET /admin/payments
router.get('/payments', async (req, res) => {
  try {
    const bookings = await Booking.find({ 'payment.status': 'paid' })
      .populate('item')
      .populate('renter', 'name email')
      .populate('seller', 'name email')
      .sort({ createdAt: -1 });
    res.render('admin/payments', { bookings });
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/admin/dashboard');
  }
});

// GET /admin/moderation
router.get('/moderation', async (req, res) => {
  try {
    const items = await Item.find({ status: 'pending_review' }).populate('owner', 'name email');
    res.render('admin/moderation', { items });
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/admin/dashboard');
  }
});

// PUT /admin/moderation/:id
router.put('/moderation/:id', async (req, res) => {
  try {
    const { action } = req.body;
    const item = await Item.findById(req.params.id);

    if (action === 'approve') {
      item.status = 'active';
      item.flagged = false;
    } else {
      item.status = 'rejected';
      item.flagged = true;
    }

    await item.save();
    req.flash('success', `Content moderation action successfully registered.`);
    res.redirect('/admin/moderation');
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/admin/moderation');
  }
});

// GET /admin/aadhaar-review — Review user/seller Aadhaar docs
router.get('/aadhaar-review', async (req, res) => {
  try {
    const usersWithAadhaar = await User.find({ 'aadhaarDoc.url': { $exists: true, $ne: '' }, aadhaarVerified: false });
    res.render('admin/aadhaar-review', { usersWithAadhaar });
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/admin/dashboard');
  }
});

// PUT /admin/aadhaar-review/:id/verify
router.put('/aadhaar-review/:id/verify', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      req.flash('error', 'User not found.');
      return res.redirect('back');
    }
    user.aadhaarVerified = true;
    await user.save();
    req.flash('success', `Aadhaar verified for ${user.name}.`);
    res.redirect('/admin/aadhaar-review');
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('back');
  }
});

module.exports = router;
