# Creator portfolio site (Liquid Glass design)

Flask + PostgreSQL + HTML/CSS/JS. Mobile-friendly public site and a full admin panel.

## What it has
- **Public site**: profile, social links (YouTube, Facebook…) as Wallet-style cards, where he works, and a videos/articles library.
- **Tap any video card** → a sheet opens with the written summary, key points and full explanation (readable without watching). The video plays only if you press play. Each post also has its own shareable page.
- **Comments** on every post (rate-limited, spam trap).
- **Admin panel** at `/admin`: edit profile + pictures, add/edit/delete videos & articles (with cover picture and description), work places (with logo), links, and **read / delete comments** (also directly on the public post when logged in). Drafts, change password.
- Uploaded images are validated and shrunk automatically.

## New: backups, video upload, Shadhin bot
- **Admin -> Backup**: automatic snapshots on the volume, one-click full backup download (with pictures and videos), restore from a zip, and automatic restore if the database is ever empty.
- **Admin -> Videos & posts -> Upload video**: drag in a downloaded video (progress bar, automatic cover picture).
- **Admin -> Bot**: edit the greeting and messages of **Shadhin**, the welcome bot on the home page.

## Easiest way: Docker
```bash
cp .env.example .env      # then edit SECRET_KEY and ADMIN_PASSWORD
docker compose up -d --build
```
Open http://localhost:8000 — admin at http://localhost:8000/admin

## Without Docker
1. Install Python 3.10+ and PostgreSQL, then create a database: `createdb cousin_site`
2. ```bash
   python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   cp .env.example .env     # edit DATABASE_URL, SECRET_KEY, ADMIN_PASSWORD
   python app.py            # http://localhost:5000
   ```
Tables and the first admin account are created automatically on first start
(admin password must be 8+ characters and not the example value).
Reset/create an admin later: `flask --app app create-admin`

## Railway
Step-by-step guide: see `DEPLOY-RAILWAY.md`.

## Putting it online
- Run with `gunicorn -w 2 --threads 4 app:app` behind nginx/Caddy with HTTPS.
- In `.env` set `SECURE_COOKIES=1` and `TRUST_PROXY=1`.
- Back up the database and the `uploads/` folder.

## First steps after login
Profile → add name, picture, bio · Links → add YouTube/Facebook · Work → add where he works · Videos & posts → New.

## Security built in
Password hashing, CSRF protection on every form, login lockout, HTML escaping, strict Content-Security-Policy, image-only uploads, comment rate limit.
