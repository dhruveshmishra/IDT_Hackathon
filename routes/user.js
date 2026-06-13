const express = require('express');
const router = express.Router();
const isLoggedIn = require('../middleware/isLoggedIn');
const upload = require('../middleware/upload');
const User = require('../models/User');
const Item = require('../models/Item');
const Booking = require('../models/Booking');
const Review = require('../models/Review');
const Message = require('../models/Message');
const cloudinary = require('../config/cloudinary');
const { assessDamage } = require('../utils/geminiHelpers');

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

// Ensure logged in for all user routes
router.use(isLoggedIn);

// GET /user/home — show items near user, with distance
router.get('/home', async (req, res) => {
  try {
    // Allow query params to override stored location (e.g. from search form)
    const distance = req.query.distance || '50'; // default 50km so seeded data always shows
    const maxDistanceMeters = parseFloat(distance) * 1000;

    // Prefer query-param coords, then user's stored location, then Mumbai fallback
    const userLng = parseFloat(req.query.lng) ||
      (req.user.location && req.user.location.coordinates && req.user.location.coordinates[0]) ||
      72.8777;
    const userLat = parseFloat(req.query.lat) ||
      (req.user.location && req.user.location.coordinates && req.user.location.coordinates[1]) ||
      19.0760;

    // $geoNear aggregation gives us the distance in metres for each item, sorted by price ascending
    let items = await Item.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [userLng, userLat] },
          distanceField: 'dist.calculated',   // metres
          maxDistance: maxDistanceMeters,
          query: { isAvailable: true, status: 'active' },
          spherical: true
        }
      },
      { $sort: { pricePerDay: 1 } }
    ]);
    items = await Item.populate(items, { path: 'owner', select: 'name avatar isVerified' });

    res.render('user/home', {
      items,
      search: req.query.search || '',
      smartSearch: req.query.smartSearch || '',
      category: req.query.category || 'all',
      subcategory: req.query.subcategory || '',
      maxPrice: req.query.maxPrice || '',
      lng: userLng,
      lat: userLat,
      distance: distance,
      aiExplanation: ''
    });
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/');
  }
});

// POST /user/location/update — called from browser Geolocation API (JSON)
router.post('/location/update', async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (!lat || !lng) return res.json({ success: false, error: 'Missing coordinates' });

    await User.findByIdAndUpdate(req.user._id, {
      location: {
        type: 'Point',
        coordinates: [parseFloat(lng), parseFloat(lat)]
      }
    });

    res.json({ success: true, lat: parseFloat(lat), lng: parseFloat(lng) });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// GET /user/profile
router.get('/profile', (req, res) => {
  res.render('user/profile');
});

// POST /user/profile — Update basic profile info + address
router.post('/profile', upload.single('avatar'), async (req, res) => {
  try {
    const { name, phone, address, lng, lat } = req.body;
    const user = await User.findById(req.user._id);
    
    user.name    = name    || user.name;
    user.phone   = phone   || user.phone;
    user.address = address || user.address;
    
    if (lng && lat) {
      user.location = {
        type: 'Point',
        coordinates: [parseFloat(lng), parseFloat(lat)]
      };
    }

    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, 'rentapp_avatars');
      user.avatar = {
        url: result.secure_url,
        public_id: result.public_id
      };
    }

    await user.save();
    req.flash('success', 'Profile updated successfully.');
    res.redirect('/user/profile');
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/user/profile');
  }
});

// POST /user/aadhaar — Upload Aadhaar doc + save number
router.post('/aadhaar', upload.single('aadhaar'), async (req, res) => {
  try {
    const { aadhaarNumber } = req.body;
    const user = await User.findById(req.user._id);

    // Save Aadhaar number if valid 12 digits
    if (aadhaarNumber && aadhaarNumber.replace(/\s/g, '').length === 12) {
      user.aadhaarNumber = aadhaarNumber.replace(/\s/g, '');
    }

    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, 'rentapp_aadhaar');
      user.aadhaarDoc = {
        url: result.secure_url,
        public_id: result.public_id
      };
      user.aadhaarVerified = false; // Pending admin review
    }

    await user.save();
    req.flash('success', 'Aadhaar details submitted for verification. Admin will review shortly.');
    res.redirect('/user/profile');
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/user/profile');
  }
});

// GET /user/bookings
router.get('/bookings', async (req, res) => {
  try {
    const bookings = await Booking.find({ renter: req.user._id })
      .populate('item')
      .populate('seller', 'name email phone address')
      .sort({ createdAt: -1 });
    res.render('user/bookings', { bookings });
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/');
  }
});

