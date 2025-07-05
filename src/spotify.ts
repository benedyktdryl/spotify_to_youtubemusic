import { Elysia } from "elysia";
import { nanoid } from "nanoid";
import { db } from "./db";

const spotifyClientId = process.env.SPOTIFY_CLIENT_ID;
const spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const spotifyRedirectUri = process.env.SPOTIFY_REDIRECT_URI;

export const spotifyRoutes = new Elysia({ prefix: "/spotify" })
    .get("/auth", () => {
        if (!spotifyClientId) {
            return new Response("Spotify client ID not set", { status: 500 });
        }
        const state = nanoid();
        const scope = 'playlist-read-private playlist-read-collaborative';

        const queryParams = new URLSearchParams({
            response_type: 'code',
            client_id: spotifyClientId,
            scope: scope,
            redirect_uri: spotifyRedirectUri || '',
            state: state
        });

        return { url: `https://accounts.spotify.com/authorize?${queryParams.toString()}` };
    })
    .get("/callback", async ({ query }) => {
        const code = query.code as string;
        const state = query.state as string;

        if (state === null) {
            return new Response(null, {
                status: 302,
                headers: {
                    Location: `http://localhost:5173/?service=spotify&status=error&message=State%20mismatch`
                }
            });
        }

        if (!spotifyClientId || !spotifyClientSecret || !spotifyRedirectUri) {
            return new Response(null, {
                status: 302,
                headers: {
                    Location: `http://localhost:5173/?service=spotify&status=error&message=Spotify%20credentials%20not%20set`
                }
            });
        }

        const authOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + (Buffer.from(spotifyClientId + ':' + spotifyClientSecret).toString('base64'))
            },
            body: new URLSearchParams({
                code: code,
                redirect_uri: spotifyRedirectUri,
                grant_type: 'authorization_code'
            })
        };

        const response = await fetch('https://accounts.spotify.com/api/token', authOptions);
        const body = await response.json();

        if (!response.ok) {
            return new Response(null, {
                status: 302,
                headers: {
                    Location: `http://localhost:5173/?service=spotify&status=error&message=${encodeURIComponent(body.error_description || body.error)}`
                }
            });
        }

        const expiresAt = Date.now() + (body.expires_in * 1000);
        db.run(
            "INSERT OR REPLACE INTO tokens (service, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?)",
            "spotify",
            body.access_token,
            body.refresh_token,
            expiresAt
        );

        return new Response(null, {
            status: 302,
            headers: {
                Location: `http://localhost:5173/?service=spotify&status=success`
            }
        });
    })
    .get("/refresh", async () => {
        const spotifyToken: any = db.query("SELECT refresh_token FROM tokens WHERE service = 'spotify'").get();

        if (!spotifyToken || !spotifyToken.refresh_token) {
            return new Response("No Spotify refresh token found", { status: 400 });
        }

        const authOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + (Buffer.from(spotifyClientId + ':' + spotifyClientSecret).toString('base64'))
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: spotifyToken.refresh_token
            })
        };

        const response = await fetch('https://accounts.spotify.com/api/token', authOptions);
        const body = await response.json();

        if (!response.ok) {
            return new Response(JSON.stringify(body), { status: response.status });
        }

        const expiresAt = Date.now() + (body.expires_in * 1000);
        db.run(
            "UPDATE tokens SET access_token = ?, expires_at = ? WHERE service = 'spotify'",
            body.access_token,
            expiresAt
        );

        return { message: "Spotify token refreshed successfully" };
    });