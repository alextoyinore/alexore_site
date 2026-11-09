CREATE TABLE IF NOT EXISTS articles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(220) NOT NULL UNIQUE,
  title VARCHAR(240) NOT NULL,
  category VARCHAR(80) NOT NULL,
  tags TEXT NOT NULL,
  deck VARCHAR(500) NOT NULL DEFAULT '',
  cover_image VARCHAR(2048) NOT NULL DEFAULT '',
  seo_description VARCHAR(160) NOT NULL DEFAULT '',
  body MEDIUMTEXT NOT NULL,
  view_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('draft','published') NOT NULL DEFAULT 'draft',
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_articles_public (status, published_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add article metadata to databases created with an older schema. This only
-- adds a column when missing and never drops or rewrites existing fields.
SET @alexore_schema_has_tags = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'articles' AND COLUMN_NAME = 'tags'
);
SET @alexore_schema_sql = IF(
  @alexore_schema_has_tags = 0,
  'ALTER TABLE articles ADD COLUMN tags TEXT NULL AFTER category',
  'SELECT 1'
);
PREPARE alexore_schema_statement FROM @alexore_schema_sql;
EXECUTE alexore_schema_statement;
DEALLOCATE PREPARE alexore_schema_statement;
UPDATE articles SET tags = '' WHERE tags IS NULL;

SET @alexore_schema_has_article_views = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'articles' AND COLUMN_NAME = 'view_count'
);
SET @alexore_schema_views_sql = IF(
  @alexore_schema_has_article_views = 0,
  'ALTER TABLE articles ADD COLUMN view_count BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER body',
  'SELECT 1'
);
PREPARE alexore_schema_views_statement FROM @alexore_schema_views_sql;
EXECUTE alexore_schema_views_statement;
DEALLOCATE PREPARE alexore_schema_views_statement;

