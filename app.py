"""
Creator portfolio / blog site  -  Flask + PostgreSQL
Public site  : /
Admin panel  : /admin
"""
import hashlib
import os
import re
import secrets
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from functools import wraps
from urllib.parse import quote, urlparse

import click
import psycopg2
from psycopg2 import extras, pool
from dotenv import load_dotenv
from flask import (Flask, abort, flash, jsonify, redirect, render_template,
                   request, send_from_directory, session, url_for)
from markupsafe import Markup, escape
from PIL import Image, ImageOps
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash, generate_password_hash

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None

load_dotenv()

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
UPLOAD_DIR = os.environ.get("UPLOAD_DIR") or os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

PLACEHOLDER_PASSWORD = "change-this-password"
ASSET_V = str(int(time.time()))

app = Flask(__name__)

_secret = os.environ.get("SECRET_KEY")
if not _secret or _secret.startswith("change-me"):
    _secret = secrets.token_hex(32)
    print("WARNING: SECRET_KEY is not set - using a temporary key. "
          "Admin sessions will be lost on every restart. Set SECRET_KEY in .env")

app.config.update(
    SECRET_KEY=_secret,
    MAX_CONTENT_LENGTH=12 * 1024 * 1024,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("SECURE_COOKIES") == "1",
    PERMANENT_SESSION_LIFETIME=60 * 60 * 12,
    JSON_AS_ASCII=False,
)
if os.environ.get("TRUST_PROXY") == "1":
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

try:
    DISPLAY_TZ = ZoneInfo(os.environ.get("TZ_NAME", "Asia/Dhaka")) if ZoneInfo else timezone.utc
except Exception:  # unknown tz / tzdata missing
    DISPLAY_TZ = timezone.utc


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
_pool = None


def get_pool():
    global _pool
    if _pool is None:
        dsn = os.environ.get("DATABASE_URL")
        if not dsn:
            raise RuntimeError("DATABASE_URL is not set. Copy .env.example to .env and edit it.")
        _pool = pool.ThreadedConnectionPool(1, 10, dsn)
    return _pool


@contextmanager
def db():
    p = get_pool()
    conn = p.getconn()
    if conn.closed:  # stale connection (db restarted)
        p.putconn(conn, close=True)
        conn = p.getconn()
    try:
        with conn.cursor(cursor_factory=extras.RealDictCursor) as cur:
            yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        p.putconn(conn)


def query(sql, params=(), one=False):
    with db() as cur:
        cur.execute(sql, params)
        return cur.fetchone() if one else cur.fetchall()


def execute(sql, params=(), returning=False):
    with db() as cur:
        cur.execute(sql, params)
        return cur.fetchone() if returning else None


def bootstrap_db():
    """Create tables (idempotent) and the first admin account if none exists."""
    with open(os.path.join(BASE_DIR, "schema.sql"), encoding="utf-8") as fh:
        schema = fh.read()
    p = get_pool()
    conn = p.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_advisory_xact_lock(7342)")  # safe with several workers
            cur.execute(schema)
            cur.execute("SELECT COUNT(*) FROM admin_users")
            count = cur.fetchone()[0]
            user = (os.environ.get("ADMIN_USERNAME") or "admin").strip()
            pw = os.environ.get("ADMIN_PASSWORD") or ""
            if count == 0:
                if pw and pw != PLACEHOLDER_PASSWORD and len(pw) >= 8:
                    cur.execute("INSERT INTO admin_users (username, password_hash) VALUES (%s, %s)",
                                (user, generate_password_hash(pw)))
                    print(f"Created admin account '{user}'.")
                else:
                    print("No admin account yet. Set ADMIN_PASSWORD (8+ chars, not the example "
                          "value) in .env, or run:  flask --app app create-admin")
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        p.putconn(conn)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def clean(value, maxlen=255, multiline=False):
    value = (value or "").replace("\x00", "")
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    if not multiline:
        value = " ".join(value.split())
    value = value.strip()
    return value[:maxlen]


def valid_url(u):
    try:
        p = urlparse(u)
    except ValueError:
        return False
    return p.scheme in ("http", "https") and bool(p.netloc)


def to_int(value, default=None, lo=None, hi=None):
    try:
        n = int(str(value).strip())
    except (TypeError, ValueError):
        return default
    if lo is not None and n < lo:
        return default
    if hi is not None and n > hi:
        return default
    return n


