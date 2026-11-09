<?php
function require_student(bool $requireMatric = true): int
{
  global $pdo;
  $id = filter_var($_SESSION['ore_student_id'] ?? null, FILTER_VALIDATE_INT);
  if (!$id) {
    respond(401, ['error' => 'Sign in to continue.']);
  }
  if ($requireMatric) {
    $profile = $pdo->prepare('SELECT matric_number,phone,department,level FROM students WHERE id=? AND is_active=1');
    $profile->execute([(int) $id]);
    $studentProfile = $profile->fetch();
    if (!$studentProfile || in_array('', array_map(static fn($value) => trim((string) $value), $studentProfile), true) || in_array(null, $studentProfile, true)) {
      respond(403, ['error' => 'Complete your student profile before using the studio.', 'needsProfile' => true]);
    }
    $_SESSION['ore_student_matric'] = true;
    $_SESSION['ore_student_department'] = $studentProfile['department'];
    $_SESSION['ore_student_level'] = $studentProfile['level'];
  }
  return (int) $id;
}

function log_student_activity(PDO $pdo, ?int $studentId, string $eventType, ?int $assignmentId = null): void
{
  $pdo->prepare('INSERT INTO student_activity_log(student_id,assignment_id,event_type) VALUES(?,?,?)')
    ->execute([$studentId, $assignmentId, $eventType]);
}

function require_student_csrf(): void
{
  $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
  if (
    !is_string($sent) ||
    empty($_SESSION['ore_student_csrf']) ||
    !hash_equals($_SESSION['ore_student_csrf'], $sent)
  ) {
    respond(403, ['error' => 'Session token expired. Refresh and try again.']);
  }
}

function student_email_allowed(string $email): bool
{
  if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254) {
    return false;
  }
  $domain = strtolower((string) substr(strrchr($email, '@') ?: '', 1));
  $providers = [
    'gmail.com',
    'googlemail.com',
    'yahoo.com',
    'yahoo.co.uk',
    'ymail.com',
    'outlook.com',
    'hotmail.com',
    'hotmail.co.uk',
    'live.com',
    'icloud.com',
    'me.com',
    'mac.com',
    'aol.com',
    'proton.me',
    'protonmail.com',
    'pm.me',
    'gmx.com',
    'gmx.net',
    'mail.com',
  ];
  if (!in_array($domain, $providers, true)) {
    return false;
  }
  return !function_exists('checkdnsrr') || checkdnsrr($domain, 'MX') || checkdnsrr($domain, 'A');
}

$studentTablesReady = true;
foreach (
  [
    'students',
    'assignments',
    'student_submissions',
    'student_attendance',
    'pair_reviews',
    'student_forum_posts',
    'student_forum_comments',
    'student_activity_log',
  ]
  as $studentTable
) {
  try {
    $pdo->query("SELECT 1 FROM `{$studentTable}` LIMIT 0");
  } catch (Throwable) {
    $studentTablesReady = false;
    break;
  }
}
if (
  !$studentTablesReady &&
  (str_starts_with((string) $route, 'student-') || $route === 'assignments' || $route === 'alexore-sso-start')
) {
  error_log('Student Studio tables are not installed.');
  respond(503, [
    'error' => 'Student Studio is temporarily unavailable. Please try again later.',
  ]);
}

if ($route === 'student-upload-image' && $method === 'POST') {
  require_student();
  require_student_csrf();
  $file = $_FILES['image'] ?? null;
  if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) respond(422, ['error' => 'Choose an image to upload.']);
  if (($file['size'] ?? 0) < 1 || ($file['size'] ?? 0) > 8 * 1024 * 1024 || !is_uploaded_file($file['tmp_name'] ?? '')) {
    respond(422, ['error' => 'Images must be smaller than 8 MB.']);
  }
  $imageInfo = @getimagesize($file['tmp_name']);
  $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
  $extensions = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];
  if (!$imageInfo || !isset($extensions[$mime]) || ($imageInfo['mime'] ?? '') !== $mime) {
    respond(422, ['error' => 'Upload a JPG, PNG, GIF, or WebP image.']);
  }
  $uploadDirectory = dirname(__DIR__, 2) . '/uploads';
  if (!is_dir($uploadDirectory) && !mkdir($uploadDirectory, 0755, true) && !is_dir($uploadDirectory)) {
    respond(500, ['error' => 'The uploads folder could not be created.']);
  }
  $filename = bin2hex(random_bytes(16)) . '.' . $extensions[$mime];
  if (!move_uploaded_file($file['tmp_name'], $uploadDirectory . '/' . $filename)) {
    respond(500, ['error' => 'The image could not be saved. Check uploads folder permissions.']);
  }
  $scriptPath = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? ''));
  $basePath = dirname(dirname($scriptPath));
  if ($basePath === '/' || $basePath === '.') $basePath = '';
  $scheme = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http';
  respond(201, ['url' => $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . rtrim($basePath, '/') . '/uploads/' . $filename]);
}

