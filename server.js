const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const { connectRedis } = require('./utils/redisClient');

connectRedis();

const app = express();

// IMPORTANT for Nginx + Docker
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

// Redis RateLimiter
const rateLimiter = require('./middleware/rateLimiter');

// app.use('/api', rateLimiter({
//   windowSize: 60,     // 1 minute
//   maxRequests: 100    // 100 req/min per IP
// }));
// Apply rate limiter to everything EXCEPT uploads
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/cdn/upload')) return next();
  return rateLimiter({ windowSize: 60, maxRequests: 100 })(req, res, next);
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));
// Note: /cdn/videos is naturally inside /public so express.static will serve it.

// API Routes
// app.use('/api/auth', require('./routes/auth'));
// app.use('/api/courses', require('./routes/courses'));
// app.use('/api/learner', require('./routes/learner'));
// app.use('/api/instructor', require('./routes/instructor'));
// app.use('/api/admin', require('./routes/admin'));
// app.use('/api/cdn', require('./routes/cdn'));

// Basic response to ensure server is running
app.get('/api/health', (req, res) => {
  res.json({ status: 'Skill++ API is running' });
});

const authRoutes = require('./routes/auth');
const coursesRoutes = require('./routes/courses');
const instructorRoutes = require('./routes/instructor');
const adminRoutes = require('./routes/admin');
const learnerRoutes = require('./routes/learner');
const cdnRoutes = require('./routes/cdn');

app.use('/api/auth', authRoutes);
app.use('/api/courses', coursesRoutes);
app.use('/api/instructor', instructorRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/learner', learnerRoutes);
app.use('/api/cdn', cdnRoutes);

// Serve frontend application for all other routes
// app.get('*', (req, res) => {
//   res.sendFile(path.join(__dirname, 'public', 'home.html'));
// });

// No static serving here (handled by Nginx)

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
