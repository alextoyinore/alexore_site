# alexore

A responsive personal publishing site and studio dashboard for alexore.

## Run the app locally

Start Apache and MySQL in XAMPP, then from the project folder run:

```powershell
npm install
npm run dev
```

Open `http://localhost:5173/`. Vite serves the React app and proxies `/api` and `/uploads` to `http://localhost/alexore`, so the XAMPP PHP API and database remain available while you test. The dev command does not create a production build.

## Build an approved commit

Only run a production build after the commit is approved:

```powershell
npm run build:xampp
```

`npm run build` writes the production site to `dist/`. `npm run build:xampp` also publishes it to `C:\xampp\htdocs\alexore`.

## Local XAMPP setup

1. Start Apache and MySQL in the XAMPP Control Panel.
2. In phpMyAdmin, create a database named `alexore_site` and import `api/schema.sql`.
3. After approving and committing the source, run `npm run build:xampp`, then open `http://localhost/alexore/studio.html`. On loopback requests, the API uses the local `root` MySQL account with a blank password by default, so no private config file is needed for a standard XAMPP install.

For an existing local database created before admin display names were added, run api/migrate-admin-name.sql once in phpMyAdmin. The current local admin account is labeled Alex Ore. For the existing article table, also run api/migrate-article-metadata.sql once to add tags and remove the stored reading-time column.

The content library table is created automatically on the first API request. If your database account cannot create tables, run `api/migrate-content-items.sql` once in phpMyAdmin.

Article comments and likes are also created automatically for existing databases. If the database account cannot create tables, run `api/migrate-article-engagement.sql` once in phpMyAdmin.

4. Create the first admin account from PowerShell in the project folder:

```powershell
$env:ALEXORE_ADMIN_PASSWORD = 'choose-a-strong-password'
php api/create-admin.php alexore
Remove-Item Env:ALEXORE_ADMIN_PASSWORD
```

If your XAMPP MySQL root account has a password or a different port, put the settings in a private config file at `C:\xampp\htdocs\alexore-config.php` (one level above this project), or set the corresponding `ALEXORE_DB_PASSWORD` / `ALEXORE_DSN` environment variables for both Apache and the CLI.

## Local PHP built-in server setup

The local schema is installed in the `alexore_site` database on port `3306` (MariaDB). For quick local development, the PHP built-in server defaults to the local MariaDB `root` account with a blank password. These defaults only activate when PHP is bound to a loopback address. Start it from PowerShell:

```powershell
npm run build
php -S 127.0.0.1:8000 -t dist
```

To create the first dashboard account, set `ALEXORE_ADMIN_PASSWORD` in the PowerShell session and run `php api/create-admin.php alexore` from the source project. The password is stored as a hash in the `users` table. Open `http://127.0.0.1:8000/` for the public site and `/studio.html` for the dashboard. If your local MariaDB root account has a password, set `ALEXORE_DB_PASSWORD` before starting PHP. You can also override the database user or DSN with `ALEXORE_DB_USER` or `ALEXORE_DSN`. These local defaults are for development only; cPanel uses the private production config described below.

## Included

- Public home, writing, author introduction, work areas, and newsletter signup form.
- Public detail pages for articles and publishing items, plus the book, framework, teaching, speaking, and media pages.
- In-page article editor with rich text controls, drafts, publishing, categories, descriptions, reading time, cover image URLs, and SEO descriptions.
- PHP API and MySQL schema for articles, subscriber emails, and public profile links.
- Studio password login, server-side sessions, CSRF checks, and public article pages backed by MySQL.
- Published articles appear on a dedicated writing list page with individual reading pages.
- Readers can like articles and leave named or anonymous comments without creating accounts. Comments are held for Studio moderation; newsletter signup from the comment form is optional and requires explicit consent.
- Studio includes a Comments queue for approving or hiding reader comments. Comment emails remain private.
- Dashboard libraries for books and downloadable products, plus videos and podcasts. Add hosted watch/listen URLs; upload product files as PDF, EPUB, ZIP, or DOCX (up to 25 MB, subject to PHP's upload limits).
- Books and products appear in the public shop; paid items should link to an external checkout URL. The site does not process payments itself.
- Videos and podcasts appear in the public media library with watch/listen detail pages.
- Categories and tags link to a combined public browser across writing, books, products, videos, and podcasts.
- Dashboard page-content editors for the shop, media, and speaking pages, plus site settings for homepage/About copy and social profile URLs.
- Subscriber CSV export and full JSON backup export from the dashboard.
- Responsive layout for desktop and mobile.

## cPanel setup

1. In cPanel’s Database Wizard, create a MySQL database and a dedicated user with access to it.
2. Import `api/schema.sql` into that database with phpMyAdmin.
   If the production database user cannot create tables, also import `api/migrate-content-items.sql`.
   If the production database user cannot create tables, also import `api/migrate-article-engagement.sql`.
3. Copy `api/config.example.php` to `~/alexore-config.php` (outside `public_html`) and enter the database credentials.
4. From the hosting account’s command line, set `ALEXORE_ADMIN_PASSWORD` and run `php public_html/api/create-admin.php alexore` to create your first admin login. The password is stored as a hash in the `users` table.
5. Upload the files into the domain’s document root. Select a current PHP version with PDO MySQL enabled and enable HTTPS.
6. Sign in through `studio.html` and add your real social URLs under Site settings.

The API expects the private config one directory above `public_html`; it also accepts `ALEXORE_CONFIG_PATH` to point to a private config file elsewhere. For local development, it can read the `ALEXORE_*` environment variables above. Newsletter addresses are stored in MySQL; connect an email delivery provider when you’re ready to send newsletters. The visible sample homepage articles are design placeholders until your own writing is added.

Confirm your specific cPanel plan supports PHP 8.3+ and MySQL 8.0+ or MariaDB 10.11+ before deployment.
