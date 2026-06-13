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
const { moderateContent, assessDamage } = require('../utils/geminiHelpers');

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

    // Calculate real 30 days daily earnings for chart
    const dailyEarningsMap = {};
    const chartLabels = [];
    const chartData = [];
    
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      dailyEarningsMap[key] = 0;
      chartLabels.push(key);
    }
    
    bookings.forEach(b => {
      if (b.payment && b.payment.status === 'paid' && b.createdAt) {
        const key = new Date(b.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (dailyEarningsMap[key] !== undefined) {
          dailyEarningsMap[key] += (b.totalAmount - (b.deposit || 0));
        }
      }
    });

    chartLabels.forEach(label => {
      chartData.push(dailyEarningsMap[label]);
    });

    // Calculate weekly earnings (last 12 weeks)
    const weeklyEarningsMap = {};
    const weeklyLabels = [];
    const weeklyData = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i * 7);
      const key = "Wk of " + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      weeklyEarningsMap[key] = 0;
      weeklyLabels.push(key);
    }
    bookings.forEach(b => {
      if (b.payment && b.payment.status === 'paid' && b.createdAt) {
        const bDate = new Date(b.createdAt);
        for (let i = 11; i >= 0; i--) {
          const bucketDate = new Date();
          bucketDate.setDate(bucketDate.getDate() - i * 7);
          bucketDate.setHours(0,0,0,0);
          const bucketEnd = new Date(bucketDate);
          bucketEnd.setDate(bucketEnd.getDate() + 7);
          if (bDate >= bucketDate && bDate < bucketEnd) {
            const label = weeklyLabels[11 - i];
            weeklyEarningsMap[label] += (b.totalAmount - (b.deposit || 0));
            break;
          }
        }
      }
    });
    weeklyLabels.forEach(label => {
      weeklyData.push(weeklyEarningsMap[label]);
    });

    // Calculate monthly earnings (last 12 months)
    const monthlyEarningsMap = {};
    const monthlyLabels = [];
    const monthlyData = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      monthlyEarningsMap[key] = 0;
      monthlyLabels.push(key);
    }
    bookings.forEach(b => {
      if (b.payment && b.payment.status === 'paid' && b.createdAt) {
        const key = new Date(b.createdAt).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        if (monthlyEarningsMap[key] !== undefined) {
          monthlyEarningsMap[key] += (b.totalAmount - (b.deposit || 0));
        }
      }
    });
    monthlyLabels.forEach(label => {
      monthlyData.push(monthlyEarningsMap[label]);
    });



    res.render('seller/dashboard', {
      itemsCount,
      activeBookings,
      earnings,
      avgRating,
      recentBookings,
      chartLabels,
      chartData,
      weeklyLabels,
      weeklyData,
      monthlyLabels,
      monthlyData
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
    const { title, description, category, pricePerDay, pricePerHour, deposit, address, lng, lat, tags, quantity } = req.body;
    
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
    const quantityVal = quantity !== undefined ? Number(quantity) : 1;

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
      flagged: isFlagged,
      quantity: quantityVal,
      isAvailable: quantityVal > 0
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
    const { title, description, category, pricePerDay, pricePerHour, deposit, address, lng, lat, tags, quantity } = req.body;
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

    const quantityVal = quantity !== undefined ? Number(quantity) : 1;

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
    item.quantity = quantityVal;
    item.isAvailable = quantityVal > 0;

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

    if (status === 'confirmed' && booking.status !== 'confirmed') {
      const item = await Item.findById(booking.item);
      if (item) {
        if (item.quantity > 0) {
          item.quantity -= 1;
        }
        item.isAvailable = item.quantity > 0;
        await item.save();
      }
    }

    if (status === 'cancelled' && (booking.status === 'confirmed' || booking.status === 'active')) {
      const item = await Item.findById(booking.item);
      if (item) {
        item.quantity += 1;
        item.isAvailable = true;
        await item.save();
      }
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

// POST /seller/bookings/:id/handover — Upload handover photo and mark active
router.post('/bookings/:id/handover', upload.single('handoverImage'), async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking || !booking.seller.equals(req.user._id)) {
      req.flash('error', 'Booking not found or access denied.');
      return res.redirect('back');
    }

    if (!req.file) {
      req.flash('error', 'Please upload a photo of the item during handover.');
      return res.redirect('back');
    }

    const uploadResult = await uploadToCloudinary(req.file.buffer, 'rentapp_handover');
    booking.dispute = booking.dispute || {};
    booking.dispute.beforeImage = uploadResult.secure_url;
    booking.dispute.status = 'pending';
    booking.status = 'active';
    await booking.save();

    req.flash('success', 'Handover recorded successfully! Item is now marked as Active (Rented).');
    res.redirect('/seller/bookings');
  } catch (err) {
    req.flash('error', 'Handover failed: ' + err.message);
    res.redirect('back');
  }
});

