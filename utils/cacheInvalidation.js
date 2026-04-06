const { client: redis }  = require('./redisClient');

// Invalidate public course listing
const invalidateCourseList = async () => {
  try {
    await redis.del('courses:approved');
  } catch (err) {
    console.error('Invalidate course list error:', err);
  }
};


// Invalidate single course cache (ALL variants)
const invalidateCourse = async (courseId, instructorId) => {
  try {
    const keys = [
      `course:${courseId}:guest`,
      `course:${courseId}:user`,
      `course:${courseId}:admin`,
    ];

    if (instructorId) {
      keys.push(`course:${courseId}:instructor:${instructorId}`);
    }

    await redis.del(keys);
  } catch (err) {
    console.error('Invalidate course error:', err);
  }
};


// Invalidate instructor dashboard
const invalidateInstructorCourses = async (instructorId) => {
  try {
    await redis.del(`instructor:${instructorId}:courses`);
  } catch (err) {
    console.error('Invalidate instructor courses error:', err);
  }
};


// FULL invalidation (most common use-case)
const invalidateCourseDeep = async (courseId, instructorId) => {
  try {
    await Promise.all([
      invalidateCourseList(),
      invalidateCourse(courseId, instructorId),
      invalidateInstructorCourses(instructorId)
    ]);
  } catch (err) {
    console.error('Deep invalidation error:', err);
  }
};

module.exports = {
  invalidateCourseList,
  invalidateCourse,
  invalidateInstructorCourses,
  invalidateCourseDeep
};