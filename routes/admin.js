const express = require('express');
const router = express.Router();
const db = require('../db');
const cache = require('../middleware/cache');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { invalidateCourseDeep } = require('../utils/cacheInvalidation');
const { client: redis }  = require('../utils/redisClient');

router.use(authenticateToken);
router.use(requireRole('admin'));


// Get pending courses (CACHE)
router.get(
  '/courses/pending',
  cache(() => 'admin:courses:pending', 300), // 5 min
  async (req, res) => {
    try {
      const query = `
        SELECT c.*, u.name as instructor_name 
        FROM courses c
        JOIN instructors i ON c.instructor_id = i.instructor_id
        JOIN users u ON i.instructor_id = u.user_id
        WHERE c.status = 'pending'
        ORDER BY c.created_at ASC
      `;
      const result = await db.query(query);
      res.json(result.rows);

    } catch (err) {
      res.status(500).json({
        error: 'Database error',
        details: err.message
      });
    }
  }
);


// Audit course (approve / reject)
router.put('/courses/:id/audit', async (req, res) => {
  const { status } = req.body; // 'approved' | 'rejected'

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    await db.query('BEGIN');

    // update course
    const result = await db.query(
      `UPDATE courses 
       SET status = $1 
       WHERE course_id = $2 
       RETURNING *`,
      [status, req.params.id]
    );

    if (result.rows.length === 0) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: 'Course not found' });
    }

    const course = result.rows[0];

    // insert audit log
    await db.query(
      `INSERT INTO audits (course_id, admin_id, status)
       VALUES ($1, $2, $3)`,
      [req.params.id, req.user.id, status]
    );

    await db.query('COMMIT');

    // CACHE INVALIDATION (CRITICAL)
    await Promise.all([
      invalidateCourseDeep(course.course_id, course.instructor_id), // course + instructor + public
      redis.del('admin:courses:pending') // admin queue
    ]);

    res.json(course);

  } catch (err) {
    await db.query('ROLLBACK');
    res.status(500).json({
      error: 'Database error',
      details: err.message
    });
  }
});

module.exports = router;