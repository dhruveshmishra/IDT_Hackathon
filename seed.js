require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Item = require('./models/Item');
const Review = require('./models/Review');
const Booking = require('./models/Booking');

const mongoUrl = process.env.MONGO_URL;
const localMongoUrl = process.env.LOCAL_MONGO_URL || 'mongodb://127.0.0.1:27017/rentapp';

const unsplashImages = {
  mobile: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80',
  laptop: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600&auto=format&fit=crop&q=80',
  camera: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=600&auto=format&fit=crop&q=80',
  tv: 'https://images.unsplash.com/photo-1593789198777-f29bc259780e?w=600&auto=format&fit=crop&q=80',
  audio: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=80',
  appliances: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=600&auto=format&fit=crop&q=80',
  
  self_drive_car: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=600&auto=format&fit=crop&q=80',
  bikes_scooters: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=600&auto=format&fit=crop&q=80',
  outstation_cabs: 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=600&auto=format&fit=crop&q=80',
  luxury_cars: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=600&auto=format&fit=crop&q=80',
  segways: 'https://images.unsplash.com/photo-1607603750909-408e19385117?w=600&auto=format&fit=crop&q=80',
  golf_cart: 'https://images.unsplash.com/photo-1531693251400-38df35776dc7?w=600&auto=format&fit=crop&q=80',

  drills: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=600&auto=format&fit=crop&q=80',
  saws: 'https://images.unsplash.com/photo-1581147036324-c17da41dfa6c?w=600&auto=format&fit=crop&q=80',
  hand_tools: 'https://images.unsplash.com/photo-1530124406582-7ef6944e6027?w=600&auto=format&fit=crop&q=80',
  generators: 'https://images.unsplash.com/photo-1620714223084-8fcacc6dfd8d?w=600&auto=format&fit=crop&q=80',
  ladders: 'https://images.unsplash.com/photo-1618762044398-ec1e7e048bbd?w=600&auto=format&fit=crop&q=80',

  sofa: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&auto=format&fit=crop&q=80',
  bed: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=600&auto=format&fit=crop&q=80',
  table: 'https://images.unsplash.com/photo-1577140917170-285929fb55b7?w=600&auto=format&fit=crop&q=80',
  chair: 'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=600&auto=format&fit=crop&q=80',

  cycle: 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=600&auto=format&fit=crop&q=80',
  fitness: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=600&auto=format&fit=crop&q=80',
  camping: 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=600&auto=format&fit=crop&q=80',

  suits: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=600&auto=format&fit=crop&q=80',
  traditional: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600&auto=format&fit=crop&q=80',
  dresses: 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=600&auto=format&fit=crop&q=80',

  other: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80'
};

