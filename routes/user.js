const express = require('express');
const router = express.Router();
const isLoggedIn = require('../middleware/isLoggedIn');
const upload = require('../middleware/upload');
const User = require('../models/User');
const Item = require('../models/Item');
const Booking = require('../models/Booking');
const Review = require('../models/Review');
const cloudinary = require('../config/cloudinary');

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
    const userLng = req.user.location && req.user.location.coordinates && req.user.location.coordinates[0]
      ? req.user.location.coordinates[0] : 72.8777;
    const userLat = req.user.location && req.user.location.coordinates && req.user.location.coordinates[1]
      ? req.user.location.coordinates[1] : 19.0760;

    // $geoNear aggregation gives us the distance in metres for each item, sorted by price ascending
    let items = await Item.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [userLng, userLat] },
          distanceField: 'dist.calculated',   // metres
          maxDistance: 5000,                  // 5 km
          query: { isAvailable: true, status: 'active' },
          spherical: true
        }
      },
      { $sort: { pricePerDay: 1 } }
    ]);
    items = await Item.populate(items, { path: 'owner', select: 'name avatar isVerified' });

    res.render('user/home', {
      items,
      search: '',
      smartSearch: '',
      category: 'all',
      maxPrice: '',
      lng: userLng,
      lat: userLat,
      distance: '5',
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

module.exports = router;
