# Deploy on Railway

You need: a free GitHub account and a Railway account (https://railway.com).

## 1. Put the code on GitHub
Run inside the `cousin-site` folder:
```bash
git init
git add .
git commit -m "first version"
git branch -M main
git remote add origin https://github.com/YOUR-NAME/cousin-site.git   # create the empty repo on github.com first
git push -u origin main
```
`.gitignore` keeps your local `.env` (passwords) out of GitHub. Do not remove it.

## 2. Create the project
1. Railway dashboard -> **New Project** -> **Deploy from GitHub repo** -> pick `cousin-site`.
2. Railway finds the `Dockerfile` and builds it. The first deploy will fail or show an error page until steps 3-5 are done. That is normal.

## 3. Add the database
In the project canvas: **+ New** -> **Database** -> **Add PostgreSQL**.

## 4. Add a volume (so pictures, videos and backups are never lost)
Click the web service -> **Settings** -> **Volumes** (or right-click the canvas -> **Volume**) -> attach it to the web service with mount path:
```
/data
```
This is the most important step. Uploaded pictures, uploaded videos and the automatic backups all live on this volume, so restarts and redeploys cannot erase them.

## 5. Set the variables
Web service -> **Variables** -> **Raw Editor**, paste, then edit the values:
```
DATABASE_URL=${{Postgres.DATABASE_URL}}
SECRET_KEY=PUT_A_LONG_RANDOM_STRING_HERE
ADMIN_USERNAME=Izaz
ADMIN_PASSWORD=PUT_A_STRONG_PASSWORD_HERE
UPLOAD_DIR=/data/uploads
SECURE_COOKIES=1
TRUST_PROXY=1
TZ_NAME=Asia/Dhaka
```
- If your database service is not called `Postgres`, use its real name in `${{...}}`.
- Make a SECRET_KEY with: `python -c "import secrets; print(secrets.token_hex(32))"`
- Use a strong password here, not the one from the local test. 8+ characters.
- Do not set `PORT`. Railway sets it.

Click **Deploy** when Railway offers it.

## 6. Get the public link
Web service -> **Settings** -> **Networking** -> **Generate Domain**.
Open it. The site loads; log in at `/admin/login` (or the small Admin link in the footer).

For your own domain: **Custom Domain**, add it, then create the DNS record Railway shows.

## 7. After the first start
- The admin account is created automatically the first time the site starts with an empty database.
- Later changes to ADMIN_USERNAME / ADMIN_PASSWORD do not change an existing account. Reset it from the web service's shell/CLI:
  ```
  railway link
  railway ssh
  flask --app app create-admin
  ```
- Updating the site: `git push` and Railway redeploys.

## Backups (Admin -> Backup)
- A snapshot of all text, comments and settings is saved automatically to `/data/backups` a few minutes after every change.
- If the database is ever empty when the site starts (for example you deleted and re-created the Postgres service), the newest snapshot is **restored automatically**. Pictures and videos are already on the volume.
- **Download full backup** gives one zip with everything including pictures and videos. Do this now and then and keep it on your phone/computer.
- To restore: Admin -> Backup -> choose the zip -> Restore.
- To really start from zero, delete the snapshots on the Backup page first (or set `AUTO_RESTORE=0`).
- If the volume itself is deleted, only a downloaded full backup can bring back pictures and videos.

## Uploading videos
Admin -> Videos & posts -> **Upload video**. Pick or drop an MP4 (MOV/WEBM also work), up to 1 GB by default (`MAX_UPLOAD_MB`). A cover picture is made automatically. Railway cuts requests that last more than about 15 minutes, so for very large files compress the video first. Volume space is limited by your Railway plan.

## Troubleshooting
- **500 page / "could not prepare the database" in Deploy Logs**: `DATABASE_URL` is wrong or missing. It must be `${{Postgres.DATABASE_URL}}`.
- **Admin login says wrong password**: the account already existed. Use the reset command above.
- **Uploaded pictures disappear after a deploy**: the volume is missing, or `UPLOAD_DIR` is not `/data/uploads`.
- **Logged out on every deploy**: `SECRET_KEY` is not set.
- **Can't log in, no error**: `SECURE_COOKIES=1` only works over https. Use the generated https domain.
