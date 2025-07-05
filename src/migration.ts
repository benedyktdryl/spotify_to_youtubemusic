

import { compareTwoStrings } from "string-similarity";
import { db } from "./db";
import type { HeadersInit } from "bun";

interface Tokens {
    spotify: string;
    youtube: string | { [key: string]: string }; // YouTube can be OAuth token or browser headers
}

async function getTokens(): Promise<Tokens> {
    let spotifyToken: any = db.query("SELECT access_token, refresh_token, expires_at FROM tokens WHERE service = 'spotify'").get();
    let youtubeToken: any = db.query("SELECT access_token, refresh_token, expires_at, auth_type FROM tokens WHERE service = 'youtube'").get();

    if (!spotifyToken || !youtubeToken) {
        throw new Error("Tokens not found in the database. Please authenticate with both services first.");
    }

    // Check and refresh Spotify token if expired
    if (spotifyToken.expires_at && Date.now() >= spotifyToken.expires_at) {
        console.log("Spotify token expired, attempting to refresh...");
        const response = await fetch("http://localhost:3000/spotify/refresh");
        if (!response.ok) {
            const errorBody = await response.json();
            throw new Error(`Failed to refresh Spotify token: ${errorBody.message || response.statusText}`);
        }
        spotifyToken = db.query("SELECT access_token, refresh_token, expires_at FROM tokens WHERE service = 'spotify'").get(); // Re-fetch updated token
        console.log("Spotify token refreshed.");
    }

    // Check and refresh YouTube token if expired, only if auth_type is 'oauth'
    if (youtubeToken.auth_type === 'oauth' && youtubeToken.expires_at && Date.now() >= youtubeToken.expires_at) {
        console.log("YouTube token expired, attempting to refresh...");
        const response = await fetch("http://localhost:3000/youtube/refresh");
        if (!response.ok) {
            const errorBody = await response.json();
            throw new Error(`Failed to refresh YouTube token: ${errorBody.message || response.statusText}`);
        }
        youtubeToken = db.query("SELECT access_token, refresh_token, expires_at, auth_type FROM tokens WHERE service = 'youtube'").get(); // Re-fetch updated token
        console.log("YouTube token refreshed.");
    }

    let youtubeAccessToken: string | { [key: string]: string };
    if (youtubeToken.auth_type === 'browser') {
        try {
            youtubeAccessToken = JSON.parse(youtubeToken.access_token);
        } catch (e) {
            throw new Error("Invalid YouTube browser token format.");
        }
    } else {
        youtubeAccessToken = youtubeToken.access_token;
    }

    return {
        spotify: spotifyToken.access_token,
        youtube: youtubeAccessToken
    };
}

function getYoutubeAuthHeaders(youtubeAuth: string | { [key: string]: string }): HeadersInit {
	console.log({youtubeAuth});
    if (typeof youtubeAuth === 'string') { // OAuth token
        return {
            "Authorization": `Bearer ${youtubeAuth}`,
            "Content-Type": "application/json"
        };
    } else { // Browser headers
        return {
            ...youtubeAuth, // Spread the parsed headers
            "Content-Type": "application/json"
        };
    }
}

async function getMatchThreshold(): Promise<number> {
    const config: any = db.query("SELECT value FROM config WHERE key = 'match_threshold'").get();
    return parseFloat(config.value);
}

async function getSpotifyPlaylistDetails(accessToken: string, playlistId: string): Promise<any> {
    const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
        headers: {
            "Authorization": `Bearer ${accessToken}`
        }
    });

    if (!response.ok) {
        const errorBody = await response.json();
        console.error("Error fetching Spotify playlist details:", errorBody);
        throw new Error(`Failed to fetch Spotify playlist details: ${errorBody.error?.message || response.statusText}`);
    }

    return await response.json();
}

async function getSpotifyPlaylistTracks(accessToken: string, playlistId: string): Promise<any[]> {
    const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks` , {
        headers: {
            "Authorization": `Bearer ${accessToken}`
        }
    });

    if (!response.ok) {
        const errorBody = await response.json();
        console.error("Error fetching Spotify playlist tracks:", errorBody);
        throw new Error(`Failed to fetch Spotify playlist tracks: ${errorBody.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.items;
}

async function createYoutubePlaylist(youtubeAuth: string | { [key: string]: string }, name: string, description: string): Promise<any> {
    const headers = getYoutubeAuthHeaders(youtubeAuth);
    const response = await fetch("https://www.googleapis.com/youtube/v3/playlists?part=snippet,status", {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
            snippet: {
                title: name,
                description: description
            },
            status: {
                privacyStatus: "private"
            }
        })
    });

    if (!response.ok) {
        const errorBody = await response.json();
        console.error("Error creating YouTube playlist:", errorBody);
        throw new Error(`Failed to create YouTube playlist: ${errorBody.error?.message || response.statusText}`);
    }

    return await response.json();
}

