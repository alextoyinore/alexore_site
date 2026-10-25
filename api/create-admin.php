<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$username = trim((string) ($argv[1] ?? ''));
$password = getenv('ALEXORE_ADMIN_PASSWORD') ?: '';
if ($username === '' || strlen($username) > 80 || $password === '') {
    fwrite(STDERR, "Usage: set ALEXORE_ADMIN_PASSWORD, then run php api/create-admin.php <username>\n");
    exit(1);
}

$configPath = getenv('ALEXORE_CONFIG_PATH') ?: dirname(__DIR__, 2) . '/alexore-config.php';
if (is_file($configPath)) {
    $config = require $configPath;
} else {
    $config = [
        'dsn' => getenv('ALEXORE_DSN') ?: 'mysql:host=127.0.0.1;port=3306;dbname=alexore_site;charset=utf8mb4',
        'db_user' => getenv('ALEXORE_DB_USER') ?: 'root',
        'db_password' => getenv('ALEXORE_DB_PASSWORD') ?: '',
    ];
}

try {
    $pdo = new PDO($config['dsn'], $config['db_user'], $config['db_password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $statement = $pdo->prepare('INSERT INTO users (username, password_hash, role, is_active) VALUES (?, ?, \'admin\', 1)');
    $statement->execute([$username, password_hash($password, PASSWORD_DEFAULT)]);
    fwrite(STDOUT, "Admin account created for {$username}.\n");
} catch (Throwable $error) {
    fwrite(STDERR, "Could not create admin account: {$error->getMessage()}\n");
    exit(1);
} finally {
    unset($password);
}