// GET /user/chat/:bookingId
router.get('/chat/:bookingId', async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId)
      .populate('item')
      .populate('seller', 'name avatar')
      .populate('renter', 'name avatar');

    if (!booking) {
      req.flash('error', 'Booking not found');
      return res.redirect('/');
    }

    if (!booking.renter._id.equals(req.user._id) && !booking.seller._id.equals(req.user._id)) {
      req.flash('error', 'Unauthorized chat access');
      return res.redirect('/');
    }

    res.render('user/chat', { booking });
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/');
  }
});

// POST /user/review/:itemId
router.post('/review/:itemId', async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const item = await Item.findById(req.params.itemId);
    if (!item) {
      req.flash('error', 'Item not found');
      return res.redirect('back');
    }

    await Review.create({
      item: item._id,
      author: req.user._id,
      rating: parseInt(rating, 10),
      comment
    });

    const reviews = await Review.find({ item: item._id });
    const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
    
    item.avgRating   = avg;
    item.reviewCount = reviews.length;
    await item.save();

    req.flash('success', 'Review posted successfully!');
    res.redirect(`/items/${item._id}`);
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('back');
  }
});

// GET /user/inspection — Standalone AI Damage Inspection Portal
router.get('/inspection', async (req, res) => {
  try {
    // Find renter's bookings that are confirmed, active, or completed to show in dropdown
    const bookings = await Booking.find({ 
      renter: req.user._id,
      status: { $in: ['confirmed', 'active', 'completed'] }
    })
      .populate('item')
      .sort({ createdAt: -1 });

    res.render('user/damage-inspection', { bookings, activePage: 'inspection' });
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/');
  }
});

// POST /user/inspection — Run AI Damage Inspection
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
// GET /user/messages            — inbox list
// GET /user/messages/:bookingId — open thread
// ─────────────────────────────────────────────
router.get('/messages', async (req, res) => {
  try {
    const renterId = req.user._id;

    const bookings = await Booking.find({ renter: renterId })
      .populate('item')
      .populate('seller', 'name avatar')
      .sort({ updatedAt: -1 });

    const renterBookings = bookings.filter(b => b.item);

    let threads = [];
    let totalUnread = 0;

    for (const booking of renterBookings) {
      let lastMsg = null;
      let unread = 0;

      if (Message) {
        lastMsg = await Message.findOne({ booking: booking._id })
          .sort({ createdAt: -1 }).select('text createdAt sender');
        unread = await Message.countDocuments({
          booking: booking._id,
          sender: { $ne: renterId },
          readBy: { $ne: renterId }
        });
      }

      totalUnread += unread;
      threads.push({ booking, lastMsg, unread });
    }

    res.render('user/messages', { threads, activeBooking: null, messages: [], totalUnread, activePage: 'messages' });
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/user/home');
  }
});

router.get('/messages/:bookingId', async (req, res) => {
  try {
    const renterId = req.user._id;

    const bookings = await Booking.find({ renter: renterId })
      .populate('item')
      .populate('seller', 'name avatar')
      .sort({ updatedAt: -1 });

    const renterBookings = bookings.filter(b => b.item);

    let threads = [];
    let totalUnread = 0;

    for (const booking of renterBookings) {
      let lastMsg = null;
      let unread = 0;

      if (Message) {
        lastMsg = await Message.findOne({ booking: booking._id })
          .sort({ createdAt: -1 }).select('text createdAt sender');
        unread = await Message.countDocuments({
          booking: booking._id,
          sender: { $ne: renterId },
          readBy: { $ne: renterId }
        });
      }

      totalUnread += unread;
      threads.push({ booking, lastMsg, unread });
    }

    const activeBooking = await Booking.findById(req.params.bookingId)
      .populate('seller', 'name avatar _id')
      .populate('item', 'title');

    if (!activeBooking) {
      req.flash('error', 'Conversation not found.');
      return res.redirect('/user/messages');
    }

    let messages = [];
    if (Message) {
      messages = await Message.find({ booking: req.params.bookingId })
        .populate('sender', 'name')
        .sort({ createdAt: 1 });

      await Message.updateMany(
        { booking: req.params.bookingId, sender: { $ne: renterId }, readBy: { $ne: renterId } },
        { $addToSet: { readBy: renterId } }
      );
    }

    res.render('user/messages', { threads, activeBooking, messages, totalUnread, activePage: 'messages' });
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/user/messages');
  }
});

module.exports = router;
