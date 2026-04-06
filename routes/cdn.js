const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

const { authenticateToken, requireRole } = require('../middleware/auth');
const { invalidateCourseDeep } = require('../utils/cacheInvalidation');

const fs = require('fs');

const uploadDir = path.join(__dirname, '../public/cdn/videos');

// Ensure directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Storage config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix =
      Date.now() + '-' + Math.round(Math.random() * 1E9);

    cb(
      null,
      'VID-' + uniqueSuffix + path.extname(file.originalname)
    );
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files allowed'), false);
    }
  }
});


// Upload video
router.post(
  '/upload',
  authenticateToken,
  requireRole('instructor'),
  upload.single('video'),
  async (req, res) => {

    if (!req.file) {
      return res.status(400).json({
        error: 'No video file provided'
      });
    }

    const cdnUrl = `/cdn/videos/${req.file.filename}`;

    // OPTIONAL: invalidate course cache if tied
    const { course_id } = req.body;

    if (course_id) {
      try {
        await invalidateCourseDeep(course_id, req.user.id);
      } catch (err) {
        console.error('Cache invalidation failed:', err);
      }
    }

    res.json({ url: cdnUrl });
  }
);


// Error handler
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'File too large (max 500MB)'
      });
    }
  } else if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

module.exports = router;