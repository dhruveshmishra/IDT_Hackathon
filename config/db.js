const mongoose = require('mongoose');

const mongoUrl = process.env.MONGO_URL;
const localMongoUrl = process.env.LOCAL_MONGO_URL || 'mongodb://127.0.0.1:27017/rentapp';

mongoose.set('strictQuery', false);

async function connectDB() {
  const connectionOptions = {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 10,
    minPoolSize: 2,
    socketTimeoutMS: 45000
  };

  try {
    await mongoose.connect(mongoUrl, connectionOptions);
    console.log('Successfully connected to MongoDB Atlas');
  } catch (error) {
    console.error('Failed to connect to MongoDB Atlas. Error:', error.message);
    console.log(`Attempting fallback connection to local MongoDB: ${localMongoUrl}`);
    try {
      await mongoose.connect(localMongoUrl, connectionOptions);
      console.log('Successfully connected to local MongoDB');
    } catch (localError) {
      console.error('Fallback to local MongoDB also failed:', localError.message);
      process.exit(1);
    }
  }
}

connectDB();

module.exports = mongoose.connection;
