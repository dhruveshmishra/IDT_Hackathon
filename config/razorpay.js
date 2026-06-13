const Razorpay = require('razorpay');

let razorpayInstance = null;

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

if (keyId && keySecret) {
  try {
    razorpayInstance = new Razorpay({
      key_id: keyId,
      key_secret: keySecret
    });
    console.log('Razorpay initiated successfully.');
  } catch (err) {
    console.error('Error initiating Razorpay:', err.message);
  }
} else {
  console.log('DEBUG Razorpay config check:', { keyId: !!keyId, keySecret: !!keySecret, envKeys: Object.keys(process.env).filter(k => k.includes('RAZORPAY')) });
  console.warn('Razorpay credentials missing. Running in mock payment mode.');
}

// Transparent fallback helper
const razorpayClient = razorpayInstance || {
  orders: {
    create: async (options) => {
      console.log('Mock Razorpay: Creating order with options:', options);
      return {
        id: 'order_mock_' + Math.random().toString(36).substring(2, 15),
        amount: options.amount,
        currency: options.currency,
        receipt: options.receipt,
        status: 'created'
      };
    }
  }
};

module.exports = razorpayClient;
