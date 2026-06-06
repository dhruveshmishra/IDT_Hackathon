require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Item = require('./models/Item');
const Review = require('./models/Review');
const Booking = require('./models/Booking');

const mongoUrl = process.env.MONGO_URL;
const localMongoUrl = process.env.LOCAL_MONGO_URL || 'mongodb://127.0.0.1:27017/rentapp';

async function seed() {
  let connected = false;

  // Try Atlas first if defined
  if (mongoUrl) {
    try {
      console.log('Connecting to MongoDB Atlas for seeding...');
      await mongoose.connect(mongoUrl);
      console.log('Connected to MongoDB Atlas.');
      connected = true;
    } catch (err) {
      console.error('Atlas connection failed:', err.message);
    }
  }

  // Fallback to local
  if (!connected) {
    try {
      console.log(`Attempting fallback to local MongoDB: ${localMongoUrl}...`);
      await mongoose.connect(localMongoUrl);
      console.log('Connected to local MongoDB.');
      connected = true;
    } catch (err) {
      console.error('Local connection failed:', err.message);
      process.exit(1);
    }
  }

  try {
    console.log('Cleaning collections...');
    await User.deleteMany({});
    await Item.deleteMany({});
    await Review.deleteMany({});
    await Booking.deleteMany({});

    console.log('Collections cleared. Seeding Users...');

    // 1. Create Admin
    const admin = new User({
      name: 'Super Admin',
      email: process.env.DEMO_ADMIN_EMAIL || 'admin@rentit.com',
      password: process.env.DEMO_ADMIN_PASS || 'admin123',
      phone: '+919999999999',
      role: 'admin',
      isVerified: true,
      aadhaarVerified: true,
      address: 'Admin HQ, Bandra Kurla Complex, Mumbai 400051',
      aadhaarNumber: '123456789012',
      sellerApproved: true
    });
    await admin.save();

    // 2. Create Seller (pre-approved for demo)
    const seller = new User({
      name: 'Sharma Rentals',
      email: process.env.DEMO_SELLER_EMAIL || 'seller@rentit.com',
      password: process.env.DEMO_SELLER_PASS || 'seller123',
      phone: '+918888888888',
      role: 'seller',
      isVerified: true,
      aadhaarVerified: true,
      sellerApproved: true,   // Pre-approved demo account
      address: 'Shop 12, MG Road, Bangalore 560001',
      aadhaarNumber: '987654321098',
      location: {
        type: 'Point',
        coordinates: [77.5896, 12.9696] // Bangalore nearby
      },
      sellerProfile: {
        businessName: 'Sharma Camera & Tool Hub',
        description: 'Quality rentals at very affordable prices in central Bangalore.',
        address: 'Shop 12, MG Road, Bangalore 560001',
        earnings: 12000,
        payoutDetails: {
          upi: 'sharmarentals@okaxis',
          bank: 'Account: 9988776655, IFSC: UTIB0000123'
        }
      }
    });
    await seller.save();

    // 3. Create Renter User
    const renter = new User({
      name: 'Dhruvesh Mishra',
      email: process.env.DEMO_RENTER_EMAIL || 'renter@rentit.com',
      password: process.env.DEMO_RENTER_PASS || 'renter123',
      phone: '+917777777777',
      role: 'user',
      isVerified: true,
      aadhaarVerified: true,
      sellerApproved: true,
      address: 'Flat 301, Sunrise Apartments, Indiranagar, Bangalore 560038',
      aadhaarNumber: '111122223333',
      location: {
        type: 'Point',
        coordinates: [77.5946, 12.9716] // Bangalore Center
      }
    });
    await renter.save();

    console.log('Users seeded. Seeding Items...');

    // 4. Create Items
    const items = [
      {
        title: 'Sony Alpha 7 III Mirrorless Camera',
        description: 'Comes with a 28-70mm lens, 2 batteries, and a 64GB high-speed SD card. Perfect for photography projects and cinematography.',
        category: 'electronics',
        pricePerDay: 1500,
        deposit: 5000,
        owner: seller._id,
        location: {
          type: 'Point',
          coordinates: [77.5896, 12.9696]
        },
        address: 'Sharma Rentals, MG Road, Bangalore',
        isAvailable: true,
        tags: ['camera', 'sony', 'dslr', 'electronics', 'lens'],
        status: 'active',
        avgRating: 4.8,
        reviewCount: 2
      },
      {
        title: 'Bosch Professional Cordless Drill',
        description: 'Heavy duty 18V cordless drill with hammer function. Comes with keyless chuck and double battery packs.',
        category: 'tools',
        pricePerDay: 400,
        deposit: 1500,
        owner: seller._id,
        location: {
          type: 'Point',
          coordinates: [77.5996, 12.9736]
        },
        address: 'MG Road Metro Station, Bangalore',
        isAvailable: true,
        tags: ['drill', 'bosch', 'tools', 'hammer', 'repair'],
        status: 'active',
        avgRating: 4.5,
        reviewCount: 1
      },
      {
        title: 'Royal Enfield Classic 350',
        description: 'Gunmetal Grey classic. Well maintained, runs smooth. Please bring a valid driving license.',
        category: 'vehicles',
        pricePerDay: 1200,
        deposit: 3000,
        owner: seller._id,
        location: {
          type: 'Point',
          coordinates: [77.5916, 12.9756]
        },
        address: 'Brigade Road, Bangalore',
        isAvailable: true,
        tags: ['bike', 'motorcycle', 'bullet', 'royal enfield', 'trip'],
        status: 'active',
        avgRating: 5.0,
        reviewCount: 3
      },
      {
        title: 'Royal Enfield Classic 350',
        description: 'Stealth Black classic motorcycle. Cruiser style, comfortable seat, brand new tires.',
        category: 'vehicles',
        pricePerDay: 1500,
        deposit: 4000,
        owner: seller._id,
        location: {
          type: 'Point',
          coordinates: [77.5926, 12.9766]
        },
        address: 'Indiranagar Metro Station, Bangalore',
        isAvailable: true,
        tags: ['bike', 'motorcycle', 'bullet', 'royal enfield', 'trip'],
        status: 'active',
        avgRating: 4.6,
        reviewCount: 2
      },
      {
        title: 'Designer Leather Jacket',
        description: 'Premium black leather jacket, size L. Perfect for events and riding.',
        category: 'clothing',
        pricePerDay: 300,
        deposit: 1000,
        owner: seller._id,
        location: {
          type: 'Point',
          coordinates: [77.5936, 12.9706]
        },
        address: 'Commercial Street, Bangalore',
        isAvailable: true,
        tags: ['jacket', 'clothing', 'fashion', 'leather', 'ride'],
        status: 'active',
        avgRating: 4.7,
        reviewCount: 1
      }
    ];

    const seededItems = [];
    for (const itemData of items) {
      const it = new Item(itemData);
      await it.save();
      seededItems.push(it);
    }

    console.log('Items seeded. Seeding Reviews...');

    // 5. Create Reviews
    const reviews = [
      {
        item: seededItems[0]._id,
        author: renter._id,
        rating: 5,
        comment: 'Absolutely amazing camera quality. Highly recommended!'
      },
      {
        item: seededItems[0]._id,
        author: admin._id,
        rating: 4.6,
        comment: 'Good battery life, but lens filters were missing.'
      },
      {
        item: seededItems[1]._id,
        author: renter._id,
        rating: 4.5,
        comment: 'Worked perfectly for drilling wall mounts. Clean condition.'
      }
    ];

    for (const revData of reviews) {
      await Review.create(revData);
    }

    console.log('Database successfully seeded!');
    process.exit(0);
  } catch (error) {
    console.error('Seeding operations failed:', error.message);
    process.exit(1);
  }
}

seed();
