const express = require('express');
const router = express.Router();
const isLoggedIn = require('../middleware/isLoggedIn');
const upload = require('../middleware/upload');
const cloudinary = require('../config/cloudinary');
const Booking = require('../models/Booking');
const Item = require('../models/Item');
const User = require('../models/User');
const razorpay = require('../config/razorpay');
const { findAlternativesMessage, generateRentalAgreement, assessDamage } = require('../utils/geminiHelpers');

// Helper to upload file buffer to Cloudinary
function uploadToCloudinary(fileBuffer, folderName = 'rentapp_disputes') {
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

// Ensure logged in for all booking routes
router.use(isLoggedIn);

// POST /bookings (Check conflicts, create booking, create Razorpay order)
router.post('/', async (req, res) => {
  try {
    // Aadhaar Verification Check
    if (!req.user.aadhaarVerified) {
      return res.status(403).json({
        success: false,
        error: 'Your Aadhaar is not verified yet. Please upload your Aadhaar in your profile and wait for Admin approval before booking items.'
      });
    }

    const { item: itemId, startDate, endDate, totalDays, totalAmount, deposit, paymentMethod } = req.body;
    
    const start = new Date(startDate);
    const end = new Date(endDate);

    const item = await Item.findById(itemId);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }

    // Seller verification gate — block payment if seller is not verified
    const seller = await User.findById(item.owner);
    if (!seller || !seller.isVerified) {
      return res.status(403).json({
        success: false,
        error: 'This item belongs to an unverified seller. Payment is not allowed until the seller completes identity and business verification.'
      });
    }

    // Check if item has stock available
    if (item.quantity !== undefined && item.quantity <= 0) {
      return res.status(400).json({
        success: false,
        error: 'This item is out of stock / no longer available.'
      });
    }

    // Booking Conflict Check
    const overlappingBooking = await Booking.findOne({
      item: itemId,
      status: { $in: ['confirmed', 'active'] },
      $or: [
        {
          startDate: { $lt: end },
          endDate: { $gt: start }
        }
      ]
    });

    if (overlappingBooking) {
      // Find similar active items in the same category as alternatives
      const alternatives = await Item.find({
        category: item.category,
        _id: { $ne: item._id },
        isAvailable: true,
        status: 'active'
      }).limit(3);

      let alternativesText = '';
      try {
        alternativesText = await findAlternativesMessage(item, alternatives);
      } catch (err) {
        console.error('Failed to generate AI alternative suggestions:', err.message);
        alternativesText = 'Please try looking at other similar items in the category.';
      }

      return res.status(400).json({
        success: false,
        error: 'This item is already booked during your selected dates.',
        alternativesText
      });
    }

    // Create the booking record
    const booking = new Booking({
      item: itemId,
      renter: req.user._id,
      seller: item.owner,
      startDate: start,
      endDate: end,
      totalDays: Number(totalDays),
      totalAmount: Number(totalAmount),
      deposit: Number(deposit),
      status: 'pending',
      payment: {
        status: 'pending'
      }
    });

    await booking.save();

    // Create Razorpay or Mock Order
    let order;
    if (paymentMethod === 'p2p') {
      order = {
        id: 'order_mock_' + Math.random().toString(36).substring(2, 15),
        amount: Math.round(Number(totalAmount) * 100),
        currency: 'INR',
        receipt: `booking_${booking._id}`,
        status: 'created'
      };
    } else {
      const orderOptions = {
        amount: Math.round(Number(totalAmount) * 100),
        currency: 'INR',
        receipt: `booking_${booking._id}`
      };
      order = await razorpay.orders.create(orderOptions);
    }

    // Save orderId to booking payment details
    booking.payment.orderId = order.id;
    await booking.save();

    res.json({
      success: true,
      order,
      bookingId: booking._id,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_mockkey12398'
    });

  } catch (err) {
    console.error('Error creating booking:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /bookings/:id (Booking details)
router.get('/:id', async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('item')
      .populate('renter', 'name email phone')
      .populate('seller', 'name email phone');

    if (!booking) {
      req.flash('error', 'Booking not found.');
      return res.redirect('/');
    }

    // Authorization check
    if (!booking.renter._id.equals(req.user._id) && !booking.seller._id.equals(req.user._id) && req.user.role !== 'admin') {
      req.flash('error', 'Access denied.');
      return res.redirect('/');
    }

    // Payment validation check: only allow viewing receipt if payment status is 'paid'
    if (req.user.role !== 'admin' && (!booking.payment || booking.payment.status !== 'paid')) {
      req.flash('error', 'Receipt is not available for pending or failed payments.');
      return res.redirect('/user/bookings');
    }

    res.render('user/booking-show', { booking });
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/');
  }
});

// PUT /bookings/:id/cancel
router.put('/:id/cancel', async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      req.flash('error', 'Booking not found');
      return res.redirect('back');
    }

    if (!booking.renter.equals(req.user._id) && !booking.seller.equals(req.user._id)) {
      req.flash('error', 'Access denied.');
      return res.redirect('back');
    }

    if (booking.status === 'confirmed' || booking.status === 'active') {
      const item = await Item.findById(booking.item);
      if (item) {
        item.quantity += 1;
        item.isAvailable = true;
        await item.save();
      }
    }

    booking.status = 'cancelled';
    await booking.save();

    req.flash('success', 'Booking cancelled successfully.');
    res.redirect('back');
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('back');
  }
});

// GET /bookings/:id/agreement — Generate / view dynamic AI rental agreement
router.get('/:id/agreement', async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('item')
      .populate('renter')
      .populate('seller');

    if (!booking) {
      req.flash('error', 'Booking not found.');
      return res.redirect('back');
    }

    if (!booking.renter._id.equals(req.user._id) && !booking.seller._id.equals(req.user._id) && req.user.role !== 'admin') {
      req.flash('error', 'Access denied.');
      return res.redirect('back');
    }

    // Generate contract HTML if not cached already
    if (!booking.agreementHtml) {
      const contract = await generateRentalAgreement(booking, booking.item, booking.renter, booking.seller);
      booking.agreementHtml = contract;
      await booking.save();
    }

    res.render('user/booking-agreement', { booking, agreement: booking.agreementHtml });
  } catch (err) {
    req.flash('error', 'Failed to generate contract: ' + err.message);
    res.redirect('back');
  }
});

// POST /bookings/:id/dispute — AI Damage / Dispute Assessment
router.post('/:id/dispute', upload.fields([
  { name: 'beforeImage', maxCount: 1 },
  { name: 'afterImage', maxCount: 1 }
]), async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('item');
    if (!booking) {
      req.flash('error', 'Booking not found.');
      return res.redirect('back');
    }

    if (!req.files || !req.files['beforeImage'] || !req.files['afterImage']) {
      req.flash('error', 'Both before and after photos are required for AI damage assessment.');
      return res.redirect('back');
    }

    // Upload images to Cloudinary
    const beforeResult = await uploadToCloudinary(req.files['beforeImage'][0].buffer);
    const afterResult = await uploadToCloudinary(req.files['afterImage'][0].buffer);

    // Call Gemini Image Damage Assessor
    const assessment = await assessDamage(beforeResult.secure_url, afterResult.secure_url, booking.item.description || booking.item.title);

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

    req.flash('success', 'AI Dispute Assessment completed!');
    res.redirect(`/bookings/${booking._id}`);
  } catch (err) {
    req.flash('error', 'Dispute assessment failed: ' + err.message);
    res.redirect('back');
  }
});

module.exports = router;
