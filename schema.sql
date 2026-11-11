-- PostgreSQL schema. Safe to run more than once.

CREATE TABLE IF NOT EXISTS admin_users (
    id            SERIAL PRIMARY KEY,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One single row (id = 1): the main profile shown on the home page
CREATE TABLE IF NOT EXISTS profile (
    id         INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    site_title TEXT NOT NULL DEFAULT 'Creator Portfolio',
    name       TEXT NOT NULL DEFAULT 'Your Name',
    headline   TEXT NOT NULL DEFAULT '',
    bio        TEXT NOT NULL DEFAULT '',
    location   TEXT NOT NULL DEFAULT '',
    email      TEXT NOT NULL DEFAULT '',
    avatar     TEXT,
    cover      TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO profile (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- YouTube / Facebook / etc.
CREATE TABLE IF NOT EXISTS social_links (
    id          SERIAL PRIMARY KEY,
    platform    TEXT NOT NULL DEFAULT 'other',
    label       TEXT NOT NULL,
    url         TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    sort_order  INT  NOT NULL DEFAULT 0
);

-- Places he works / has worked
CREATE TABLE IF NOT EXISTS workplaces (
    id          SERIAL PRIMARY KEY,
    role        TEXT NOT NULL,
    org         TEXT NOT NULL,
    url         TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    start_year  INT,
    end_year    INT,
    logo        TEXT,
    sort_order  INT NOT NULL DEFAULT 0
);

-- Videos and written articles
CREATE TABLE IF NOT EXISTS posts (
    id          SERIAL PRIMARY KEY,
    slug        TEXT UNIQUE NOT NULL,
    title       TEXT NOT NULL,
    kind        TEXT NOT NULL DEFAULT 'video' CHECK (kind IN ('video', 'article')),
    platform    TEXT NOT NULL DEFAULT 'other',
    video_url   TEXT NOT NULL DEFAULT '',
    thumb       TEXT,
    summary     TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    key_points  TEXT NOT NULL DEFAULT '',
    tags        TEXT NOT NULL DEFAULT '',
    published   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS posts_created_idx ON posts (created_at DESC);

CREATE TABLE IF NOT EXISTS comments (
    id         SERIAL PRIMARY KEY,
    post_id    INT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    body       TEXT NOT NULL,
    ip_hash    TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comments_post_idx ON comments (post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS comments_ip_idx ON comments (ip_hash, created_at DESC);

-- Uploaded video file (stored in the uploads folder). Safe to run more than once.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS video_file TEXT;

-- The "Shadhin" welcome bot shown on the home page (single row, id = 1)
CREATE TABLE IF NOT EXISTS bot_settings (
    id         INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    enabled    BOOLEAN NOT NULL DEFAULT TRUE,
    name       TEXT NOT NULL DEFAULT 'Shadhin',
    messages   TEXT NOT NULL DEFAULT E'Hi! 👋 My name is Izaz Ahmad. Please see my work.\nEvery video has a short written summary, so you can read it instead of watching.\nYou can leave a comment under any video. I read them all.\nFollow me on YouTube and Facebook so you do not miss new videos.',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO bot_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
