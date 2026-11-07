<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
ini_set('display_errors', '0');
ini_set('log_errors', '1');

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$host = $_SERVER['HTTP_HOST'] ?? '';
if ($origin !== '') {
  $originHost = parse_url($origin, PHP_URL_HOST);
  if (!is_string($originHost) || !hash_equals(strtolower($host), strtolower($originHost))) {
    respond(403, ['error' => 'Cross-origin request denied.']);
  }
  header('Access-Control-Allow-Origin: ' . $origin);
  header('Vary: Origin');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');
  http_response_code(204);
  exit();
}

$secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
$sessionHost = strtolower((string) parse_url('http://' . ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST));
$sessionDomain = preg_match('/(^|\.)alexore\.com\.ng$/', $sessionHost) ? '.alexore.com.ng' : '';
session_set_cookie_params([
  'httponly' => true,
  'secure' => $secure,
  'samesite' => 'Lax',
  'path' => '/',
  'domain' => $sessionDomain,
]);
session_start();

function respond(int $status, array $payload): never
{
  http_response_code($status);
  echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit();
}

set_exception_handler(static function (Throwable $error): void {
  $route = preg_replace('/[^a-z0-9_-]/i', '', (string) ($_GET['route'] ?? 'unknown'));
  error_log('alexore API exception on route ' . $route . ': ' . $error->getMessage());
  if (!headers_sent()) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
  }
  echo json_encode(['error' => 'We could not complete your request. Please try again.']);
});

function body_json(): array
{
  $data = json_decode(file_get_contents('php://input') ?: '', true);
  return is_array($data) ? $data : [];
}

function article_reading_time(string $html): string
{
  $plainText = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
  preg_match_all('/[\p{L}\p{N}]+/u', $plainText, $words);
  return max(1, (int) ceil(count($words[0]) / 220)) . ' min read';
}

function comment_highlight_color(string $value): string
{
  $value = strtolower(preg_replace('/\s+/', '', $value) ?? '');
  if (preg_match('/^#[0-9a-f]{6}$/', $value)) {
    return $value;
  }
  if (!preg_match('/^rgb\((\d{1,3}),(\d{1,3}),(\d{1,3})\)$/', $value, $matches)) {
    return '';
  }
  $channels = array_map('intval', array_slice($matches, 1));
  if (array_filter($channels, static fn(int $channel): bool => $channel > 255) !== []) {
    return '';
  }
  return sprintf('#%02x%02x%02x', ...$channels);
}

