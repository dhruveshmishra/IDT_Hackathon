const express = require('express');
const router = express.Router();
const Item = require('../models/Item');
const Review = require('../models/Review');
const Booking = require('../models/Booking');
const redisClient = require('../config/redis');
const { parseSearchQuery, summarizeReviews } = require('../utils/geminiHelpers');

// GET /items (with text search, smart search, and filters)
router.get('/', async (req, res) => {
  try {
    let { search, smartSearch, category, subcategory, maxPrice, lng, lat, distance = 50, sort } = req.query;
    let query = { status: 'active', isAvailable: true };

    // Determine sort order
    let sortQuery = { pricePerDay: 1 };
    if (sort === 'price_desc') {
      sortQuery = { pricePerDay: -1 };
    } else if (sort === 'newest') {
      sortQuery = { createdAt: -1 };
    }

    // Smart Search via Gemini AI
    let aiExplanation = '';
    if (smartSearch && smartSearch.trim().length > 0) {
      try {
        const aiParams = await parseSearchQuery(smartSearch);
        console.log('Gemini Smart Search Parsed Params:', aiParams);
        if (aiParams.keywords) {
          search = aiParams.keywords;
        }
        if (aiParams.category) {
          category = aiParams.category;
        }
        if (aiParams.maxPricePerDay) {
          maxPrice = aiParams.maxPricePerDay;
        }
        if (aiParams.interpretation) {
          aiExplanation = aiParams.interpretation;
        }
      } catch (aiErr) {
        console.error('Smart Search Gemini execution failed:', aiErr.message);
        search = smartSearch; // fallback to standard keyword search
      }
    }

    // Keyword Text Search using RegExp to be compatible with $geoNear query
    if (search && search.trim().length > 0) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { tags: searchRegex }
      ];
    }

    // Category Filter
    if (category && category !== 'all' && category !== 'null') {
      query.category = category;
    }
    
    // Subcategory Filter
    if (subcategory && subcategory !== 'all' && subcategory !== 'null') {
      query.subcategory = subcategory;
    }

    // Price Filter
    if (maxPrice) {
      query.pricePerDay = { $lte: Number(maxPrice) };
    }

    // Fallback to logged-in user's coordinates if query parameters are missing (only for regular users, not sellers)
    if (!lng && !lat && req.user && req.user.role === 'user' && req.user.location && req.user.location.coordinates) {
      lng = req.user.location.coordinates[0];
      lat = req.user.location.coordinates[1];
    }

    // Distance calculation helper (Haversine formula in metres)
    function getDistance(lat1, lon1, lat2, lon2) {
      const R = 6371e3;
      const phi1 = lat1 * Math.PI/180;
      const phi2 = lat2 * Math.PI/180;
      const deltaPhi = (lat2-lat1) * Math.PI/180;
      const deltaLambda = (lon2-lon1) * Math.PI/180;
      const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
                Math.cos(phi1) * Math.cos(phi2) *
                Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    }

    let items = [];

    // Separate text search and geoNear based on search query presence to avoid MongoDB conflicts
    const isTextSearching = (search && search.trim().length > 0) || (smartSearch && smartSearch.trim().length > 0);

    if (lng && lat) {
      const parsedLng = parseFloat(lng);
      const parsedLat = parseFloat(lat);
      const maxDistanceMeters = parseFloat(distance) * 1000;

      if (isTextSearching) {
        // Run standard find with filters (compatible with text/regex filters) sorted by query
        const found = await Item.find(query).populate('owner', 'name avatar isVerified').sort(sortQuery);
        // Calculate distance manually and filter
        items = found.map(item => {
          const itemObj = item.toObject();
          if (itemObj.location && itemObj.location.coordinates) {
            const [iLng, iLat] = itemObj.location.coordinates;
            const dist = getDistance(parsedLat, parsedLng, iLat, iLng);
            itemObj.dist = { calculated: dist };
          }
          return itemObj;
        }).filter(item => item.dist && item.dist.calculated <= maxDistanceMeters);
        
        // Ensure manual sort keeps requested order intact after filtering
        if (sort === 'price_desc') {
          items.sort((a, b) => b.pricePerDay - a.pricePerDay);
        } else if (sort === 'newest') {
          items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        } else {
          items.sort((a, b) => a.pricePerDay - b.pricePerDay);
        }
      } else {
        // Run geoNear aggregation for purely spatial browsing, sorted by requested order
        items = await Item.aggregate([
          {
            $geoNear: {
              near: { type: 'Point', coordinates: [parsedLng, parsedLat] },
              distanceField: 'dist.calculated',
              maxDistance: maxDistanceMeters,
              query: query,
              spherical: true
            }
          },
          { $sort: sortQuery }
        ]);
        items = await Item.populate(items, { path: 'owner', select: 'name avatar isVerified' });
      }
    } else {
      items = await Item.find(query).populate('owner', 'name avatar isVerified').sort(sortQuery);
    }

    res.render('user/home', {
      items,
      search: search || '',
      smartSearch: smartSearch || '',
      category: category || 'all',
      subcategory: subcategory || '',
      maxPrice: maxPrice || '',
      lng: lng || '',
      lat: lat || '',
      distance: distance || '5',
      sort: sort || 'price_asc',
      aiExplanation
    });

  } catch (error) {
    console.error("GET /items Error:", error);
    req.flash('error', error.message);
    res.redirect(req.isAuthenticated() ? '/user/home' : '/');
  }
});