CREATE TABLE IF NOT EXISTS content_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  kind ENUM('book','product','video','podcast') NOT NULL,
  slug VARCHAR(220) NOT NULL UNIQUE,
  title VARCHAR(240) NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'Notes',
  tags TEXT NOT NULL,
  summary VARCHAR(500) NOT NULL DEFAULT '',
  body MEDIUMTEXT NOT NULL,
  cover_image VARCHAR(2048) NOT NULL DEFAULT '',
  media_url VARCHAR(2048) NOT NULL DEFAULT '',
  asset_url VARCHAR(2048) NOT NULL DEFAULT '',
  purchase_url VARCHAR(2048) NOT NULL DEFAULT '',
  price DECIMAL(10,2) NULL,
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  status ENUM('draft','published') NOT NULL DEFAULT 'draft',
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_content_public (status, kind, published_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subscribers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS article_likes (
  article_id BIGINT UNSIGNED NOT NULL,
  visitor_hash CHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (article_id, visitor_hash),
  CONSTRAINT fk_article_likes_article FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS article_comments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  article_id BIGINT UNSIGNED NOT NULL,
  display_name VARCHAR(120) NOT NULL DEFAULT 'Anonymous',
  email VARCHAR(254) NULL,
  is_anonymous TINYINT(1) NOT NULL DEFAULT 0,
  comment_text TEXT NOT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_article_comments_public (article_id, status, created_at),
  INDEX idx_article_comments_moderation (status, created_at),
  CONSTRAINT fk_article_comments_article FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contact_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL,
  subject VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  status ENUM('new','read') NOT NULL DEFAULT 'new',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_contact_messages_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS site_settings (
  setting_key VARCHAR(80) NOT NULL PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  display_name VARCHAR(120) NOT NULL DEFAULT '',
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin') NOT NULL DEFAULT 'admin',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS site_members (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NULL,
  session_version INT UNSIGNED NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME NULL,
  INDEX idx_site_members_name (full_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @has_member_session_version = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='site_members' AND COLUMN_NAME='session_version');
SET @member_session_version_sql = IF(@has_member_session_version=0, 'ALTER TABLE site_members ADD COLUMN session_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER password_hash', 'SELECT 1');
PREPARE member_session_version_statement FROM @member_session_version_sql;
EXECUTE member_session_version_statement;
DEALLOCATE PREPARE member_session_version_statement;

-- Add the admin display name on older databases without replacing usernames
-- or password hashes.
SET @alexore_schema_has_display_name = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'display_name'
);
SET @alexore_schema_sql = IF(
  @alexore_schema_has_display_name = 0,
  'ALTER TABLE users ADD COLUMN display_name VARCHAR(120) NOT NULL DEFAULT '''' AFTER username',
  'SELECT 1'
);
PREPARE alexore_schema_statement FROM @alexore_schema_sql;
EXECUTE alexore_schema_statement;
DEALLOCATE PREPARE alexore_schema_statement;
UPDATE users SET display_name = 'Alex Ore' WHERE role = 'admin' AND display_name = '';

-- Student learning service: safe additive tables shared by the main site and its student subdomain.
CREATE TABLE IF NOT EXISTS students (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(160) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  session_version INT UNSIGNED NOT NULL DEFAULT 1,
  matric_number VARCHAR(40) NULL UNIQUE,
  phone VARCHAR(30) NULL,
  department VARCHAR(120) NULL,
  level VARCHAR(40) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME NULL,
  INDEX idx_students_name (full_name),
  INDEX idx_students_department_level (department, level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @has_student_session_version = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='students' AND COLUMN_NAME='session_version');
SET @student_session_version_sql = IF(@has_student_session_version=0, 'ALTER TABLE students ADD COLUMN session_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER password_hash', 'SELECT 1');
PREPARE student_session_version_statement FROM @student_session_version_sql;
EXECUTE student_session_version_statement;
DEALLOCATE PREPARE student_session_version_statement;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  account_type ENUM('member','student') NOT NULL,
  account_id BIGINT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  used_at DATETIME NULL,
  INDEX idx_password_reset_account (account_type, account_id, used_at),
  INDEX idx_password_reset_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ip_hash CHAR(64) NOT NULL,
  email_hash CHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_password_reset_ip_rate (ip_hash, created_at),
  INDEX idx_password_reset_email_rate (email_hash, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One-time Reo to Alexore sign-in handoffs and explicit account links.
CREATE TABLE IF NOT EXISTS reo_alexore_sso_tickets (
  ticket_hash CHAR(64) NOT NULL PRIMARY KEY,
  student_id BIGINT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_reo_alexore_ticket_expiry (expires_at),
  CONSTRAINT fk_reo_alexore_ticket_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS site_member_reo_links (
  student_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  member_id BIGINT UNSIGNED NOT NULL UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_site_member_reo_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_site_member_reo_member FOREIGN KEY (member_id) REFERENCES site_members(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add profile and assignment targeting fields to existing student databases.
SET @has_student_phone = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='students' AND COLUMN_NAME='phone');
SET @student_profile_sql = IF(@has_student_phone=0, 'ALTER TABLE students ADD COLUMN phone VARCHAR(30) NULL AFTER matric_number', 'SELECT 1');
PREPARE student_profile_statement FROM @student_profile_sql;
EXECUTE student_profile_statement;
DEALLOCATE PREPARE student_profile_statement;
SET @has_student_department = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='students' AND COLUMN_NAME='department');
SET @student_profile_sql = IF(@has_student_department=0, 'ALTER TABLE students ADD COLUMN department VARCHAR(120) NULL AFTER phone', 'SELECT 1');
PREPARE student_profile_statement FROM @student_profile_sql;
EXECUTE student_profile_statement;
DEALLOCATE PREPARE student_profile_statement;
SET @has_student_level = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='students' AND COLUMN_NAME='level');
SET @student_profile_sql = IF(@has_student_level=0, 'ALTER TABLE students ADD COLUMN level VARCHAR(40) NULL AFTER department', 'SELECT 1');
PREPARE student_profile_statement FROM @student_profile_sql;
EXECUTE student_profile_statement;
DEALLOCATE PREPARE student_profile_statement;
SET @has_student_target_index = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='students' AND INDEX_NAME='idx_students_department_level');
SET @student_index_sql = IF(@has_student_target_index=0, 'CREATE INDEX idx_students_department_level ON students(department,level)', 'SELECT 1');
PREPARE student_index_statement FROM @student_index_sql;
EXECUTE student_index_statement;
DEALLOCATE PREPARE student_index_statement;

CREATE TABLE IF NOT EXISTS assignments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(240) NOT NULL,
  question MEDIUMTEXT NOT NULL,
  department TEXT NULL,
  level VARCHAR(40) NULL,
  status ENUM('open','closed') NOT NULL DEFAULT 'open',
  pair_review TINYINT(1) NOT NULL DEFAULT 0,
  due_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_assignments_status (status, due_at),
  INDEX idx_assignments_target (level, status, due_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @has_assignment_department = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='assignments' AND COLUMN_NAME='department');
SET @assignment_target_sql = IF(@has_assignment_department=0, 'ALTER TABLE assignments ADD COLUMN department TEXT NULL AFTER question', 'SELECT 1');
PREPARE assignment_target_statement FROM @assignment_target_sql;
EXECUTE assignment_target_statement;
DEALLOCATE PREPARE assignment_target_statement;
SET @has_assignment_level = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='assignments' AND COLUMN_NAME='level');
SET @assignment_target_sql = IF(@has_assignment_level=0, 'ALTER TABLE assignments ADD COLUMN level VARCHAR(40) NULL AFTER department', 'SELECT 1');
PREPARE assignment_target_statement FROM @assignment_target_sql;
EXECUTE assignment_target_statement;
DEALLOCATE PREPARE assignment_target_statement;
SET @assignment_target_index_has_department = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='assignments' AND INDEX_NAME='idx_assignments_target' AND COLUMN_NAME='department');
SET @assignment_index_sql = IF(@assignment_target_index_has_department>0, 'DROP INDEX idx_assignments_target ON assignments', 'SELECT 1');
PREPARE assignment_index_statement FROM @assignment_index_sql;
EXECUTE assignment_index_statement;
DEALLOCATE PREPARE assignment_index_statement;
SET @assignment_department_is_text = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='assignments' AND COLUMN_NAME='department' AND DATA_TYPE IN ('text','mediumtext','longtext'));
SET @assignment_department_sql = IF(@assignment_department_is_text=0, 'ALTER TABLE assignments MODIFY COLUMN department TEXT NULL', 'SELECT 1');
PREPARE assignment_department_statement FROM @assignment_department_sql;
EXECUTE assignment_department_statement;
DEALLOCATE PREPARE assignment_department_statement;
SET @has_assignment_target_index = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='assignments' AND INDEX_NAME='idx_assignments_target');
SET @assignment_index_sql = IF(@has_assignment_target_index=0, 'CREATE INDEX idx_assignments_target ON assignments(level,status,due_at)', 'SELECT 1');
PREPARE assignment_index_statement FROM @assignment_index_sql;
EXECUTE assignment_index_statement;
DEALLOCATE PREPARE assignment_index_statement;

CREATE TABLE IF NOT EXISTS student_submissions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  assignment_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  body MEDIUMTEXT NOT NULL,
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  instructor_score DECIMAL(5,2) NULL,
  instructor_feedback MEDIUMTEXT NULL,
  INDEX idx_submissions_assignment (assignment_id, submitted_at),
  UNIQUE KEY uq_submission_student_assignment (student_id, assignment_id),
  CONSTRAINT fk_student_submissions_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
  CONSTRAINT fk_student_submissions_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One attendance point is awarded for each assignment submitted, including existing submissions.
CREATE TABLE IF NOT EXISTS student_attendance (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  student_id BIGINT UNSIGNED NOT NULL,
  submission_id BIGINT UNSIGNED NOT NULL,
  assignment_id BIGINT UNSIGNED NOT NULL,
  awarded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_attendance_submission (submission_id),
  INDEX idx_attendance_student (student_id, awarded_at),
  CONSTRAINT fk_student_attendance_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_student_attendance_submission FOREIGN KEY (submission_id) REFERENCES student_submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_student_attendance_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO student_attendance(student_id,submission_id,assignment_id,awarded_at)
SELECT student_id,id,assignment_id,submitted_at FROM student_submissions;

CREATE TABLE IF NOT EXISTS pair_reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  submission_id BIGINT UNSIGNED NOT NULL,
  reviewer_student_id BIGINT UNSIGNED NOT NULL,
  score DECIMAL(5,2) NULL,
  feedback MEDIUMTEXT NULL,
  reviewed_at DATETIME NULL,
  UNIQUE KEY uq_pair_review (submission_id, reviewer_student_id),
  INDEX idx_pair_reviews_reviewer (reviewer_student_id, reviewed_at),
  CONSTRAINT fk_pair_reviews_submission FOREIGN KEY (submission_id) REFERENCES student_submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_pair_reviews_reviewer FOREIGN KEY (reviewer_student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_forum_posts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  student_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  body MEDIUMTEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_student_forum_posts_created (created_at),
  CONSTRAINT fk_student_forum_posts_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_forum_comments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  post_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  body MEDIUMTEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_student_forum_comments_post (post_id, created_at),
  CONSTRAINT fk_student_forum_comments_post FOREIGN KEY (post_id) REFERENCES student_forum_posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_student_forum_comments_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_activity_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  student_id BIGINT UNSIGNED NULL,
  assignment_id BIGINT UNSIGNED NULL,
  event_type VARCHAR(40) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_student_activity_created (created_at),
  INDEX idx_student_activity_student (student_id, created_at),
  CONSTRAINT fk_student_activity_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL,
  CONSTRAINT fk_student_activity_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