function sanitize_comment_html(string $html): string
{
  $allowedTags =
    '<p><div><h2><h3><h4><br><strong><b><em><i><u><s><del><code><pre><ul><ol><li><blockquote><a><span><mark><table><thead><tbody><tfoot><tr><th><td>';
  $html = strip_tags($html, $allowedTags);
  $sanitized = preg_replace_callback(
    '~</?([a-z][a-z0-9]*)\b[^>]*>~i',
    static function (array $match): string {
      $rawTag = $match[0];
      $inputTag = strtolower($match[1]);
      $tag = $inputTag === 'div' ? 'p' : $inputTag;
      $closing = str_starts_with($rawTag, '</');
      if ($inputTag === 'span') {
        if ($closing) {
          return '</mark>';
        }
        if (!preg_match('/background-color\s*:\s*([^;"\']+)/i', $rawTag, $styleMatch)) {
          return '';
        }
        $color = comment_highlight_color($styleMatch[1]);
        return $color === '' ? '' : '<mark data-highlight="' . $color . '">';
      }
      if ($tag === 'br') {
        return $closing ? '' : '<br>';
      }
      if ($closing) {
        return '</' . $tag . '>';
      }

      if ($inputTag === 'mark') {
        $colorValue = '';
        if (
          preg_match('/data-highlight\s*=\s*(?:"([^"]*)"|\'([^\']*)\')/i', $rawTag, $colorMatch)
        ) {
          $colorValue = $colorMatch[1] ?: $colorMatch[2] ?? '';
        } elseif (preg_match('/background-color\s*:\s*([^;"\']+)/i', $rawTag, $styleMatch)) {
          $colorValue = $styleMatch[1];
        }
        $color = comment_highlight_color($colorValue);
        return $color === '' ? '<mark>' : '<mark data-highlight="' . $color . '">';
      }

      if (in_array($tag, ['p', 'div'], true)) {
        $alignValue = '';
        if (preg_match('/data-align\s*=\s*(?:"([^"]*)"|\'([^\']*)\')/i', $rawTag, $alignMatch)) {
          $alignValue = strtolower($alignMatch[1] ?: $alignMatch[2] ?? '');
        } elseif (preg_match('/text-align\s*:\s*(left|center|right)/i', $rawTag, $alignMatch)) {
          $alignValue = strtolower($alignMatch[1]);
        }
        return in_array($alignValue, ['left', 'center', 'right'], true)
          ? '<' . $tag . ' data-align="' . $alignValue . '">'
          : '<' . $tag . '>';
      }

      if ($tag !== 'a') {
        return '<' . $tag . '>';
      }
      if (
        !preg_match('/\bhref\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s>]+))/i', $rawTag, $hrefMatch)
      ) {
        return '<a>';
      }
      $href = html_entity_decode(
        $hrefMatch[1] ?: ($hrefMatch[2] ?: $hrefMatch[3] ?? ''),
        ENT_QUOTES | ENT_HTML5,
        'UTF-8',
      );
      $scheme = strtolower((string) parse_url($href, PHP_URL_SCHEME));
      if (!in_array($scheme, ['http', 'https'], true) || !filter_var($href, FILTER_VALIDATE_URL)) {
        return '<a>';
      }
      return '<a href="' .
        htmlspecialchars($href, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') .
        '" rel="nofollow noopener noreferrer" target="_blank">';
    },
    $html,
  );
  return $sanitized ?? '';
}

function require_admin(): void
{
  if (empty($_SESSION['alexore_admin'])) {
    respond(401, ['error' => 'Sign in required.']);
  }
}

function require_csrf(): void
{
  $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
  if (!is_string($sent) || empty($_SESSION['csrf']) || !hash_equals($_SESSION['csrf'], $sent)) {
    respond(403, ['error' => 'Session token expired. Refresh and try again.']);
  }
}

function require_member(): array
{
  global $pdo;
  $memberId = filter_var($_SESSION['alexore_member_id'] ?? null, FILTER_VALIDATE_INT);
  if (!$memberId) respond(401, ['error' => 'Sign in to continue.']);
  $query = $pdo->prepare('SELECT id,email,full_name AS fullName FROM site_members WHERE id=? AND is_active=1 LIMIT 1');
  $query->execute([(int) $memberId]);
  $member = $query->fetch();
  if (!$member) {
    unset($_SESSION['alexore_member_id'], $_SESSION['alexore_member_source']);
    respond(401, ['error' => 'Sign in to continue.']);
  }
  return $member;
}

function require_member_csrf(): void
{
  $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
  if (!is_string($sent) || empty($_SESSION['alexore_member_csrf']) || !hash_equals($_SESSION['alexore_member_csrf'], $sent)) {
    respond(403, ['error' => 'Session token expired. Refresh and try again.']);
  }
}

$configPath = getenv('ALEXORE_CONFIG_PATH') ?: dirname(__DIR__, 2) . '/alexore-config.php';
if (is_file($configPath)) {
  $config = require $configPath;
} else {
  // The built-in PHP server and XAMPP's Apache are both common local
  // development environments. Only enable the convenience defaults when
  // the request itself comes from a loopback client.
  $remoteAddress = $_SERVER['REMOTE_ADDR'] ?? '';
  $requestHost = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
  $requestHostname = parse_url('http://' . $requestHost, PHP_URL_HOST);
  $localDevelopment =
    in_array($remoteAddress, ['127.0.0.1', '::1'], true) &&
    (PHP_SAPI === 'cli-server' ||
      in_array($requestHostname, ['localhost', '127.0.0.1', '::1'], true));
  if ($localDevelopment) {
    $environmentConfig = [
      'dsn' =>
        getenv('ALEXORE_DSN') ?:
        'mysql:host=127.0.0.1;port=3306;dbname=alexore_site;charset=utf8mb4',
      'db_user' => getenv('ALEXORE_DB_USER') ?: 'root',
      'db_password' => getenv('ALEXORE_DB_PASSWORD') ?: '',
    ];
  } else {
    $environmentConfig = [
      'dsn' => getenv('ALEXORE_DSN') ?: '',
      'db_user' => getenv('ALEXORE_DB_USER') ?: '',
      'db_password' => getenv('ALEXORE_DB_PASSWORD') ?: '',
    ];
    if (in_array('', $environmentConfig, true)) {
      respond(503, [
        'error' => 'This service is temporarily unavailable. Please try again later.',
      ]);
    }
  }
  $config = $environmentConfig;
}
if (!is_array($config)) {
  respond(503, ['error' => 'This service is temporarily unavailable. Please try again later.']);
}

try {
  $pdo = new PDO($config['dsn'], $config['db_user'], $config['db_password'], [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
  ]);
} catch (Throwable $error) {
  error_log('alexore database connection failed: ' . $error->getMessage());
  respond(503, [
    'error' => 'This service is temporarily unavailable. Please try again later.',
  ]);
}

// Table creation and additive upgrades live in api/schema.sql. Check their
// presence here without requiring CREATE privileges or changing live data.
$tableExists = static function (PDO $connection, string $table): bool {
  if (!preg_match('/^[a-z_]+$/', $table)) {
    return false;
  }
  try {
    $connection->query("SELECT 1 FROM `{$table}` LIMIT 0");
    return true;
  } catch (Throwable) {
    return false;
  }
};
$contentSchemaReady = $tableExists($pdo, 'content_items');
$engagementSchemaReady =
  $tableExists($pdo, 'article_likes') && $tableExists($pdo, 'article_comments');
$contactSchemaReady = $tableExists($pdo, 'contact_messages');
$memberSchemaReady = $tableExists($pdo, 'site_members');
if (!$contentSchemaReady || !$engagementSchemaReady || !$contactSchemaReady || !$memberSchemaReady) {
  error_log('alexore database tables are missing; import api/schema.sql.');
}

$route = $_GET['route'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

require_once __DIR__ . '/students/routes.php';

if ($route === 'images' && $method === 'GET') {
  require_admin();
  $uploadDirectory = dirname(__DIR__) . '/uploads';
  $images = [];
  if (is_dir($uploadDirectory)) {
    foreach (glob($uploadDirectory . '/*.{jpg,jpeg,png,webp,gif}', GLOB_BRACE) ?: [] as $path) {
      $filename = basename($path);
      if (!preg_match('/^[a-f0-9]{32}\.(jpg|jpeg|png|webp|gif)$/i', $filename)) {
        continue;
      }
      $imageInfo = @getimagesize($path);
      if (!$imageInfo || !str_starts_with((string) ($imageInfo['mime'] ?? ''), 'image/')) {
        continue;
      }
      $images[] = [
        'url' => 'uploads/' . $filename,
        'width' => (int) $imageInfo[0],
        'height' => (int) $imageInfo[1],
        'uploadedAt' => (int) (filemtime($path) ?: 0),
      ];
    }
    usort($images, static fn(array $a, array $b): int => $b['uploadedAt'] <=> $a['uploadedAt']);
  }
  respond(200, ['images' => $images]);
}

if ($route === 'upload' && $method === 'POST') {
  require_admin();
  require_csrf();
  $file = $_FILES['image'] ?? null;
  if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    respond(422, ['error' => 'Choose an image to upload.']);
  }
  if (
    ($file['size'] ?? 0) < 1 ||
    $file['size'] > 8 * 1024 * 1024 ||
    !is_uploaded_file($file['tmp_name'] ?? '')
  ) {
    respond(422, ['error' => 'Images must be smaller than 8 MB.']);
  }
  $imageInfo = @getimagesize($file['tmp_name']);
  // prettier-ignore: PHP requires parentheses before calling a method on a new expression here.
  $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
  $extensions = [
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'image/webp' => 'webp',
    'image/gif' => 'gif',
  ];
  if (!$imageInfo || !isset($extensions[$mime]) || ($imageInfo['mime'] ?? '') !== $mime) {
    respond(422, ['error' => 'Upload a JPG, PNG, GIF, or WebP image.']);
  }
  $uploadDirectory = dirname(__DIR__) . '/uploads';
  if (
    !is_dir($uploadDirectory) &&
    !mkdir($uploadDirectory, 0755, true) &&
    !is_dir($uploadDirectory)
  ) {
    respond(500, ['error' => 'The uploads folder could not be created. Check folder permissions.']);
  }
  $filename = bin2hex(random_bytes(16)) . '.' . $extensions[$mime];
  if (!move_uploaded_file($file['tmp_name'], $uploadDirectory . '/' . $filename)) {
    respond(500, ['error' => 'The image could not be saved. Check uploads folder permissions.']);
  }
  respond(201, ['url' => 'uploads/' . $filename]);
}

if ($route === 'asset-upload' && $method === 'POST') {
  require_admin();
  require_csrf();
  $file = $_FILES['asset'] ?? null;
  if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    $uploadError = is_array($file)
      ? (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE)
      : UPLOAD_ERR_NO_FILE;
    if (in_array($uploadError, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) {
      respond(422, [
        'error' =>
          'PHP rejected this file before upload. Increase upload_max_filesize and post_max_size in XAMPP’s php.ini, then restart Apache.',
      ]);
    }
    respond(422, ['error' => 'Choose a digital file to upload.']);
  }
  if (
    ($file['size'] ?? 0) < 1 ||
    $file['size'] > 25 * 1024 * 1024 ||
    !is_uploaded_file($file['tmp_name'] ?? '')
  ) {
    respond(422, ['error' => 'Digital files must be smaller than 25 MB.']);
  }
  // prettier-ignore: PHP requires parentheses before calling a method on a new expression here.
  $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
  $allowed = [
    'application/pdf' => 'pdf',
    'application/epub+zip' => 'epub',
    'application/zip' => 'zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
  ];
  if (!isset($allowed[$mime])) {
    respond(422, ['error' => 'Upload a PDF, EPUB, ZIP, or DOCX file.']);
  }
  $uploadDirectory = dirname(__DIR__) . '/uploads';
  if (
    !is_dir($uploadDirectory) &&
    !mkdir($uploadDirectory, 0755, true) &&
    !is_dir($uploadDirectory)
  ) {
    respond(500, ['error' => 'The uploads folder could not be created. Check folder permissions.']);
  }
  $filename = bin2hex(random_bytes(16)) . '.' . $allowed[$mime];
  if (!move_uploaded_file($file['tmp_name'], $uploadDirectory . '/' . $filename)) {
    respond(500, ['error' => 'The file could not be saved. Check uploads folder permissions.']);
  }
  respond(201, ['url' => 'uploads/' . $filename]);
}

if ($route === 'auth' && $method === 'GET') {
  respond(200, [
    'authenticated' => !empty($_SESSION['alexore_admin']),
    'csrf' => $_SESSION['csrf'] ?? null,
    'displayName' => $_SESSION['alexore_display_name'] ?? null,
  ]);
}
if ($route === 'auth' && $method === 'POST') {
  $input = body_json();
  if (($input['action'] ?? '') === 'logout') {
    require_admin();
    require_csrf();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
      $cookie = session_get_cookie_params();
      setcookie(session_name(), '', [
        'expires' => time() - 42000,
        'path' => $cookie['path'],
        'domain' => $cookie['domain'],
        'secure' => $cookie['secure'],
        'httponly' => $cookie['httponly'],
        'samesite' => $cookie['samesite'] ?? 'Lax',
      ]);
    }
    session_destroy();
    respond(200, ['authenticated' => false]);
  }
  if (!empty($_SESSION['login_blocked_until']) && time() < (int) $_SESSION['login_blocked_until']) {
    respond(429, ['error' => 'Too many attempts. Wait a few minutes and try again.']);
  }
  $username = trim((string) ($input['username'] ?? ''));
  $password = (string) ($input['password'] ?? '');
  $statement = $pdo->prepare(
    'SELECT id, username, display_name, password_hash FROM users WHERE username=? AND role=\'admin\' AND is_active=1 LIMIT 1',
  );
  $statement->execute([$username]);
  $user = $statement->fetch();
  if ($user && password_verify($password, $user['password_hash'])) {
    session_regenerate_id(true);
    $_SESSION['alexore_admin'] = true;
    $_SESSION['alexore_user_id'] = (int) $user['id'];
    $_SESSION['alexore_username'] = $user['username'];
    $_SESSION['alexore_display_name'] = $user['display_name'] ?: $user['username'];
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
    $_SESSION['login_attempts'] = 0;
    $pdo->prepare('UPDATE users SET last_login_at=NOW() WHERE id=?')->execute([$user['id']]);
    respond(200, [
      'authenticated' => true,
      'csrf' => $_SESSION['csrf'],
      'displayName' => $_SESSION['alexore_display_name'],
    ]);
  }
  $_SESSION['login_attempts'] = (int) ($_SESSION['login_attempts'] ?? 0) + 1;
  if ($_SESSION['login_attempts'] >= 5) {
    $_SESSION['login_blocked_until'] = time() + 300;
  }
  respond(401, ['error' => 'That username or password did not match.']);
}

