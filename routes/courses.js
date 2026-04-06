const express = require('express');
const router = express.Router();
const db = require('../db');
const cache = require('../middleware/cache');
const { authenticateTokenOptional } = require('../middleware/auth');


// Get all approved courses (PUBLIC CACHE)
router.get(
  '/',
  cache(() => 'courses:approved', 3600),
  async (req, res) => {
    try {
      const result = await db.query(`
        SELECT c.*, u.name as instructor_name 
        FROM courses c
        JOIN instructors i ON c.instructor_id = i.instructor_id
        JOIN users u ON i.instructor_id = u.user_id
        WHERE c.status = 'approved'
        ORDER BY c.created_at DESC
      `);

      res.json(result.rows);

    } catch (err) {
      res.status(500).json({
        error: 'Database error',
        details: err.message
      });
    }
  }
);


// Get single course (ROLE-AWARE CACHE)
router.get(
  '/:id',
  authenticateTokenOptional,
  cache((req) => {
    const courseId = req.params.id;

    if (!req.user) return `course:${courseId}:guest`;

    if (req.user.role === 'admin') {
      return `course:${courseId}:admin`;
    }

    if (req.user.role === 'instructor') {
      return `course:${courseId}:instructor:${req.user.id}`;
    }

    return `course:${courseId}:user`;
  }, 3600),
  async (req, res) => {
    const { id } = req.params;
    const user = req.user;

    try {
      const courseRes = await db.query(`
        SELECT c.*, u.name as instructor_name 
        FROM courses c
        JOIN instructors i ON c.instructor_id = i.instructor_id
        JOIN users u ON i.instructor_id = u.user_id
        WHERE c.course_id = $1
      `, [id]);

      if (courseRes.rows.length === 0) {
        return res.status(404).json({ error: 'Course not found' });
      }

      const course = courseRes.rows[0];

      // Access control BEFORE expensive queries
      const isApproved = course.status === 'approved';
      const isAdmin = user && user.role === 'admin';
      const isOwner = user && user.id === course.instructor_id;

      if (!isApproved && !isAdmin && !isOwner) {
        return res.status(403).json({
          error: 'Course is not available or pending approval'
        });
      }

      // Modules
      const modulesRes = await db.query(
        'SELECT * FROM modules WHERE course_id = $1 ORDER BY module_index ASC',
        [id]
      );

      // Lessons
      const lessonsRes = await db.query(
        'SELECT * FROM lessons WHERE course_id = $1 ORDER BY module_index ASC, lesson_index ASC',
        [id]
      );

      course.modules = modulesRes.rows.map(mod => ({
        ...mod,
        lessons: lessonsRes.rows.filter(
          l => l.module_index === mod.module_index
        )
      }));

      // Reviews
      const reviewsRes = await db.query(`
        SELECT r.*, u.name as learner_name
        FROM reviews r
        JOIN users u ON r.learner_id = u.user_id
        WHERE r.course_id = $1
        ORDER BY r.rating DESC
      `, [id]);

      course.reviews = reviewsRes.rows;

      res.json(course);

    } catch (err) {
      res.status(500).json({
        error: 'Database error',
        details: err.message
      });
    }
  }
);


// No Caching
router.get('/verify/:certId', async (req, res) => {
  const certId = req.params.certId;
  const parts = certId.split('-');

  if (parts.length !== 3 || parts[0] !== 'CERT') {
    return res.status(400).json({ error: 'Invalid Certificate Format' });
  }

  const learnerId = parseInt(parts[1], 10);
  const courseId = parseInt(parts[2], 10);

  try {
    const result = await db.query(`
      SELECT c.title as course_title,
             u.name as learner_name,
             e.enrolled_at as issued_at,
             i_u.name as instructor_name
      FROM enrollments e
      JOIN courses c ON e.course_id = c.course_id
      JOIN users u ON e.learner_id = u.user_id
      JOIN instructors i ON c.instructor_id = i.instructor_id
      JOIN users i_u ON i.instructor_id = i_u.user_id
      WHERE e.learner_id = $1 AND e.course_id = $2
    `, [learnerId, courseId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Certificate not found or invalid'
      });
    }

    res.json(result.rows[0]);

  } catch (err) {
    res.status(500).json({
      error: 'Database error',
      details: err.message
    });
  }
});

module.exports = router;