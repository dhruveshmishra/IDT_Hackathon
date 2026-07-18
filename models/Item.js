const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true },
  description: { type: String, required: true },
  category:    { type: String, enum: ['electronics','tools','vehicles','furniture','sports','clothing','other'], required: true },
  subcategory: { type: String, trim: true },
  vehicleNumber: { type: String, trim: true, uppercase: true },  // Required only for vehicles
  pricePerDay: { type: Number, required: true, min: 0 },
  pricePerHour: { type: Number, default: 0 },
  deposit:     { type: Number, default: 0 },
  images:      [{ url: String, public_id: String }],
  owner:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  location: {
    type:        { type: String, default: 'Point' },
    coordinates: { type: [Number], required: true }  // [lng, lat]
  },
  address:      String,
  isAvailable:  { type: Boolean, default: true },
  quantity:     { type: Number, default: 1, min: 0 },
  tags:         [String],
  aiGenerated:  { type: Boolean, default: false },
  flagged:      { type: Boolean, default: false },
  status:       { type: String, enum: ['active','pending_review','rejected'], default: 'active' },
  avgRating:    { type: Number, default: 0 },
  reviewCount:  { type: Number, default: 0 },
  createdAt:    { type: Date, default: Date.now }
});

itemSchema.index({ location: '2dsphere' });
itemSchema.index({ title: 'text', description: 'text', tags: 'text' });
itemSchema.index({ status: 1, isAvailable: 1 });
itemSchema.index({ owner: 1 });

module.exports = mongoose.model('Item', itemSchema);
