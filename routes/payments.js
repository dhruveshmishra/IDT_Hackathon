const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Booking = require('../models/Booking');

// POST /payments/verify (HMAC signature verification)
router.post('/verify', async (req, res) => {
  try {
    const { bookingId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, error: 'Booking reference not found.' });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    // Check if we are running in mock payment mode
    if (razorpay_order_id && razorpay_order_id.startsWith('order_mock_')) {
      booking.payment.paymentId = razorpay_payment_id;
      booking.payment.status = 'paid';
      booking.status = 'confirmed';
      await booking.save();
      return res.json({ success: true, message: 'Mock payment verified successfully' });
    }

    if (!keySecret) {
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

      // Emit real-time update socket event
      const io = req.app.get('io');
      if (io) {
        io.to(booking.seller.toString()).emit('booking-notification', {
          bookingId: booking._id,
          message: `New confirmed booking for your listing!`
        });
      }

      res.json({ success: true, message: 'Payment verified and booking confirmed.' });
    } else {
      res.status(400).json({ success: false, error: 'Payment signature mismatch.' });
    }

  } catch (err) {
    console.error('Payment verification failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /payments/webhook
router.post('/webhook', (req, res) => {
  // Simple success acknowledgement
  res.json({ status: 'ok' });
});

module.exports = router;