if ($route === 'member-auth' && $method === 'GET') {
  if (!$memberSchemaReady) respond(503, ['error' => 'Accounts are temporarily unavailable. Please import api/schema.sql.']);
  if (empty($_SESSION['alexore_member_id']) && empty($_SESSION['alexore_sso_suppressed']) && !empty($_SESSION['ore_student_id'])) {
    $studentQuery = $pdo->prepare('SELECT full_name,email FROM students WHERE id=? AND is_active=1 LIMIT 1');
    $studentQuery->execute([(int) $_SESSION['ore_student_id']]);
    $student = $studentQuery->fetch();
    if ($student) {
      $memberQuery = $pdo->prepare('SELECT id,is_active FROM site_members WHERE email=? LIMIT 1');
      $memberQuery->execute([strtolower((string) $student['email'])]);
      $member = $memberQuery->fetch();
      if (!$member) {
        $pdo->prepare('INSERT IGNORE INTO site_members(email,full_name) VALUES(?,?)')->execute([strtolower((string) $student['email']), $student['full_name']]);
        $memberQuery->execute([strtolower((string) $student['email'])]);
        $member = $memberQuery->fetch();
      }
      if ($member && (int) $member['is_active'] === 1) {
        session_regenerate_id(true);
        $_SESSION['alexore_member_id'] = (int) $member['id'];
        $_SESSION['alexore_member_source'] = 'reo';
        $_SESSION['alexore_sso_suppressed'] = false;
        $_SESSION['alexore_member_csrf'] = bin2hex(random_bytes(32));
      }
    }
  }
  $member = null;
  if (!empty($_SESSION['alexore_member_id'])) {
    $memberQuery = $pdo->prepare('SELECT id,email,full_name AS fullName FROM site_members WHERE id=? AND is_active=1 LIMIT 1');
    $memberQuery->execute([(int) $_SESSION['alexore_member_id']]);
    $member = $memberQuery->fetch() ?: null;
    if (!$member) unset($_SESSION['alexore_member_id'], $_SESSION['alexore_member_source']);
  }
  if (empty($_SESSION['alexore_member_csrf'])) $_SESSION['alexore_member_csrf'] = bin2hex(random_bytes(32));
  respond(200, ['authenticated' => (bool) $member, 'user' => $member, 'csrf' => $_SESSION['alexore_member_csrf']]);
}
if ($route === 'member-auth' && $method === 'POST') {
  if (!$memberSchemaReady) respond(503, ['error' => 'Accounts are temporarily unavailable. Please import api/schema.sql.']);
  require_member_csrf();
  $input = body_json();
  $action = (string) ($input['action'] ?? 'login');
  if ($action === 'logout') {
    unset($_SESSION['alexore_member_id'], $_SESSION['alexore_member_source']);
    $_SESSION['alexore_sso_suppressed'] = true;
    $_SESSION['alexore_member_csrf'] = bin2hex(random_bytes(32));
    respond(200, ['authenticated' => false]);
  }
  if (!empty($_SESSION['alexore_member_login_blocked_until']) && time() < (int) $_SESSION['alexore_member_login_blocked_until']) {
    respond(429, ['error' => 'Too many attempts. Wait a few minutes and try again.']);
  }
  $email = strtolower(trim((string) ($input['email'] ?? '')));
  $password = (string) ($input['password'] ?? '');
  if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254 || strlen($password) < 10 || strlen($password) > 72) {
    respond(422, ['error' => 'Enter a valid email and a password between 10 and 72 bytes.']);
  }
  if ($action === 'register') {
    $name = trim(preg_replace('/\s+/u', ' ', strip_tags((string) ($input['fullName'] ?? ''))) ?? '');
    if (mb_strlen($name) < 2 || mb_strlen($name) > 120) respond(422, ['error' => 'Enter your name.']);
    $existing = $pdo->prepare('SELECT id,password_hash,is_active FROM site_members WHERE email=? LIMIT 1');
    $existing->execute([$email]);
    $account = $existing->fetch();
    if ($account && (int) $account['is_active'] === 1 && $account['password_hash'] === null) {
      $pdo->prepare('UPDATE site_members SET full_name=?,password_hash=?,last_login_at=NOW() WHERE id=?')->execute([$name, password_hash($password, PASSWORD_DEFAULT), $account['id']]);
      $memberId = (int) $account['id'];
    } elseif ($account) {
      respond(409, ['error' => 'An account already exists for this email. Sign in instead.']);
    } else {
      try {
        $pdo->prepare('INSERT INTO site_members(email,full_name,password_hash,last_login_at) VALUES(?,?,?,NOW())')->execute([$email, $name, password_hash($password, PASSWORD_DEFAULT)]);
        $memberId = (int) $pdo->lastInsertId();
      } catch (PDOException $error) {
        if ((string) $error->getCode() === '23000') respond(409, ['error' => 'An account already exists for this email. Sign in instead.']);
        throw $error;
      }
    }
  } elseif ($action === 'login') {
    $query = $pdo->prepare('SELECT id,password_hash FROM site_members WHERE email=? AND is_active=1 LIMIT 1');
    $query->execute([$email]);
    $account = $query->fetch();
    if (!$account || !$account['password_hash'] || !password_verify($password, $account['password_hash'])) {
      $_SESSION['alexore_member_login_attempts'] = (int) ($_SESSION['alexore_member_login_attempts'] ?? 0) + 1;
      if ($_SESSION['alexore_member_login_attempts'] >= 5) $_SESSION['alexore_member_login_blocked_until'] = time() + 300;
      respond(401, ['error' => 'That email or password did not match.']);
    }
    $memberId = (int) $account['id'];
    $pdo->prepare('UPDATE site_members SET last_login_at=NOW() WHERE id=?')->execute([$memberId]);
    $_SESSION['alexore_member_login_attempts'] = 0;
  } else {
    respond(422, ['error' => 'Choose a valid account action.']);
  }
  session_regenerate_id(true);
  $_SESSION['alexore_member_id'] = $memberId;
  $_SESSION['alexore_member_source'] = 'password';
  $_SESSION['alexore_sso_suppressed'] = false;
  $_SESSION['alexore_member_csrf'] = bin2hex(random_bytes(32));
  $member = require_member();
  respond($action === 'register' ? 201 : 200, ['authenticated' => true, 'user' => $member, 'csrf' => $_SESSION['alexore_member_csrf']]);
}

