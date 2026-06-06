const model = require('../config/gemini');

// Helper to fetch image as base64 safely
async function fetchImageAsBase64(url) {
  try {
    if (!url || !url.startsWith('http')) {
      return null;
    }
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString('base64');
  } catch (err) {
    console.error('Failed to fetch image for base64 conversion:', err.message);
    return null;
  }
}

// 1. Generate item description from title + image URL
async function generateItemDescription(title, imageUrl) {
  if (!model) {
    return mockGenerateItemDescription(title);
  }
  try {
    const prompt = `
      You are a marketplace listing assistant for an Indian item rental app.
      Item title: "${title}"
      Based on this title and image, write:
      1. A compelling 3-sentence rental listing description (clear, honest, friendly tone, tailored to the Indian market)
      2. 5 relevant search tags (comma-separated, lowercase)
      3. A suggested rental category from: electronics, tools, vehicles, furniture, sports, clothing, other
      
      Respond ONLY in this JSON format (no markdown, no extra text):
      {"description":"...","tags":["","","","",""],"category":"..."}
    `;

    const contents = [prompt];
    const base64Data = await fetchImageAsBase64(imageUrl);
    if (base64Data) {
      contents.push({
        inlineData: {
          data: base64Data,
          mimeType: 'image/jpeg'
        }
      });
    }

    const result = await model.generateContent(contents);
    const text = result.response.text().trim();
    // Strip markdown formatting if any
    const cleanText = text.replace(/^```json\s*|```$/g, '');
    return JSON.parse(cleanText);
  } catch (err) {
    console.error('Gemini generateItemDescription failed, falling back to mock:', err.message);
    return mockGenerateItemDescription(title);
  }
}

function mockGenerateItemDescription(title) {
  return {
    description: `High-quality ${title} available for short-term rental. Well-maintained and works perfectly. Perfect for personal or professional use. Contact the seller for details.`,
    tags: [title.toLowerCase().split(' ')[0], 'rental', 'india', 'affordable', 'nearby'],
    category: 'other'
  };
}

// 2. Suggest price based on comparable items
async function suggestPrice(title, description, category, comparables) {
  if (!model) {
    return mockSuggestPrice(category);
  }
  try {
    const prompt = `
      You are a pricing advisor for an Indian peer-to-peer rental marketplace.
      Item: "${title}" — ${description}
      Category: ${category}
      Comparable items and their prices (per day in INR): ${JSON.stringify(comparables)}
      
      Suggest a fair rental price per day in INR. Consider Indian market rates.
      Respond ONLY in this JSON format:
      {"minPrice": 100, "maxPrice": 300, "suggestedPrice": 200, "reasoning": "one sentence"}
    `;
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const cleanText = text.replace(/^```json\s*|```$/g, '');
    return JSON.parse(cleanText);
  } catch (err) {
    console.error('Gemini suggestPrice failed, falling back to mock:', err.message);
    return mockSuggestPrice(category);
  }
}

function mockSuggestPrice(category) {
  let min = 150, max = 500, sug = 300;
  if (category === 'electronics') { min = 300; max = 1500; sug = 600; }
  else if (category === 'tools') { min = 100; max = 400; sug = 200; }
  else if (category === 'vehicles') { min = 500; max = 3000; sug = 1200; }
  return {
    minPrice: min,
    maxPrice: max,
    suggestedPrice: sug,
    reasoning: 'Price estimated based on average local rates for ' + category
  };
}

