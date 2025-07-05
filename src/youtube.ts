
import { Elysia } from "elysia";
import { nanoid } from "nanoid";
import { db } from "./db";

const youtubeClientId = process.env.YOUTUBE_CLIENT_ID;
const youtubeClientSecret = process.env.YOUTUBE_CLIENT_SECRET;
const youtubeRedirectUri = process.env.YOUTUBE_REDIRECT_URI;

export const youtubeRoutes = new Elysia({ prefix: "/youtube" })
    .get("/auth", () => {
        if (!youtubeClientId) {
            return new Response("YouTube client ID not set", { status: 500 });
        }
        const state = nanoid();
        const scope = 'https://www.googleapis.com/auth/youtube';

        const queryParams = new URLSearchParams({
            response_type: 'code',
            client_id: youtubeClientId,
            scope: scope,
            redirect_uri: youtubeRedirectUri || '',
            state: state,
            access_type: 'offline' // To get a refresh token
        });

        return { url: `https://accounts.google.com/o/oauth2/v2/auth?${queryParams.toString()}` };
    })
    .get("/callback", async ({ query }) => {
        const code = query.code as string;
        const state = query.state as string;

        if (state === null) {
            return new Response(null, {
                status: 302,
                headers: {
                    Location: `http://localhost:5173/?service=youtube&status=error&message=State%20mismatch`
                }
            });
        }

        if (!youtubeClientId || !youtubeClientSecret || !youtubeRedirectUri) {
            return new Response(null, {
                status: 302,
                headers: {
                    Location: `http://localhost:5173/?service=youtube&status=error&message=YouTube%20credentials%20not%20set`
                }
            });
        }

        const authOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                code: code,
                client_id: youtubeClientId,
                client_secret: youtubeClientSecret,
                redirect_uri: youtubeRedirectUri,
                grant_type: 'authorization_code'
            })
        };

        const response = await fetch('https://oauth2.googleapis.com/token', authOptions);
        const body = await response.json();

        if (!response.ok) {
            return new Response(null, {
                status: 302,
                headers: {
                    Location: `http://localhost:5173/?service=youtube&status=error&message=${encodeURIComponent(body.error_description || body.error)}`
                }
            });
        }

        const expiresAt = Date.now() + (body.expires_in * 1000);
        db.run(
            "INSERT OR REPLACE INTO tokens (service, access_token, refresh_token, expires_at, auth_type) VALUES (?, ?, ?, ?, ?)",
            "youtube",
            body.access_token,
            body.refresh_token,
            expiresAt,
            "oauth"
        );

        return new Response(null, {
            status: 302,
            headers: {
                Location: `http://localhost:5173/?service=youtube&status=success`
            }
        });
    })
    .get("/refresh", async () => {
        const youtubeToken: any = db.query("SELECT refresh_token, auth_type FROM tokens WHERE service = 'youtube'").get();

        if (!youtubeToken || youtubeToken.auth_type === 'browser' || !youtubeToken.refresh_token) {
            return new Response("No YouTube OAuth refresh token found or using browser auth.", { status: 400 });
        }

        const authOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: youtubeClientId,
                client_secret: youtubeClientSecret,
                refresh_token: youtubeToken.refresh_token,
                grant_type: 'refresh_token'
            })
        };

        const response = await fetch('https://oauth2.googleapis.com/token', authOptions);
        const body = await response.json();

        if (!response.ok) {
            return new Response(JSON.stringify(body), { status: response.status });
        }

        const expiresAt = Date.now() + (body.expires_in * 1000);
        db.run(
            "UPDATE tokens SET access_token = ?, expires_at = ? WHERE service = 'youtube'",
            body.access_token,
            expiresAt
        );

        return { message: "YouTube token refreshed successfully" };
    })
    .post("/auth/browser", async ({ body }) => {
        const { headers } = body as { headers: string };
        if (!headers) {
            console.error("YouTube browser auth error: No headers provided.");
            return new Response("Request body must be a JSON object with a 'headers' property.", { status: 400 });
        }

        try {
            const parsedHeaders = JSON.parse(headers);
            const cookie = parsedHeaders.cookie;

            if (!cookie) {
                console.error("YouTube browser auth error: No cookie found in headers.", { receivedKeys: Object.keys(parsedHeaders) });
                return new Response("The 'cookie' property is missing from the provided headers.", { status: 400 });
            }

            // Spoof the rest of the headers
            // const spoofedHeaders = {
            //     "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
            //     "accept-language": "en-US,en;q=0.9",
            //     "accept-encoding": "gzip, deflate, br",
            //     "accept": "*/*",
            //     "referer": "https://music.youtube.com/",
            //     "origin": "https://music.youtube.com",
            //     "dnt": "1",
            //     "sec-fetch-dest": "empty",
            //     "sec-fetch-mode": "cors",
            //     "sec-fetch-site": "same-origin",
            //     "cookie": cookie,
            // };
			const spoofedHeaders = parsedHeaders;

            db.run(
                "INSERT OR REPLACE INTO tokens (service, access_token, auth_type, value) VALUES (?, ?, ?, ?)",
                "youtube",
                JSON.stringify(spoofedHeaders),
                "browser",
                headers // Store the original headers for debugging
            );

            return { message: "YouTube browser authentication successful." };
        } catch (error) {
            console.error("YouTube browser auth error: Invalid JSON in headers.", { error: error, receivedHeaders: headers });
            return new Response("The 'headers' property must be a valid JSON string.", { status: 400 });
        }
    })
    .post("/set-cookie", async ({ body }) => {
        const { cookie } = body as { cookie: string };
        if (!cookie) {
            return new Response("Cookie not provided", { status: 400 });
        }
        db.run(
            "INSERT OR REPLACE INTO tokens (service, access_token, auth_type) VALUES (?, ?, ?)",
            "youtube",
            cookie,
            "browser"
        );
        return { message: "YouTube cookie set successfully" };
    })
    .get("/check-auth", async () => {
        const youtubeToken: any = db.query("SELECT access_token, auth_type FROM tokens WHERE service = 'youtube'").get();
        if (!youtubeToken || !youtubeToken.access_token) {
            return { isAuthenticated: false };
        }
        return { isAuthenticated: true, authType: youtubeToken.auth_type };
    });