YT_RE = re.compile(
    r"(?:youtube\.com/(?:watch\?(?:[^#]*&)?v=|embed/|shorts/|live/)|youtu\.be/)([A-Za-z0-9_-]{11})")


def youtube_id(url):
    m = YT_RE.search(url or "")
    return m.group(1) if m else None


def _host(url):
    try:
        return (urlparse(url).hostname or "").lower()
    except ValueError:
        return ""


def is_facebook(url):
    h = _host(url)
    return h in ("fb.watch", "fb.com") or h == "facebook.com" or h.endswith(".facebook.com")


def detect_platform(url):
    if not url:
        return "other"
    if youtube_id(url):
        return "youtube"
    if is_facebook(url):
        return "facebook"
    return "other"


def embed_url(post):
    url = post["video_url"] if post else ""
    if not url:
        return None
    yid = youtube_id(url)
    if yid:
        return f"https://www.youtube-nocookie.com/embed/{yid}?autoplay=1&rel=0&playsinline=1"
    if is_facebook(url):
        return ("https://www.facebook.com/plugins/video.php?href=" + quote(url, safe="")
                + "&show_text=false&autoplay=true")
    return None


def media_url(name):
    return url_for("media", filename=name) if name else None


def thumb_url(post):
    if post["thumb"]:
        return media_url(post["thumb"])
    yid = youtube_id(post["video_url"])
    if yid:
        return f"https://i.ytimg.com/vi/{yid}/hqdefault.jpg"
    return None


def save_image(file_storage, max_side=1600):
    """Validate + shrink an uploaded image, store as .webp. Returns filename or None."""
    if not file_storage or not file_storage.filename:
        return None
    try:
        img = Image.open(file_storage.stream)
        img = ImageOps.exif_transpose(img)
        img.thumbnail((max_side, max_side))
        img = img.convert("RGBA" if "A" in img.getbands() else "RGB")
        name = uuid.uuid4().hex + ".webp"
        img.save(os.path.join(UPLOAD_DIR, name), "WEBP", quality=85)
        return name
    except Exception:
        raise ValueError("That file is not a valid image. Please upload a JPG, PNG, WEBP or GIF.")


def delete_media(name):
    if not name:
        return
    path = os.path.join(UPLOAD_DIR, os.path.basename(name))
    try:
        os.remove(path)
    except OSError:
        pass


def make_slug(title, exclude_id=None):
    base = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:60]
    if not base:  # e.g. titles written fully in Bangla
        base = "post-" + secrets.token_hex(3)
    slug, i = base, 2
    while query("SELECT 1 FROM posts WHERE slug=%s AND id IS DISTINCT FROM %s",
                (slug, exclude_id), one=True):
        slug = f"{base}-{i}"
        i += 1
    return slug


def wants_json():
    return request.headers.get("X-Requested-With") == "fetch"


def is_admin():
    return bool(session.get("admin_id"))


def safe_next(default):
    n = request.form.get("next") or request.args.get("next") or ""
    if n.startswith("/") and not n.startswith("//") and "\\" not in n:
        return n
    return default


def ip_hash():
    raw = f"{app.config['SECRET_KEY']}|{request.remote_addr}"
    return hashlib.sha256(raw.encode()).hexdigest()


def admin_required(fn):
    @wraps(fn)
    def wrapper(*a, **kw):
        if not is_admin():
            return redirect(url_for("admin_login", next=request.path))
        return fn(*a, **kw)
    return wrapper


# ---------------------------------------------------------------------------
# Template filters / globals
# ---------------------------------------------------------------------------
@app.template_filter("dt")
def _dt(v):
    return v.astimezone(DISPLAY_TZ).strftime("%d %b %Y") if v else ""


@app.template_filter("dtfull")
def _dtfull(v):
    return v.astimezone(DISPLAY_TZ).strftime("%d %b %Y, %H:%M") if v else ""


@app.template_filter("ago")
def _ago(v):
    if not v:
        return ""
    s = int((datetime.now(timezone.utc) - v).total_seconds())
    if s < 60:
        return "just now"
    if s < 3600:
        return f"{s // 60} min ago"
    if s < 86400:
        return f"{s // 3600} h ago"
    if s < 86400 * 7:
        return f"{s // 86400} d ago"
    return _dt(v)


