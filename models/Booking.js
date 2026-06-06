const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  item:        { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  renter:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  seller:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  startDate:   { type: Date, required: true },
  endDate:     { type: Date, required: true },
  totalDays:   Number,
  totalAmount: Number,
  deposit:     Number,
  status:      { type: String, enum: ['pending','confirmed','active','completed','cancelled'], default: 'pending' },
  payment: {
    orderId:    String,
    paymentId:  String,
    status:     { type: String, enum: ['pending','paid','refunded'], default: 'pending' }
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Booking', bookingSchema);
