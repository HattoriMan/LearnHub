const { client: redis }  = require('../utils/redisClient');

const rateLimiter = ({ windowSize = 60, maxRequests = 100 }) => {
  return async (req, res, next) => {
    try {
      const identifier = req.user?.id || req.body?.email || req.ip;
      const key = `rate:${identifier}`;

      // Increment request count
      const requests = await redis.incr(key);

      // Get TTL
      let ttl = await redis.ttl(key);

      // First request → set expiry
      if (requests === 1) {
        await redis.expire(key, windowSize);
        ttl = windowSize;
      }

      // Progressive delay (starts after 80% usage)
      if (requests > maxRequests * 0.8 && requests <= maxRequests) {
        // Delay increases as user approaches limit
        const excessRatio = (requests - maxRequests * 0.8) / (maxRequests * 0.2);

        // Max delay ~1000ms
        const delay = Math.min(1000, Math.floor(excessRatio * 1000));

        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - requests));
      res.setHeader(
        'X-RateLimit-Reset',
        Math.floor(Date.now() / 1000) + ttl
      );

      // If limit exceeded
      if (requests > maxRequests) {
        res.setHeader('Retry-After', ttl);

        return res.status(429).json({
          error: 'Too many requests. Please try again later.',
          retryAfter: ttl
        });
      }

      next();
    } catch (err) {
      console.error('Rate limiter error:', err);
      next();
    }
  };
};

module.exports = rateLimiter;