@app.template_filter("paragraphs")
def _paragraphs(text):
    parts = [p.strip() for p in re.split(r"\n\s*\n", text or "") if p.strip()]
    return Markup("".join(
        "<p>" + str(escape(p)).replace("\n", "<br>") + "</p>" for p in parts))


@app.template_filter("lines")
def _lines(text):
    return [ln.strip(" -•\t") for ln in (text or "").split("\n") if ln.strip(" -•\t")]


@app.template_filter("taglist")
def _taglist(text):
    return [t.strip() for t in (text or "").split(",") if t.strip()]


@app.template_filter("hue")
def _hue(text):
    return sum(ord(c) for c in (text or "x")) * 37 % 360


def csrf_token():
    if "_csrf" not in session:
        session["_csrf"] = secrets.token_urlsafe(32)
    return session["_csrf"]


@app.context_processor
def inject():
    try:
        profile = query("SELECT * FROM profile WHERE id=1", one=True)
    except Exception:
        profile = None
    if not profile:
        profile = {"site_title": "Portfolio", "name": "Portfolio", "headline": "", "bio": "",
                   "location": "", "email": "", "avatar": None, "cover": None}
    return dict(profile=profile, csrf_token=csrf_token, is_admin=is_admin,
                media_url=media_url, thumb_url=thumb_url, embed_url=embed_url,
                year=datetime.now(DISPLAY_TZ).year, asset_v=ASSET_V)


# ---------------------------------------------------------------------------
# Security
# ---------------------------------------------------------------------------
@app.before_request
def csrf_protect():
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        sent = request.form.get("csrf_token") or request.headers.get("X-CSRF-Token") or ""
        good = session.get("_csrf", "")
        if not good or not secrets.compare_digest(sent.encode(), good.encode()):
            abort(400, "Your session expired. Please refresh the page and try again.")


@app.after_request
def security_headers(resp):
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "SAMEORIGIN"
    resp.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    resp.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    resp.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "img-src 'self' data: https://i.ytimg.com https://img.youtube.com; "
        "frame-src https://www.youtube-nocookie.com https://www.youtube.com https://www.facebook.com; "
        "style-src 'self' 'unsafe-inline'; script-src 'self'; "
        "base-uri 'self'; form-action 'self'; object-src 'none'; frame-ancestors 'self'")
    if request.endpoint in ("admin_login",) or (request.endpoint or "").startswith("admin"):
        resp.headers["Cache-Control"] = "no-store"
    return resp


@app.errorhandler(400)
@app.errorhandler(404)
@app.errorhandler(413)
@app.errorhandler(429)
@app.errorhandler(500)
def handle_error(err):
    code = getattr(err, "code", 500) or 500
    msg = {404: "We couldn't find that page.",
           413: "That upload is too large (max 12 MB).",
           500: "Something went wrong on our side. Please try again."}.get(
        code, getattr(err, "description", "") or "Something went wrong.")
    if wants_json():
        return jsonify(ok=False, error=msg), code
    return render_template("error.html", code=code, message=msg), code


# ---------------------------------------------------------------------------
# Public pages
# ---------------------------------------------------------------------------
@app.route("/media/<path:filename>")
def media(filename):
    return send_from_directory(UPLOAD_DIR, filename, max_age=31536000)


@app.route("/")
def index():
    links = query("SELECT * FROM social_links ORDER BY sort_order, id")
    work = query("SELECT * FROM workplaces ORDER BY sort_order, start_year DESC NULLS LAST, id DESC")
    posts = query("""SELECT p.*, (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
                     FROM posts p WHERE p.published ORDER BY p.created_at DESC""")
    return render_template("index.html", links=links, work=work, posts=posts)


@app.route("/post/<slug>")
def post_view(slug):
    post = query("SELECT * FROM posts WHERE slug=%s", (slug,), one=True)
    if not post or (not post["published"] and not is_admin()):
        abort(404)
    comments = query("SELECT * FROM comments WHERE post_id=%s ORDER BY created_at DESC", (post["id"],))
    if request.args.get("partial"):
        return render_template("_post_body.html", post=post, comments=comments)
    return render_template("post.html", post=post, comments=comments)