if ($route === 'site-members' && $method === 'GET') {
  require_admin();
  if (!$memberSchemaReady) respond(503, ['error' => 'Member accounts are temporarily unavailable.']);
  $page = max(1, (int) ($_GET['page'] ?? 1));
  $pageSize = min(100, max(10, (int) ($_GET['pageSize'] ?? 25)));
  $offset = ($page - 1) * $pageSize;
  $search = trim((string) ($_GET['search'] ?? ''));
  $pattern = '%' . $search . '%';
  $where = "(?='' OR sm.full_name LIKE ? OR sm.email LIKE ?)";
  $count = $pdo->prepare("SELECT COUNT(*) FROM site_members sm WHERE {$where}");
  $count->execute([$search, $pattern, $pattern]);
  $total = (int) $count->fetchColumn();
  $members = $pdo->prepare(
    "SELECT sm.id,sm.full_name AS fullName,sm.email,sm.is_active AS isActive,sm.created_at AS createdAt,sm.last_login_at AS lastLoginAt,EXISTS(SELECT 1 FROM students st WHERE st.email=sm.email) AS hasReoAccount FROM site_members sm WHERE {$where} ORDER BY sm.created_at DESC,sm.id DESC LIMIT {$pageSize} OFFSET {$offset}",
  );
  $members->execute([$search, $pattern, $pattern]);
  respond(200, ['members' => $members->fetchAll(), 'total' => $total, 'page' => $page, 'pageSize' => $pageSize]);
}
if ($route === 'site-members' && $method === 'POST') {
  require_admin();
  require_csrf();
  if (!$memberSchemaReady) respond(503, ['error' => 'Member accounts are temporarily unavailable.']);
  $input = body_json();
  $id = filter_var($input['id'] ?? null, FILTER_VALIDATE_INT);
  $active = filter_var($input['active'] ?? null, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
  if (!$id || $active === null) respond(422, ['error' => 'Choose a valid member account action.']);
  $update = $pdo->prepare('UPDATE site_members SET is_active=? WHERE id=?');
  $update->execute([$active ? 1 : 0, $id]);
  if (!$update->rowCount()) {
    $exists = $pdo->prepare('SELECT 1 FROM site_members WHERE id=?');
    $exists->execute([$id]);
    if (!$exists->fetchColumn()) respond(404, ['error' => 'That member account could not be found.']);
  }
  respond(200, ['ok' => true, 'active' => $active]);
}

if ($route === 'subscribe' && $method === 'POST') {
  $email = filter_var(trim((string) (body_json()['email'] ?? '')), FILTER_VALIDATE_EMAIL);
  if (!$email || strlen($email) > 254) {
    respond(422, ['error' => 'Enter a valid email address.']);
  }
  $statement = $pdo->prepare('INSERT IGNORE INTO subscribers (email) VALUES (?)');
  $statement->execute([$email]);
  $message =
    $statement->rowCount() === 1
      ? 'You’re on the list. Keep becoming.'
      : 'You’re already on the list. Keep becoming.';
  respond(200, ['ok' => true, 'message' => $message]);
}

if ($route === 'contact' && $method === 'POST') {
  if (!$contactSchemaReady) {
    respond(503, [
      'error' => 'The contact form is temporarily unavailable. Please try again later.',
    ]);
  }
  $input = body_json();
  if (trim((string) ($input['website'] ?? '')) !== '') {
    respond(200, [
      'ok' => true,
      'message' => 'Thanks for reaching out. Your message has been sent.',
    ]);
  }
  $name = trim((string) ($input['name'] ?? ''));
  $email = filter_var(trim((string) ($input['email'] ?? '')), FILTER_VALIDATE_EMAIL);
  $subject = trim((string) ($input['subject'] ?? ''));
  $message = trim((string) ($input['message'] ?? ''));
  if ($name === '' || mb_strlen($name) > 120) {
    respond(422, ['error' => 'Enter your name (up to 120 characters).']);
  }
  if (!$email || strlen($email) > 254) {
    respond(422, ['error' => 'Enter a valid email address.']);
  }
  if ($subject === '' || mb_strlen($subject) > 180) {
    respond(422, ['error' => 'Add a subject up to 180 characters.']);
  }
  if ($message === '' || mb_strlen($message) > 5000) {
    respond(422, ['error' => 'Write a message up to 5,000 characters.']);
  }
  if ((int) ($_SESSION['last_contact_at'] ?? 0) > time() - 30) {
    respond(429, ['error' => 'Please wait a moment before sending another message.']);
  }
  $pdo
    ->prepare('INSERT INTO contact_messages (name,email,subject,message) VALUES (?,?,?,?)')
    ->execute([$name, $email, $subject, $message]);
  $_SESSION['last_contact_at'] = time();
  respond(201, ['ok' => true, 'message' => 'Thanks for reaching out. Your message has been sent.']);
}

if ($route === 'messages' && $method === 'GET') {
  require_admin();
  if (!$contactSchemaReady) {
    respond(503, [
      'error' => 'The contact message inbox is temporarily unavailable. Please try again later.',
    ]);
  }
  $rows = $pdo
    ->query(
      "SELECT id,name,email,subject,message,status,DATE_FORMAT(created_at, '%b %e, %Y · %l:%i %p') AS date FROM contact_messages ORDER BY FIELD(status,'new','read'), created_at DESC",
    )
    ->fetchAll();
  respond(200, ['messages' => $rows]);
}
if ($route === 'messages' && $method === 'POST') {
  require_admin();
  require_csrf();
  if (!$contactSchemaReady) {
    respond(503, [
      'error' => 'The contact message inbox is temporarily unavailable. Please try again later.',
    ]);
  }
  $input = body_json();
  $id = filter_var($input['id'] ?? null, FILTER_VALIDATE_INT);
  if (!$id || ($input['status'] ?? '') !== 'read') {
    respond(422, ['error' => 'Choose a valid message action.']);
  }
  $pdo->prepare("UPDATE contact_messages SET status='read' WHERE id=?")->execute([$id]);
  respond(200, ['ok' => true]);
}

if ($route === 'comments' && $method === 'GET') {
  if (!$engagementSchemaReady) {
    respond(503, [
      'error' => 'Comments are temporarily unavailable. Please try again later.',
    ]);
  }
  if (($_GET['include'] ?? '') === 'all') {
    require_admin();
    $rows = $pdo
      ->query(
        "SELECT c.id, c.article_id AS articleId, a.slug, a.title AS articleTitle, c.display_name AS displayName, c.is_anonymous AS isAnonymous, c.comment_text AS commentText, c.status, DATE_FORMAT(c.created_at, '%b %e, %Y') AS date FROM article_comments c JOIN articles a ON a.id=c.article_id ORDER BY FIELD(c.status,'pending','approved','rejected'), c.created_at DESC",
      )
      ->fetchAll();
    foreach ($rows as &$row) {
      $row['commentText'] = sanitize_comment_html((string) $row['commentText']);
    }
    unset($row);
    respond(200, ['comments' => $rows]);
  }
  $slug = trim((string) ($_GET['slug'] ?? ''));
  $statement = $pdo->prepare(
    "SELECT c.display_name AS displayName, c.is_anonymous AS isAnonymous, c.comment_text AS commentText, DATE_FORMAT(c.created_at, '%b %e, %Y') AS date FROM article_comments c JOIN articles a ON a.id=c.article_id WHERE a.slug=? AND a.status='published' AND c.status='approved' ORDER BY c.created_at ASC LIMIT 200",
  );
  $statement->execute([$slug]);
  $comments = $statement->fetchAll();
  foreach ($comments as &$comment) {
    $comment['commentText'] = sanitize_comment_html((string) $comment['commentText']);
  }
  unset($comment);
  respond(200, ['comments' => $comments]);
}
if ($route === 'comments' && $method === 'POST') {
  if (!$engagementSchemaReady) {
    respond(503, [
      'error' => 'Comments are temporarily unavailable. Please try again later.',
    ]);
  }
  $input = body_json();
  if (!empty($input['moderate'])) {
    require_admin();
    require_csrf();
    $id = filter_var($input['id'] ?? null, FILTER_VALIDATE_INT);
    $status = (string) ($input['status'] ?? '');
    if (!$id || !in_array($status, ['approved', 'rejected'], true)) {
      respond(422, ['error' => 'Choose a valid moderation action.']);
    }
    $pdo->prepare('UPDATE article_comments SET status=? WHERE id=?')->execute([$status, $id]);
    respond(200, ['ok' => true]);
  }
  $member = require_member();
  require_member_csrf();
  $slug = trim((string) ($input['slug'] ?? ''));
  $articleQuery = $pdo->prepare(
    "SELECT id FROM articles WHERE slug=? AND status='published' LIMIT 1",
  );
  $articleQuery->execute([$slug]);
  $articleId = $articleQuery->fetchColumn();
  if (!$articleId) {
    respond(404, ['error' => 'This article is not available for comments.']);
  }
  $commentInput = trim((string) ($input['comment'] ?? ''));
  $plainComment = trim(
    html_entity_decode(strip_tags($commentInput), ENT_QUOTES | ENT_HTML5, 'UTF-8'),
  );
  if ($plainComment === '' || mb_strlen($plainComment) > 3000) {
    respond(422, ['error' => 'Write a comment up to 3,000 characters.']);
  }
  $comment = sanitize_comment_html($commentInput);
  $name = (string) $member['fullName'];
  $email = (string) $member['email'];
  if ((int) ($_SESSION['last_comment_at'] ?? 0) > time() - 20) {
    respond(429, ['error' => 'Please wait a moment before posting another comment.']);
  }
  $pdo->beginTransaction();
  try {
    $pdo
      ->prepare(
        'INSERT INTO article_comments (article_id, display_name, email, is_anonymous, comment_text, status) VALUES (?, ?, ?, ?, ?, \'pending\')',
      )
      ->execute([$articleId, $name, $email, 0, $comment]);
    $pdo->commit();
    $_SESSION['last_comment_at'] = time();
  } catch (Throwable $error) {
    if ($pdo->inTransaction()) {
      $pdo->rollBack();
    }
    throw $error;
  }
  respond(201, [
    'ok' => true,
    'message' => 'Comment submitted for review.',
  ]);
}

if ($route === 'like' && $method === 'GET') {
  if (!$engagementSchemaReady) {
    respond(503, [
      'error' => 'Likes are temporarily unavailable. Please try again later.',
    ]);
  }
  $member = require_member();
  $slug = trim((string) ($_GET['slug'] ?? ''));
  $articleQuery = $pdo->prepare(
    "SELECT id FROM articles WHERE slug=? AND status='published' LIMIT 1",
  );
  $articleQuery->execute([$slug]);
  $articleId = $articleQuery->fetchColumn();
  if (!$articleId) {
    respond(404, ['error' => 'This article is not available for likes.']);
  }
  $visitorHash = hash('sha256', 'alexore-member:' . (int) $member['id']);
  $likedQuery = $pdo->prepare('SELECT 1 FROM article_likes WHERE article_id=? AND visitor_hash=?');
  $likedQuery->execute([$articleId, $visitorHash]);
  $countQuery = $pdo->prepare('SELECT COUNT(*) FROM article_likes WHERE article_id=?');
  $countQuery->execute([$articleId]);
  respond(200, [
    'liked' => (bool) $likedQuery->fetchColumn(),
    'count' => (int) $countQuery->fetchColumn(),
  ]);
}
if ($route === 'like' && $method === 'POST') {
  if (!$engagementSchemaReady) {
    respond(503, [
      'error' => 'Likes are temporarily unavailable. Please try again later.',
    ]);
  }
  $member = require_member();
  require_member_csrf();
  $input = body_json();
  $slug = trim((string) ($input['slug'] ?? ''));
  $articleQuery = $pdo->prepare(
    "SELECT id FROM articles WHERE slug=? AND status='published' LIMIT 1",
  );
  $articleQuery->execute([$slug]);
  $articleId = $articleQuery->fetchColumn();
  if (!$articleId) {
    respond(404, ['error' => 'This article is not available for likes.']);
  }
  $visitorHash = hash('sha256', 'alexore-member:' . (int) $member['id']);
  $check = $pdo->prepare('SELECT 1 FROM article_likes WHERE article_id=? AND visitor_hash=?');
  $check->execute([$articleId, $visitorHash]);
  if ($check->fetchColumn()) {
    $pdo
      ->prepare('DELETE FROM article_likes WHERE article_id=? AND visitor_hash=?')
      ->execute([$articleId, $visitorHash]);
    $liked = false;
  } else {
    $pdo
      ->prepare('INSERT IGNORE INTO article_likes (article_id, visitor_hash) VALUES (?, ?)')
      ->execute([$articleId, $visitorHash]);
    $liked = true;
  }
  $count = $pdo->prepare('SELECT COUNT(*) FROM article_likes WHERE article_id=?');
  $count->execute([$articleId]);
  respond(200, ['liked' => $liked, 'count' => (int) $count->fetchColumn()]);
}

if ($route === 'content' && $method === 'GET') {
  if (!$contentSchemaReady) {
    respond(503, [
      'error' => 'The content library is temporarily unavailable. Please try again later.',
    ]);
  }
  $admin = !empty($_SESSION['alexore_admin']) && ($_GET['include'] ?? '') === 'all';
  $kind = (string) ($_GET['kind'] ?? '');
  $allowedKinds = ['book', 'product', 'video', 'podcast'];
  if ($kind !== '' && !in_array($kind, $allowedKinds, true)) {
    respond(422, ['error' => 'Unknown content type.']);
  }
  $assetSelection = $admin
    ? 'asset_url AS assetUrl'
    : 'CASE WHEN price IS NULL OR price=0 THEN asset_url ELSE \'\' END AS assetUrl';
  $sql = "SELECT id, kind, slug, title, category, tags, summary, body, cover_image AS coverImage, media_url AS mediaUrl, $assetSelection, purchase_url AS purchaseUrl, price, currency, IF(status='published','Published','Draft') AS status, DATE_FORMAT(COALESCE(published_at, updated_at), '%b %e, %Y') AS date FROM content_items";
  $where = [];
  $params = [];
  if (!$admin) {
    $where[] = "status='published'";
  }
  if ($kind !== '') {
    $where[] = 'kind=?';
    $params[] = $kind;
  }
  if ($where) {
    $sql .= ' WHERE ' . implode(' AND ', $where);
  }
  $sql .= ' ORDER BY COALESCE(published_at, updated_at) DESC';
  $statement = $pdo->prepare($sql);
  $statement->execute($params);
  respond(200, ['items' => $statement->fetchAll()]);
}
if ($route === 'content-item' && $method === 'GET') {
  if (!$contentSchemaReady) {
    respond(503, [
      'error' => 'The content library is temporarily unavailable. Please try again later.',
    ]);
  }
  $statement = $pdo->prepare(
    "SELECT id, kind, slug, title, category, tags, summary, body, cover_image AS coverImage, media_url AS mediaUrl, CASE WHEN price IS NULL OR price=0 THEN asset_url ELSE '' END AS assetUrl, purchase_url AS purchaseUrl, price, currency, 'Published' AS status, DATE_FORMAT(published_at, '%b %e, %Y') AS date FROM content_items WHERE slug=? AND status='published' LIMIT 1",
  );
  $statement->execute([trim((string) ($_GET['slug'] ?? ''))]);
  $item = $statement->fetch();
  if (!$item) {
    respond(404, ['error' => 'This item is not available.']);
  }
  respond(200, ['item' => $item]);
}
if ($route === 'content' && $method === 'POST') {
  if (!$contentSchemaReady) {
    respond(503, [
      'error' => 'The content library is temporarily unavailable. Please try again later.',
    ]);
  }
  require_admin();
  require_csrf();
  $input = body_json();
  $id = filter_var($input['id'] ?? null, FILTER_VALIDATE_INT) ?: null;
  $kind = (string) ($input['kind'] ?? '');
  if (!in_array($kind, ['book', 'product', 'video', 'podcast'], true)) {
    respond(422, ['error' => 'Choose a valid content type.']);
  }
  $title = trim((string) ($input['title'] ?? ''));
  if ($title === '' || mb_strlen($title) > 240) {
    respond(422, ['error' => 'Add a title up to 240 characters.']);
  }
  $tags = [];
  foreach (preg_split('/[,;\r\n]+/', (string) ($input['tags'] ?? '')) ?: [] as $tag) {
    $tag = trim(preg_replace('/\s+/u', ' ', strip_tags($tag)) ?? '');
    if ($tag !== '' && count($tags) < 12) {
      $tags[mb_strtolower($tag)] = mb_substr($tag, 0, 40);
    }
  }
  $slugBase = trim((string) ($input['slug'] ?? '')) ?: $title;
  $slug = strtolower(
    substr(
      trim(
        preg_replace(
          '/[^a-z0-9]+/i',
          '-',
          iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $slugBase) ?: $slugBase,
        ),
        '-',
      ),
      0,
      210,
    ),
  );
  $slug = $slug ?: 'item';
  $checkSql = $id
    ? 'SELECT id FROM content_items WHERE slug=? AND id<>?'
    : 'SELECT id FROM content_items WHERE slug=?';
  $check = $pdo->prepare($checkSql);
  $check->execute($id ? [$slug, $id] : [$slug]);
  if ($check->fetch()) {
    $slug .= '-' . substr(bin2hex(random_bytes(4)), 0, 8);
  }
  $status = ($input['status'] ?? '') === 'Published' ? 'published' : 'draft';
  $price = trim((string) ($input['price'] ?? ''));
  if ($price !== '' && (!is_numeric($price) || (float) $price < 0 || (float) $price > 99999999)) {
    respond(422, ['error' => 'Enter a valid product price.']);
  }
  $publishedAt = $status === 'published' ? date('Y-m-d H:i:s') : null;
  $values = [
    $kind,
    $slug,
    $title,
    mb_substr(trim((string) ($input['category'] ?? 'Notes')), 0, 80),
    implode(', ', array_values($tags)),
    mb_substr(trim((string) ($input['summary'] ?? '')), 0, 500),
    (string) ($input['body'] ?? ''),
    trim((string) ($input['coverImage'] ?? '')),
    trim((string) ($input['mediaUrl'] ?? '')),
    trim((string) ($input['assetUrl'] ?? '')),
    trim((string) ($input['purchaseUrl'] ?? '')),
    $price === '' ? null : number_format((float) $price, 2, '.', ''),
    strtoupper(
      substr(preg_replace('/[^a-z]/i', '', (string) ($input['currency'] ?? 'NGN')) ?: 'NGN', 0, 3),
    ),
    $status,
    $publishedAt,
  ];
  if ($id) {
    $values[] = $id;
    $pdo
      ->prepare(
        'UPDATE content_items SET kind=?,slug=?,title=?,category=?,tags=?,summary=?,body=?,cover_image=?,media_url=?,asset_url=?,purchase_url=?,price=?,currency=?,status=?,published_at=COALESCE(?,published_at) WHERE id=?',
      )
      ->execute($values);
  } else {
    $pdo
      ->prepare(
        'INSERT INTO content_items (kind,slug,title,category,tags,summary,body,cover_image,media_url,asset_url,purchase_url,price,currency,status,published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      ->execute($values);
    $id = (int) $pdo->lastInsertId();
  }
  respond(200, [
    'ok' => true,
    'id' => $id,
    'slug' => $slug,
    'status' => $status === 'published' ? 'Published' : 'Draft',
  ]);
}

if ($route === 'articles' && $method === 'GET') {
  $admin = !empty($_SESSION['alexore_admin']) && ($_GET['include'] ?? '') === 'all';
  if ($admin) {
    $rows = $pdo
      ->query(
        "SELECT id, slug, title, category, tags, deck, cover_image AS coverImage, seo_description AS seoDescription, body, view_count AS viewCount, IF(status='published','Published','Draft') AS status, DATE_FORMAT(COALESCE(published_at, updated_at), '%b %e, %Y') AS date, UNIX_TIMESTAMP(updated_at) * 1000 AS updatedAt FROM articles ORDER BY updated_at DESC",
      )
      ->fetchAll();
  } else {
    $rows = $pdo
      ->query(
        "SELECT id, slug, title, category, tags, deck, cover_image AS coverImage, seo_description AS seoDescription, body, 'Published' AS status, DATE_FORMAT(published_at, '%b %e, %Y') AS date, UNIX_TIMESTAMP(updated_at) * 1000 AS updatedAt FROM articles WHERE status='published' ORDER BY published_at DESC",
      )
      ->fetchAll();
  }
  foreach ($rows as &$row) {
    $row['read'] = article_reading_time((string) $row['body']);
  }
  unset($row);
  respond(200, ['articles' => $rows]);
}
if ($route === 'article' && $method === 'GET') {
  $slug = trim((string) ($_GET['slug'] ?? ''));
  $statement = $pdo->prepare(
    "SELECT id, slug, title, category, tags, deck, cover_image AS coverImage, seo_description AS seoDescription, body, view_count AS viewCount, 'Published' AS status, DATE_FORMAT(published_at, '%b %e, %Y') AS date FROM articles WHERE slug=? AND status='published' LIMIT 1",
  );
  $statement->execute([$slug]);
  $article = $statement->fetch();
  if (!$article) {
    respond(404, ['error' => 'Article not found.']);
  }
  $articleId = (int) $article['id'];
  $viewedArticles = $_SESSION['alexore_article_views'] ?? [];
  if (!is_array($viewedArticles)) {
    $viewedArticles = [];
  }
  if (empty($viewedArticles[$articleId])) {
    $pdo->prepare('UPDATE articles SET view_count=view_count+1 WHERE id=?')->execute([$articleId]);
    $viewedArticles[$articleId] = true;
    if (count($viewedArticles) > 500) {
      $viewedArticles = array_slice($viewedArticles, -500, null, true);
    }
    $_SESSION['alexore_article_views'] = $viewedArticles;
    $article['viewCount'] = (int) $article['viewCount'] + 1;
  } else {
    $article['viewCount'] = (int) $article['viewCount'];
  }
  $article['read'] = article_reading_time((string) $article['body']);
  $article['likeCount'] = 0;
  $article['commentCount'] = 0;
  if ($engagementSchemaReady) {
    $counts = $pdo->prepare(
      "SELECT (SELECT COUNT(*) FROM article_likes WHERE article_id=?) AS likeCount, (SELECT COUNT(*) FROM article_comments WHERE article_id=? AND status='approved') AS commentCount",
    );
    $counts->execute([$article['id'], $article['id']]);
    $article = array_merge($article, $counts->fetch() ?: []);
  }
  respond(200, ['article' => $article]);
}
if ($route === 'articles' && $method === 'POST') {
  require_admin();
  require_csrf();
  $input = body_json();
  $title = trim((string) ($input['title'] ?? ''));
  if ($title === '' || mb_strlen($title) > 240) {
    respond(422, ['error' => 'Add a title up to 240 characters.']);
  }
  $id = filter_var($input['id'] ?? null, FILTER_VALIDATE_INT) ?: null;
  $status = ($input['status'] ?? '') === 'Published' ? 'published' : 'draft';
  $tags = [];
  foreach (preg_split('/[,;\r\n]+/', (string) ($input['tags'] ?? '')) ?: [] as $tag) {
    $tag = trim(preg_replace('/\s+/u', ' ', strip_tags($tag)) ?? '');
    if ($tag !== '' && count($tags) < 12) {
      $tags[mb_strtolower($tag)] = mb_substr($tag, 0, 40);
    }
  }
  $tagsValue = implode(', ', array_values($tags));
  $slugBase = trim((string) ($input['slug'] ?? ''));
  if ($slugBase === '') {
    $slugBase = $title;
  }
  $slug = trim(
    preg_replace(
      '/[^a-z0-9]+/i',
      '-',
      iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $slugBase) ?: $slugBase,
    ),
    '-',
  );
  $slug = strtolower(substr($slug ?: 'article', 0, 190));
  if ($id) {
    $check = $pdo->prepare('SELECT id FROM articles WHERE slug=? AND id<>?');
    $check->execute([$slug, $id]);
  } else {
    $check = $pdo->prepare('SELECT id FROM articles WHERE slug=?');
    $check->execute([$slug]);
  }
  if ($check->fetch()) {
    $slug .= '-' . substr(bin2hex(random_bytes(4)), 0, 8);
  }
  $publishedAt = $status === 'published' ? date('Y-m-d H:i:s') : null;
  $body = (string) ($input['body'] ?? '');
  $values = [
    $slug,
    $title,
    trim((string) ($input['category'] ?? 'Notes')),
    $tagsValue,
    trim((string) ($input['deck'] ?? '')),
    trim((string) ($input['coverImage'] ?? '')),
    substr(trim((string) ($input['seoDescription'] ?? '')), 0, 160),
    $body,
    $status,
    $publishedAt,
  ];
  if ($id) {
    $sql =
      'UPDATE articles SET slug=?, title=?, category=?, tags=?, deck=?, cover_image=?, seo_description=?, body=?, status=?, published_at=CASE WHEN ? IS NULL THEN published_at ELSE COALESCE(published_at, ?) END WHERE id=?';
    $pdo->prepare($sql)->execute([...array_slice($values, 0, 9), $publishedAt, $publishedAt, $id]);
  } else {
    $sql =
      'INSERT INTO articles (slug,title,category,tags,deck,cover_image,seo_description,body,status,published_at) VALUES (?,?,?,?,?,?,?,?,?,?)';
    $pdo->prepare($sql)->execute($values);
    $id = (int) $pdo->lastInsertId();
  }
  respond(200, [
    'ok' => true,
    'id' => $id,
    'slug' => $slug,
    'status' => $status === 'published' ? 'Published' : 'Draft',
  ]);
}