async function searchYoutubeVideos(youtubeAuth: string | { [key: string]: string }, query: string): Promise<any[]> {
    const headers = getYoutubeAuthHeaders(youtubeAuth);
    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&maxResults=5`, {
        headers: headers
    });

    if (!response.ok) {
        const errorBody = await response.json();
        console.error(`Error searching for track "${query}":`, errorBody);
        throw new Error(`Failed to search for track "${query}": ${errorBody.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.items;
}

async function getVideoDetails(youtubeAuth: string | { [key: string]: string }, videoIds: string[]): Promise<any[]> {
    const headers = getYoutubeAuthHeaders(youtubeAuth);
    const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${videoIds.join(",")}` , {
        headers: headers
    });

    if (!response.ok) {
        const errorBody = await response.json();
        console.error("Error fetching video details:", errorBody);
        throw new Error(`Failed to fetch video details: ${errorBody.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.items;
}

function calculateMatchScore(spotifyTrack: any, youtubeVideo: any): number {
    let score = 0;

    // Title similarity
    const titleSimilarity = compareTwoStrings(spotifyTrack.name, youtubeVideo.snippet.title);
    score += titleSimilarity * 0.5; // Weight title similarity by 50%

    // Duration difference
    const durationDifference = Math.abs(spotifyTrack.duration_ms - (parseDuration(youtubeVideo.contentDetails.duration) * 1000));
    const durationScore = 1 - (durationDifference / spotifyTrack.duration_ms);
    score += durationScore * 0.3; // Weight duration similarity by 30%

    // Official channel bonus
    const channelTitle = youtubeVideo.snippet.channelTitle.toLowerCase();
    if (channelTitle.includes("official") || channelTitle.includes("vevo") || channelTitle.endsWith(" - topic")) {
        score += 0.2; // Add a 20% bonus for official channels
    }

    return score;
}

function parseDuration(duration: string): number {
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    if (!match) return 0;
    const hours = (parseInt(match[1]) || 0);
    const minutes = (parseInt(match[2]) || 0);
    const seconds = (parseInt(match[3]) || 0);
    return hours * 3600 + minutes * 60 + seconds;
}

async function addTrackToYoutubePlaylist(youtubeAuth: string | { [key: string]: string }, playlistId: string, videoId: string): Promise<void> {
    const headers = getYoutubeAuthHeaders(youtubeAuth);
    const response = await fetch("https://www.googleapis.com/youtube/v3/playlistItems?part=snippet", {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
            snippet: {
                playlistId: playlistId,
                resourceId: {
                    kind: "youtube#video",
                    videoId: videoId
                }
            }
        })
    });

    if (!response.ok) {
        const errorBody = await response.json();
        console.error(`Error adding track to playlist:`, errorBody);
        throw new Error(`Failed to add track to playlist: ${errorBody.error?.message || response.statusText}`);
    }
}

// Database helper functions
function getMigratedPlaylist(spotifyPlaylistId: string): any {
    return db.query("SELECT * FROM migrated_playlists WHERE spotify_playlist_id = ?").get(spotifyPlaylistId);
}

function insertMigratedPlaylist(spotifyPlaylistId: string, name: string, youtubePlaylistId: string | null, status: string): void {
    db.run("INSERT INTO migrated_playlists (spotify_playlist_id, name, youtube_playlist_id, status, last_updated) VALUES (?, ?, ?, ?, ?)",
        spotifyPlaylistId, name, youtubePlaylistId, status, Date.now());
}

function updateMigratedPlaylist(spotifyPlaylistId: string, youtubePlaylistId: string | null, status: string): void {
    db.run("UPDATE migrated_playlists SET youtube_playlist_id = ?, status = ?, last_updated = ? WHERE spotify_playlist_id = ?",
        youtubePlaylistId, status, Date.now(), spotifyPlaylistId);
}

function getMigratedTrack(spotifyTrackId: string, spotifyPlaylistId: string): any {
    return db.query("SELECT * FROM migrated_tracks WHERE spotify_track_id = ? AND spotify_playlist_id = ?").get(spotifyTrackId, spotifyPlaylistId);
}

function insertMigratedTrack(spotifyTrackId: string, spotifyPlaylistId: string, youtubeVideoId: string | null, status: string): void {
    db.run("INSERT INTO migrated_tracks (spotify_track_id, spotify_playlist_id, youtube_video_id, status, last_updated) VALUES (?, ?, ?, ?, ?)",
        spotifyTrackId, spotifyPlaylistId, youtubeVideoId, status, Date.now());
}

function updateMigratedTrack(spotifyTrackId: string, spotifyPlaylistId: string, youtubeVideoId: string | null, status: string): void {
    db.run("UPDATE migrated_tracks SET youtube_video_id = ?, status = ?, last_updated = ? WHERE spotify_track_id = ? AND spotify_playlist_id = ?",
        youtubeVideoId, status, Date.now(), spotifyTrackId, spotifyPlaylistId);
}

