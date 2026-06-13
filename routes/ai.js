const express = require('express');
const router = express.Router();
const isLoggedIn = require('../middleware/isLoggedIn');
const {
  generateItemDescription,
  suggestPrice,
  summarizeReviews,
  parseSearchQuery,
  findAlternativesMessage,
  moderateContent,
  chatWithRenter,
  generateSmartReplies,
  optimizeMessageTone
} = require('../utils/geminiHelpers');

router.use(isLoggedIn);

// POST /ai/chat/replies
router.post('/chat/replies', async (req, res) => {
  try {
    const { history, title } = req.body;
    const replies = await generateSmartReplies(history || [], title || '');
    res.json({ success: true, replies });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /ai/chat/optimize-tone
router.post('/chat/optimize-tone', async (req, res) => {
  try {
    const { text } = req.body;
    const optimized = await optimizeMessageTone(text);
    res.json({ success: true, optimized });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /ai/generate-description
router.post('/generate-description', async (req, res) => {
  try {
    const { title, imageUrl } = req.body;
    const data = await generateItemDescription(title, imageUrl);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /ai/suggest-price
router.post('/suggest-price', async (req, res) => {
  try {
    const { title, description, category, comparables } = req.body;
    const data = await suggestPrice(title, description, category, comparables || []);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /ai/summarize-reviews
router.post('/summarize-reviews', async (req, res) => {
  try {
    const { title, reviews } = req.body;
    const summary = await summarizeReviews(title, reviews || []);
    res.json({ success: true, summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /ai/smart-search
router.post('/smart-search', async (req, res) => {
  try {
    const { query } = req.body;
    const data = await parseSearchQuery(query);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /ai/find-alternatives
router.post('/find-alternatives', async (req, res) => {
  try {
    const { item, alternatives } = req.body;
    const message = await findAlternativesMessage(item, alternatives || []);
    res.json({ success: true, message });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /ai/moderate
router.post('/moderate', async (req, res) => {
  try {
    const { text } = req.body;
    const data = await moderateContent(text);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /ai/chatbot
router.post('/chatbot', async (req, res) => {
  try {
    const { message, items, history } = req.body;
    const reply = await chatWithRenter(message, items || [], history || []);
    res.json({ success: true, reply });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