if ($route === 'subscribers' && $method === 'GET') {
  require_admin();
  respond(200, [
    'subscribers' => $pdo
      ->query(
        "SELECT email, DATE_FORMAT(created_at, '%b %e, %Y') AS date, DATE_FORMAT(created_at, '%Y-%m-%d') AS subscribedAt FROM subscribers ORDER BY created_at DESC",
      )
      ->fetchAll(),
  ]);
}
if ($route === 'settings' && $method === 'GET') {
  $rows = $pdo
    ->query(
      "SELECT setting_key, setting_value FROM site_settings WHERE setting_key IN ('intro','home_intro','about_intro','about_detail','about_hero_title','about_hero_emphasis','about_section_title','about_story_continued','about_point1_title','about_point1_body','about_point2_title','about_point2_body','about_point3_title','about_point3_body','about_point4_title','about_point4_body','about_bottom_title','about_bottom_body','offers_intro','x','medium','substack','linkedin','youtube','products_heading','products_intro','products_section_heading','products_section_body','book_status','book_card_title','book_card_description','book_hero_title','book_lead','book_section_title','book_section_body','framework_status','framework_card_title','framework_card_description','framework_hero_title','framework_lead','framework_section_title','framework_section_body','media_hero_title','media_lead','media_section_title','media_section_body','media_bottom_title','media_bottom_body','speaking_hero_title','speaking_lead','speaking_section_title','speaking_section_body','speaking_bottom_title','speaking_bottom_body','editor_autosave_minutes','contact_delivery_email','public_site_url')",
    )
    ->fetchAll();
  $settings = [];
  foreach ($rows as $row) {
    $settings[$row['setting_key']] = $row['setting_value'];
  }
  respond(200, ['settings' => $settings]);
}
if ($route === 'settings' && $method === 'POST') {
  require_admin();
  require_csrf();
  $input = body_json();
  if (array_key_exists('contact_delivery_email', $input)) {
    $deliveryEmail = trim((string) $input['contact_delivery_email']);
    if (
      $deliveryEmail !== '' &&
      (!filter_var($deliveryEmail, FILTER_VALIDATE_EMAIL) || strlen($deliveryEmail) > 254)
    ) {
      respond(422, ['error' => 'Enter a valid contact delivery email address.']);
    }
    $input['contact_delivery_email'] = $deliveryEmail;
  }
  if (array_key_exists('public_site_url', $input)) {
    $siteUrl = rtrim(trim((string) $input['public_site_url']), '/');
    $scheme = strtolower((string) parse_url($siteUrl, PHP_URL_SCHEME));
    if (
      $siteUrl !== '' &&
      (!filter_var($siteUrl, FILTER_VALIDATE_URL) || !in_array($scheme, ['http', 'https'], true))
    ) {
      respond(422, ['error' => 'Enter a valid public site URL beginning with https://.']);
    }
    $input['public_site_url'] = $siteUrl;
  }
  $statement = $pdo->prepare(
    'INSERT INTO site_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)',
  );
  foreach ($input as $key => $value) {
    if (preg_match('/^[a-z_]{1,80}$/', (string) $key)) {
      $statement->execute([$key, is_scalar($value) ? (string) $value : '']);
    }
  }
  respond(200, ['ok' => true]);
}

respond(404, ['error' => 'Unknown API route.']);
