<?php
// Copy this file to a location outside public_html, such as ~/alexore-config.php.
return [
  'dsn' => 'mysql:host=localhost;dbname=cpanelprefix_alexore;charset=utf8mb4',
  'db_user' => 'cpanelprefix_alexoreuser',
  'db_password' => 'replace-with-a-long-random-database-password',
  // Copy the SMTP host, port, and security mode from cPanel → Email Accounts → Connect Devices.
  // Keep the mailbox password only in this private file, outside public_html.
  'mail' => [
    'smtp_host' => 'mail.alexore.com.ng',
    'smtp_port' => 465,
    'smtp_security' => 'ssl', // 'ssl' for implicit TLS (usually 465), 'tls' for STARTTLS (usually 587).
    'smtp_username' => 'noreply@alexore.com.ng',
    'smtp_password' => 'replace-with-the-mailbox-password',
    'from_email' => 'noreply@alexore.com.ng',
    'from_name' => 'Alex Ore',
  ],
];