// GET /items/autocomplete (JSON suggestions api)
router.get('/autocomplete', async (req, res) => {
  console.log("Autocomplete Hit! Query:", req.query.query);
  try {
    const queryStr = req.query.query;
    if (!queryStr || queryStr.trim().length === 0) {
      return res.json({ success: true, items: [] });
    }
    const searchRegex = new RegExp(queryStr.trim(), 'i');
    const items = await Item.find({
      status: 'active',
      isAvailable: true,
      $or: [
        { title: searchRegex },
        { tags: searchRegex }
      ]
    }).limit(8).select('title pricePerDay category');
    res.json({ success: true, items });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// GET /items/nearby (JSON API for map markers within 1km)
router.get('/nearby', async (req, res) => {
  try {
    const lng = parseFloat(req.query.lng) || 72.8777;
    const lat = parseFloat(req.query.lat) || 19.0760;

    const items = await Item.find({
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: 1000 // 1000m = 1km
        }
      },
      isAvailable: true,
      status: 'active'
    }).populate('owner', 'name avatar sellerProfile.businessName isVerified');

    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /items/:id (Show detail page)
router.get('/:id', async (req, res) => {
  console.log("Show Item Hit! ID:", req.params.id);
  try {
    const item = await Item.findById(req.params.id).populate('owner');
    if (!item) {
      req.flash('error', 'Item not found');
      return res.redirect('/');
    }

    const reviews = await Review.find({ item: item._id }).populate('author', 'name avatar');
    
    // Check Redis for cached Gemini review summary
    const cacheKey = `review-summary:${item._id}`;
    let summary = null;
    try {
      summary = await redisClient.get(cacheKey);
    } catch (err) {
      console.warn('Redis read failed:', err.message);
    }

    if (!summary && reviews.length > 0) {
      try {
        summary = await summarizeReviews(item.title, reviews);
        if (summary) {
          await redisClient.set(cacheKey, summary, { EX: 86400 });
        }
      } catch (aiErr) {
        console.error('Failed to generate review summary:', aiErr.message);
        summary = 'Unable to generate review summary at this time.';
      }
    }

    // Calculate distance from logged-in user to item location (only for regular users, not sellers)
    let distanceKm = null;
    if (req.user && req.user.role === 'user' && req.user.location && req.user.location.coordinates &&
        item.location && item.location.coordinates) {
      const [uLng, uLat] = req.user.location.coordinates;
      const [iLng, iLat] = item.location.coordinates;
      // Haversine formula
      const R = 6371; // Earth radius in km
      const dLat = (iLat - uLat) * Math.PI / 180;
      const dLng = (iLng - uLng) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(uLat * Math.PI / 180) * Math.cos(iLat * Math.PI / 180) *
                Math.sin(dLng/2) * Math.sin(dLng/2);
      distanceKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // Fetch active/confirmed bookings for date blocking in Flatpickr
    const bookings = await Booking.find({
      item: item._id,
      status: { $in: ['confirmed', 'active'] }
    }).select('startDate endDate');

    res.render('user/item-show', {
      item,
      reviews,
      reviewSummary: summary || 'No reviews available yet.',
      distanceKm,   // null if user not logged in or has no location
      bookings
    });

  } catch (error) {
    req.flash('error', error.message);
    res.redirect('/');
  }
});

module.exports = router;
