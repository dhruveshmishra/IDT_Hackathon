const express = require('express');
const router = express.Router();
const isLoggedIn = require('../middleware/isLoggedIn');
const Message = require('../models/Message');
const Booking = require('../models/Booking');
const Item = require('../models/Item');

router.use(isLoggedIn);

// GET /chat/:bookingId/history (Retrieve conversation messages)
router.get('/:bookingId/history', async (req, res) => {
  try {
    const messages = await Message.find({ booking: req.params.bookingId })
      .populate('sender', 'name avatar')
      .sort({ createdAt: 1 });
    res.json({ success: true, messages });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /chat/:bookingId (Save message)
router.post('/:bookingId', async (req, res) => {
  try {
    const { text, receiverId } = req.body;
    const msg = await Message.create({
      booking: req.params.bookingId,
      sender: req.user._id,
      receiver: receiverId,
      text: text
    });
    res.json({ success: true, message: msg });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /chat/direct/:sellerId (Initiate direct chat without a formal booking)
router.post('/direct/:sellerId', async (req, res) => {
  try {
    const sellerId = req.params.sellerId;
    
    // Find if a booking or direct chat room booking already exists
    let booking = await Booking.findOne({
      renter: req.user._id,
      seller: sellerId
    });

    if (!booking) {
      // Find one of the seller's active items to associate the direct chat room with
      const item = await Item.findOne({ owner: sellerId });
      if (!item) {
        return res.status(404).json({ success: false, error: 'Seller has no listings to chat about.' });
      }

      booking = new Booking({
        item: item._id,
        renter: req.user._id,
        seller: sellerId,
        startDate: new Date(),
        endDate: new Date(),
        totalDays: 0,
        totalAmount: 0,
        deposit: 0,
        status: 'pending',
        payment: { status: 'pending' }
      });
      await booking.save();
    }

    res.json({ success: true, bookingId: booking._id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