if ($route === 'alexore-sso-start' && $method === 'GET') {
  $state = (string) ($_GET['state'] ?? '');
  $callback = (string) ($_GET['return'] ?? '');
  if (!preg_match('/^[a-f0-9]{64}$/', $state)) respond(422, ['error' => 'Start again from the Alexore account page.']);
  $callbackParts = parse_url($callback);
  if (!is_array($callbackParts) || isset($callbackParts['user']) || isset($callbackParts['pass']) || isset($callbackParts['query']) || isset($callbackParts['fragment']) || isset($callbackParts['port'])) respond(400, ['error' => 'The Alexore return address is not allowed.']);
  $callbackHost = strtolower((string) ($callbackParts['host'] ?? ''));
  $callbackPath = (string) ($callbackParts['path'] ?? '');
  $callbackIsLocal = in_array($callbackParts['scheme'] ?? '', ['http', 'https'], true)
    && in_array($callbackHost, ['localhost', '127.0.0.1'], true)
    && $callbackPath === '/alexore/account.html';
  $callbackIsProduction = ($callbackParts['scheme'] ?? '') === 'https'
    && in_array($callbackHost, ['alexore.com.ng', 'www.alexore.com.ng'], true)
    && $callbackPath === '/account.html';
  if (!$callbackIsLocal && !$callbackIsProduction) respond(400, ['error' => 'The Alexore return address is not allowed.']);
  $studentId = filter_var($_SESSION['ore_student_id'] ?? null, FILTER_VALIDATE_INT);
  $activeStudent = null;
  if ($studentId) {
    $activeQuery = $pdo->prepare('SELECT id FROM students WHERE id=? AND is_active=1 LIMIT 1');
    $activeQuery->execute([(int) $studentId]);
    $activeStudent = $activeQuery->fetch();
  }
  if (!$activeStudent) {
    $host = strtolower((string) parse_url('http://' . ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST));
    if (in_array($host, ['localhost', '127.0.0.1'], true)) {
      $studentPage = ((!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https://' : 'http://') . $host . '/students/index.html';
    } else {
      $studentPage = 'https://reo.alexore.com.ng/';
    }
    header('Location: ' . $studentPage . '?' . http_build_query(['sso_state' => $state, 'return' => $callback]));
    http_response_code(303);
    exit();
  }
  try {
    $pdo->query('SELECT 1 FROM reo_alexore_sso_tickets LIMIT 0');
  } catch (Throwable) {
    respond(503, ['error' => 'Reo sign-in is not ready yet. Please import the latest api/schema.sql.']);
  }
  $ticket = bin2hex(random_bytes(32));
  $pdo->prepare('INSERT INTO reo_alexore_sso_tickets(ticket_hash,student_id,expires_at) VALUES(?,?,DATE_ADD(NOW(), INTERVAL 5 MINUTE))')
    ->execute([hash('sha256', $ticket), $studentId]);

  $separator = str_contains($callback, '?') ? '&' : '?';
  header('Location: ' . $callback . $separator . http_build_query(['reo_sso' => '1', 'ticket' => $ticket, 'state' => $state]));
  http_response_code(303);
  exit();
}

// Student accounts use a separate session namespace from the site administrator.
if ($route === 'student-auth' && $method === 'GET') {
  $id = filter_var($_SESSION['ore_student_id'] ?? null, FILTER_VALIDATE_INT);
  $student = null;
  if ($id) {
    $query = $pdo->prepare(
      'SELECT id,full_name AS fullName,email,matric_number AS matricNumber,phone,department,level FROM students WHERE id=? AND is_active=1',
    );
    $query->execute([$id]);
    $student = $query->fetch() ?: null;
  }
  if (!$student) {
    unset($_SESSION['ore_student_id'], $_SESSION['ore_student_matric']);
  }
  if (empty($_SESSION['ore_student_csrf'])) {
    $_SESSION['ore_student_csrf'] = bin2hex(random_bytes(32));
  }
  respond(200, [
    'authenticated' => (bool) $student,
    'student' => $student,
    'needsMatric' => (bool) $student && !$student['matricNumber'],
    'needsProfile' => (bool) $student && (!$student['phone'] || !$student['department'] || !$student['level']),
    'csrf' => $_SESSION['ore_student_csrf'],
  ]);
}
if ($route === 'student-auth' && $method === 'POST') {
  $input = body_json();
  $action = (string) ($input['action'] ?? 'login');
  if ($action === 'logout') {
    require_student_csrf();
    unset($_SESSION['ore_student_id'], $_SESSION['ore_student_matric'], $_SESSION['ore_student_department'], $_SESSION['ore_student_level']);
    $_SESSION['ore_student_csrf'] = bin2hex(random_bytes(32));
    respond(200, ['authenticated' => false]);
  }
  if ($action === 'register') {
    $name = trim(
      preg_replace('/\s+/u', ' ', strip_tags((string) ($input['fullName'] ?? ''))) ?? '',
    );
    $email = strtolower(trim((string) ($input['email'] ?? '')));
    $password = (string) ($input['password'] ?? '');
    if (mb_strlen($name) < 2 || mb_strlen($name) > 160) {
      respond(422, ['error' => 'Enter your full name.']);
    }
    if (!student_email_allowed($email)) {
      respond(422, [
        'error' =>
          'Use a valid email from a supported provider such as Gmail, Yahoo, Outlook, iCloud, or Proton Mail. Private and disposable email domains are not accepted.',
      ]);
    }
    if (strlen($password) < 10 || strlen($password) > 72) {
      respond(422, ['error' => 'Choose a password between 10 and 72 bytes long.']);
    }
    try {
      $pdo->beginTransaction();
      $pdo
      ->prepare('INSERT INTO students (full_name,email,password_hash) VALUES (?,?,?)')
        ->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT)]);
      $studentId = (int) $pdo->lastInsertId();
      $pdo->prepare('INSERT IGNORE INTO subscribers (email) VALUES (?)')->execute([$email]);
      log_student_activity($pdo, $studentId, 'registered');
      $pdo->commit();
    } catch (PDOException $error) {
      if ($pdo->inTransaction()) {
        $pdo->rollBack();
      }
      if ((string) $error->getCode() === '23000') {
        respond(409, ['error' => 'An account already exists for that email. Sign in instead.']);
      }
      throw $error;
    }
    session_regenerate_id(true);
    $_SESSION['ore_student_id'] = $studentId;
    $_SESSION['ore_student_matric'] = false;
    $_SESSION['ore_student_csrf'] = bin2hex(random_bytes(32));
    respond(201, [
      'authenticated' => true,
      'needsMatric' => true,
      'needsProfile' => true,
      'csrf' => $_SESSION['ore_student_csrf'],
      'message' =>
        'Account created. Your email was also added to Alex Ore’s email list for occasional updates.',
    ]);
  }
  if ($action !== 'login') {
    respond(422, ['error' => 'Choose a valid account action.']);
  }
  if (
    !empty($_SESSION['ore_student_blocked_until']) &&
    time() < (int) $_SESSION['ore_student_blocked_until']
  ) {
    respond(429, ['error' => 'Too many attempts. Wait a few minutes and try again.']);
  }
  $email = strtolower(trim((string) ($input['email'] ?? '')));
  $query = $pdo->prepare(
    'SELECT id,full_name,email,matric_number,phone,department,level,password_hash FROM students WHERE email=? AND is_active=1 LIMIT 1',
  );
  $query->execute([$email]);
  $student = $query->fetch();
  if (
    !$student ||
    !password_verify((string) ($input['password'] ?? ''), $student['password_hash'])
  ) {
    $_SESSION['ore_student_login_attempts'] =
      (int) ($_SESSION['ore_student_login_attempts'] ?? 0) + 1;
    if ($_SESSION['ore_student_login_attempts'] >= 5) {
      $_SESSION['ore_student_blocked_until'] = time() + 300;
    }
    respond(401, ['error' => 'That email or password did not match.']);
  }
  session_regenerate_id(true);
  $_SESSION['ore_student_id'] = (int) $student['id'];
  $_SESSION['ore_student_matric'] = (bool) $student['matric_number'];
  $_SESSION['ore_student_csrf'] = bin2hex(random_bytes(32));
  $_SESSION['ore_student_login_attempts'] = 0;
  $pdo->prepare('UPDATE students SET last_login_at=NOW() WHERE id=?')->execute([$student['id']]);
  respond(200, [
    'authenticated' => true,
    'needsMatric' => !$student['matric_number'],
    'needsProfile' => !$student['phone'] || !$student['department'] || !$student['level'],
    'csrf' => $_SESSION['ore_student_csrf'],
    'student' => [
      'fullName' => $student['full_name'],
      'email' => $student['email'],
      'matricNumber' => $student['matric_number'],
      'phone' => $student['phone'],
      'department' => $student['department'],
      'level' => $student['level'],
    ],
  ]);
}
if ($route === 'student-profile' && $method === 'POST') {
  $studentId = require_student(false);
  require_student_csrf();
  $input = body_json();
  $matric = strtoupper(trim((string) ($input['matricNumber'] ?? '')));
  $phone = trim(preg_replace('/\s+/', ' ', strip_tags((string) ($input['phone'] ?? ''))) ?? '');
  $department = trim(preg_replace('/\s+/', ' ', strip_tags((string) ($input['department'] ?? ''))) ?? '');
  $level = trim(preg_replace('/\s+/', ' ', strip_tags((string) ($input['level'] ?? ''))) ?? '');
  if (!preg_match('/^[A-Z0-9][A-Z0-9\/-]{2,39}$/', $matric)) {
    respond(422, ['error' => 'Enter a valid matric number using letters, numbers, / or -.']);
  }
  if (strlen($phone) > 30 || !preg_match('/^\+?[0-9][0-9\s().-]{5,28}$/', $phone) || strlen(preg_replace('/\D/', '', $phone) ?? '') < 7) {
    respond(422, ['error' => 'Enter a valid phone number.']);
  }
  if (mb_strlen($department) < 2 || mb_strlen($department) > 120) {
    respond(422, ['error' => 'Enter your department.']);
  }
  if (mb_strlen($level) < 2 || mb_strlen($level) > 40) {
    respond(422, ['error' => 'Enter your level.']);
  }
  $current = $pdo->prepare('SELECT matric_number FROM students WHERE id=?');
  $current->execute([$studentId]);
  $isNewMatric = !(bool) $current->fetchColumn();
  try {
    $pdo->prepare('UPDATE students SET matric_number=?,phone=?,department=?,level=? WHERE id=?')->execute([$matric, $phone, $department, $level, $studentId]);
    if ($isNewMatric) log_student_activity($pdo, $studentId, 'matric_added');
    log_student_activity($pdo, $studentId, 'profile_completed');
  } catch (PDOException $error) {
    if ((string) $error->getCode() === '23000') {
      respond(409, ['error' => 'That matric number is already linked to another account.']);
    }
    throw $error;
  }
  $_SESSION['ore_student_matric'] = true;
  $_SESSION['ore_student_department'] = $department;
  $_SESSION['ore_student_level'] = $level;
  respond(200, ['ok' => true, 'matricNumber' => $matric, 'phone' => $phone, 'department' => $department, 'level' => $level]);
}
if ($route === 'student-dashboard' && $method === 'GET') {
  $studentId = require_student();
  $studentDepartment = (string) $_SESSION['ore_student_department'];
  $studentLevel = (string) $_SESSION['ore_student_level'];
  $attendanceQuery = $pdo->prepare('SELECT COUNT(*) FROM student_attendance WHERE student_id=?');
  $attendanceQuery->execute([$studentId]);
  $attendancePoints = (int) $attendanceQuery->fetchColumn();
  $attendanceHistory = $pdo->prepare('SELECT a.title AS assignmentTitle,sa.awarded_at AS awardedAt FROM student_attendance sa JOIN assignments a ON a.id=sa.assignment_id WHERE sa.student_id=? ORDER BY sa.awarded_at DESC LIMIT 20');
  $attendanceHistory->execute([$studentId]);
  $assignments = $pdo->prepare(
    "SELECT a.id,a.title,a.question,IF(a.status='open' AND (a.due_at IS NULL OR a.due_at>=NOW()),'open','closed') AS status,a.pair_review AS pairReview,DATE_FORMAT(a.due_at,'%Y-%m-%dT%H:%i') AS dueAt,s.id AS submissionId,s.body AS submissionBody,s.submitted_at AS submittedAt,s.instructor_score AS score,s.instructor_feedback AS instructorFeedback,pr.peerScore,pr.peerReviewCount FROM assignments a LEFT JOIN student_submissions s ON s.assignment_id=a.id AND s.student_id=? LEFT JOIN (SELECT submission_id,AVG(score) AS peerScore,COUNT(score) AS peerReviewCount FROM pair_reviews GROUP BY submission_id) pr ON pr.submission_id=s.id WHERE (a.department IS NULL OR FIND_IN_SET(LOWER(?),LOWER(REPLACE(a.department, ', ', ',')))>0) AND (a.level IS NULL OR a.level=?) ORDER BY a.created_at DESC",
  );
  $assignments->execute([$studentId, $studentDepartment, $studentLevel]);
  $reviews = $pdo->prepare(
    "SELECT pr.id AS reviewId,pr.score,pr.feedback,pr.reviewed_at AS reviewedAt,ss.id AS submissionId,ss.body AS submissionBody,a.id AS assignmentId,a.title AS assignmentTitle,st.full_name AS authorName FROM pair_reviews pr JOIN student_submissions ss ON ss.id=pr.submission_id JOIN assignments a ON a.id=ss.assignment_id JOIN students st ON st.id=ss.student_id WHERE pr.reviewer_student_id=? AND a.pair_review=1 AND (a.department IS NULL OR FIND_IN_SET(LOWER(?),LOWER(REPLACE(a.department, ', ', ',')))>0) AND (a.level IS NULL OR a.level=?) ORDER BY pr.reviewed_at IS NULL DESC,ss.submitted_at DESC",
  );
  $reviews->execute([$studentId, $studentDepartment, $studentLevel]);
  $peerFeedbackQuery = $pdo->prepare(
    "SELECT a.title AS assignmentTitle,pr.score,pr.feedback,pr.reviewed_at AS reviewedAt,st.full_name AS reviewerName FROM pair_reviews pr JOIN student_submissions ss ON ss.id=pr.submission_id JOIN assignments a ON a.id=ss.assignment_id JOIN students st ON st.id=pr.reviewer_student_id WHERE ss.student_id=? AND a.pair_review=1 AND pr.reviewed_at IS NOT NULL AND (a.department IS NULL OR FIND_IN_SET(LOWER(?),LOWER(REPLACE(a.department, ', ', ',')))>0) AND (a.level IS NULL OR a.level=?) ORDER BY pr.reviewed_at DESC",
  );
  $peerFeedbackQuery->execute([$studentId, $studentDepartment, $studentLevel]);
  $articles = $pdo
    ->query(
      "SELECT slug,title,category,deck,DATE_FORMAT(published_at,'%b %e, %Y') AS date FROM articles WHERE status='published' ORDER BY published_at DESC LIMIT 5",
    )
    ->fetchAll();
  $siteUrlQuery = $pdo->prepare(
    "SELECT setting_value FROM site_settings WHERE setting_key='public_site_url' LIMIT 1",
  );
  $siteUrlQuery->execute();
  $siteUrl = rtrim((string) ($siteUrlQuery->fetchColumn() ?: ''), '/');
  $siteScheme = strtolower((string) parse_url($siteUrl, PHP_URL_SCHEME));
  if (
    !filter_var($siteUrl, FILTER_VALIDATE_URL) ||
    !in_array($siteScheme, ['http', 'https'], true)
  ) {
    $siteUrl = '';
  }
  if ($siteUrl === '') {
    $host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
    $scheme = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http';
    $siteUrl = in_array(preg_replace('/:\\d+$/', '', $host), ['localhost', '127.0.0.1'], true)
      ? $scheme . '://' . $host . '/alexore'
      : $scheme . '://' . preg_replace('/^students\./', '', $host);
  }
  $posts = $pdo
    ->query(
      'SELECT p.id,p.title,p.body,p.created_at AS createdAt,s.full_name AS authorName,(SELECT COUNT(*) FROM student_forum_comments c WHERE c.post_id=p.id) AS commentCount FROM student_forum_posts p JOIN students s ON s.id=p.student_id ORDER BY p.created_at DESC LIMIT 30',
    )
    ->fetchAll();
  $comments = $pdo
    ->query(
      'SELECT c.id,c.post_id AS postId,c.body,c.created_at AS createdAt,s.full_name AS authorName FROM student_forum_comments c JOIN students s ON s.id=c.student_id JOIN student_forum_posts p ON p.id=c.post_id ORDER BY c.created_at ASC LIMIT 150',
    )
    ->fetchAll();
  foreach ($posts as &$post) {
    $post['comments'] = array_values(
      array_filter(
        $comments,
        static fn(array $comment): bool => (int) $comment['postId'] === (int) $post['id'],
      ),
    );
  }
  unset($post);
  respond(200, [
    'assignments' => $assignments->fetchAll(),
    'reviews' => $reviews->fetchAll(),
    'peerFeedback' => $peerFeedbackQuery->fetchAll(),
    'attendancePoints' => $attendancePoints,
    'attendanceHistory' => $attendanceHistory->fetchAll(),
    'articles' => $articles,
    'forum' => $posts,
    'siteUrl' => $siteUrl,
  ]);
}
if ($route === 'assignments' && $method === 'GET') {
  require_admin();
  $rows = $pdo
    ->query(
      'SELECT a.id,a.title,a.question,a.department,a.level,a.status,a.pair_review AS pairReview,a.due_at AS dueAt,a.created_at AS createdAt,(SELECT COUNT(*) FROM student_submissions s WHERE s.assignment_id=a.id) AS submissionCount FROM assignments a ORDER BY a.created_at DESC',
    )
    ->fetchAll();
  $departments = $pdo->query("SELECT DISTINCT department FROM students WHERE department IS NOT NULL AND department<>'' ORDER BY department")->fetchAll(PDO::FETCH_COLUMN);
  $levels = $pdo->query("SELECT DISTINCT level FROM students WHERE level IS NOT NULL AND level<>'' ORDER BY level")->fetchAll(PDO::FETCH_COLUMN);
  respond(200, ['assignments' => $rows, 'departments' => $departments, 'levels' => $levels]);
}
if ($route === 'assignment-submissions' && $method === 'GET') {
  require_admin();
  $assignmentId = filter_var($_GET['assignmentId'] ?? null, FILTER_VALIDATE_INT);
  if (!$assignmentId) {
    respond(422, ['error' => 'Choose an assignment to view its submissions.']);
  }
  $page = max(1, (int) ($_GET['page'] ?? 1));
  $pageSize = min(100, max(10, (int) ($_GET['pageSize'] ?? 25)));
  $offset = ($page - 1) * $pageSize;
  $search = trim((string) ($_GET['search'] ?? ''));
  $pattern = '%' . $search . '%';
  $where = "s.assignment_id=? AND (?='' OR st.full_name LIKE ? OR st.email LIKE ? OR st.matric_number LIKE ?)";
  $count = $pdo->prepare("SELECT COUNT(*) FROM student_submissions s JOIN students st ON st.id=s.student_id WHERE {$where}");
  $count->execute([$assignmentId, $search, $pattern, $pattern, $pattern]);
  $total = (int) $count->fetchColumn();
  $submissions = $pdo->prepare(
    "SELECT s.id,s.body,s.submitted_at AS submittedAt,s.instructor_score AS score,s.instructor_feedback AS feedback,st.full_name AS studentName,st.email,st.matric_number AS matricNumber,st.phone,st.department,st.level FROM student_submissions s JOIN students st ON st.id=s.student_id WHERE {$where} ORDER BY s.submitted_at DESC LIMIT {$pageSize} OFFSET {$offset}",
  );
  $submissions->execute([$assignmentId, $search, $pattern, $pattern, $pattern]);
  respond(200, ['submissions' => $submissions->fetchAll(), 'total' => $total, 'page' => $page, 'pageSize' => $pageSize]);
}
if ($route === 'student-records' && $method === 'GET') {
  require_admin();
  $studentId = filter_var($_GET['studentId'] ?? null, FILTER_VALIDATE_INT) ?: null;
  if ($studentId) {
    $studentQuery = $pdo->prepare(
      'SELECT st.id,st.full_name AS fullName,st.email,st.matric_number AS matricNumber,st.phone,st.department,st.level,st.is_active AS isActive,st.created_at AS createdAt,(SELECT COUNT(*) FROM student_attendance sa WHERE sa.student_id=st.id) AS attendancePoints,(SELECT COUNT(*) FROM student_submissions ss WHERE ss.student_id=st.id) AS submissionTotal,(SELECT COUNT(*) FROM student_submissions ss WHERE ss.student_id=st.id AND ss.instructor_score IS NOT NULL) AS gradedTotal,(SELECT AVG(ss.instructor_score) FROM student_submissions ss WHERE ss.student_id=st.id AND ss.instructor_score IS NOT NULL) AS averageGrade,(SELECT COUNT(*) FROM student_activity_log l WHERE l.student_id=st.id) AS activityTotal FROM students st WHERE st.id=? LIMIT 1',
    );
    $studentQuery->execute([$studentId]);
    $record = $studentQuery->fetch();
    if (!$record) respond(404, ['error' => 'Student record not found.']);
    $submissionPage = max(1, (int) ($_GET['submissionPage'] ?? 1));
    $activityPage = max(1, (int) ($_GET['activityPage'] ?? 1));
    $detailPageSize = 25;
    $submissions = $pdo->prepare('SELECT a.title AS assignmentTitle,ss.submitted_at AS submittedAt,ss.instructor_score AS score,ss.instructor_feedback AS feedback FROM student_submissions ss JOIN assignments a ON a.id=ss.assignment_id WHERE ss.student_id=? ORDER BY ss.submitted_at DESC LIMIT ' . $detailPageSize . ' OFFSET ' . (($submissionPage - 1) * $detailPageSize));
    $submissions->execute([$studentId]);
    $activity = $pdo->prepare('SELECT l.event_type AS eventType,l.created_at AS createdAt,a.title AS assignmentTitle FROM student_activity_log l LEFT JOIN assignments a ON a.id=l.assignment_id WHERE l.student_id=? ORDER BY l.created_at DESC,l.id DESC LIMIT ' . $detailPageSize . ' OFFSET ' . (($activityPage - 1) * $detailPageSize));
    $activity->execute([$studentId]);
    $recordActivity = $activity->fetchAll();
    foreach ($recordActivity as &$event) {
      $event['description'] = match ($event['eventType']) {
        'registered' => 'Created student account',
        'matric_added' => 'Added matric number',
        'profile_completed' => 'Completed student profile',
        'submission_created' => 'Submitted ' . ($event['assignmentTitle'] ?: 'an assignment'),
        'submission_updated' => 'Updated a submission for ' . ($event['assignmentTitle'] ?: 'an assignment'),
        'attendance_awarded' => 'Earned an attendance point for ' . ($event['assignmentTitle'] ?: 'an assignment'),
        'pair_review_submitted' => 'Completed a pair review',
        'grade_posted' => 'Received a grade for ' . ($event['assignmentTitle'] ?: 'an assignment'),
        'forum_topic_created' => 'Started a forum topic',
        'forum_reply_created' => 'Replied in the student forum',
        default => 'Student activity',
      };
      unset($event['eventType'], $event['assignmentTitle']);
    }
    unset($event);
    respond(200, ['student' => $record, 'submissions' => $submissions->fetchAll(), 'activity' => $recordActivity, 'submissionPage' => $submissionPage, 'activityPage' => $activityPage, 'pageSize' => $detailPageSize]);
  }
  $page = max(1, (int) ($_GET['page'] ?? 1));
  $pageSize = min(100, max(10, (int) ($_GET['pageSize'] ?? 25)));
  $offset = ($page - 1) * $pageSize;
  $search = trim((string) ($_GET['search'] ?? ''));
  $pattern = '%' . $search . '%';
  $where = "(?='' OR st.full_name LIKE ? OR st.email LIKE ? OR st.matric_number LIKE ? OR st.department LIKE ? OR st.level LIKE ?)";
  $count = $pdo->prepare("SELECT COUNT(*) FROM students st WHERE {$where}");
  $count->execute([$search, $pattern, $pattern, $pattern, $pattern, $pattern]);
  $total = (int) $count->fetchColumn();
  $rows = $pdo->prepare(
    "SELECT st.id,st.full_name AS fullName,st.email,st.matric_number AS matricNumber,st.department,st.level,st.is_active AS isActive,(SELECT COUNT(*) FROM student_attendance sa WHERE sa.student_id=st.id) AS attendancePoints,(SELECT COUNT(*) FROM student_submissions ss WHERE ss.student_id=st.id) AS submissionTotal,(SELECT COUNT(*) FROM student_submissions ss WHERE ss.student_id=st.id AND ss.instructor_score IS NOT NULL) AS gradedTotal,(SELECT AVG(ss.instructor_score) FROM student_submissions ss WHERE ss.student_id=st.id AND ss.instructor_score IS NOT NULL) AS averageGrade,(SELECT COUNT(*) FROM student_activity_log l WHERE l.student_id=st.id) AS activityTotal FROM students st WHERE {$where} ORDER BY st.full_name ASC LIMIT {$pageSize} OFFSET {$offset}",
  );
  $rows->execute([$search, $pattern, $pattern, $pattern, $pattern, $pattern]);
  respond(200, ['students' => $rows->fetchAll(), 'total' => $total, 'page' => $page, 'pageSize' => $pageSize]);
}
if ($route === 'assignments' && $method === 'DELETE') {
  require_admin();
  require_csrf();
  $input = body_json();
  $id = filter_var($input['id'] ?? null, FILTER_VALIDATE_INT);
  if (!$id) {
    respond(422, ['error' => 'Choose a valid assignment to delete.']);
  }
  $delete = $pdo->prepare('DELETE FROM assignments WHERE id=?');
  $delete->execute([$id]);
  if (!$delete->rowCount()) {
    respond(404, ['error' => 'That assignment could not be found.']);
  }
  respond(200, ['ok' => true]);
}
if ($route === 'student-activity' && $method === 'GET') {
  require_admin();
  $rows = $pdo->query(
    'SELECT l.event_type AS eventType,l.created_at AS createdAt,s.full_name AS studentName,a.title AS assignmentTitle FROM student_activity_log l LEFT JOIN students s ON s.id=l.student_id LEFT JOIN assignments a ON a.id=l.assignment_id ORDER BY l.created_at DESC,l.id DESC LIMIT 150',
  )->fetchAll();
  foreach ($rows as &$row) {
    $name = $row['studentName'] ?: 'A student';
    $assignment = $row['assignmentTitle'] ?: 'an assignment';
    $row['description'] = match ($row['eventType']) {
      'registered' => "$name created a student account",
      'matric_added' => "$name added a matric number",
      'profile_completed' => "$name completed their student profile",
      'submission_created' => "$name submitted $assignment",
      'submission_updated' => "$name updated a submission for $assignment",
      'attendance_awarded' => "$name earned an attendance point for $assignment",
      'pair_review_submitted' => "$name completed a pair review for $assignment",
      'grade_posted' => "A grade was posted for $name on $assignment",
      'forum_topic_created' => "$name started a forum topic",
      'forum_reply_created' => "$name replied in the student forum",
      'assignment_created' => "Assignment created: $assignment",
      'assignment_updated' => "Assignment updated: $assignment",
      default => 'Student service activity',
    };
    unset($row['eventType'], $row['studentName'], $row['assignmentTitle']);
  }
  unset($row);
  respond(200, ['activity' => $rows]);
}
if ($route === 'assignments' && $method === 'POST') {
  require_admin();
  require_csrf();
  $input = body_json();
  $id = filter_var($input['id'] ?? null, FILTER_VALIDATE_INT) ?: null;
  $title = trim(strip_tags((string) ($input['title'] ?? '')));
  $question = sanitize_comment_html((string) ($input['question'] ?? ''));
  $departmentInput = trim(preg_replace('/\s+/', ' ', strip_tags((string) ($input['department'] ?? ''))) ?? '');
  $departments = array_values(array_unique(array_filter(array_map('trim', explode(',', $departmentInput)), static fn($value) => $value !== '')));
  $department = implode(',', $departments);
  $level = trim(preg_replace('/\s+/', ' ', strip_tags((string) ($input['level'] ?? ''))) ?? '');
  if (
    $title === '' ||
    mb_strlen($title) > 240 ||
    mb_strlen($question) > 50000 ||
    trim(strip_tags($question)) === ''
  ) {
    respond(422, ['error' => 'Add an assignment title and question.']);
  }
  if (mb_strlen($level) > 40) {
    respond(422, ['error' => 'Level is too long.']);
  }
  $department = $department === '' ? null : $department;
  $level = $level === '' ? null : $level;
  $status = ($input['status'] ?? 'open') === 'closed' ? 'closed' : 'open';
  $pair = !empty($input['pairReview']) ? 1 : 0;
  $due = trim((string) ($input['dueAt'] ?? ''));
  if ($due !== '' && strtotime($due) === false) {
    respond(422, ['error' => 'Enter a valid due date.']);
  }
  $due = $due === '' ? null : date('Y-m-d H:i:s', strtotime($due));
  if ($id) {
    $pdo
      ->prepare(
        'UPDATE assignments SET title=?,question=?,department=?,level=?,status=?,pair_review=?,due_at=? WHERE id=?',
      )
      ->execute([$title, $question, $department, $level, $status, $pair, $due, $id]);
    log_student_activity($pdo, null, 'assignment_updated', $id);
  } else {
    $pdo
      ->prepare(
        'INSERT INTO assignments(title,question,department,level,status,pair_review,due_at) VALUES(?,?,?,?,?,?,?)',
      )
      ->execute([$title, $question, $department, $level, $status, $pair, $due]);
    $id = (int) $pdo->lastInsertId();
    log_student_activity($pdo, null, 'assignment_created', $id);
  }
  respond(200, ['ok' => true, 'id' => $id]);
}
if ($route === 'student-submit' && $method === 'POST') {
  $studentId = require_student();
  require_student_csrf();
  $input = body_json();
  $assignmentId = filter_var($input['assignmentId'] ?? null, FILTER_VALIDATE_INT);
  $body = sanitize_comment_html((string) ($input['body'] ?? ''), true);
  if (!$assignmentId || mb_strlen($body) > 100000 || trim(strip_tags($body)) === '') {
    respond(422, ['error' => 'Choose an assignment and write your submission.']);
  }
  $a = $pdo->prepare(
    "SELECT id FROM assignments WHERE id=? AND status='open' AND (due_at IS NULL OR due_at>=NOW()) AND (department IS NULL OR FIND_IN_SET(LOWER(?),LOWER(REPLACE(department, ', ', ',')))>0) AND (level IS NULL OR LOWER(level)=LOWER(?))",
  );
  $a->execute([$assignmentId, (string) ($_SESSION['ore_student_department'] ?? ''), (string) ($_SESSION['ore_student_level'] ?? '')]);
  if (!$a->fetchColumn()) {
    respond(409, ['error' => 'This assignment is closed or past its due date.']);
  }
  $existing = $pdo->prepare('SELECT id FROM student_submissions WHERE assignment_id=? AND student_id=?');
  $existing->execute([$assignmentId, $studentId]);
  $isUpdate = (bool) $existing->fetchColumn();
  $pdo
    ->prepare(
      'INSERT INTO student_submissions(assignment_id,student_id,body) VALUES(?,?,?) ON DUPLICATE KEY UPDATE body=VALUES(body),submitted_at=NOW()',
    )
    ->execute([$assignmentId, $studentId, $body]);
  log_student_activity($pdo, $studentId, $isUpdate ? 'submission_updated' : 'submission_created', (int) $assignmentId);
  $s = $pdo->prepare('SELECT id FROM student_submissions WHERE assignment_id=? AND student_id=?');
  $s->execute([$assignmentId, $studentId]);
  $submissionId = (int) $s->fetchColumn();
  $attendance = $pdo->prepare('INSERT IGNORE INTO student_attendance(student_id,submission_id,assignment_id) VALUES(?,?,?)');
  $attendance->execute([$studentId, $submissionId, $assignmentId]);
  if ($attendance->rowCount()) log_student_activity($pdo, $studentId, 'attendance_awarded', (int) $assignmentId);
  $pair = $pdo->prepare('SELECT pair_review FROM assignments WHERE id=?');
  $pair->execute([$assignmentId]);
  if ((int) $pair->fetchColumn() === 1) {
    $target = $pdo->prepare(
      'SELECT s.id FROM student_submissions s WHERE s.assignment_id=? AND s.student_id<>? AND NOT EXISTS(SELECT 1 FROM pair_reviews r WHERE r.submission_id=s.id AND r.reviewer_student_id=?) ORDER BY s.submitted_at ASC LIMIT 1',
    );
    $target->execute([$assignmentId, $studentId, $studentId]);
    $targetId = $target->fetchColumn();
    if ($targetId) {
      $pdo
        ->prepare('INSERT IGNORE INTO pair_reviews(submission_id,reviewer_student_id) VALUES(?,?)')
        ->execute([$targetId, $studentId]);
    }
    $reviewer = $pdo->prepare(
      'SELECT s.student_id FROM student_submissions s WHERE s.assignment_id=? AND s.student_id<>? AND NOT EXISTS(SELECT 1 FROM pair_reviews r WHERE r.submission_id=? AND r.reviewer_student_id=s.student_id) ORDER BY (SELECT COUNT(*) FROM pair_reviews r2 WHERE r2.reviewer_student_id=s.student_id) ASC,s.submitted_at ASC LIMIT 1',
    );
    $reviewer->execute([$assignmentId, $studentId, $submissionId]);
    $reviewerId = $reviewer->fetchColumn();
    if ($reviewerId) {
      $pdo
        ->prepare('INSERT IGNORE INTO pair_reviews(submission_id,reviewer_student_id) VALUES(?,?)')
        ->execute([$submissionId, $reviewerId]);
    }
  }
  respond(200, ['ok' => true, 'submissionId' => $submissionId]);
}
if ($route === 'student-review' && $method === 'POST') {
  $studentId = require_student();
  require_student_csrf();
  $input = body_json();
  $reviewId = filter_var($input['reviewId'] ?? null, FILTER_VALIDATE_INT);
  $feedback = sanitize_comment_html((string) ($input['feedback'] ?? ''));
  $score = filter_var($input['score'] ?? null, FILTER_VALIDATE_FLOAT);
  if (
    !$reviewId ||
    $score === false ||
    $score < 0 ||
    $score > 100 ||
    mb_strlen($feedback) > 50000 ||
    trim(strip_tags($feedback)) === ''
  ) {
    respond(422, ['error' => 'Add review feedback and a score from 0 to 100.']);
  }
  $q = $pdo->prepare(
    "UPDATE pair_reviews pr JOIN student_submissions ss ON ss.id=pr.submission_id JOIN assignments a ON a.id=ss.assignment_id SET pr.score=?,pr.feedback=?,pr.reviewed_at=NOW() WHERE pr.id=? AND pr.reviewer_student_id=? AND a.pair_review=1 AND (a.department IS NULL OR FIND_IN_SET(LOWER(?),LOWER(REPLACE(a.department, ', ', ',')))>0) AND (a.level IS NULL OR a.level=?)",
  );
  $q->execute([$score, $feedback, $reviewId, $studentId, (string) ($_SESSION['ore_student_department'] ?? ''), (string) ($_SESSION['ore_student_level'] ?? '')]);
  if (!$q->rowCount()) {
    respond(404, ['error' => 'This pair review is not assigned to you.']);
  }
  $reviewInfo = $pdo->prepare('SELECT a.id FROM pair_reviews pr JOIN student_submissions ss ON ss.id=pr.submission_id JOIN assignments a ON a.id=ss.assignment_id WHERE pr.id=?');
  $reviewInfo->execute([$reviewId]);
  log_student_activity($pdo, $studentId, 'pair_review_submitted', (int) $reviewInfo->fetchColumn());
  respond(200, ['ok' => true]);
}
if ($route === 'student-grade' && $method === 'POST') {
  require_admin();
  require_csrf();
  $input = body_json();
  $submissionId = filter_var($input['submissionId'] ?? null, FILTER_VALIDATE_INT);
  $score = filter_var($input['score'] ?? null, FILTER_VALIDATE_FLOAT);
  $feedback = sanitize_comment_html((string) ($input['feedback'] ?? ''));
  if (!$submissionId || $score === false || $score < 0 || $score > 100) {
    respond(422, ['error' => 'Enter a score from 0 to 100.']);
  }
  $info = $pdo->prepare('SELECT student_id,assignment_id FROM student_submissions WHERE id=?');
  $info->execute([$submissionId]);
  $submission = $info->fetch();
  $q = $pdo->prepare(
    'UPDATE student_submissions SET instructor_score=?,instructor_feedback=? WHERE id=?',
  );
  $q->execute([$score, $feedback, $submissionId]);
  if ($submission) log_student_activity($pdo, (int) $submission['student_id'], 'grade_posted', (int) $submission['assignment_id']);
  respond(200, ['ok' => true]);
}
if ($route === 'student-forum-post' && $method === 'POST') {
  $studentId = require_student();
  require_student_csrf();
  $input = body_json();
  $title = trim(strip_tags((string) ($input['title'] ?? '')));
  $body = sanitize_comment_html((string) ($input['body'] ?? ''));
  if (
    $title === '' ||
    mb_strlen($title) > 180 ||
    mb_strlen($body) > 50000 ||
    trim(strip_tags($body)) === ''
  ) {
    respond(422, ['error' => 'Add a topic title and message.']);
  }
  $pdo
    ->prepare('INSERT INTO student_forum_posts(student_id,title,body) VALUES(?,?,?)')
    ->execute([$studentId, $title, $body]);
  log_student_activity($pdo, $studentId, 'forum_topic_created');
  respond(201, ['ok' => true]);
}
if ($route === 'student-forum-comment' && $method === 'POST') {
  $studentId = require_student();
  require_student_csrf();
  $input = body_json();
  $postId = filter_var($input['postId'] ?? null, FILTER_VALIDATE_INT);
  $body = sanitize_comment_html((string) ($input['body'] ?? ''));
  if (!$postId || mb_strlen($body) > 50000 || trim(strip_tags($body)) === '') {
    respond(422, ['error' => 'Write a reply first.']);
  }
  $q = $pdo->prepare(
    'INSERT INTO student_forum_comments(post_id,student_id,body) SELECT id,?,? FROM student_forum_posts WHERE id=?',
  );
  $q->execute([$studentId, $body, $postId]);
  if (!$q->rowCount()) {
    respond(404, ['error' => 'Forum topic not found.']);
  }
  log_student_activity($pdo, $studentId, 'forum_reply_created');
  respond(201, ['ok' => true]);
}
