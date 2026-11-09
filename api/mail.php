<?php
declare(strict_types=1);

function smtp_read_reply($socket): string
{
  $reply = '';
  while (($line = fgets($socket, 515)) !== false) {
    $reply .= $line;
    if (preg_match('/^\d{3} /', $line)) return $reply;
    if (!preg_match('/^\d{3}-/', $line)) break;
  }
  throw new RuntimeException('SMTP server returned an incomplete response.');
}

function smtp_expect($socket, array $accepted): string
{
  $reply = smtp_read_reply($socket);
  $code = (int) substr($reply, 0, 3);
  if (!in_array($code, $accepted, true)) {
    throw new RuntimeException('SMTP server rejected a mail operation with code ' . $code . '.');
  }
  return $reply;
}

function smtp_command($socket, string $command, array $accepted): string
{
  if (fwrite($socket, $command . "\r\n") === false) throw new RuntimeException('Could not write to the SMTP server.');
  return smtp_expect($socket, $accepted);
}

function smtp_is_configured(array $config): bool
{
  $mail = $config['mail'] ?? [];
  foreach (['smtp_host', 'smtp_username', 'smtp_password', 'from_email'] as $key) {
    if (!is_string($mail[$key] ?? null) || trim($mail[$key]) === '') return false;
  }
  return filter_var($mail['from_email'], FILTER_VALIDATE_EMAIL) !== false
    && (int) ($mail['smtp_port'] ?? 0) > 0
    && in_array($mail['smtp_security'] ?? '', ['ssl', 'tls'], true);
}

function send_configured_email(array $config, string $to, string $subject, string $body): void
{
  if (!smtp_is_configured($config)) throw new RuntimeException('Password recovery SMTP is not configured.');
  if (!filter_var($to, FILTER_VALIDATE_EMAIL)) throw new RuntimeException('Invalid destination email.');
  $mail = $config['mail'];
  $host = trim((string) $mail['smtp_host']);
  $port = (int) $mail['smtp_port'];
  $security = (string) $mail['smtp_security'];
  $connectHost = ($security === 'ssl' ? 'ssl://' : 'tcp://') . $host;
  $context = stream_context_create(['ssl' => [
    'verify_peer' => true,
    'verify_peer_name' => true,
    'peer_name' => $host,
    'SNI_enabled' => true,
  ]]);
  $socket = @stream_socket_client($connectHost . ':' . $port, $errorCode, $errorMessage, 15, STREAM_CLIENT_CONNECT, $context);
  if (!$socket) throw new RuntimeException('Could not connect to the configured SMTP server (' . $errorCode . ').');
  stream_set_timeout($socket, 15);

  try {
    smtp_expect($socket, [220]);
    $ehloName = preg_replace('/[^a-z0-9.-]/i', '', (string) (parse_url('http://' . ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST) ?: 'localhost')) ?: 'localhost';
    smtp_command($socket, 'EHLO ' . $ehloName, [250]);
    if ($security === 'tls') {
      smtp_command($socket, 'STARTTLS', [220]);
      if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
        throw new RuntimeException('Could not start TLS with the SMTP server.');
      }
      smtp_command($socket, 'EHLO ' . $ehloName, [250]);
    }
    smtp_command($socket, 'AUTH LOGIN', [334]);
    smtp_command($socket, base64_encode((string) $mail['smtp_username']), [334]);
    smtp_command($socket, base64_encode((string) $mail['smtp_password']), [235]);
    smtp_command($socket, 'MAIL FROM:<' . $mail['from_email'] . '>', [250]);
    smtp_command($socket, 'RCPT TO:<' . $to . '>', [250, 251]);
    smtp_command($socket, 'DATA', [354]);

    $fromName = (string) ($mail['from_name'] ?? 'Alex Ore');
    $encodedName = '=?UTF-8?B?' . base64_encode($fromName) . '?=';
    $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    $message = implode("\r\n", [
      'Date: ' . gmdate('D, d M Y H:i:s') . ' +0000',
      'From: ' . $encodedName . ' <' . $mail['from_email'] . '>',
      'To: <' . $to . '>',
      'Subject: ' . $encodedSubject,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      chunk_split(base64_encode($body), 76, "\r\n"),
    ]);
    if (fwrite($socket, $message . "\r\n.\r\n") === false) throw new RuntimeException('Could not send the email body.');
    smtp_expect($socket, [250]);
    smtp_command($socket, 'QUIT', [221]);
  } finally {
    fclose($socket);
  }
}