// POST /seller/bookings/:id/return — Upload return photo, run AI damage inspection, and mark completed
router.post('/bookings/:id/return', upload.single('returnImage'), async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('item');
    if (!booking || !booking.seller.equals(req.user._id)) {
      req.flash('error', 'Booking not found or access denied.');
      return res.redirect('back');
    }

    if (!req.file) {
      req.flash('error', 'Please upload a photo of the item during return.');
      return res.redirect('back');
    }

    const uploadResult = await uploadToCloudinary(req.file.buffer, 'rentapp_return');
    booking.dispute = booking.dispute || {};
    booking.dispute.afterImage = uploadResult.secure_url;
    booking.dispute.status = 'pending';
    booking.status = 'completed';

    // Auto run Gemini AI damage assessment
    try {
      const assessment = await assessDamage(
        booking.dispute.beforeImage,
        booking.dispute.afterImage,
        booking.item ? (booking.item.description || booking.item.title) : 'Rented Item'
      );
      
      const damageLoc = (assessment.damageLocation || 'none').toUpperCase();
      const severityStr = (assessment.severity || 'none').toUpperCase();
      
      booking.dispute.aiAnalysis = `Damage: ${assessment.description || 'No damage detected'}. Detected Location: ${damageLoc}. Severity: ${severityStr}. Reasoning: ${assessment.reasoning || 'No reasoning details provided.'}`;
      booking.dispute.deductionAmount = 0;
    } catch (aiErr) {
      console.error('Auto Gemini assessment failed on return:', aiErr.message);
      booking.dispute.aiAnalysis = 'Auto AI inspection failed during return: ' + aiErr.message;
      booking.dispute.deductionAmount = 0;
    }

    // Restore item quantity when marked completed/returned
    const item = await Item.findById(booking.item);
    if (item) {
      item.quantity += 1;
      item.isAvailable = true;
      await item.save();
    }

    await booking.save();
    req.flash('success', 'Return recorded and AI Damage Inspection completed! Booking marked as Completed.');
    res.redirect('/seller/bookings');
  } catch (err) {
    req.flash('error', 'Return recording failed: ' + err.message);
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

// GET /seller/inspection — Run AI Damage Inspection
router.get('/inspection', async (req, res) => {
  try {
    const bookings = await Booking.find({ 
      seller: req.user._id,
      status: { $in: ['confirmed', 'active', 'completed'] }
    })
      .populate('item')
      .sort({ createdAt: -1 });

    res.render('seller/damage-inspection', { bookings, activePage: 'inspection' });
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/seller/dashboard');
  }
});

// POST /seller/inspection — Run AI Damage Inspection
router.post('/inspection', upload.fields([
  { name: 'beforeImage', maxCount: 1 },
  { name: 'afterImage', maxCount: 1 }
]), async (req, res) => {
  try {
    const { itemTitle, bookingId } = req.body;

    if (!req.files || !req.files['beforeImage'] || !req.files['afterImage']) {
      return res.status(400).json({ success: false, error: 'Both before and after photos are required.' });
    }

    // Upload to Cloudinary using helper function
    const beforeResult = await uploadToCloudinary(req.files['beforeImage'][0].buffer, 'rentapp_inspection');
    const afterResult = await uploadToCloudinary(req.files['afterImage'][0].buffer, 'rentapp_inspection');

    // Run AI damage analysis
    const assessment = await assessDamage(
      beforeResult.secure_url,
      afterResult.secure_url,
      itemTitle || 'Rented Item'
    );

    // If a bookingId was provided, save the result to that booking's dispute field
    if (bookingId && bookingId !== 'custom') {
      const booking = await Booking.findById(bookingId);
      if (booking) {
        const damageLoc = (assessment.damageLocation || 'none').toUpperCase();
        const severityStr = (assessment.severity || 'none').toUpperCase();
        booking.dispute = {
          beforeImage: beforeResult.secure_url,
          afterImage: afterResult.secure_url,
          status: 'pending',
          aiAnalysis: `Damage: ${assessment.description || 'No damage detected'}. Detected Location: ${damageLoc}. Severity: ${severityStr}. Reasoning: ${assessment.reasoning || 'No reasoning details provided.'}`,
          deductionAmount: 0,
          createdAt: new Date()
        };
        await booking.save();
      }
    }

    res.json({
      success: true,
      beforeImage: beforeResult.secure_url,
      afterImage: afterResult.secure_url,
      description: assessment.description,
      severity: assessment.severity,
      damageLocation: assessment.damageLocation,
      deductionAmount: 0,
      reasoning: assessment.reasoning
    });
  } catch (err) {
    console.error('AI Inspection Portal Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// GET /seller/messages            — inbox list
// GET /seller/messages/:bookingId — open thread
// ─────────────────────────────────────────────
const Message = (() => {
  try { return require('../models/Message'); } catch(e) { return null; }
})();

router.get('/messages', async (req, res) => {
  try {
    const sellerId = req.user._id;

    // All bookings that belong to seller directly, with populated renter + item
    const bookings = await Booking.find({ seller: sellerId })
      .populate('item')
      .populate('renter', 'name avatar')
      .sort({ updatedAt: -1 });

    const sellerBookings = bookings.filter(b => b.item);

    // Build thread list with last message and unread count
    let threads = [];
    let totalUnread = 0;

    for (const booking of sellerBookings) {
      let lastMsg = null;
      let unread = 0;

      if (Message) {
        lastMsg = await Message.findOne({ booking: booking._id })
          .sort({ createdAt: -1 }).select('text createdAt sender');
        unread = await Message.countDocuments({
          booking: booking._id,
          sender: { $ne: sellerId },
          readBy: { $ne: sellerId }
        });
      }

      totalUnread += unread;
      threads.push({ booking, lastMsg, unread });
    }

    res.render('seller/messages', { threads, activeBooking: null, messages: [], totalUnread });
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/seller/dashboard');
  }
});

router.get('/messages/:bookingId', async (req, res) => {
  try {
    const sellerId = req.user._id;

    // First mark messages as read for this booking
    if (Message) {
      await Message.updateMany(
        { booking: req.params.bookingId, sender: { $ne: sellerId }, readBy: { $ne: sellerId } },
        { $addToSet: { readBy: sellerId } }
      );
    }

    const bookings = await Booking.find({ seller: sellerId })
      .populate('item')
      .populate('renter', 'name avatar')
      .sort({ updatedAt: -1 });

    const sellerBookings = bookings.filter(b => b.item);

    let threads = [];
    let totalUnread = 0;

    for (const booking of sellerBookings) {
      let lastMsg = null;
      let unread = 0;

      if (Message) {
        lastMsg = await Message.findOne({ booking: booking._id })
          .sort({ createdAt: -1 }).select('text createdAt sender');
        unread = await Message.countDocuments({
          booking: booking._id,
          sender: { $ne: sellerId },
          readBy: { $ne: sellerId }
        });
      }

      totalUnread += unread;
      threads.push({ booking, lastMsg, unread });
    }

    // Active booking for open thread
    const activeBooking = await Booking.findById(req.params.bookingId)
      .populate('renter', 'name avatar _id')
      .populate('item', 'title');

    if (!activeBooking) {
      req.flash('error', 'Conversation not found.');
      return res.redirect('/seller/messages');
    }

    let messages = [];
    if (Message) {
      messages = await Message.find({ booking: req.params.bookingId })
        .populate('sender', 'name')
        .sort({ createdAt: 1 });
    }

    res.render('seller/messages', { threads, activeBooking, messages, totalUnread });
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/seller/messages');
  }
});

// POST /seller/messages/:bookingId/clear
router.post('/messages/:bookingId/clear', async (req, res) => {
  try {
    if (Message) {
      await Message.deleteMany({ booking: req.params.bookingId });
    }
    req.flash('success', 'Chat cleared successfully.');
    res.redirect('/seller/messages/' + req.params.bookingId);
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/seller/messages');
  }
});

// POST /seller/messages/:bookingId/delete
router.post('/messages/:bookingId/delete', async (req, res) => {
  try {
    if (Message) {
      await Message.deleteMany({ booking: req.params.bookingId });
    }
    req.flash('success', 'Chat deleted successfully.');
    res.redirect('/seller/messages');
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/seller/messages');
  }
});

module.exports = router;

