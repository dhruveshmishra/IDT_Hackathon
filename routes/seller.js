const express = require('express');
const router = express.Router();
const isLoggedIn = require('../middleware/isLoggedIn');
const isSeller = require('../middleware/isSeller');
const isOwner = require('../middleware/isOwner');
const upload = require('../middleware/upload');
const Item = require('../models/Item');
const Booking = require('../models/Booking');
const User = require('../models/User');
const cloudinary = require('../config/cloudinary');
const { moderateContent } = require('../utils/geminiHelpers');

// Ensure all seller routes are guarded
router.use(isLoggedIn);
router.use(isSeller);

// Helper to upload buffer to Cloudinary
function uploadToCloudinary(fileBuffer, folderName = 'rentapp_items') {
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

// GET /seller/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const itemsCount = await Item.countDocuments({ owner: req.user._id });
    
    // Aggregate bookings to compute earnings
    const bookings = await Booking.find({ seller: req.user._id, status: { $ne: 'cancelled' } });
    const activeBookings = bookings.filter(b => ['confirmed', 'active'].includes(b.status)).length;
    
    const earnings = bookings
      .filter(b => b.payment.status === 'paid')
      .reduce((sum, b) => sum + (b.totalAmount - (b.deposit || 0)), 0);

    // Save total earnings back to user model
    req.user.sellerProfile.earnings = earnings;
    await req.user.save();

    // Average rating
    const items = await Item.find({ owner: req.user._id });
    const ratedItems = items.filter(i => i.reviewCount > 0);
    const avgRating = ratedItems.length > 0 
      ? ratedItems.reduce((sum, i) => sum + i.avgRating, 0) / ratedItems.length 
      : 0;

    const recentBookings = await Booking.find({ seller: req.user._id })
      .populate('item')
      .populate('renter', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(5);

    res.render('seller/dashboard', {
      itemsCount,
      activeBookings,
      earnings,
      avgRating,
      recentBookings
    });
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/');
  }
});

// GET /seller/verify
router.get('/verify', (req, res) => {
  res.render('seller/verify');
});

// POST /seller/verify (Submit seller document verification)
router.post('/verify', upload.single('verificationDoc'), async (req, res) => {
  try {
    const { businessName, description } = req.body;
    if (!req.file) {
      req.flash('error', 'Please upload your business registration or ID verification document.');
      return res.redirect('/seller/verify');
    }

    const result = await uploadToCloudinary(req.file.buffer, 'rentapp_seller_docs');

    const user = await User.findById(req.user._id);
    user.sellerProfile.businessName = businessName;
    user.sellerProfile.description = description;
    user.sellerProfile.verificationDoc = {
      url: result.secure_url,
      public_id: result.public_id
    };
    user.isVerified = false; // pending admin verify approval
    await user.save();

    req.flash('success', 'Business verification details submitted.');
    res.redirect('/seller/dashboard');
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/seller/verify');
  }
});

// GET /seller/items
router.get('/items', async (req, res) => {
  try {
    const items = await Item.find({ owner: req.user._id });
    res.render('seller/items', { items });
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/seller/dashboard');
  }
});

// GET /seller/items/new
router.get('/items/new', (req, res) => {
  res.render('seller/item-new');
});

// POST /seller/items (Create Listing + AI content moderation check)
router.post('/items', upload.array('images', 5), async (req, res) => {
  try {
    const { title, description, category, pricePerDay, pricePerHour, deposit, address, lng, lat, tags } = req.body;
    
    // AI Content Moderation Check
    let moderationStatus = 'active';
    let isFlagged = false;
    try {
      const modResult = await moderateContent(`${title} ${description}`);
      console.log('Gemini Moderation result:', modResult);
      if (modResult.severity === 'high') {
        req.flash('error', 'Listing creation rejected: inappropriate content detected. Reason: ' + modResult.reason);
        return res.redirect('/seller/items/new');
      } else if (modResult.severity === 'medium') {
        moderationStatus = 'pending_review';
        isFlagged = true;
      }
    } catch (aiErr) {
      console.warn('AI Moderation failed. Permitting listing by default:', aiErr.message);
    }

    // Process Uploads
    const images = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const result = await uploadToCloudinary(file.buffer);
        images.push({
          url: result.secure_url,
          public_id: result.public_id
        });
      }
    }

    const tagList = tags ? tags.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 0) : [];

    const item = new Item({
      title,
      description,
      category,
      pricePerDay: Number(pricePerDay),
      pricePerHour: Number(pricePerHour || 0),
      deposit: Number(deposit || 0),
      images,
      owner: req.user._id,
      location: {
        type: 'Point',
        coordinates: [parseFloat(lng || 72.8777), parseFloat(lat || 19.0760)]
      },
      address,
      tags: tagList,
      status: moderationStatus,
      flagged: isFlagged
    });

    await item.save();

    if (isFlagged) {
      req.flash('warning', 'Listing created but held for moderation review.');
    } else {
      req.flash('success', 'Listing published successfully!');
    }
    res.redirect('/seller/items');
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/seller/items/new');
  }
});

// GET /seller/items/:id/edit
router.get('/items/:id/edit', isOwner, async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    res.render('seller/item-edit', { item });
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/seller/items');
  }
});

