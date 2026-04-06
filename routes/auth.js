const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');
const rateLimiter = require('../middleware/rateLimiter');
const cache = require('../middleware/cache');
const { client: redis }  = require('../utils/redisClient');
const { authenticateToken } = require('../middleware/auth');


// /register route with custom rateLimiter
router.post(
  '/register',
  rateLimiter({ windowSize: 60, maxRequests: 5 }),
  async (req, res) => {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    try {
      const hashedPassword = await bcrypt.hash(password, 10);

      await db.query('BEGIN');

      const userRes = await db.query(
        'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING user_id',
        [name, email, hashedPassword]
      );

      const userId = userRes.rows[0].user_id;

      if (role === 'learner') {
        await db.query('INSERT INTO learners (learner_id) VALUES ($1)', [userId]);
      } else if (role === 'instructor') {
        await db.query('INSERT INTO instructors (instructor_id) VALUES ($1)', [userId]);
      } else if (role === 'admin') {
        await db.query('INSERT INTO admins (admin_id) VALUES ($1)', [userId]);
      } else {
        await db.query('ROLLBACK');
        return res.status(400).json({ error: 'Invalid role' });
      }

      await db.query('COMMIT');

      res.status(201).json({ message: 'User registered successfully' });

    } catch (err) {
      await db.query('ROLLBACK');

      if (err.code === '23505') {
        return res.status(400).json({ error: 'Email already exists' });
      }

      res.status(500).json({ error: 'Database error', details: err.message });
    }
  }
);


// /login route with custom rateLimiter
router.post(
  '/login',
  rateLimiter({ windowSize: 60, maxRequests: 10 }),
  async (req, res) => {
    const { email, password } = req.body;

    try {
      const userRes = await db.query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );

      const fakeHash = '$2b$10$abcdefghijklmnopqrstuv';

      const user = userRes.rows[0];
      const passwordToCheck = user ? user.password : fakeHash;

      const validPassword = await bcrypt.compare(password, passwordToCheck);

      if (!user || !validPassword) {
        return res.status(400).json({ error: 'Invalid credentials' });
      }

      // Determine role
      let role = null;

      const learnerRes = await db.query(
        'SELECT 1 FROM learners WHERE learner_id = $1',
        [user.user_id]
      );

      if (learnerRes.rows.length > 0) role = 'learner';
      else {
        const instructorRes = await db.query(
          'SELECT 1 FROM instructors WHERE instructor_id = $1',
          [user.user_id]
        );
        if (instructorRes.rows.length > 0) role = 'instructor';
        else {
          const adminRes = await db.query(
            'SELECT 1 FROM admins WHERE admin_id = $1',
            [user.user_id]
          );
          if (adminRes.rows.length > 0) role = 'admin';
        }
      }

      const token = jwt.sign(
        { id: user.user_id, email: user.email, role },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        token,
        role,
        name: user.name,
        id: user.user_id
      });

    } catch (err) {
      res.status(500).json({
        error: 'Database error',
        details: err.message
      });
    }
  }
);


// UPDATE PROFILE (invalidate cache)
router.put('/profile', authenticateToken, async (req, res) => {
  const { name, email } = req.body;

  try {
    if (!name || !email) {
      return res.status(400).json({
        error: 'Name and email are required'
      });
    }

    const checkEmail = await db.query(
      'SELECT user_id FROM users WHERE email = $1 AND user_id != $2',
      [email, req.user.id]
    );

    if (checkEmail.rows.length > 0) {
      return res.status(400).json({
        error: 'Email is already in use by another account'
      });
    }

    await db.query(
      'UPDATE users SET name = $1, email = $2 WHERE user_id = $3',
      [name, email, req.user.id]
    );

    // invalidate profile cache
    await redis.del(`user:${req.user.id}:profile`);

    res.json({
      message: 'Profile updated successfully',
      name,
      email
    });

  } catch (err) {
    res.status(500).json({
      error: 'Database error',
      details: err.message
    });
  }
});


// GET PROFILE (CACHED)
router.get(
  '/profile',
  authenticateToken,
//   cache((req) => `user:${req.user.id}:profile`, 600), // 10 min
  cache((req) => {
    if (!req.user) return null;
    return `user:${req.user.id}:profile`;
  }, 600),
  async (req, res) => {
    try {
      const user = await db.query(
        'SELECT name, email, created_at FROM users WHERE user_id = $1',
        [req.user.id]
      );

      if (user.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json(user.rows[0]);

    } catch (err) {
      res.status(500).json({
        error: 'Database error',
        details: err.message
      });
    }
  }
);

module.exports = router;