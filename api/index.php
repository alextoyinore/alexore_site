<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

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
    exit;
}

$secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
session_set_cookie_params(['httponly' => true, 'secure' => $secure, 'samesite' => 'Lax', 'path' => '/']);
session_start();

function respond(int $status, array $payload): never {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function body_json(): array {
    $data = json_decode(file_get_contents('php://input') ?: '', true);
    return is_array($data) ? $data : [];
}

function article_reading_time(string $html): string {
    $plainText = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    preg_match_all('/[\p{L}\p{N}]+/u', $plainText, $words);
    return max(1, (int) ceil(count($words[0]) / 220)) . ' min read';
}

function require_admin(): void {
    if (empty($_SESSION['alexore_admin'])) respond(401, ['error' => 'Sign in required.']);
}

function require_csrf(): void {
    $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!is_string($sent) || empty($_SESSION['csrf']) || !hash_equals($_SESSION['csrf'], $sent)) {
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
    $localDevelopment = in_array($remoteAddress, ['127.0.0.1', '::1'], true)
        && (PHP_SAPI === 'cli-server'
            || in_array($requestHostname, ['localhost', '127.0.0.1', '::1'], true));
    if ($localDevelopment) {
        $environmentConfig = [
            'dsn' => getenv('ALEXORE_DSN') ?: 'mysql:host=127.0.0.1;port=3306;dbname=alexore_site;charset=utf8mb4',
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
            respond(503, ['error' => 'Backend setup is incomplete. Configure a private config file or the ALEXORE environment variables.']);
        }
    }
    $config = $environmentConfig;
}
if (!is_array($config)) respond(503, ['error' => 'Backend configuration is invalid.']);

try {
    $pdo = new PDO($config['dsn'], $config['db_user'], $config['db_password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
} catch (Throwable $error) {
    error_log('alexore database connection failed: ' . $error->getMessage());
    respond(503, ['error' => 'The database is not available. Check the private cPanel configuration.']);
}

// Keep newly added publishing features available on existing XAMPP installs
// without requiring the original database schema to be re-imported.
$contentSchemaReady = true;
try { $pdo->exec("CREATE TABLE IF NOT EXISTS content_items (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"); }
catch (Throwable $error) { $contentSchemaReady = false; error_log('alexore content table setup failed: ' . $error->getMessage()); }

$route = $_GET['route'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($route === 'upload' && $method === 'POST') {
    require_admin(); require_csrf();
    $file = $_FILES['image'] ?? null;
    if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        respond(422, ['error' => 'Choose an image to upload.']);
    }
    if (($file['size'] ?? 0) < 1 || $file['size'] > 8 * 1024 * 1024 || !is_uploaded_file($file['tmp_name'] ?? '')) {
        respond(422, ['error' => 'Images must be smaller than 8 MB.']);
    }
    $imageInfo = @getimagesize($file['tmp_name']);
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
    $extensions = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];
    if (!$imageInfo || !isset($extensions[$mime]) || ($imageInfo['mime'] ?? '') !== $mime) {
        respond(422, ['error' => 'Upload a JPG, PNG, GIF, or WebP image.']);
    }
    $uploadDirectory = dirname(__DIR__) . '/uploads';
    if (!is_dir($uploadDirectory) && !mkdir($uploadDirectory, 0755, true) && !is_dir($uploadDirectory)) {
        respond(500, ['error' => 'The uploads folder could not be created. Check folder permissions.']);
    }
    $filename = bin2hex(random_bytes(16)) . '.' . $extensions[$mime];
    if (!move_uploaded_file($file['tmp_name'], $uploadDirectory . '/' . $filename)) {
        respond(500, ['error' => 'The image could not be saved. Check uploads folder permissions.']);
    }
    respond(201, ['url' => 'uploads/' . $filename]);
}

if ($route === 'asset-upload' && $method === 'POST') {
    require_admin(); require_csrf();
    $file = $_FILES['asset'] ?? null;
    if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        $uploadError = is_array($file) ? (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) : UPLOAD_ERR_NO_FILE;
        if (in_array($uploadError, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) respond(422, ['error' => 'PHP rejected this file before upload. Increase upload_max_filesize and post_max_size in XAMPP’s php.ini, then restart Apache.']);
        respond(422, ['error' => 'Choose a digital file to upload.']);
    }
    if (($file['size'] ?? 0) < 1 || $file['size'] > 25 * 1024 * 1024 || !is_uploaded_file($file['tmp_name'] ?? '')) respond(422, ['error' => 'Digital files must be smaller than 25 MB.']);
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
    $allowed = ['application/pdf'=>'pdf','application/epub+zip'=>'epub','application/zip'=>'zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document'=>'docx'];
    if (!isset($allowed[$mime])) respond(422, ['error' => 'Upload a PDF, EPUB, ZIP, or DOCX file.']);
    $uploadDirectory = dirname(__DIR__) . '/uploads';
    if (!is_dir($uploadDirectory) && !mkdir($uploadDirectory, 0755, true) && !is_dir($uploadDirectory)) respond(500, ['error' => 'The uploads folder could not be created. Check folder permissions.']);
    $filename = bin2hex(random_bytes(16)) . '.' . $allowed[$mime];
    if (!move_uploaded_file($file['tmp_name'], $uploadDirectory . '/' . $filename)) respond(500, ['error' => 'The file could not be saved. Check uploads folder permissions.']);
    respond(201, ['url'=>'uploads/' . $filename]);
}

if ($route === 'auth' && $method === 'GET') {
    respond(200, ['authenticated' => !empty($_SESSION['alexore_admin']), 'csrf' => $_SESSION['csrf'] ?? null, 'displayName' => $_SESSION['alexore_display_name'] ?? null]);
}
if ($route === 'auth' && $method === 'POST') {
    $input = body_json();
    if (($input['action'] ?? '') === 'logout') {
        require_admin(); require_csrf();
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $cookie = session_get_cookie_params();
            setcookie(session_name(), '', ['expires' => time() - 42000, 'path' => $cookie['path'], 'domain' => $cookie['domain'], 'secure' => $cookie['secure'], 'httponly' => $cookie['httponly'], 'samesite' => $cookie['samesite'] ?? 'Lax']);
        }
        session_destroy();
        respond(200, ['authenticated' => false]);
    }
    if (!empty($_SESSION['login_blocked_until']) && time() < (int) $_SESSION['login_blocked_until']) {
        respond(429, ['error' => 'Too many attempts. Wait a few minutes and try again.']);
    }
    $username = trim((string) ($input['username'] ?? ''));
    $password = (string) ($input['password'] ?? '');
    $statement = $pdo->prepare('SELECT id, username, display_name, password_hash FROM users WHERE username=? AND role=\'admin\' AND is_active=1 LIMIT 1');
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
        respond(200, ['authenticated' => true, 'csrf' => $_SESSION['csrf'], 'displayName' => $_SESSION['alexore_display_name']]);
    }
    $_SESSION['login_attempts'] = (int) ($_SESSION['login_attempts'] ?? 0) + 1;
    if ($_SESSION['login_attempts'] >= 5) $_SESSION['login_blocked_until'] = time() + 300;
    respond(401, ['error' => 'That username or password did not match.']);
}