@app.post("/post/<int:post_id>/comment")
def add_comment(post_id):
    post = query("SELECT id, slug FROM posts WHERE id=%s AND published", (post_id,), one=True)
    if not post:
        abort(404)
    back = url_for("post_view", slug=post["slug"]) + "#comments"

    def fail(msg, code=400):
        if wants_json():
            return jsonify(ok=False, error=msg), code
        flash(msg, "err")
        return redirect(back)

    if request.form.get("website"):  # honeypot filled in => bot
        return jsonify(ok=True, html="", count=0) if wants_json() else redirect(back)

    name = clean(request.form.get("name"), 60)
    body = clean(request.form.get("body"), 1000, multiline=True)
    if not name or not body:
        return fail("Please enter your name and a comment.")

    iph = ip_hash()
    recent = query("""SELECT COUNT(*) AS n FROM comments
                      WHERE ip_hash=%s AND created_at > now() - interval '10 minutes'""",
                   (iph,), one=True)["n"]
    if recent >= 5:
        return fail("You are commenting too fast. Please try again in a few minutes.", 429)

    row = execute("""INSERT INTO comments (post_id, name, body, ip_hash)
                     VALUES (%s, %s, %s, %s) RETURNING *""",
                  (post_id, name, body, iph), returning=True)
    count = query("SELECT COUNT(*) AS n FROM comments WHERE post_id=%s", (post_id,), one=True)["n"]
    if wants_json():
        return jsonify(ok=True, html=render_template("_comment.html", c=row), count=count)
    flash("Thanks! Your comment was posted.", "ok")
    return redirect(back)


# ---------------------------------------------------------------------------
# Admin: auth
# ---------------------------------------------------------------------------
_fails = {}  # ip -> (failed_count, locked_until)
_DUMMY_HASH = generate_password_hash("dummy-password-for-timing")


@app.route("/admin/login", methods=["GET", "POST"])
def admin_login():
    if is_admin():
        return redirect(url_for("admin_dashboard"))
    if request.method == "POST":
        ip = request.remote_addr or "?"
        n, until = _fails.get(ip, (0, 0))
        if until > time.time():
            flash("Too many attempts. Please wait a few minutes and try again.", "err")
            return render_template("admin/login.html"), 429
        username = clean(request.form.get("username"), 80)
        password = request.form.get("password") or ""
        user = query("SELECT * FROM admin_users WHERE username=%s", (username,), one=True)
        ok = check_password_hash(user["password_hash"] if user else _DUMMY_HASH, password) and user
        if ok:
            _fails.pop(ip, None)
            session.clear()
            session["admin_id"] = user["id"]
            session.permanent = True
            csrf_token()
            return redirect(safe_next(url_for("admin_dashboard")))
        n += 1
        _fails[ip] = (0, time.time() + 300) if n >= 5 else (n, 0)
        flash("Wrong username or password.", "err")
        return render_template("admin/login.html"), 401
    return render_template("admin/login.html")


@app.post("/admin/logout")
def admin_logout():
    session.clear()
    return redirect(url_for("index"))


@app.route("/admin/password", methods=["GET", "POST"])
@admin_required
def admin_password():
    if request.method == "POST":
        user = query("SELECT * FROM admin_users WHERE id=%s", (session["admin_id"],), one=True)
        cur_pw = request.form.get("current") or ""
        new_pw = request.form.get("new") or ""
        if not check_password_hash(user["password_hash"], cur_pw):
            flash("Your current password is wrong.", "err")
        elif len(new_pw) < 8:
            flash("The new password must be at least 8 characters.", "err")
        elif new_pw != (request.form.get("confirm") or ""):
            flash("The new passwords do not match.", "err")
        else:
            execute("UPDATE admin_users SET password_hash=%s WHERE id=%s",
                    (generate_password_hash(new_pw), user["id"]))
            flash("Password changed.", "ok")
            return redirect(url_for("admin_dashboard"))
    return render_template("admin/password.html")


# ---------------------------------------------------------------------------
# Admin: dashboard
# ---------------------------------------------------------------------------
@app.route("/admin")
@admin_required
def admin_dashboard():
    stats = query("""SELECT (SELECT COUNT(*) FROM posts) AS posts,
                            (SELECT COUNT(*) FROM comments) AS comments,
                            (SELECT COUNT(*) FROM social_links) AS links,
                            (SELECT COUNT(*) FROM workplaces) AS work""", one=True)
    latest = query("""SELECT c.*, p.title AS post_title, p.slug
                      FROM comments c JOIN posts p ON p.id = c.post_id
                      ORDER BY c.created_at DESC LIMIT 6""")
    return render_template("admin/dashboard.html", stats=stats, latest=latest)


