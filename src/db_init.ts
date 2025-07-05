import { Database } from "bun:sqlite";

const db = new Database("db.sqlite");

// Create tables
db.run(`
    CREATE TABLE IF NOT EXISTS tokens (
        service TEXT PRIMARY KEY,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        expires_at INTEGER,
        auth_type TEXT DEFAULT 'oauth' NOT NULL,
        value TEXT
    );
`);

db.run(`
    CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
`);

db.run(`
    CREATE TABLE IF NOT EXISTS migrated_playlists (
        spotify_playlist_id TEXT PRIMARY KEY,
        youtube_playlist_id TEXT UNIQUE,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        last_updated INTEGER NOT NULL
    );
`);

db.run(`
    CREATE TABLE IF NOT EXISTS migrated_tracks (
        spotify_track_id TEXT PRIMARY KEY,
        spotify_playlist_id TEXT NOT NULL,
        youtube_video_id TEXT UNIQUE,
        status TEXT NOT NULL,
        last_updated INTEGER NOT NULL,
        FOREIGN KEY (spotify_playlist_id) REFERENCES migrated_playlists(spotify_playlist_id)
    );
`);

// Update existing tokens to have 'oauth' auth_type if it's null
db.run(`
    UPDATE tokens SET auth_type = 'oauth' WHERE auth_type IS NULL;
`);

// Insert default config
const defaultConfig = {
    'match_threshold': '0.5'
};

const stmt = db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)");

for (const [key, value] of Object.entries(defaultConfig)) {
    stmt.run(key, value);
}

console.log("Database initialized successfully.");