if ($route === 'subscribe' && $method === 'POST') {
    $email = filter_var(trim((string) (body_json()['email'] ?? '')), FILTER_VALIDATE_EMAIL);
    if (!$email || strlen($email) > 254) respond(422, ['error' => 'Enter a valid email address.']);
    $statement = $pdo->prepare('INSERT IGNORE INTO subscribers (email) VALUES (?)');
    $statement->execute([$email]);
    $message = $statement->rowCount() === 1
        ? 'You’re on the list. Keep becoming.'
        : 'You’re already on the list. Keep becoming.';
    respond(200, ['ok' => true, 'message' => $message]);
}

if ($route === 'content' && $method === 'GET') {
    if (!$contentSchemaReady) respond(503, ['error'=>'The content library table is unavailable. Run api/migrate-content-items.sql or grant the database account CREATE TABLE permission.']);
    $admin = !empty($_SESSION['alexore_admin']) && ($_GET['include'] ?? '') === 'all';
    $kind = (string) ($_GET['kind'] ?? '');
    $allowedKinds = ['book','product','video','podcast'];
    if ($kind !== '' && !in_array($kind, $allowedKinds, true)) respond(422, ['error'=>'Unknown content type.']);
    $assetSelection = $admin ? 'asset_url AS assetUrl' : 'CASE WHEN price IS NULL OR price=0 THEN asset_url ELSE \'\' END AS assetUrl';
    $sql = "SELECT id, kind, slug, title, category, tags, summary, body, cover_image AS coverImage, media_url AS mediaUrl, $assetSelection, purchase_url AS purchaseUrl, price, currency, IF(status='published','Published','Draft') AS status, DATE_FORMAT(COALESCE(published_at, updated_at), '%b %e, %Y') AS date FROM content_items";
    $where = []; $params = [];
    if (!$admin) $where[] = "status='published'";
    if ($kind !== '') { $where[] = 'kind=?'; $params[] = $kind; }
    if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
    $sql .= ' ORDER BY COALESCE(published_at, updated_at) DESC';
    $statement = $pdo->prepare($sql); $statement->execute($params);
    respond(200, ['items'=>$statement->fetchAll()]);
}
if ($route === 'content-item' && $method === 'GET') {
    if (!$contentSchemaReady) respond(503, ['error'=>'The content library table is unavailable. Run api/migrate-content-items.sql or grant the database account CREATE TABLE permission.']);
    $statement = $pdo->prepare("SELECT id, kind, slug, title, category, tags, summary, body, cover_image AS coverImage, media_url AS mediaUrl, CASE WHEN price IS NULL OR price=0 THEN asset_url ELSE '' END AS assetUrl, purchase_url AS purchaseUrl, price, currency, 'Published' AS status, DATE_FORMAT(published_at, '%b %e, %Y') AS date FROM content_items WHERE slug=? AND status='published' LIMIT 1");
    $statement->execute([trim((string) ($_GET['slug'] ?? ''))]);
    $item = $statement->fetch();
    if (!$item) respond(404, ['error'=>'This item is not available.']);
    respond(200, ['item'=>$item]);
}
if ($route === 'content' && $method === 'POST') {
    if (!$contentSchemaReady) respond(503, ['error'=>'The content library table is unavailable. Run api/migrate-content-items.sql or grant the database account CREATE TABLE permission.']);
    require_admin(); require_csrf();
    $input = body_json();
    $id = filter_var($input['id'] ?? null, FILTER_VALIDATE_INT) ?: null;
    $kind = (string) ($input['kind'] ?? '');
    if (!in_array($kind, ['book','product','video','podcast'], true)) respond(422, ['error'=>'Choose a valid content type.']);
    $title = trim((string) ($input['title'] ?? ''));
    if ($title === '' || mb_strlen($title) > 240) respond(422, ['error'=>'Add a title up to 240 characters.']);
    $tags = [];
    foreach (preg_split('/[,;\r\n]+/', (string) ($input['tags'] ?? '')) ?: [] as $tag) {
        $tag = trim(preg_replace('/\s+/u', ' ', strip_tags($tag)) ?? '');
        if ($tag !== '' && count($tags) < 12) $tags[mb_strtolower($tag)] = mb_substr($tag, 0, 40);
    }
    $slugBase = trim((string) ($input['slug'] ?? '')) ?: $title;
    $slug = strtolower(substr(trim(preg_replace('/[^a-z0-9]+/i', '-', iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $slugBase) ?: $slugBase), '-'), 0, 210));
    $slug = $slug ?: 'item';
    $checkSql = $id ? 'SELECT id FROM content_items WHERE slug=? AND id<>?' : 'SELECT id FROM content_items WHERE slug=?';
    $check = $pdo->prepare($checkSql); $check->execute($id ? [$slug,$id] : [$slug]);
    if ($check->fetch()) $slug .= '-' . substr(bin2hex(random_bytes(4)), 0, 8);
    $status = ($input['status'] ?? '') === 'Published' ? 'published' : 'draft';
    $price = trim((string) ($input['price'] ?? ''));
    if ($price !== '' && (!is_numeric($price) || (float) $price < 0 || (float) $price > 99999999)) respond(422, ['error'=>'Enter a valid product price.']);
    $publishedAt = $status === 'published' ? date('Y-m-d H:i:s') : null;
    $values = [$kind,$slug,$title,mb_substr(trim((string) ($input['category'] ?? 'Notes')),0,80),implode(', ',array_values($tags)),mb_substr(trim((string) ($input['summary'] ?? '')),0,500),(string) ($input['body'] ?? ''),trim((string) ($input['coverImage'] ?? '')),trim((string) ($input['mediaUrl'] ?? '')),trim((string) ($input['assetUrl'] ?? '')),trim((string) ($input['purchaseUrl'] ?? '')),$price === '' ? null : number_format((float) $price,2,'.',''),strtoupper(substr(preg_replace('/[^a-z]/i','',(string) ($input['currency'] ?? 'NGN')) ?: 'NGN',0,3)),$status,$publishedAt];
    if ($id) {
        $values[] = $id;
        $pdo->prepare('UPDATE content_items SET kind=?,slug=?,title=?,category=?,tags=?,summary=?,body=?,cover_image=?,media_url=?,asset_url=?,purchase_url=?,price=?,currency=?,status=?,published_at=COALESCE(?,published_at) WHERE id=?')->execute($values);
    } else {
        $pdo->prepare('INSERT INTO content_items (kind,slug,title,category,tags,summary,body,cover_image,media_url,asset_url,purchase_url,price,currency,status,published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute($values);
        $id = (int) $pdo->lastInsertId();
    }
    respond(200, ['ok'=>true,'id'=>$id,'slug'=>$slug,'status'=>$status === 'published' ? 'Published' : 'Draft']);
}

