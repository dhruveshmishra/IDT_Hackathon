const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  name:             { type: String, required: true, trim: true },
  email:            { type: String, required: true, unique: true, lowercase: true },
  password:         { type: String, required: true },
  phone:            { type: String },
  role:             { type: String, enum: ['admin', 'seller', 'user'], default: 'user' },
  isVerified:       { type: Boolean, default: false },
  aadhaarVerified:  { type: Boolean, default: false },
  aadhaarNumber:    { type: String, default: '' },          // 12-digit Aadhaar number
  aadhaarDoc:       { url: String, public_id: String },
  avatar:           { url: String, public_id: String },
  address:          { type: String, default: '' },           // Full address — visible to sellers & admins
  sellerApproved:   { type: Boolean, default: false },       // Admin must approve seller login
  location: {
    type:        { type: String, default: 'Point' },
    coordinates: { type: [Number], default: [72.8777, 19.0760] }  // [lng, lat] Mumbai default
  },
  sellerProfile: {
    businessName:    String,
    description:     String,
    address:         { type: String, default: '' },           // Business address
    verificationDoc: { url: String, public_id: String },
    verifiedAt:      Date,
    earnings:        { type: Number, default: 0 },
    payoutDetails: {
      upi: String,
      bankAccount: String,
      bankName: String,
      bankIfsc: String,
      bankHolderName: String,
      verified: { type: Boolean, default: false }
    }
  },
  createdAt: { type: Date, default: Date.now }
});

userSchema.index({ location: '2dsphere' });

// Pre-save password hashing hook
userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  } catch (err) {
    throw err;
  }
});

module.exports = mongoose.model('User', userSchema);