// PUT /seller/items/:id (Update Listing + Moderation)
router.post('/items/:id', isOwner, upload.array('images', 5), async (req, res) => {
  try {
    const { title, description, category, pricePerDay, pricePerHour, deposit, address, lng, lat, tags } = req.body;
    const item = await Item.findById(req.params.id);

    let moderationStatus = 'active';
    let isFlagged = false;
    try {
      const modResult = await moderateContent(`${title} ${description}`);
      if (modResult.severity === 'high') {
        req.flash('error', 'Update rejected: inappropriate content detected.');
        return res.redirect(`/seller/items/${item._id}/edit`);
      } else if (modResult.severity === 'medium') {
        moderationStatus = 'pending_review';
        isFlagged = true;
      }
    } catch (aiErr) {
      console.warn('AI Moderation failed during update:', aiErr.message);
    }

    item.title = title;
    item.description = description;
    item.category = category;
    item.pricePerDay = Number(pricePerDay);
    item.pricePerHour = Number(pricePerHour || 0);
    item.deposit = Number(deposit || 0);
    item.address = address;
    item.location = {
      type: 'Point',
      coordinates: [parseFloat(lng || 72.8777), parseFloat(lat || 19.0760)]
    };
    item.tags = tags ? tags.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 0) : [];
    item.status = moderationStatus;
    item.flagged = isFlagged;

    // Process new images if uploaded
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const result = await uploadToCloudinary(file.buffer);
        item.images.push({
          url: result.secure_url,
          public_id: result.public_id
        });
      }
    }

    await item.save();
    req.flash('success', 'Listing updated successfully.');
    res.redirect('/seller/items');
  } catch (err) {
    req.flash('error', err.message);
    res.redirect(`/seller/items/${req.params.id}/edit`);
  }
});

// DELETE /seller/items/:id
router.delete('/items/:id', isOwner, async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    
    // Delete images from Cloudinary
    if (item.images && item.images.length > 0) {
      for (const img of item.images) {
        if (img.public_id) {
          await cloudinary.uploader.destroy(img.public_id);
        }
      }
    }

    await Item.findByIdAndDelete(req.params.id);
    req.flash('success', 'Listing deleted successfully.');
    res.redirect('/seller/items');
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/seller/items');
  }
});

// GET /seller/bookings (Booking Calendar View)
router.get('/bookings', async (req, res) => {
  try {
    const bookings = await Booking.find({ seller: req.user._id })
      .populate('item')
      .populate('renter', 'name email phone avatar')
      .sort({ startDate: 1 });

    res.render('seller/bookings', { bookings });
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/seller/dashboard');
  }
});

// PUT /seller/bookings/:id (Update Booking Status: Confirm/Reject)
router.put('/bookings/:id', async (req, res) => {
  try {
    const { status } = req.body;
    const booking = await Booking.findById(req.params.id);

    if (!booking || !booking.seller.equals(req.user._id)) {
      req.flash('error', 'Booking details not found or access denied.');
      return res.redirect('back');
    }

    booking.status = status;
    await booking.save();

    req.flash('success', `Booking status updated to: ${status}`);
    res.redirect('/seller/bookings');
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('back');
  }
});

// GET /seller/profile
router.get('/profile', (req, res) => {
  res.render('seller/profile');
});

// POST /seller/profile — Update full profile: avatar, business details, address, payout, location
router.post('/profile', upload.single('avatar'), async (req, res) => {
  try {
    const { name, phone, address, businessName, businessAddress, description, upi, bank, aadhaarNumber, lat, lng } = req.body;
    const user = await User.findById(req.user._id);

    // Basic info
    user.name    = name    || user.name;
    user.phone   = phone   || user.phone;
    user.address = address || user.address;

    // GPS location
    if (lat && lng) {
      user.location = { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] };
    }

    // Aadhaar number
    if (aadhaarNumber && aadhaarNumber.replace(/\s/g, '').length === 12) {
      user.aadhaarNumber = aadhaarNumber.replace(/\s/g, '');
    }

    // Seller profile
    user.sellerProfile.businessName  = businessName  || user.sellerProfile.businessName;
    user.sellerProfile.description   = description   || user.sellerProfile.description;
    user.sellerProfile.address       = businessAddress || user.sellerProfile.address;
    user.sellerProfile.payoutDetails = { upi, bank };

    // Avatar upload
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, 'rentapp_avatars');
      user.avatar = { url: result.secure_url, public_id: result.public_id };
    }

    await user.save();
    req.flash('success', 'Profile updated successfully.');
    res.redirect('/seller/profile');
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/seller/profile');
  }
});

// POST /seller/location/update — save GPS from browser Geolocation (JSON)
router.post('/location/update', async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (!lat || !lng) return res.json({ success: false, error: 'Missing coords' });
    await User.findByIdAndUpdate(req.user._id, {
      location: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] }
    });
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// POST /seller/aadhaar — Aadhaar document upload
router.post('/aadhaar', upload.single('aadhaar'), async (req, res) => {
  try {
    const { aadhaarNumber } = req.body;
    const user = await User.findById(req.user._id);

    if (aadhaarNumber && aadhaarNumber.replace(/\s/g, '').length === 12) {
      user.aadhaarNumber = aadhaarNumber.replace(/\s/g, '');
    }

    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, 'rentapp_aadhaar');
      user.aadhaarDoc = { url: result.secure_url, public_id: result.public_id };
      user.aadhaarVerified = false;
    }

    await user.save();
    req.flash('success', 'Aadhaar submitted for verification.');
    res.redirect('/seller/profile');
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/seller/profile');
  }
});

module.exports = router;