if ($route === 'articles' && $method === 'GET') {
    $admin = !empty($_SESSION['alexore_admin']) && ($_GET['include'] ?? '') === 'all';
    if ($admin) {
        $rows = $pdo->query("SELECT id, slug, title, category, tags, deck, cover_image AS coverImage, seo_description AS seoDescription, body, IF(status='published','Published','Draft') AS status, DATE_FORMAT(COALESCE(published_at, updated_at), '%b %e, %Y') AS date, UNIX_TIMESTAMP(updated_at) * 1000 AS updatedAt FROM articles ORDER BY updated_at DESC")->fetchAll();
    } else {
        $rows = $pdo->query("SELECT id, slug, title, category, tags, deck, cover_image AS coverImage, seo_description AS seoDescription, body, 'Published' AS status, DATE_FORMAT(published_at, '%b %e, %Y') AS date, UNIX_TIMESTAMP(updated_at) * 1000 AS updatedAt FROM articles WHERE status='published' ORDER BY published_at DESC")->fetchAll();
    }
    foreach ($rows as &$row) $row['read'] = article_reading_time((string) $row['body']);
    unset($row);
    respond(200, ['articles' => $rows]);
}
if ($route === 'article' && $method === 'GET') {
    $slug = trim((string) ($_GET['slug'] ?? ''));
    $statement = $pdo->prepare("SELECT id, slug, title, category, tags, deck, cover_image AS coverImage, seo_description AS seoDescription, body, 'Published' AS status, DATE_FORMAT(published_at, '%b %e, %Y') AS date FROM articles WHERE slug=? AND status='published' LIMIT 1");
    $statement->execute([$slug]);
    $article = $statement->fetch();
    if (!$article) respond(404, ['error' => 'Article not found.']);
    $article['read'] = article_reading_time((string) $article['body']);
    respond(200, ['article' => $article]);
}
if ($route === 'articles' && $method === 'POST') {
    require_admin(); require_csrf();
    $input = body_json();
    $title = trim((string) ($input['title'] ?? ''));
    if ($title === '' || mb_strlen($title) > 240) respond(422, ['error' => 'Add a title up to 240 characters.']);
    $id = filter_var($input['id'] ?? null, FILTER_VALIDATE_INT) ?: null;
    $status = ($input['status'] ?? '') === 'Published' ? 'published' : 'draft';
    $tags = [];
    foreach (preg_split('/[,;\r\n]+/', (string) ($input['tags'] ?? '')) ?: [] as $tag) {
        $tag = trim(preg_replace('/\s+/u', ' ', strip_tags($tag)) ?? '');
        if ($tag !== '' && count($tags) < 12) $tags[mb_strtolower($tag)] = mb_substr($tag, 0, 40);
    }
    $tagsValue = implode(', ', array_values($tags));
    $slugBase = trim((string) ($input['slug'] ?? ''));
    if ($slugBase === '') $slugBase = $title;
    $slug = trim(preg_replace('/[^a-z0-9]+/i', '-', iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $slugBase) ?: $slugBase), '-');
    $slug = strtolower(substr($slug ?: 'article', 0, 190));
    if ($id) {
        $check = $pdo->prepare('SELECT id FROM articles WHERE slug=? AND id<>?'); $check->execute([$slug, $id]);
    } else {
        $check = $pdo->prepare('SELECT id FROM articles WHERE slug=?'); $check->execute([$slug]);
    }
    if ($check->fetch()) $slug .= '-' . substr(bin2hex(random_bytes(4)), 0, 8);
    $publishedAt = $status === 'published' ? date('Y-m-d H:i:s') : null;
    $body = (string) ($input['body'] ?? '');
    $values = [$slug, $title, trim((string) ($input['category'] ?? 'Notes')), $tagsValue, trim((string) ($input['deck'] ?? '')), trim((string) ($input['coverImage'] ?? '')), substr(trim((string) ($input['seoDescription'] ?? '')), 0, 160), $body, $status, $publishedAt];
    if ($id) {
        $sql = 'UPDATE articles SET slug=?, title=?, category=?, tags=?, deck=?, cover_image=?, seo_description=?, body=?, status=?, published_at=COALESCE(?, published_at) WHERE id=?';
        $pdo->prepare($sql)->execute([...$values, $id]);
    } else {
        $sql = 'INSERT INTO articles (slug,title,category,tags,deck,cover_image,seo_description,body,status,published_at) VALUES (?,?,?,?,?,?,?,?,?,?)';
        $pdo->prepare($sql)->execute($values); $id = (int) $pdo->lastInsertId();
    }
    respond(200, ['ok' => true, 'id' => $id, 'slug' => $slug, 'status' => $status === 'published' ? 'Published' : 'Draft']);
}

