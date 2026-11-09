<?php
declare(strict_types=1);

function password_reset_url(string $accountType, string $token): string
{
  $hostHeader = (string) ($_SERVER['HTTP_HOST'] ?? '');
  $host = strtolower((string) parse_url('http://' . $hostHeader, PHP_URL_HOST));
  $scriptPath = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? ''));
  $basePath = dirname(dirname($scriptPath));
  if ($basePath === '/' || $basePath === '.') $basePath = '';
  if (in_array($host, ['localhost', '127.0.0.1'], true)) {
    $scheme = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http';
    $page = $accountType === 'student' ? '/index.html' : '/account.html';
    return $scheme . '://' . $hostHeader . rtrim($basePath, '/') . $page . '?' . http_build_query(['password_reset' => $token]);
  }
  if ($accountType === 'student' && preg_match('/^(reo|students)\.alexore\.com\.ng$/', $host)) {
    return 'https://' . $host . '/?password_reset=' . rawurlencode($token);
  }
  if ($accountType === 'member' && in_array($host, ['alexore.com.ng', 'www.alexore.com.ng'], true)) {
    return 'https://' . $host . '/account.html?password_reset=' . rawurlencode($token);
  }
  throw new RuntimeException('The password reset URL host is not configured.');
}

function password_reset_rate_allowed(PDO $pdo, string $email): bool
{
  $remote = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
  $ipHash = hash('sha256', 'ip:' . $remote);
  $emailHash = hash('sha256', 'email:' . strtolower($email));
  $ipCount = $pdo->prepare('SELECT COUNT(*) FROM password_reset_requests WHERE ip_hash=? AND created_at>=DATE_SUB(NOW(), INTERVAL 1 HOUR)');
  $ipCount->execute([$ipHash]);
  $emailCount = $pdo->prepare('SELECT COUNT(*) FROM password_reset_requests WHERE email_hash=? AND created_at>=DATE_SUB(NOW(), INTERVAL 1 HOUR)');
  $emailCount->execute([$emailHash]);
  if ((int) $ipCount->fetchColumn() >= 10 || (int) $emailCount->fetchColumn() >= 3) return false;
  $pdo->prepare('INSERT INTO password_reset_requests(ip_hash,email_hash) VALUES(?,?)')->execute([$ipHash, $emailHash]);
  $pdo->exec('DELETE FROM password_reset_requests WHERE created_at<DATE_SUB(NOW(), INTERVAL 2 DAY)');
  return true;
}

function create_password_reset(PDO $pdo, array $config, string $accountType, int $accountId, string $email, string $name): void
{
  $pdo->prepare('DELETE FROM password_reset_tokens WHERE account_type=? AND account_id=?')->execute([$accountType, $accountId]);
  $token = bin2hex(random_bytes(32));
  $pdo->prepare('INSERT INTO password_reset_tokens(token_hash,account_type,account_id,expires_at) VALUES(?,?,?,DATE_ADD(NOW(), INTERVAL 30 MINUTE))')
    ->execute([hash('sha256', $token), $accountType, $accountId]);
  $serviceName = $accountType === 'student' ? 'Reo' : 'Alexore';
  $url = password_reset_url($accountType, $token);
  $greeting = trim(preg_replace('/[\r\n]+/', ' ', $name) ?? '') ?: 'there';
  $body = "Hello {$greeting},\n\nWe received a request to reset your {$serviceName} password. Choose a new password using this one-time link within 30 minutes:\n\n{$url}\n\nIf you did not request this, you can ignore this message. Your password will not change.\n";
  try {
    send_configured_email($config, $email, "Reset your {$serviceName} password", $body);
  } catch (Throwable $error) {
    $pdo->prepare('DELETE FROM password_reset_tokens WHERE token_hash=?')->execute([hash('sha256', $token)]);
    throw $error;
  }
}

function apply_password_reset(PDO $pdo, string $accountType, string $token, string $password): bool
{
  if (!preg_match('/^[a-f0-9]{64}$/', $token)) return false;
  $pdo->beginTransaction();
  try {
    $query = $pdo->prepare('SELECT account_type,account_id FROM password_reset_tokens WHERE token_hash=? AND expires_at>NOW() AND used_at IS NULL FOR UPDATE');
    $query->execute([hash('sha256', $token)]);
    $reset = $query->fetch();
    if (!$reset || $reset['account_type'] !== $accountType) {
      $pdo->commit();
      return false;
    }
    $table = $accountType === 'student' ? 'students' : 'site_members';
    $update = $pdo->prepare("UPDATE {$table} SET password_hash=?,session_version=session_version+1 WHERE id=? AND is_active=1");
    $update->execute([password_hash($password, PASSWORD_DEFAULT), (int) $reset['account_id']]);
    if (!$update->rowCount()) {
      $pdo->commit();
      return false;
    }
    $pdo->prepare('UPDATE password_reset_tokens SET used_at=NOW() WHERE token_hash=?')->execute([hash('sha256', $token)]);
    $pdo->prepare('DELETE FROM password_reset_tokens WHERE account_type=? AND account_id=?')->execute([$accountType, (int) $reset['account_id']]);
    $pdo->commit();
    return true;
  } catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $error;
  }
}
