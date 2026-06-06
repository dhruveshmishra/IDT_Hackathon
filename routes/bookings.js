const express = require('express');
const router = express.Router();
const isLoggedIn = require('../middleware/isLoggedIn');
const Booking = require('../models/Booking');
const Item = require('../models/Item');
const razorpay = require('../config/razorpay');
const { findAlternativesMessage } = require('../utils/geminiHelpers');

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

    const { item: itemId, startDate, endDate, totalDays, totalAmount, deposit } = req.body;
    
    const start = new Date(startDate);
    const end = new Date(endDate);

    const item = await Item.findById(itemId);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
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

    // Create Razorpay Order
    // totalAmount is in INR, Razorpay accepts amount in Paise
    const orderOptions = {
      amount: Math.round(Number(totalAmount) * 100),
      currency: 'INR',
      receipt: `booking_${booking._id}`
    };

    const order = await razorpay.orders.create(orderOptions);

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

    booking.status = 'cancelled';
    await booking.save();

    req.flash('success', 'Booking cancelled successfully.');
    res.redirect('back');
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('back');
  }
});

module.exports = router;