if ($route === 'subscribers' && $method === 'GET') {
    require_admin();
    respond(200, ['subscribers' => $pdo->query("SELECT email, DATE_FORMAT(created_at, '%b %e, %Y') AS date FROM subscribers ORDER BY created_at DESC")->fetchAll()]);
}
if ($route === 'settings' && $method === 'GET') {
    $rows = $pdo->query("SELECT setting_key, setting_value FROM site_settings WHERE setting_key IN ('intro','home_intro','about_intro','about_detail','about_hero_title','about_hero_emphasis','about_section_title','about_story_continued','about_point1_title','about_point1_body','about_point2_title','about_point2_body','about_point3_title','about_point3_body','about_point4_title','about_point4_body','about_bottom_title','about_bottom_body','offers_intro','x','medium','substack','linkedin','youtube','products_heading','products_intro','products_section_heading','products_section_body','book_status','book_card_title','book_card_description','book_hero_title','book_lead','book_section_title','book_section_body','framework_status','framework_card_title','framework_card_description','framework_hero_title','framework_lead','framework_section_title','framework_section_body','media_hero_title','media_lead','media_section_title','media_section_body','media_bottom_title','media_bottom_body','speaking_hero_title','speaking_lead','speaking_section_title','speaking_section_body','speaking_bottom_title','speaking_bottom_body')")->fetchAll();
    $settings = []; foreach ($rows as $row) $settings[$row['setting_key']] = $row['setting_value'];
    respond(200, ['settings' => $settings]);
}
if ($route === 'settings' && $method === 'POST') {
    require_admin(); require_csrf();
    $statement = $pdo->prepare('INSERT INTO site_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)');
    foreach (body_json() as $key => $value) {
        if (preg_match('/^[a-z_]{1,80}$/', (string) $key)) $statement->execute([$key, is_scalar($value) ? (string) $value : '']);
    }
    respond(200, ['ok' => true]);
}

respond(404, ['error' => 'Unknown API route.']);