const rawSeedItems = [
  // ELECTRONICS (12 items)
  { title: 'iPhone 15 Pro Max', category: 'electronics', subcategory: 'mobile', price: 900, deposit: 4000, desc: 'Titanium grey, 256GB. Excellent condition, comes with protective cover.' },
  { title: 'Samsung Galaxy S24 Ultra', category: 'electronics', subcategory: 'mobile', price: 850, deposit: 4000, desc: '512GB, includes Stylus S-pen. High performance camera.' },
  { title: 'Google Pixel 8 Pro', category: 'electronics', subcategory: 'mobile', price: 700, deposit: 3500, desc: '128GB Obsidian black. Phenomenal AI features and camera.' },
  { title: 'MacBook Pro 16" M3 Max', category: 'electronics', subcategory: 'laptop', price: 1800, deposit: 6000, desc: '36GB Unified Memory, 1TB SSD. Powerful compilation and rendering machine.' },
  { title: 'Lenovo ThinkPad X1 Carbon', category: 'electronics', subcategory: 'laptop', price: 1100, deposit: 4000, desc: 'Intel Core i7, 16GB RAM. Perfect business laptop for presentations.' },
  { title: 'Sony Alpha 7 IV Mirrorless', category: 'electronics', subcategory: 'camera', price: 1600, deposit: 5000, desc: 'Body only, includes 2 extra batteries and charger. High end mirrorless.' },
  { title: 'DJI Mavic 3 Pro Drone', category: 'electronics', subcategory: 'camera', price: 2000, deposit: 8000, desc: 'Triple camera system, Fly More combo. Ideal for premium aerial shots.' },
  { title: 'LG C3 55" 4K OLED TV', category: 'electronics', subcategory: 'tv', price: 1200, deposit: 5000, desc: 'Outstanding gaming and viewing experience. Screen mount included.' },
  { title: 'JBL PartyBox 310 Speaker', category: 'electronics', subcategory: 'audio', price: 800, deposit: 3000, desc: '240W output, wireless mic included, synchronized light show.' },
  { title: 'Bose QuietComfort Ultra', category: 'electronics', subcategory: 'audio', price: 350, deposit: 1500, desc: 'Premium ANC wireless headphones for business flights.' },
  { title: 'Dyson Purifier Cool Gen1', category: 'electronics', subcategory: 'appliances', price: 500, deposit: 2500, desc: 'Sleek air purifier and fan. Removes 99.97% of allergens.' },
  { title: 'LG Double Door Smart Fridge', category: 'electronics', subcategory: 'appliances', price: 950, deposit: 4000, desc: '350 Litres smart inverter compressor. Incredibly spacious.' },

  // VEHICLES (12 items)
  { title: 'Mahindra Thar 4x4 MT', category: 'vehicles', subcategory: 'self_drive_car', price: 3000, deposit: 8000, desc: 'Rugged manual transmission 4x4 SUV. Ideal for hill-trips.' },
  { title: 'Hyundai Creta Automatic', category: 'vehicles', subcategory: 'self_drive_car', price: 2200, deposit: 5000, desc: 'Panoramic sunroof, comfortable 5-seater city ride.' },
  { title: 'Royal Enfield Classic 350', category: 'vehicles', subcategory: 'bikes_scooters', price: 1000, deposit: 3000, desc: 'Halcyon black retro cruiser. Very well maintained engine.' },
  { title: 'Ather 450X Gen 3 Scooter', category: 'vehicles', subcategory: 'bikes_scooters', price: 600, deposit: 2000, desc: 'High speed electric scooter, Charger and helmet included.' },
  { title: 'Innova Crysta (Outstation Driver)', category: 'vehicles', subcategory: 'outstation_cabs', price: 4500, deposit: 2000, desc: 'Spacious 7-seater. Rental rate includes professional local driver.' },
  { title: 'BMW 530d M Sport Sedan', category: 'vehicles', subcategory: 'luxury_cars', price: 22000, deposit: 30000, desc: 'Premium luxury sedan. Impeccable drive comfort and power.' },
  { title: 'Mercedes-Benz E-Class Coupe', category: 'vehicles', subcategory: 'luxury_cars', price: 25000, deposit: 35000, desc: 'Ultra premium coupe for wedding entries and VIP guest hosting.' },
  { title: 'Ninebot Segway S-Plus', category: 'vehicles', subcategory: 'segways', price: 800, deposit: 4000, desc: 'Smart self-balancing electric transporter. Fun and convenient.' },
  { title: 'Club Car 4-Seater Golf Cart', category: 'vehicles', subcategory: 'golf_cart', price: 3500, deposit: 8000, desc: 'Electric utility cart. Perfect for resort movements or events.' },
  { title: 'Audi A6 Matrix LED Sedan', category: 'vehicles', subcategory: 'luxury_cars', price: 20000, deposit: 25000, desc: 'Stunning business sedan with plush leather interiors.' },
  { title: 'Tata Harrier XZA+ SUV', category: 'vehicles', subcategory: 'self_drive_car', price: 2800, deposit: 6000, desc: 'Big bold SUV with automatic transmission and smart drive modes.' },
  { title: 'Vespa VXL 150 Classic', category: 'vehicles', subcategory: 'bikes_scooters', price: 800, deposit: 2500, desc: 'Charming retro scooter in vibrant yellow. Great for city rides.' },

  // TOOLS (10 items)
  { title: 'Bosch GSB 18V Cordless Drill', category: 'tools', subcategory: 'drills', price: 350, deposit: 1500, desc: '18V cordless hammer drill with accessories. Reliable drill kit.' },
  { title: 'Dewalt Brushless Rotary Hammer', category: 'tools', subcategory: 'drills', price: 500, deposit: 2000, desc: 'SDS-plus heavy duty rotary drill for masonry and concrete.' },
  { title: 'Makita Cordless Circular Saw', category: 'tools', subcategory: 'saws', price: 450, deposit: 1800, desc: 'Precision wood cutter with dust extraction port. High safety guide.' },
  { title: 'Bosch Jigsaw Professional', category: 'tools', subcategory: 'saws', price: 300, deposit: 1200, desc: 'Perfect tool for curved cuts in wood and aluminum sheets.' },
  { title: 'Stanley 120-Piece Mechanic Toolkit', category: 'tools', subcategory: 'hand_tools', price: 200, deposit: 1000, desc: 'Full socket set, wrenches, and screwdrivers in heavy plastic case.' },
  { title: 'Honda Silent Inverter Generator 2.2kVA', category: 'tools', subcategory: 'generators', price: 1200, deposit: 5000, desc: 'Extremely silent portable petrol generator for events/camps.' },
  { title: 'Karcher K4 High Pressure Washer', category: 'tools', subcategory: 'hand_tools', price: 400, deposit: 2000, desc: 'Water pressure cleaner. Excellent for car washes and patio cleanup.' },
  { title: 'Werner 12ft Fiberglass Step Ladder', category: 'tools', subcategory: 'ladders', price: 250, deposit: 1200, desc: 'Highly stable ladder with tool holster. Non-conductive rails.' },
  { title: 'Falcon Hedge Trimmer (Petrol)', category: 'tools', subcategory: 'hand_tools', price: 350, deposit: 1500, desc: 'High blade efficiency garden maintenance tool.' },
  { title: 'Stihl Chainsaw MS 180', category: 'tools', subcategory: 'saws', price: 600, deposit: 2500, desc: 'Compact gasoline chainsaw. Perfect for cutting firewood or logs.' },

  // FURNITURE (6 items)
  { title: 'IKEA Landskrona 3-Seater Sofa', category: 'furniture', subcategory: 'sofa', price: 600, deposit: 2500, desc: 'Grey fabric sofa. Modern sleek metal legs. Sanitized.' },
  { title: 'Sheesham Wood King Bed Frame', category: 'furniture', subcategory: 'bed', price: 700, deposit: 3000, desc: 'Durable solid wood frame with storage box. Fits King mattress.' },
  { title: 'Study Table with Cabinet', category: 'furniture', subcategory: 'table', price: 300, deposit: 1200, desc: 'Compact study table. White laminate top, drawer storage.' },
  { title: 'Ergonomic Mesh Office Chair', category: 'furniture', subcategory: 'chair', price: 250, deposit: 1000, desc: '3D armrests, lumbar support. Fits home workspaces perfectly.' },
  { title: 'L-Shaped Sectional Corner Sofa', category: 'furniture', subcategory: 'sofa', price: 900, deposit: 4000, desc: 'Large 5-seater corner sofa. Microfiber grey fabric, extremely soft.' },
  { title: 'Solid Wood 6-Seater Dining Table', category: 'furniture', subcategory: 'table', price: 800, deposit: 3000, desc: 'Teak finish dining table with 6 matching cushioned chairs.' },

  // SPORTS (5 items)
  { title: 'Firefox Target 21-Speed MTB Cycle', category: 'sports', subcategory: 'cycle', price: 300, deposit: 1500, desc: 'Mountain bike with front suspension and dual disc brakes.' },
  { title: 'Decathlon Trekking Tent (3-Person)', category: 'sports', subcategory: 'camping', price: 350, deposit: 1500, desc: 'Waterproof, wind-resistant pitch tent. Quick setup guidelines.' },
  { title: 'Bowflex SelectTech Adjustable Dumbbells', category: 'sports', subcategory: 'fitness', price: 500, deposit: 2500, desc: 'Pair of dumbbells adjustable from 2kg to 24kg. Compact home workout.' },
  { title: 'Fitline Motorized Treadmill', category: 'sports', subcategory: 'fitness', price: 1200, deposit: 5000, desc: 'Foldable treadmill with 12 preset workout profiles. Heart monitor.' },
  { title: 'Quechua Camping Sleeping Bag & Mat Combo', category: 'sports', subcategory: 'camping', price: 150, deposit: 800, desc: 'Warm sleeping bag comfort rated at 10°C along with foam mat.' },

  // CLOTHING (5 items)
  { title: 'Raymond Slim Fit Black Tuxedo Suit', category: 'clothing', subcategory: 'suits', price: 600, deposit: 2500, desc: '3-piece tuxedo set with blazer, trousers, and bow tie. Size: 40.' },
  { title: 'Designer Sherwani for Weddings', category: 'clothing', subcategory: 'traditional', price: 1200, deposit: 3000, desc: 'Beige and gold intricately embroidered sherwani. Size: M (38).' },
  { title: 'Silk Banarasi Saree', category: 'clothing', subcategory: 'traditional', price: 800, deposit: 2000, desc: 'Authentic red Banarasi silk saree with gold zari border work.' },
  { title: 'Premium Evening Cocktail Gown', category: 'clothing', subcategory: 'dresses', price: 1000, deposit: 2500, desc: 'Stunning royal blue floor-length gown. Dry cleaned and ready.' },
  { title: 'Manish Malhotra Inspired Lehenga', category: 'clothing', subcategory: 'traditional', price: 2500, deposit: 5000, desc: 'Mirror work lehenga choli set. Size: Adjustable S/M.' }
];

