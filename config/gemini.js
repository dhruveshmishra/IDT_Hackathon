const { GoogleGenerativeAI } = require('@google/generative-ai');

const apiKey = process.env.GEMINI_API_KEY;
let model = null;

if (apiKey) {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    console.log('Gemini AI client successfully configured.');
  } catch (err) {
    console.error('Error initializing Gemini AI:', err.message);
  }
} else {
  console.warn('GEMINI_API_KEY is not defined. AI functions will run in sandbox mode.');
}

module.exports = model;
