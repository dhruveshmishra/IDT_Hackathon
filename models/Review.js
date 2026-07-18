const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  item:    { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  author:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rating:  { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now }
});

reviewSchema.index({ item: 1, createdAt: -1 });

module.exports = mongoose.model('Review', reviewSchema);
