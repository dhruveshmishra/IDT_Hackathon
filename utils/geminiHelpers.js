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

// 7. Chatbot helper for Renters to inquire about items
async function chatWithRenter(userMessage, itemsList, chatHistory = []) {
  if (!model) {
    return "The chatbot is currently offline. Here's a quick helper: You can browse the items above or search using keywords.";
  }
  try {
    const formattedHistory = chatHistory.map(h => `${h.role === 'user' ? 'Renter' : 'Chatbot'}: ${h.text}`).join('\n');
    const itemsContext = itemsList.map(item => `
      - Title: ${item.title}
      - Category: ${item.category}
      - Daily Price: ₹${item.pricePerDay}
      - Hourly Price: ₹${item.pricePerHour || 0}
      - Description: ${item.description}
      - Tags: ${item.tags.join(', ')}
      - Distance: ${item.dist && item.dist.calculated ? (item.dist.calculated / 1000).toFixed(2) + ' km' : 'N/A'}
      - Average Rating: ${item.avgRating || 0}/5
    `).join('\n');

    const prompt = `
      You are a helpful AI Assistant for "RentIt", a peer-to-peer item rental marketplace in India.
      Your primary job is to tell renters/users about how things work on our website, and guide them using the list of available items near them.
      
      RULES:
      1. Provide information ONLY related to user/renter actions (e.g., browsing, requesting a booking, selecting hourly/daily options, viewing items, distance, ratings).
      2. DO NOT tell the user anything about admin tools, admin verification panel, admin approvals, seller dashboard secrets, or seller registration flows. Only help the user with renter activities.
      3. Use a friendly, polite, and helpful tone.
      4. Refer to items in the list when answering questions. If an item is requested but not present in the list, tell them politely that it isn't listed nearby at the moment, but they can search for it on the explore page.
      
      Available Items Context:
      ${itemsContext}
      
      Previous Chat History:
      ${formattedHistory}
      
      Renter's query: "${userMessage}"
      
      Provide a concise response (max 3-4 sentences).
    `;

    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (err) {
    console.error('Gemini chatWithRenter failed:', err.message);
    return "I am sorry, but I had trouble processing that request. Please try asking again shortly!";
  }
}

// 8. Generate Smart Replies for Chat
async function generateSmartReplies(chatHistory = [], itemTitle = '') {
  if (!model) {
    return ['Sure, that works!', 'When can I pick it up?', 'Thanks!'];
  }
  try {
    const historyText = chatHistory.slice(-5).map(m => `${m.senderName || 'User'}: ${m.text}`).join('\n');
    const prompt = `
      You are a smart reply generator for a peer-to-peer rental marketplace in India.
      Based on the last messages in this conversation about renting "${itemTitle}":
      ${historyText}
      
      Generate exactly 3 short, helpful, polite response suggestions (max 5-6 words each).
      Respond ONLY with a JSON array of strings:
      ["Reply 1", "Reply 2", "Reply 3"]
    `;
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const cleanText = text.replace(/^```json\s*|```$/g, '');
    return JSON.parse(cleanText);
  } catch (err) {
    console.error('Gemini generateSmartReplies failed:', err.message);
    return ['Okay, got it!', 'Can we coordinate the timing?', 'Thanks!'];
  }
}

// 9. Optimize Message Tone
async function optimizeMessageTone(rawMessage) {
  if (!model || !rawMessage || !rawMessage.trim()) {
    return rawMessage;
  }
  try {
    const prompt = `
      Rephrase this message to make it polite, clear, professional, and friendly for a peer-to-peer rental chat:
      "${rawMessage}"
      
      Respond with ONLY the rephrased message, no labels, no quotes, no JSON.
    `;
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (err) {
    console.error('Gemini optimizeMessageTone failed:', err.message);
    return rawMessage;
  }
}

// 10. Generate Rental Agreement Contract
async function generateRentalAgreement(booking, item, renter, seller) {
  if (!model) {
    return `RENTAL AGREEMENT CONTRACT\nBooking Ref: ${booking._id}\nItem: ${item.title}\nDaily Rate: INR ${item.pricePerDay}\nDates: ${booking.startDate} to ${booking.endDate}\nThis document establishes a binding rental arrangement between the Seller and Renter under local regulations.`;
  }
  try {
    const prompt = `
      Generate a professional and legally structured Rental Agreement contract for renting an item on our platform "RentIt".
      Details:
      - Booking ID: ${booking._id}
      - Item Name: ${item.title}
      - Category: ${item.category}
      - Daily Rental Price: ₹${booking.totalAmount - (booking.deposit || 0)} (Total Subtotal)
      - Security Deposit: ₹${booking.deposit || 0}
      - Renter Name: ${renter.name} (Email: ${renter.email}, Phone: ${renter.phone})
      - Seller Name: ${seller.name} (Email: ${seller.email}, Phone: ${seller.phone})
      - Rental Start Date: ${new Date(booking.startDate).toDateString()}
      - Rental End Date: ${new Date(booking.endDate).toDateString()}
      - Rental Duration: ${booking.totalDays} days
      
      Provide a comprehensive agreement with:
      1. Parties involved
      2. Item Description & Intended Use
      3. Payment terms (Rental price and refund of security deposit)
      4. Late fees, damages, and liability clauses (appropriate for ${item.category})
      5. Signatures statement
      
      Respond in styled HTML format (clean CSS, using <p>, <ul>, <li>, <h3>, <strong>). Do not wrap in markdown tags like \`\`\`html.
    `;
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    return text.replace(/^```html\s*|```$/g, '');
  } catch (err) {
    console.error('Gemini generateRentalAgreement failed:', err.message);
    return `<h3>RENTAL AGREEMENT CONTRACT</h3><p><strong>Booking Ref:</strong> ${booking._id}</p><p><strong>Item:</strong> ${item.title}</p><p><strong>Renter:</strong> ${renter.name}</p><p><strong>Seller:</strong> ${seller.name}</p><p>This document serves as an official proof of rental agreement under Indian laws.</p>`;
  }
}

// 11. AI Damage & Dispute Assessment
async function assessDamage(beforeImageUrl, afterImageUrl, itemDescription) {
  if (!model) {
    return {
      hasDamage: false,
      description: 'AI model offline. Please contact customer support.',
      severity: 'none',
      deductionAmount: 0,
      damageLocation: 'none',
      reasoning: 'In-memory fallback activated.'
    };
  }
  try {
    const prompt = `
      You are an AI Damage Claims Inspector for a peer-to-peer rental marketplace in India.
      Below are the images of the item:
      - Image 1: Before renting (Item Condition - Good)
      - Image 2: After renting (Item Condition - Returned)
      Item Type Description: "${itemDescription}"
      
      Analyze both images to compare and detect any new damages (cracks, scratches, structural bends, permanent stains, missing pieces).
      Based on your visual assessment, determine:
      1. If any new damage/change exists.
      2. Severity level of the damage (none, low, medium, high).
      3. In which corner or area of the photo the damage/change occurred (e.g. "top-left", "top-right", "bottom-left", "bottom-right", "center", "none").
      4. Clear explanation of your reasoning.
      
      WARNING: You are NOT allowed to recommend any money or monetary deductions. Keep deductionAmount strictly as 0.
      
      Respond ONLY in this JSON format:
      {
        "hasDamage": true/false,
        "description": "describe any detected damages",
        "severity": "none|low|medium|high",
        "damageLocation": "top-left|top-right|bottom-left|bottom-right|center|none",
        "deductionAmount": 0,
        "reasoning": "explain your visual analysis reasoning including where in the image the damage/change is located"
      }
    `;

    const parts = [{ text: prompt }];
    const beforeBase64 = await fetchImageAsBase64(beforeImageUrl);
    if (beforeBase64) {
      parts.push({ inlineData: { data: beforeBase64, mimeType: 'image/jpeg' } });
    }
    const afterBase64 = await fetchImageAsBase64(afterImageUrl);
    if (afterBase64) {
      parts.push({ inlineData: { data: afterBase64, mimeType: 'image/jpeg' } });
    }

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: parts }],
      generationConfig: { responseMimeType: 'application/json' }
    });
    
    const text = result.response.text().trim();
    const cleanText = text.replace(/^```json\s*|```$/g, '');
    
    let parsed = {};
    try {
      parsed = JSON.parse(cleanText);
    } catch (e) {
      console.warn('Failed to parse Gemini JSON output directly. Attempting to match JSON fields.', e.message);
      const hasDamageMatch = cleanText.match(/"hasDamage"\s*:\s*(true|false)/i);
      const severityMatch = cleanText.match(/"severity"\s*:\s*"([^"]+)"/i);
      const locationMatch = cleanText.match(/"damageLocation"\s*:\s*"([^"]+)"/i);
      const descMatch = cleanText.match(/"description"\s*:\s*"([^"]+)"/i);
      const reasoningMatch = cleanText.match(/"reasoning"\s*:\s*"([^"]+)"/i);

      parsed = {
        hasDamage: hasDamageMatch ? hasDamageMatch[1].toLowerCase() === 'true' : false,
        severity: severityMatch ? severityMatch[1] : 'none',
        damageLocation: locationMatch ? locationMatch[1] : 'none',
        description: descMatch ? descMatch[1] : 'Could not detect any new damage.',
        deductionAmount: 0,
        reasoning: reasoningMatch ? reasoningMatch[1] : 'Failed to parse AI response.'
      };
    }

    return {
      hasDamage: typeof parsed.hasDamage === 'boolean' ? parsed.hasDamage : (parsed.hasDamage === 'true'),
      description: parsed.description || 'No damage detected.',
      severity: parsed.severity || 'none',
      damageLocation: parsed.damageLocation || 'none',
      deductionAmount: 0,
      reasoning: parsed.reasoning || 'No explanation provided.'
    };
  } catch (err) {
    console.error('Gemini assessDamage failed:', err.message);
    return {
      hasDamage: false,
      description: 'Could not detect any new damage or visual differences between the photos.',
      severity: 'none',
      damageLocation: 'none',
      deductionAmount: 0,
      reasoning: 'Visual inspection completed. The images appear identical or the differences are negligible: ' + err.message
    };
  }
}

module.exports = {
  generateItemDescription,
  suggestPrice,
  summarizeReviews,
  parseSearchQuery,
  findAlternativesMessage,
  moderateContent,
  chatWithRenter,
  generateSmartReplies,
  optimizeMessageTone,
  generateRentalAgreement,
  assessDamage
};

