const { client: redis }  = require('../utils/redisClient');

const cache = (keyGenerator, ttl = 3600) => {
  return async (req, res, next) => {
    try {
      const key = keyGenerator(req);
      if (!key) return next();

      const cached = await redis.get(key);

      if (cached) {
        return res.json(JSON.parse(cached));
      }

      const originalJson = res.json.bind(res);

      res.json = async (data) => {
        try {
          await redis.setEx(key, ttl, JSON.stringify(data));
        } catch (err) {
          console.error('Cache set error:', err);
        }
        return originalJson(data);
      };

      next();
    } catch (err) {
      console.error('Cache error:', err);
      next();
    }
  };
};

module.exports = cache;