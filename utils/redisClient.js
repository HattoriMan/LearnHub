const { createClient } = require('redis');

const client = createClient({
  url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
  socket: {
    reconnectStrategy: (retries) => {
      console.log(`Redis reconnect attempt: ${retries}`);
      return Math.min(retries * 100, 3000); // retry with backoff
    }
  }
});

client.on('error', (err) => {
  console.error('Redis error:', err.message);
});

client.on('connect', () => {
  console.log('Redis connecting...');
});

client.on('ready', () => {
  console.log('Redis connected and ready');
});

client.on('end', () => {
  console.log('Redis connection closed');
});


// Safe connect function
const connectRedis = async () => {
  try {
    if (!client.isOpen) {
      await client.connect();
    }
  } catch (err) {
    console.error('Redis connection failed:', err.message);
  }
};

module.exports = {
  client,
  connectRedis
};