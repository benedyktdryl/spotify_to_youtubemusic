

import { Elysia } from "elysia";
import { spotifyRoutes } from "./spotify";
import { youtubeRoutes } from "./youtube";
import { db } from "./db";
import { main as migratePlaylist } from "./migration";
import { cors } from "@elysiajs/cors";

const app = new Elysia()
    .use(cors())
    .get("/status", () => {
        const spotifyToken = db.query("SELECT access_token FROM tokens WHERE service = 'spotify'").get();
        const youtubeToken: any = db.query("SELECT access_token, auth_type FROM tokens WHERE service = 'youtube'").get();

        let youtubeAuthenticated = false;
        let youtubeAuthType = 'disconnected';
        if (youtubeToken) {
            if (youtubeToken.auth_type === 'oauth') {
                youtubeAuthenticated = !!youtubeToken.access_token; // Check if OAuth token exists
                if (youtubeAuthenticated) {
                    youtubeAuthType = 'oauth';
                }
            } else if (youtubeToken.auth_type === 'browser') {
                try {
                    JSON.parse(youtubeToken.access_token); // Check if browser headers are valid JSON
                    youtubeAuthenticated = true;
                    youtubeAuthType = 'browser';
                } catch (e) {
                    youtubeAuthenticated = false;
                }
            }
        }

        return {
            spotifyAuthenticated: !!spotifyToken,
            youtubeAuthenticated: youtubeAuthenticated,
            youtubeAuthType: youtubeAuthType,
        };
    })
    .get("/spotify/playlists", async () => {
        const spotifyToken: any = db.query("SELECT access_token FROM tokens WHERE service = 'spotify'").get();

        if (!spotifyToken) {
            return new Response("Spotify not authenticated", { status: 401 });
        }

        const response = await fetch("https://api.spotify.com/v1/me/playlists", {
            headers: {
                "Authorization": `Bearer ${spotifyToken.access_token}`
            }
        });

        if (!response.ok) {
            return new Response(JSON.stringify(await response.json()), { status: response.status });
        }

        const data = await response.json();
        const playlistsWithStatus = data.items.map((playlist: any) => {
            const migratedPlaylist = db.query("SELECT status, last_updated FROM migrated_playlists WHERE spotify_playlist_id = ?").get(playlist.id);
            return {
                id: playlist.id,
                name: playlist.name,
                trackCount: playlist.tracks.total,
                isPublic: playlist.public,
                lastModified: migratedPlaylist ? new Date(migratedPlaylist.last_updated).toISOString() : new Date().toISOString(), // Use migration date if available
                status: migratedPlaylist ? migratedPlaylist.status : 'not_started',
                description: playlist.description,
                thumbnailUrl: playlist.images.length > 0 ? playlist.images[0].url : null, // Get first image URL
            };
        });
        return playlistsWithStatus;
    })
    .get("/youtube/playlists", async () => {
        const youtubeToken: any = db.query("SELECT access_token, auth_type FROM tokens WHERE service = 'youtube'").get();

        if (!youtubeToken) {
            return new Response("YouTube not authenticated", { status: 401 });
        }

        let headers = {};
        if (youtubeToken.auth_type === 'oauth') {
            headers = { "Authorization": `Bearer ${youtubeToken.access_token}` };
        } else if (youtubeToken.auth_type === 'browser') {
            headers = JSON.parse(youtubeToken.access_token);
        }

        const response = await fetch("https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true", {
            headers: headers
        });

        if (!response.ok) {
            return new Response(JSON.stringify(await response.json()), { status: response.status });
        }

        const data = await response.json();
        return data.items.map((playlist: any) => ({
            id: playlist.id,
            name: playlist.snippet.title,
        }));
    })
    .post("/sync-playlists", async () => {
        const spotifyPlaylistsResponse = await app.handle(new Request("http://localhost:3000/spotify/playlists"));
        const youtubePlaylistsResponse = await app.handle(new Request("http://localhost:3000/youtube/playlists"));

        if (!spotifyPlaylistsResponse.ok || !youtubePlaylistsResponse.ok) {
            return new Response("Failed to fetch playlists from one or both services.", { status: 500 });
        }

        const spotifyPlaylists = await spotifyPlaylistsResponse.json();
        const youtubePlaylists = await youtubePlaylistsResponse.json();

        const youtubePlaylistMap = new Map(youtubePlaylists.map((p: any) => [p.name, p.id]));

        for (const spotifyPlaylist of spotifyPlaylists) {
            if (youtubePlaylistMap.has(spotifyPlaylist.name)) {
                const youtubePlaylistId = youtubePlaylistMap.get(spotifyPlaylist.name);
                db.run(
                    "INSERT OR REPLACE INTO migrated_playlists (spotify_playlist_id, youtube_playlist_id, name, status, last_updated) VALUES (?, ?, ?, ?, ?)",
                    spotifyPlaylist.id,
                    youtubePlaylistId,
                    spotifyPlaylist.name,
                    'migrated',
                    Date.now()
                );
            }
        }

        return { message: "Playlists synced successfully." };
    })
    .get("/migration/status", () => {
        const playlists = db.query("SELECT spotify_playlist_id, status FROM migrated_playlists").all();
        const statusMap: { [key: string]: string } = {};
        playlists.forEach((p: any) => {
            statusMap[p.spotify_playlist_id] = p.status;
        });
        return statusMap;
    })
    .get("/config/match_threshold", () => {
        const config: any = db.query("SELECT value FROM config WHERE key = 'match_threshold'").get();
        return { match_threshold: parseFloat(config.value) };
    })
    .post("/config/match_threshold", ({ body }) => {
        const { value } = body as { value: number };
        if (typeof value !== 'number' || value < 0 || value > 1) {
            return new Response("Invalid match_threshold value. Must be a number between 0 and 1.", { status: 400 });
        }
        db.run("UPDATE config SET value = ? WHERE key = 'match_threshold'", value.toString());
        return { message: "Match threshold updated successfully." };
    })
    .get("/migrate/:playlistId", async ({ params, set }) => {
        const { playlistId } = params;

        set.headers['Content-Type'] = 'text/event-stream';
        set.headers['Cache-Control'] = 'no-cache';
        set.headers['Connection'] = 'keep-alive';

        const encoder = new TextEncoder();
        const customReadable = new ReadableStream({
            async start(controller) {
                const sendEvent = (data: any) => {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
                };

                try {
                    await migratePlaylist(playlistId, sendEvent);
                    sendEvent({ type: "complete", message: "Migration finished." });
                } catch (error: any) {
                    console.error("Migration error:", error);
                    sendEvent({ type: "error", message: error.message || "Migration failed." });
                } finally {
                    controller.close();
                }
            },
        });

        return new Response(customReadable);
    })
    .delete("/migration/:playlistId", ({ params }) => {
        const { playlistId } = params;
        db.run("DELETE FROM migrated_tracks WHERE spotify_playlist_id = ?", playlistId);
        db.run("DELETE FROM migrated_playlists WHERE spotify_playlist_id = ?", playlistId);
        return { message: `Migration data for playlist ${playlistId} cleared.` };
    })
    .delete("/tokens/:service", ({ params }) => {
        const { service } = params;
        if (service !== 'spotify' && service !== 'youtube') {
            return new Response("Invalid service specified.", { status: 400 });
        }
        db.run("DELETE FROM tokens WHERE service = ?", service);
        return { message: `${service} token cleared.` };
    })
    .post("/youtube/auth/browser", ({ body }) => {
        const { headers } = body as { headers: string };
        try {
            JSON.parse(headers); // Validate if it's valid JSON
            db.run("INSERT OR REPLACE INTO tokens (service, access_token, auth_type) VALUES (?, ?, ?)",
                "youtube",
                headers,
                "browser"
            );
            return { message: "YouTube browser token stored successfully." };
        } catch (error) {
            return new Response("Invalid JSON headers provided.", { status: 400 });
        }
    })
    .get("/debug/info", () => {
        const spotifyToken = db.query("SELECT access_token FROM tokens WHERE service = 'spotify'").get();
        const youtubeToken = db.query("SELECT access_token, auth_type FROM tokens WHERE service = 'youtube'").get();
        const matchThreshold = db.query("SELECT value FROM config WHERE key = 'match_threshold'").get();

        let youtubeAuthType = 'disconnected';
        if (youtubeToken) {
            youtubeAuthType = youtubeToken.auth_type;
        }

        return {
            apiStatus: {
                spotify: spotifyToken ? 'connected' : 'disconnected',
                youtube: youtubeToken ? 'connected' : 'disconnected',
            },
            systemInfo: {
                userAgent: "Bun/Elysia Backend", // This is a backend, so userAgent is not directly applicable
                timestamp: new Date().toISOString(),
                sessionId: "N/A", // Session ID is frontend concept
            },
            permissions: {
                spotifyScopes: ['playlist-read-private', 'playlist-read-collaborative'], // Hardcoded for now
                youtubeScopes: ['https://www.googleapis.com/auth/youtube'], // Hardcoded for now
            },
            config: {
                matchThreshold: parseFloat(matchThreshold.value),
            },
            youtubeAuthType: youtubeAuthType,
        };
    })
    .use(spotifyRoutes)
    .use(youtubeRoutes)
    .listen(3000);

console.log(
    `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
