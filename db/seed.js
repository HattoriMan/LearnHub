const bcrypt = require('bcrypt');
const db = require('./index');

async function seed() {
    try {
        console.log('Starting seed...');
        // Hash standard password for testing
        const passwordHash = await bcrypt.hash('password123', 10);

        // Clear existing data (optional, but good for reliable seed)
        // Ignoring clear for safety, just insert new ones if emails don't exist

        // 1. Create Users
        console.log('Creating users...');
        const users = [
            { name: 'Admin Master', email: 'admin@skill.com', pass: passwordHash, role: 'admin' },
            { name: 'John Instructor', email: 'instructor@skill.com', pass: passwordHash, role: 'instructor' },
            { name: 'Alice Learner', email: 'learner@skill.com', pass: passwordHash, role: 'learner' },
            { name: 'Bob Learner', email: 'bob@skill.com', pass: passwordHash, role: 'learner' }
        ];

        const insertedUsers = {};

        for (const u of users) {
            const res = await db.query(
                `INSERT INTO users (name, email, password) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING RETURNING user_id, email`,
                [u.name, u.email, u.pass]
            );
            
            let userId;
            if (res.rows.length > 0) {
                userId = res.rows[0].user_id;
            } else {
                const existRes = await db.query('SELECT user_id FROM users WHERE email = $1', [u.email]);
                userId = existRes.rows[0].user_id;
            }
            insertedUsers[u.role] = insertedUsers[u.role] || [];
            insertedUsers[u.role].push(userId);

            // Create roles
            if (u.role === 'admin') await db.query('INSERT INTO admins (admin_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
            if (u.role === 'instructor') await db.query('INSERT INTO instructors (instructor_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
            if (u.role === 'learner') await db.query('INSERT INTO learners (learner_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
        }

        const instructorId = insertedUsers['instructor'][0];
        const learnerId = insertedUsers['learner'][0];
        const adminId = insertedUsers['admin'][0];

        // 2. Create Courses
        console.log('Creating courses...');
        const c1Res = await db.query(
            `INSERT INTO courses (instructor_id, title, description, status) VALUES ($1, $2, $3, $4) RETURNING course_id`,
            [instructorId, 'Full-Stack Web Development', 'Learn React, Node, and PostgreSQL by building real apps.', 'approved']
        );
        const c2Res = await db.query(
            `INSERT INTO courses (instructor_id, title, description, status) VALUES ($1, $2, $3, $4) RETURNING course_id`,
            [instructorId, 'Introduction to Data Science', 'Data analysis using Python and Pandas.', 'approved']
        );
        const c3Res = await db.query(
            `INSERT INTO courses (instructor_id, title, description, status) VALUES ($1, $2, $3, $4) RETURNING course_id`,
            [instructorId, 'Draft Masterclass', 'This course is hidden.', 'draft']
        );

        const courseId1 = c1Res.rows[0].course_id;
        const courseId2 = c2Res.rows[0].course_id;

        // 3. Create Modules
        console.log('Creating modules & lessons...');
        await db.query(`INSERT INTO modules (course_id, module_index, title) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [courseId1, 1, 'Getting Started']);
        await db.query(`INSERT INTO modules (course_id, module_index, title) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [courseId1, 2, 'Backend Architecture']);

        await db.query(`INSERT INTO modules (course_id, module_index, title) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [courseId2, 1, 'Python Basics']);

        // 4. Create Lessons (YouTube videos)
        const ytVideos = [
            'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            'https://www.youtube.com/watch?v=t0Q2otsqC4I',
            'https://www.youtube.com/watch?v=Vl0H-qTclOg'
        ];

        await db.query(`INSERT INTO lessons (course_id, module_index, lesson_index, title, video_url, video_duration) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`, 
            [courseId1, 1, 1, 'Welcome to the Course', ytVideos[0], 5]);
        await db.query(`INSERT INTO lessons (course_id, module_index, lesson_index, title, video_url, video_duration) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`, 
            [courseId1, 1, 2, 'Setting up Environmental Variables', ytVideos[1], 15]);
        
        await db.query(`INSERT INTO lessons (course_id, module_index, lesson_index, title, video_url, video_duration) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`, 
            [courseId1, 2, 1, 'Node.js Internals', ytVideos[2], 30]);

        await db.query(`INSERT INTO lessons (course_id, module_index, lesson_index, title, video_url, video_duration) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`, 
            [courseId2, 1, 1, 'Hello World in Python', ytVideos[0], 10]);

        // 5. Create Enrollments and Wishlists
        console.log('Creating enrollments & reviews...');
        await db.query(`INSERT INTO enrollments (learner_id, course_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [learnerId, courseId1]);
        await db.query(`INSERT INTO wishlists (learner_id, course_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [learnerId, courseId2]);

        // 6. Create Reviews
        await db.query(`INSERT INTO reviews (learner_id, course_id, rating, comment) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`, [learnerId, courseId1, 5, 'Absolutely loved the course! Highly practical.']);
        
        console.log('Seed completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Seed matching failed', err);
        process.exit(1);
    }
}

seed();
