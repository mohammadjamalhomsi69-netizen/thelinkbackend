const { createClient } = require('redis');

const client = createClient({
  url: process.env.REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 100, 3000)
  }
});

client.on('error', (err) => console.error('Redis error:', err));
client.on('connect', () => console.log('Redis connecting...'));
client.on('ready', () => console.log('Redis ready'));

module.exports = {
  connect: () => client.connect(),
  set: (key, value, options) => client.set(key, JSON.stringify(value), options),
  get: async (key) => {
    const val = await client.get(key);
    return val ? JSON.parse(val) : null;
  },
  del: (key) => client.del(key),
  exists: (key) => client.exists(key),
  expire: (key, seconds) => client.expire(key, seconds),
  setEx: (key, seconds, value) => client.setEx(key, seconds, JSON.stringify(value)),
  incr: (key) => client.incr(key),
  client
};