# ---------------------------------------------------------------------------
# Admin: profile
# ---------------------------------------------------------------------------
@app.route("/admin/profile", methods=["GET", "POST"])
@admin_required
def admin_profile():
    if request.method == "POST":
        f = request.form
        cur = query("SELECT * FROM profile WHERE id=1", one=True)
        email = clean(f.get("email"), 120)
        if email and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
            flash("That email address does not look right.", "err")
            return render_template("admin/profile.html", form=f)
        try:
            avatar = save_image(request.files.get("avatar"), 800)
            cover = save_image(request.files.get("cover"), 1800)
        except ValueError as e:
            flash(str(e), "err")
            return render_template("admin/profile.html", form=f)
        new_avatar, new_cover = cur["avatar"], cur["cover"]
        if avatar or f.get("remove_avatar"):
            delete_media(cur["avatar"])
            new_avatar = avatar
        if cover or f.get("remove_cover"):
            delete_media(cur["cover"])
            new_cover = cover
        execute("""UPDATE profile SET site_title=%s, name=%s, headline=%s, bio=%s, location=%s,
                   email=%s, avatar=%s, cover=%s, updated_at=now() WHERE id=1""",
                (clean(f.get("site_title"), 80) or "Portfolio", clean(f.get("name"), 80) or "Your Name",
                 clean(f.get("headline"), 160), clean(f.get("bio"), 4000, True),
                 clean(f.get("location"), 80), email, new_avatar, new_cover))
        flash("Profile saved.", "ok")
        return redirect(url_for("admin_profile"))
    return render_template("admin/profile.html", form=None)


# ---------------------------------------------------------------------------
# Admin: social links
# ---------------------------------------------------------------------------
PLATFORMS = [("youtube", "YouTube"), ("facebook", "Facebook"), ("instagram", "Instagram"),
             ("tiktok", "TikTok"), ("x", "X / Twitter"), ("linkedin", "LinkedIn"),
             ("whatsapp", "WhatsApp"), ("email", "Email"), ("website", "Website"),
             ("other", "Other")]
PLATFORM_KEYS = {k for k, _ in PLATFORMS}
app.jinja_env.globals["PLATFORMS"] = PLATFORMS


@app.route("/admin/links")
@admin_required
def admin_links():
    return render_template("admin/links.html",
                           links=query("SELECT * FROM social_links ORDER BY sort_order, id"))


@app.route("/admin/links/new", methods=["GET", "POST"])
@app.route("/admin/links/<int:link_id>", methods=["GET", "POST"])
@admin_required
def admin_link_form(link_id=None):
    item = query("SELECT * FROM social_links WHERE id=%s", (link_id,), one=True) if link_id else None
    if link_id and not item:
        abort(404)
    if request.method == "POST":
        f = request.form
        platform = f.get("platform") if f.get("platform") in PLATFORM_KEYS else "other"
        label = clean(f.get("label"), 80)
        url = clean(f.get("url"), 500)
        if platform == "email" and "@" in url and not url.lower().startswith("mailto:"):
            url = "mailto:" + url
        if not label:
            flash("Please enter a name for this link.", "err")
        elif not (valid_url(url) or url.lower().startswith("mailto:")):
            flash("The link must start with https:// (or be an email address).", "err")
        else:
            desc = clean(f.get("description"), 200)
            if item:
                order = to_int(f.get("sort_order"), item["sort_order"])
                execute("""UPDATE social_links SET platform=%s, label=%s, url=%s, description=%s,
                           sort_order=%s WHERE id=%s""", (platform, label, url, desc, order, link_id))
            else:
                nxt = query("SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM social_links", one=True)["n"]
                execute("""INSERT INTO social_links (platform, label, url, description, sort_order)
                          VALUES (%s,%s,%s,%s,%s)""",
                        (platform, label, url, desc, to_int(f.get("sort_order"), nxt)))
            flash("Link saved.", "ok")
            return redirect(url_for("admin_links"))
        item = dict(f, id=link_id)
    return render_template("admin/link_form.html", item=item)