export async function main(spotifyPlaylistId: string, onProgress: (data: { type: string; message: string; details?: string }) => void) {
    const tokens = await getTokens();
    const matchThreshold = await getMatchThreshold();

    let youtubePlaylistId: string | null = null;
    let spotifyPlaylistName: string = "";
    let spotifyPlaylistDescription: string = "";

    // Check if playlist migration already started
    let migratedPlaylistRecord = getMigratedPlaylist(spotifyPlaylistId);

    if (migratedPlaylistRecord) {
        spotifyPlaylistName = migratedPlaylistRecord.name;
        youtubePlaylistId = migratedPlaylistRecord.youtube_playlist_id;
        onProgress({ type: "info", message: `Resuming migration for playlist: ${spotifyPlaylistName} (Status: ${migratedPlaylistRecord.status})` });
        updateMigratedPlaylist(spotifyPlaylistId, youtubePlaylistId, "in_progress");
    } else {
        const selectedPlaylist = await getSpotifyPlaylistDetails(tokens.spotify, spotifyPlaylistId);
        spotifyPlaylistName = selectedPlaylist.name;
        spotifyPlaylistDescription = selectedPlaylist.description || "";

        onProgress({ type: "info", message: `Starting new migration for playlist: ${spotifyPlaylistName}` });
        insertMigratedPlaylist(spotifyPlaylistId, spotifyPlaylistName, null, "in_progress");

        const youtubePlaylist = await createYoutubePlaylist(tokens.youtube, spotifyPlaylistName, spotifyPlaylistDescription);
        youtubePlaylistId = youtubePlaylist.id;
        updateMigratedPlaylist(spotifyPlaylistId, youtubePlaylistId, "in_progress");
        onProgress({ type: "info", message: `Created YouTube playlist: ${youtubePlaylist.snippet.title}` });
    }

    if (!youtubePlaylistId) {
        throw new Error("Could not determine YouTube playlist ID.");
    }

    const tracks = await getSpotifyPlaylistTracks(tokens.spotify, spotifyPlaylistId);
    let tracksMigrated = 0;
    let tracksSkipped = 0;
    let tracksFailed = 0;

    for (const item of tracks) {
        const track = item.track;
        if (!track || !track.id) {
            onProgress({ type: "warning", message: "Skipping invalid track item." });
            continue;
        }

        let migratedTrackRecord = getMigratedTrack(track.id, spotifyPlaylistId);
        if (migratedTrackRecord && (migratedTrackRecord.status === "migrated" || migratedTrackRecord.status === "skipped")) {
            onProgress({ type: "info", message: `Skipping already processed track: ${track.name} (Status: ${migratedTrackRecord.status})` });
            if (migratedTrackRecord.status === "migrated") tracksMigrated++;
            else tracksSkipped++;
            continue;
        }

        if (!migratedTrackRecord) {
            insertMigratedTrack(track.id, spotifyPlaylistId, null, "pending");
        }

        const query = `${track.name} ${track.artists.map((a: any) => a.name).join(" ")} ${track.album.name}`;
        onProgress({ type: "info", message: `Searching for: ${query}` });

        try {
            const searchResults = await searchYoutubeVideos(tokens.youtube, query);
            if (searchResults.length === 0) {
                onProgress({ type: "warning", message: `  -> Could not find track on YouTube.` });
                updateMigratedTrack(track.id, spotifyPlaylistId, null, "skipped");
                tracksSkipped++;
                continue;
            }

            const videoIds = searchResults.map(video => video.id.videoId);
            const videoDetails = await getVideoDetails(tokens.youtube, videoIds);

            let bestMatch: any = null;
            let bestScore = 0;

            for (const video of videoDetails) {
                const score = calculateMatchScore(track, video);
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = video;
                }
            }

            if (bestMatch && bestScore > matchThreshold) {
                onProgress({ type: "info", message: `  -> Found: ${bestMatch.snippet.title} (Score: ${bestScore.toFixed(2)})` });
                await addTrackToYoutubePlaylist(tokens.youtube, youtubePlaylistId, bestMatch.id);
                updateMigratedTrack(track.id, spotifyPlaylistId, bestMatch.id, "migrated");
                tracksMigrated++;
                onProgress({ type: "success", message: `  -> Added to playlist.` });
            } else {
                onProgress({ type: "warning", message: `  -> Could not find a good match on YouTube.` });
                updateMigratedTrack(track.id, spotifyPlaylistId, null, "skipped");
                tracksSkipped++;
            }
        } catch (error: any) {
            onProgress({ type: "error", message: `Error processing track ${track.name}: ${error.message}` });
            updateMigratedTrack(track.id, spotifyPlaylistId, null, "failed");
            tracksFailed++;
            // If it's a quota error, we might want to stop the entire migration
            if (error.message.includes("quota")) {
                updateMigratedPlaylist(spotifyPlaylistId, youtubePlaylistId, "failed");
                throw new Error("YouTube API quota exceeded. Please try again later.");
            }
        }
    }

    updateMigratedPlaylist(spotifyPlaylistId, youtubePlaylistId, "completed");
    onProgress({ type: "complete", message: `Migration complete for ${spotifyPlaylistName}! Migrated: ${tracksMigrated}, Skipped: ${tracksSkipped}, Failed: ${tracksFailed}` });
}
