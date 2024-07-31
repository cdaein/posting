import { Config } from "./types";

export const defaultConfig: Config = {
  watchDir: "~/Desktop/Scheduled-Social-Posts",
  processInterval: 5,
  firebase: {
    options: {
      storageBucket: "",
    },
  },
  ngrok: {
    port: 8080,
  },
};

// in minutes
export const TIME_PAST_THRESHOLD = -10;
export const TIME_FUTURE_THRESHOLD = 10;

// Bluesky

// Mastodon
export const MASTODON_MAX_CHARS = 500;
export const MASTODON_IMAGE_FORMATS = ["jpeg", "jpg", "png", "webp", "heif"];
export const MASTODON_VIDEO_FORMATS = ["gif", "mp4", "mov", "webm", "m4v"];
// "wav", "flac", "opus",
export const MASTODON_AUDIO_FORMATS = ["mp4", "ogg", "aac", "m4a", "3gp"];

// Instagram
export const INSTAGRAM_API_URL = `https://graph.instagram.com/v20.0`;
export const INSTAGRAM_IMAGE_FORMATS = ["jpeg", "jpg"];

// Threads
// https://developers.facebook.com/docs/threads/overview
export const THREADS_API_URL = `https://graph.threads.net/v1.0`;
export const THREADS_MAX_CHARS = 500;
export const THREADS_IMAGE_FORMATS = ["jpeg", "jpg", "png"];
export const THREADS_VIDEO_FORMATS = ["mp4", "mov"];

// Twitter
// NOTE: JPG/PNG/GIF/MP4/MOV/WEBP
export const TWITTER_MAX_CHARS = 280;
export const TWITTER_IMAGE_FORMATS = ["jpeg", "jpg", "png", "gif", "webp"];
export const TWITTER_VIDEO_FORMATS = ["mp4", "mov"];