@app.post("/admin/links/<int:link_id>/delete")
@admin_required
def admin_link_delete(link_id):
    execute("DELETE FROM social_links WHERE id=%s", (link_id,))
    flash("Link deleted.", "ok")
    return redirect(url_for("admin_links"))


# ---------------------------------------------------------------------------
# Admin: workplaces
# ---------------------------------------------------------------------------
@app.route("/admin/work")
@admin_required
def admin_work():
    return render_template("admin/work.html", items=query(
        "SELECT * FROM workplaces ORDER BY sort_order, start_year DESC NULLS LAST, id DESC"))


@app.route("/admin/work/new", methods=["GET", "POST"])
@app.route("/admin/work/<int:work_id>", methods=["GET", "POST"])
@admin_required
def admin_work_form(work_id=None):
    item = query("SELECT * FROM workplaces WHERE id=%s", (work_id,), one=True) if work_id else None
    if work_id and not item:
        abort(404)
    if request.method == "POST":
        f = request.form
        role, org = clean(f.get("role"), 120), clean(f.get("org"), 120)
        url = clean(f.get("url"), 500)
        if not role or not org:
            flash("Please enter the job title and the place he works.", "err")
        elif url and not valid_url(url):
            flash("The website must start with https://", "err")
        else:
            try:
                logo = save_image(request.files.get("logo"), 600)
            except ValueError as e:
                flash(str(e), "err")
                return render_template("admin/work_form.html", item=dict(f, id=work_id, logo=item and item["logo"]))
            start = to_int(f.get("start_year"), None, 1950, 2100)
            end = to_int(f.get("end_year"), None, 1950, 2100)
            desc = clean(f.get("description"), 2000, True)
            if item:
                new_logo = item["logo"]
                if logo or f.get("remove_logo"):
                    delete_media(item["logo"])
                    new_logo = logo
                execute("""UPDATE workplaces SET role=%s, org=%s, url=%s, description=%s, start_year=%s,
                           end_year=%s, logo=%s, sort_order=%s WHERE id=%s""",
                        (role, org, url, desc, start, end, new_logo,
                         to_int(f.get("sort_order"), item["sort_order"]), work_id))
            else:
                nxt = query("SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM workplaces", one=True)["n"]
                execute("""INSERT INTO workplaces (role, org, url, description, start_year, end_year, logo, sort_order)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
                        (role, org, url, desc, start, end, logo, to_int(f.get("sort_order"), nxt)))
            flash("Work details saved.", "ok")
            return redirect(url_for("admin_work"))
        item = dict(f, id=work_id, logo=item and item["logo"])
    return render_template("admin/work_form.html", item=item)


@app.post("/admin/work/<int:work_id>/delete")
@admin_required
def admin_work_delete(work_id):
    row = query("SELECT logo FROM workplaces WHERE id=%s", (work_id,), one=True)
    if row:
        delete_media(row["logo"])
        execute("DELETE FROM workplaces WHERE id=%s", (work_id,))
    flash("Deleted.", "ok")
    return redirect(url_for("admin_work"))


# ---------------------------------------------------------------------------
# Admin: posts (videos / articles)
# ---------------------------------------------------------------------------
@app.route("/admin/posts")
@admin_required
def admin_posts():
    items = query("""SELECT p.*, (SELECT COUNT(*) FROM comments c WHERE c.post_id=p.id) AS comment_count
                     FROM posts p ORDER BY p.created_at DESC""")
    return render_template("admin/posts.html", items=items)


@app.route("/admin/posts/new", methods=["GET", "POST"])
@app.route("/admin/posts/<int:post_id>", methods=["GET", "POST"])
@admin_required
def admin_post_form(post_id=None):
    item = query("SELECT * FROM posts WHERE id=%s", (post_id,), one=True) if post_id else None
    if post_id and not item:
        abort(404)
    if request.method == "POST":
        f = request.form
        title = clean(f.get("title"), 140)
        video_url = clean(f.get("video_url"), 500)
        error = None
        if not title:
            error = "Please enter a title."
        elif video_url and not valid_url(video_url):
            error = "The video link must start with https://"
        if not error:
            try:
                thumb = save_image(request.files.get("thumb"), 1280)
            except ValueError as e:
                error, thumb = str(e), None
        if error:
            flash(error, "err")
            item = dict(f, id=post_id, thumb=item and item["thumb"],
                        published=bool(f.get("published")))
        else:
            kind = "video" if video_url else "article"
            platform = detect_platform(video_url)
            summary = clean(f.get("summary"), 400, True)
            desc = clean(f.get("description"), 20000, True)
            points = clean(f.get("key_points"), 3000, True)
            tags = clean(f.get("tags"), 200)
            published = bool(f.get("published"))
            if item:
                new_thumb = item["thumb"]
                if thumb or f.get("remove_thumb"):
                    delete_media(item["thumb"])
                    new_thumb = thumb
                execute("""UPDATE posts SET title=%s, kind=%s, platform=%s, video_url=%s, thumb=%s,
                           summary=%s, description=%s, key_points=%s, tags=%s, published=%s,
                           updated_at=now() WHERE id=%s""",
                        (title, kind, platform, video_url, new_thumb, summary, desc, points,
                         tags, published, post_id))
            else:
                execute("""INSERT INTO posts (slug, title, kind, platform, video_url, thumb, summary,
                           description, key_points, tags, published)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                        (make_slug(title), title, kind, platform, video_url, thumb, summary, desc,
                         points, tags, published))
            flash("Saved." if item else "Published! It is now on your site." if published
                  else "Saved as a draft.", "ok")
            return redirect(url_for("admin_posts"))
    return render_template("admin/post_form.html", item=item)


