const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { invalidateCourseDeep } = require('../utils/cacheInvalidation');

router.use(authenticateToken);
router.use(requireRole('instructor'));


// NO CACHE (dynamic instructor data)
router.get('/courses', async (req, res) => {
    try {
        const result = await db.query(
            'SELECT * FROM courses WHERE instructor_id = $1 ORDER BY created_at DESC',
            [req.user.id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Database error', details: err.message });
    }
});


// CREATE COURSE → invalidate course list
router.post('/courses', async (req, res) => {
    const { title, description } = req.body;

    try {
        const result = await db.query(
            `INSERT INTO courses (instructor_id, title, description, status)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [req.user.id, title, description, 'draft']
        );

        const course = result.rows[0];

        // invalidate public list (in case later approved)
        await invalidateCourseDeep(course.course_id, req.user.id);

        res.status(201).json(course);

    } catch (err) {
        res.status(500).json({ error: 'Database error', details: err.message });
    }
});


// SUBMIT COURSE → invalidate (status changes)
router.put('/courses/:id/submit', async (req, res) => {
    try {
        const result = await db.query(
            `UPDATE courses 
             SET status = 'pending'
             WHERE course_id = $1 AND instructor_id = $2
             RETURNING *`,
            [req.params.id, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Course not found or unauthorized'
            });
        }

        const course = result.rows[0];

        // invalidate everything
        await invalidateCourseDeep(course.course_id, req.user.id);

        res.json(course);

    } catch (err) {
        res.status(500).json({ error: 'Database error', details: err.message });
    }
});


// ADD MODULE → invalidate course detail
router.post('/courses/:id/modules', async (req, res) => {
    const { title } = req.body;

    try {
        const course = await db.query(
            'SELECT * FROM courses WHERE course_id = $1 AND instructor_id = $2',
            [req.params.id, req.user.id]
        );

        if (course.rows.length === 0) {
            return res.status(404).json({ error: 'Course not found' });
        }

        const maxIndexRes = await db.query(
            'SELECT COALESCE(MAX(module_index), 0) as max_idx FROM modules WHERE course_id = $1',
            [req.params.id]
        );

        const nextIndex = maxIndexRes.rows[0].max_idx + 1;

        const result = await db.query(
            `INSERT INTO modules (course_id, module_index, title)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [req.params.id, nextIndex, title]
        );

        // invalidate course cache
        await invalidateCourseDeep(req.params.id, req.user.id);

        res.status(201).json(result.rows[0]);

    } catch (err) {
        res.status(500).json({ error: 'Database error', details: err.message });
    }
});


// ADD LESSON → invalidate course detail
router.post('/courses/:id/modules/:module_index/lessons', async (req, res) => {
    const { title, video_url, video_duration } = req.body;

    try {
        const course = await db.query(
            'SELECT * FROM courses WHERE course_id = $1 AND instructor_id = $2',
            [req.params.id, req.user.id]
        );

        if (course.rows.length === 0) {
            return res.status(404).json({ error: 'Course not found' });
        }

        const maxIndexRes = await db.query(
            `SELECT COALESCE(MAX(lesson_index), 0) as max_idx 
             FROM lessons 
             WHERE course_id = $1 AND module_index = $2`,
            [req.params.id, req.params.module_index]
        );

        const nextIndex = maxIndexRes.rows[0].max_idx + 1;

        const result = await db.query(
            `INSERT INTO lessons 
             (course_id, module_index, lesson_index, title, video_url, video_duration)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [
                req.params.id,
                req.params.module_index,
                nextIndex,
                title,
                video_url,
                video_duration || 0
            ]
        );

        // invalidate course cache
        await invalidateCourseDeep(req.params.id, req.user.id);

        res.status(201).json(result.rows[0]);

    } catch (err) {
        res.status(500).json({ error: 'Database error', details: err.message });
    }
});

module.exports = router;