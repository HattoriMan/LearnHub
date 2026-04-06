CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE learners (
    learner_id INT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE instructors (
    instructor_id INT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE admins (
    admin_id INT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE courses (
    course_id SERIAL PRIMARY KEY,
    instructor_id INT REFERENCES instructors(instructor_id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE modules (
    course_id INT REFERENCES courses(course_id) ON DELETE CASCADE,
    module_index INT,
    title VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (course_id, module_index)
);

CREATE TABLE lessons (
    course_id INT,
    module_index INT,
    lesson_index INT,
    title VARCHAR(255) NOT NULL,
    video_url TEXT,
    video_duration INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (course_id, module_index, lesson_index),
    FOREIGN KEY (course_id, module_index) REFERENCES modules(course_id, module_index) ON DELETE CASCADE
);

CREATE TABLE enrollments (
    learner_id INT REFERENCES learners(learner_id) ON DELETE CASCADE,
    course_id INT REFERENCES courses(course_id) ON DELETE CASCADE,
    enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    issued_at TIMESTAMP,
    certificate_url TEXT,
    PRIMARY KEY (learner_id, course_id)
);

CREATE TABLE wishlists (
    learner_id INT REFERENCES learners(learner_id) ON DELETE CASCADE,
    course_id INT REFERENCES courses(course_id) ON DELETE CASCADE,
    PRIMARY KEY (learner_id, course_id)
);

CREATE TABLE reviews (
    learner_id INT REFERENCES learners(learner_id) ON DELETE CASCADE,
    course_id INT REFERENCES courses(course_id) ON DELETE CASCADE,
    rating INT CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    PRIMARY KEY (learner_id, course_id)
);

CREATE TABLE audits (
    course_id INT REFERENCES courses(course_id) ON DELETE CASCADE,
    admin_id INT REFERENCES admins(admin_id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL,
    audited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (course_id, admin_id)
);

CREATE TABLE progress (
    learner_id INT REFERENCES learners(learner_id) ON DELETE CASCADE,
    course_id INT,
    module_index INT,
    lesson_index INT,
    PRIMARY KEY (learner_id, course_id, module_index, lesson_index),
    FOREIGN KEY (course_id, module_index, lesson_index) REFERENCES lessons(course_id, module_index, lesson_index) ON DELETE CASCADE
);

-- USERS
CREATE INDEX idx_users_email ON users(email);

-- COURSES
CREATE INDEX idx_courses_instructor_id ON courses(instructor_id);
CREATE INDEX idx_courses_status ON courses(status);

-- MODULES
CREATE INDEX idx_modules_course_id ON modules(course_id);

-- LESSONS
CREATE INDEX idx_lessons_course_module ON lessons(course_id, module_index);

-- ENROLLMENTS
CREATE INDEX idx_enrollments_learner_id ON enrollments(learner_id);
CREATE INDEX idx_enrollments_course_id ON enrollments(course_id);

-- WISHLISTS
CREATE INDEX idx_wishlists_learner_id ON wishlists(learner_id);
CREATE INDEX idx_wishlists_course_id ON wishlists(course_id);

-- REVIEWS
CREATE INDEX idx_reviews_course_id ON reviews(course_id);

-- AUDITS
CREATE INDEX idx_audits_admin_id ON audits(admin_id);
CREATE INDEX idx_audits_course_id ON audits(course_id);

-- PROGRESS
CREATE INDEX idx_progress_learner_id ON progress(learner_id);
CREATE INDEX idx_progress_course ON progress(course_id, module_index);