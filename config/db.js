const mongoose = require('mongoose');

const mongoUrl = process.env.MONGO_URL;
const localMongoUrl = process.env.LOCAL_MONGO_URL || 'mongodb://127.0.0.1:27017/rentapp';

mongoose.set('strictQuery', false);

const dns = require('dns').promises;
const url = require('url');

async function connectDB() {
  const connectionOptions = {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 10,
    minPoolSize: 2,
    socketTimeoutMS: 45000
  };

  const isLocal = !mongoUrl || mongoUrl.includes('127.0.0.1') || mongoUrl.includes('localhost');

  if (!isLocal) {
    try {
      const hostPart = mongoUrl.replace(/^mongodb(\+srv)?:\/\//, '').split('/')[0].split('@').pop().split(':')[0];
      console.log(`Checking DNS resolution for Atlas host: ${hostPart}`);
      const isSrv = mongoUrl.startsWith('mongodb+srv://');
      const dnsPromise = isSrv 
        ? dns.resolveSrv('_mongodb._tcp.' + hostPart)
        : dns.lookup(hostPart);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('DNS lookup timeout')), 15000)
      );
      await Promise.race([dnsPromise, timeoutPromise]);
      
      console.log('Connecting to MongoDB Atlas...');
      await mongoose.connect(mongoUrl, connectionOptions);
      console.log('Successfully connected to MongoDB Atlas');
      return;
    } catch (error) {
      console.error('Failed to connect to MongoDB Atlas. Error:', error.message);
    }
  }

  console.log(`Connecting to local MongoDB: ${localMongoUrl}`);
  try {
    await mongoose.connect(localMongoUrl, connectionOptions);
    console.log('Successfully connected to local MongoDB');
  } catch (localError) {
    console.error('Connection to local MongoDB failed:', localError.message);
    process.exit(1);
  }
}

connectDB();

// mongoose.connection.once('open', async () => {
//   try {
//     // Drop the old single-field unique index on email
//     await mongoose.connection.db.collection('users').dropIndex('email_1');
//     console.log('Successfully dropped legacy single-field unique email index');
//   } catch (err) {
//     if (err.codeName !== 'IndexNotFound' && err.message !== 'index not found with name [email_1]') {
//       console.warn('Could not drop index email_1:', err.message);
//     }
//   }
// });

module.exports = mongoose.connection;
