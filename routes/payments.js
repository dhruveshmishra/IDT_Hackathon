const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Booking = require('../models/Booking');
const Item = require('../models/Item');
const upload = require('../middleware/upload');
const cloudinary = require('../config/cloudinary');

// Helper to upload file buffer to Cloudinary
function uploadToCloudinary(fileBuffer, folderName = 'rentapp_payments') {
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

// POST /payments/verify (HMAC signature verification or P2P screenshot verification)
router.post('/verify', upload.single('screenshot'), async (req, res) => {
  try {
    const bookingId = req.body.bookingId || req.query.bookingId;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      if (req.query.redirect === 'true') {
        req.flash('error', 'Booking reference not found.');
        return res.redirect('/user/bookings');
      }
      return res.status(404).json({ success: false, error: 'Booking reference not found.' });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    // Check if we are running in mock payment mode (Direct pay-to-seller)
    if (razorpay_order_id && razorpay_order_id.startsWith('order_mock_')) {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'Please upload a screenshot of your transaction.' });
      }

      // Check conflict before confirming payment
      const overlappingBooking = await Booking.findOne({
        item: booking.item,
        status: { $in: ['confirmed', 'active'] },
        _id: { $ne: booking._id },
        $or: [
          {
            startDate: { $lt: booking.endDate },
            endDate: { $gt: booking.startDate }
          }
        ]
      });

      if (overlappingBooking) {
        return res.status(400).json({
          success: false,
          error: 'This item has already been booked and confirmed by someone else for these dates in the meantime.'
        });
      }

      // Upload transaction screenshot to Cloudinary
      const uploadResult = await uploadToCloudinary(req.file.buffer);
      booking.paymentScreenshot = uploadResult.secure_url;
      booking.payment.paymentId = razorpay_payment_id || 'P2P_TRANSFER_' + Date.now();
      booking.payment.status = 'paid';
      booking.status = 'confirmed';
      await booking.save();

      // Decrement item quantity
      const item = await Item.findById(booking.item);
      if (item) {
        if (item.quantity > 0) {
          item.quantity -= 1;
        }
        item.isAvailable = item.quantity > 0;
        await item.save();
      }

      return res.json({ success: true, message: 'Payment screenshot submitted successfully!' });
    }

    if (!keySecret) {
      if (req.query.redirect === 'true') {
        req.flash('error', 'Razorpay secret key missing.');
        return res.redirect('/user/bookings');
      }
      return res.status(400).json({ success: false, error: 'Razorpay secret key missing.' });
    }

    // Standard HMAC Signature check
    const hmac = crypto.createHmac('sha256', keySecret);
    hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
    const digest = hmac.digest('hex');

    if (digest === razorpay_signature) {
      booking.payment.paymentId = razorpay_payment_id;
      booking.payment.status = 'paid';
      booking.status = 'confirmed';
      await booking.save();

      // Decrement item quantity
      const item = await Item.findById(booking.item);
      if (item) {
        if (item.quantity > 0) {
          item.quantity -= 1;
        }
        item.isAvailable = item.quantity > 0;
        await item.save();
      }

      // Emit real-time update socket event
      const io = req.app.get('io');
      if (io) {
        io.to(booking.seller.toString()).emit('booking-notification', {
          bookingId: booking._id,
          message: `New confirmed booking for your listing!`
        });
      }

      if (req.query.redirect === 'true' || req.headers['content-type'] === 'application/x-www-form-urlencoded') {
        req.flash('success', 'Payment verified and booking confirmed.');
        return res.redirect('/user/bookings');
      }
      return res.json({ success: true, message: 'Payment verified and booking confirmed.' });
    } else {
      if (req.query.redirect === 'true' || req.headers['content-type'] === 'application/x-www-form-urlencoded') {
        req.flash('error', 'Payment signature mismatch.');
        return res.redirect('/user/bookings');
      }
      return res.status(400).json({ success: false, error: 'Payment signature mismatch.' });
    }

  } catch (err) {
    console.error('Payment verification failed:', err.message);
    if (req.query.redirect === 'true') {
      req.flash('error', 'Payment verification failed: ' + err.message);
      return res.redirect('/user/bookings');
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /payments/webhook
router.post('/webhook', (req, res) => {
  // Simple success acknowledgement
  res.json({ status: 'ok' });
});

module.exports = router;