// 3. Summarize reviews for an item
async function summarizeReviews(itemTitle, reviews) {
  if (!reviews || reviews.length === 0) {
    return 'No reviews yet for this item.';
  }
  if (!model) {
    return mockSummarizeReviews(itemTitle, reviews);
  }
  try {
    const reviewText = reviews.map(r => `${r.rating}/5 — ${r.comment}`).join('\n');
    const prompt = `
      Summarize these rental reviews for "${itemTitle}" in exactly 2 sentences.
      Highlight what renters liked most and any common complaint.
      Write in third person, neutral tone.
      Reviews:
      ${reviewText}
      
      Respond with just the 2-sentence summary, no labels, no JSON.
    `;
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (err) {
    console.error('Gemini summarizeReviews failed, falling back to mock:', err.message);
    return mockSummarizeReviews(itemTitle, reviews);
  }
}

function mockSummarizeReviews(itemTitle, reviews) {
  const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  return `Renters generally rate "${itemTitle}" highly with an average rating of ${avg.toFixed(1)} stars. Most find it well-maintained and as described, while a few suggest checking details with the owner directly.`;
}

// 4. Convert natural language search to structured MongoDB query params
async function parseSearchQuery(naturalQuery) {
  if (!model) {
    return mockParseSearchQuery(naturalQuery);
  }
  try {
    const prompt = `
      Convert this natural language search into structured rental item search parameters.
      Query: "${naturalQuery}"
      
      Respond ONLY in this JSON format:
      {
        "keywords": "search terms for MongoDB text search",
        "category": "one of: electronics|tools|vehicles|furniture|sports|clothing|other|null",
        "maxPricePerDay": null or number in INR,
        "interpretation": "one sentence explaining what the user wants"
      }
    `;
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const cleanText = text.replace(/^```json\s*|```$/g, '');
    return JSON.parse(cleanText);
  } catch (err) {
    console.error('Gemini parseSearchQuery failed, falling back to mock:', err.message);
    return mockParseSearchQuery(naturalQuery);
  }
}

function mockParseSearchQuery(naturalQuery) {
  const q = naturalQuery.toLowerCase();
  let category = 'null';
  if (q.includes('phone') || q.includes('laptop') || q.includes('camera') || q.includes('tv') || q.includes('electronics')) {
    category = 'electronics';
  } else if (q.includes('drill') || q.includes('hammer') || q.includes('ladder') || q.includes('tools')) {
    category = 'tools';
  } else if (q.includes('car') || q.includes('bike') || q.includes('scooter') || q.includes('vehicle')) {
    category = 'vehicles';
  } else if (q.includes('chair') || q.includes('table') || q.includes('sofa') || q.includes('furniture')) {
    category = 'furniture';
  }

  let maxPrice = null;
  const match = q.match(/(?:under|below|max|within)\s*(?:rs|inr|₹)?\s*(\d+)/);
  if (match) {
    maxPrice = parseInt(match[1], 10);
  }

  return {
    keywords: naturalQuery,
    category: category === 'null' ? null : category,
    maxPricePerDay: maxPrice,
    interpretation: `Searching for items matching "${naturalQuery}"`
  };
}

// 5. Find alternatives when a booking is unavailable
async function findAlternativesMessage(unavailableItem, alternatives) {
  if (!model) {
    return mockFindAlternativesMessage(unavailableItem, alternatives);
  }
  try {
    const altList = alternatives.map(a => `${a.title} — ₹${a.pricePerDay}/day`).join(', ');
    const prompt = `
      A user tried to book "${unavailableItem.title}" but it's already booked for their dates.
      Write a friendly 2-sentence message suggesting these alternatives: ${altList}
      Keep it warm and helpful. Mention specific item names.
    `;
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (err) {
    console.error('Gemini findAlternativesMessage failed, falling back to mock:', err.message);
    return mockFindAlternativesMessage(unavailableItem, alternatives);
  }
}

function mockFindAlternativesMessage(unavailableItem, alternatives) {
  if (!alternatives || alternatives.length === 0) {
    return `We're sorry, "${unavailableItem.title}" is currently unavailable for your selected dates. Please check back later or search for other options.`;
  }
  const names = alternatives.slice(0, 2).map(a => `"${a.title}" (₹${a.pricePerDay}/day)`).join(' or ');
  return `It looks like "${unavailableItem.title}" is already booked for those dates. However, you might like ${names} as great alternatives nearby.`;
}

// 6. Moderate listing/review content
async function moderateContent(text) {
  if (!model) {
    return { safe: true, reason: '', severity: 'none' };
  }
  try {
    const prompt = `
      Check if this rental marketplace listing/review content is appropriate for a general Indian audience.
      Content: "${text}"
      
      Respond ONLY in this JSON format:
      {"safe": true/false, "reason": "brief reason if unsafe, empty string if safe", "severity": "none|low|medium|high"}
      
      Flag: spam, fake listings, hate speech, adult content, scam attempts, contact info in listings.
    `;
    const result = await model.generateContent(prompt);
    const resText = result.response.text().trim();
    const cleanText = resText.replace(/^```json\s*|```$/g, '');
    return JSON.parse(cleanText);
  } catch (err) {
    console.error('Gemini moderateContent failed, permitting content by default:', err.message);
    return { safe: true, reason: '', severity: 'none' };
  }
}

module.exports = {
  generateItemDescription,
  suggestPrice,
  summarizeReviews,
  parseSearchQuery,
  findAlternativesMessage,
  moderateContent
};
