const redis = require('redis');

let redisClient = null;
const useRedis = false; // We can set this to false to default to memory cache, or true if we want to try connection.

class MemoryCache {
  constructor() {
    this.store = {};
  }
  async connect() {
    console.log('Using In-Memory cache fallback (No Redis connection required).');
    return true;
  }
  async get(key) {
    const entry = this.store[key];
    if (!entry) return null;
    if (entry.expiry && entry.expiry < Date.now()) {
      delete this.store[key];
      return null;
    }
    return entry.value;
  }
  async set(key, value, options = {}) {
    let expiry = null;
    if (options.EX) {
      expiry = Date.now() + options.EX * 1000;
    }
    this.store[key] = { value, expiry };
    return 'OK';
  }
  async del(key) {
    delete this.store[key];
    return 1;
  }
  on(event, callback) {
    // mock event listener
  }
}

const client = new MemoryCache();
client.connect();

module.exports = client;