async function seed() {
  let connected = false;

  if (mongoUrl) {
    try {
      console.log('Connecting to MongoDB Atlas...');
      await mongoose.connect(mongoUrl);
      console.log('Connected.');
      connected = true;
    } catch (err) {
      console.error('Atlas failed:', err.message);
    }
  }

  if (!connected) {
    try {
      console.log(`Using local MongoDB: ${localMongoUrl}...`);
      await mongoose.connect(localMongoUrl);
      console.log('Connected.');
      connected = true;
    } catch (err) {
      console.error('Local failed:', err.message);
      process.exit(1);
    }
  }

  try {
    console.log('Cleaning collections...');
    await User.deleteMany({});
    await Item.deleteMany({});
    await Review.deleteMany({});
    await Booking.deleteMany({});

    // 1. Create Super Admin
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

    // 2. Create Seller
    const seller = new User({
      name: 'Sharma Rentals',
      email: process.env.DEMO_SELLER_EMAIL || 'seller@rentit.com',
      password: process.env.DEMO_SELLER_PASS || 'seller123',
      phone: '+918888888888',
      role: 'seller',
      isVerified: true,
      aadhaarVerified: true,
      sellerApproved: true,
      address: 'Shop 12, MG Road, Bangalore 560001',
      aadhaarNumber: '987654321098',
      location: { type: 'Point', coordinates: [77.5896, 12.9696] },
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
      location: { type: 'Point', coordinates: [77.5946, 12.9716] }
    });
    await renter.save();

    console.log('Seeding 50 diverse items with stock quantities and image URLs...');

    const seededItems = [];
    for (let i = 0; i < rawSeedItems.length; i++) {
      const info = rawSeedItems[i];
      // Lookup image based on subcategory or category
      const imageUrl = unsplashImages[info.subcategory] || unsplashImages[info.category] || unsplashImages.other;
      
      // Calculate coordinates spread around Bangalore center
      const latOffset = (Math.random() - 0.5) * 0.05;
      const lngOffset = (Math.random() - 0.5) * 0.05;

      const randomQty = Math.floor(Math.random() * 8) + 2; // Stock quantity between 2 and 9
      const randomPricePerHour = Math.round(info.price / 10);

      const it = new Item({
        title: info.title,
        description: info.desc,
        category: info.category,
        subcategory: info.subcategory,
        pricePerDay: info.price,
        pricePerHour: randomPricePerHour,
        deposit: info.deposit,
        images: [{ url: imageUrl, public_id: `seed_img_${i}` }],
        owner: seller._id,
        location: {
          type: 'Point',
          coordinates: [77.5896 + lngOffset, 12.9696 + latOffset]
        },
        address: 'Sharma Rentals Main Branch, Central Bangalore',
        isAvailable: true,
        quantity: randomQty, // Number of items remaining
        tags: [info.category, info.subcategory, info.title.toLowerCase().split(' ')[0]],
        status: 'active'
      });
      await it.save();
      seededItems.push(it);
    }

    console.log(`Seeded ${seededItems.length} items. Seeding reviews...`);

    // Create a few reviews on seeded items
    for (let i = 0; i < 5; i++) {
      const randomItem = seededItems[Math.floor(Math.random() * seededItems.length)];
      await Review.create({
        item: randomItem._id,
        author: renter._id,
        rating: 5,
        comment: 'Great item, reliable seller, and fast escrow verification process!'
      });
    }

    console.log('Database successfully cleared and seeded with 50 diverse items!');
    process.exit(0);
  } catch (error) {
    console.error('Seeding operation failed:', error.message);
    process.exit(1);
  }
}

seed();
