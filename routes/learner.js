const express = require('express');
const router = express.Router();
const db = require('../db');
const cache = require('../middleware/cache');
const { client: redis }  = require('../utils/redisClient');
const { invalidateCourseDeep } = require('../utils/cacheInvalidation');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.use(authenticateToken);
router.use(requireRole('learner'));


// ENROLL
router.post('/enrollments', async (req, res) => {
    const { course_id } = req.body;

    try {
        const courseCheck = await db.query(
            'SELECT status FROM courses WHERE course_id = $1',
            [course_id]
        );

        if (courseCheck.rows.length === 0 || courseCheck.rows[0].status !== 'approved') {
            return res.status(403).json({ error: 'Cannot enroll in an unapproved course' });
        }

        const check = await db.query(
            'SELECT * FROM enrollments WHERE learner_id = $1 AND course_id = $2',
            [req.user.id, course_id]
        );

        if (check.rows.length > 0) {
            return res.status(400).json({ error: 'Already enrolled' });
        }

        const result = await db.query(
            'INSERT INTO enrollments (learner_id, course_id) VALUES ($1, $2) RETURNING *',
            [req.user.id, course_id]
        );

        // invalidate user enrollments cache
        await redis.del(`learner:${req.user.id}:enrollments`);

        res.status(201).json(result.rows[0]);

    } catch (err) {
        res.status(500).json({ error: 'Database error', details: err.message });
    }
});


// GET ENROLLMENTS (CACHED)
router.get(
    '/enrollments',
    cache((req) => `learner:${req.user.id}:enrollments`, 600),
    async (req, res) => {
        try {
            const result = await db.query(`
                SELECT c.*, e.enrolled_at, e.issued_at, e.certificate_url, u.name as instructor_name,
                (SELECT COUNT(*) FROM lessons WHERE course_id = c.course_id) as total_lessons,
                (SELECT COUNT(*) FROM progress WHERE learner_id = e.learner_id AND course_id = c.course_id) as completed_lessons
                FROM enrollments e
                JOIN courses c ON e.course_id = c.course_id
                JOIN instructors i ON c.instructor_id = i.instructor_id
                JOIN users u ON i.instructor_id = u.user_id
                WHERE e.learner_id = $1
            `, [req.user.id]);

            const courses = result.rows.map(row => {
                let progress_percent = 0;
                if (row.total_lessons > 0) {
                    progress_percent = Math.round((row.completed_lessons / row.total_lessons) * 100);
                }
                return { ...row, progress: progress_percent };
            });

            res.json(courses);

        } catch (err) {
            res.status(500).json({ error: 'Database error', details: err.message });
        }
    }
);


// ADD TO WISHLIST
router.post('/wishlist', async (req, res) => {
    const { course_id } = req.body;

    try {
        const courseCheck = await db.query(
            'SELECT status FROM courses WHERE course_id = $1',
            [course_id]
        );

        if (courseCheck.rows.length === 0 || courseCheck.rows[0].status !== 'approved') {
            return res.status(403).json({ error: 'Cannot add unapproved course to wishlist' });
        }

        await db.query(
            'INSERT INTO wishlists (learner_id, course_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [req.user.id, course_id]
        );

        // invalidate wishlist cache
        await redis.del(`learner:${req.user.id}:wishlist`);

        res.status(201).json({ message: 'Added to wishlist' });

    } catch (err) {
        res.status(500).json({ error: 'Database error', details: err.message });
    }
});


// GET WISHLIST (CACHED)
router.get(
    '/wishlist',
    cache((req) => `learner:${req.user.id}:wishlist`, 600),
    async (req, res) => {
        try {
            const result = await db.query(`
                SELECT c.*, u.name as instructor_name
                FROM wishlists w
                JOIN courses c ON w.course_id = c.course_id
                JOIN instructors i ON c.instructor_id = i.instructor_id
                JOIN users u ON i.instructor_id = u.user_id
                WHERE w.learner_id = $1
            `, [req.user.id]);

            res.json(result.rows);

        } catch (err) {
            res.status(500).json({ error: 'Database error', details: err.message });
        }
    }
);


// REMOVE FROM WISHLIST
router.delete('/wishlist/:course_id', async (req, res) => {
    try {
        await db.query(
            'DELETE FROM wishlists WHERE learner_id = $1 AND course_id = $2',
            [req.user.id, req.params.course_id]
        );

        // invalidate wishlist
        await redis.del(`learner:${req.user.id}:wishlist`);

        res.json({ message: 'Removed from wishlist' });

    } catch (err) {
        res.status(500).json({ error: 'Database error', details: err.message });
    }
});


// REVIEW
router.post('/courses/:id/reviews', async (req, res) => {
    const { rating, comment } = req.body;

    try {
        const isEnrolled = await db.query(
            'SELECT * FROM enrollments WHERE learner_id = $1 AND course_id = $2',
            [req.user.id, req.params.id]
        );

        if (isEnrolled.rows.length === 0) {
            return res.status(403).json({ error: 'Not enrolled in this course' });
        }

        await db.query(
            `INSERT INTO reviews (learner_id, course_id, rating, comment)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (learner_id, course_id)
             DO UPDATE SET rating = $3, comment = $4`,
            [req.user.id, req.params.id, rating, comment]
        );

        // invalidate course cache (reviews changed)
        await invalidateCourseDeep(req.params.id, null);

        res.json({ message: 'Review added/updated' });

    } catch (err) {
        res.status(500).json({ error: 'Database error', details: err.message });
    }
});


// SAVE PROGRESS
router.post('/progress', async (req, res) => {
    const { course_id, module_index, lesson_index } = req.body;

    try {
        const isEnrolled = await db.query(
            'SELECT * FROM enrollments WHERE learner_id = $1 AND course_id = $2',
            [req.user.id, course_id]
        );

        if (isEnrolled.rows.length === 0) {
            return res.status(403).json({ error: 'Not enrolled in this course' });
        }

        await db.query(
            `INSERT INTO progress (learner_id, course_id, module_index, lesson_index)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT DO NOTHING`,
            [req.user.id, course_id, module_index, lesson_index]
        );

        // invalidate both caches
        await redis.del(`learner:${req.user.id}:enrollments`);
        await redis.del(`learner:${req.user.id}:progress:${course_id}`);

        res.status(201).json({ message: 'Progress saved' });

    } catch (err) {
        res.status(500).json({ error: 'Database error', details: err.message });
    }
});


// GET PROGRESS (CACHED)
router.get(
    '/progress/:course_id',
    cache((req) => `learner:${req.user.id}:progress:${req.params.course_id}`, 600),
    async (req, res) => {
        try {
            const result = await db.query(
                'SELECT module_index, lesson_index FROM progress WHERE learner_id = $1 AND course_id = $2',
                [req.user.id, req.params.course_id]
            );

            res.json(result.rows);

        } catch (err) {
            res.status(500).json({ error: 'Database error', details: err.message });
        }
    }
);

module.exports = router;