@app.post("/admin/posts/<int:post_id>/delete")
@admin_required
def admin_post_delete(post_id):
    row = query("SELECT thumb FROM posts WHERE id=%s", (post_id,), one=True)
    if row:
        delete_media(row["thumb"])
        execute("DELETE FROM posts WHERE id=%s", (post_id,))  # comments cascade
    flash("Deleted.", "ok")
    return redirect(url_for("admin_posts"))


@app.post("/admin/posts/<int:post_id>/toggle")
@admin_required
def admin_post_toggle(post_id):
    execute("UPDATE posts SET published = NOT published WHERE id=%s", (post_id,))
    return redirect(url_for("admin_posts"))


# ---------------------------------------------------------------------------
# Admin: comments
# ---------------------------------------------------------------------------
@app.route("/admin/comments")
@admin_required
def admin_comments():
    post_id = to_int(request.args.get("post"))
    base = """SELECT c.*, p.title AS post_title, p.slug FROM comments c
              JOIN posts p ON p.id = c.post_id"""
    if post_id:
        items = query(base + " WHERE c.post_id=%s ORDER BY c.created_at DESC LIMIT 300", (post_id,))
    else:
        items = query(base + " ORDER BY c.created_at DESC LIMIT 300")
    posts = query("SELECT id, title FROM posts ORDER BY created_at DESC")
    return render_template("admin/comments.html", items=items, posts=posts, post_id=post_id)


@app.post("/admin/comments/<int:comment_id>/delete")
@admin_required
def admin_delete_comment(comment_id):
    row = execute("DELETE FROM comments WHERE id=%s RETURNING post_id", (comment_id,), returning=True)
    if wants_json():
        count = 0
        if row:
            count = query("SELECT COUNT(*) AS n FROM comments WHERE post_id=%s",
                          (row["post_id"],), one=True)["n"]
        return jsonify(ok=True, count=count)
    flash("Comment deleted.", "ok")
    return redirect(safe_next(url_for("admin_comments")))


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
@app.cli.command("init-db")
def init_db_cmd():
    """Create the database tables."""
    bootstrap_db()
    click.echo("Database is ready.")


@app.cli.command("create-admin")
@click.option("--username", prompt=True)
@click.option("--password", prompt=True, hide_input=True, confirmation_prompt=True)
def create_admin_cmd(username, password):
    """Create an admin user, or reset the password of an existing one."""
    if len(password) < 8:
        raise click.ClickException("Password must be at least 8 characters.")
    execute("""INSERT INTO admin_users (username, password_hash) VALUES (%s, %s)
               ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash""",
            (username.strip(), generate_password_hash(password)))
    click.echo(f"Admin '{username}' saved.")


if os.environ.get("AUTO_INIT", "1") == "1" and os.environ.get("DATABASE_URL"):
    try:
        bootstrap_db()
    except Exception as exc:  # keep the app importable so errors are visible
        print(f"WARNING: could not prepare the database: {exc}")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)),
            debug=os.environ.get("FLASK_DEBUG") == "1")
