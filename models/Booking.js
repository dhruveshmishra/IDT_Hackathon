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
  paymentScreenshot: String, // URL of P2P transaction screenshot
  agreementHtml: String, // Store generated rental contract EJS/HTML
  dispute: {
    beforeImage:     String,
    afterImage:      String,
    status:          { type: String, enum: ['none', 'pending', 'resolved'], default: 'none' },
    aiAnalysis:      String,
    deductionAmount: { type: Number, default: 0 },
    createdAt:       Date
  },
  createdAt: { type: Date, default: Date.now }
});

bookingSchema.index({ seller: 1, createdAt: -1 });
bookingSchema.index({ renter: 1, createdAt: -1 });

module.exports = mongoose.model('Booking', bookingSchema);
