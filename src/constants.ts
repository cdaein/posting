import { Config, Platform, PostType } from "./types";

export const defaultConfig: Config = {
  watchDir: "~/Desktop/Scheduled-Social-Posts",
  processInterval: 5,
  cronTime: "0 0,6-23 * * *",
};

export const supportedPlatforms: Platform[] = [
  "bluesky",
  "instagram",
  "mastodon",
  "threads",
  "twitter",
];
export const supportedPostTypes: PostType[] = ["text", "media"];

// in minutes
export const TIME_PAST_THRESHOLD = -5;
export const TIME_FUTURE_THRESHOLD = 5;

// Bluesky
export const BLUESKY_MAX_CHARS = 300;
export const BLUESKY_IMAGE_FORMATS = ["jpeg", "jpg", "png", "webp", "gif"];
export const BLUESKY_VIDEO_FORMATS = [];
export const BLUESKY_MAX_ATTACHMENTS = 4;

// Mastodon
export const MASTODON_MAX_CHARS = 500;
export const MASTODON_IMAGE_FORMATS = ["jpeg", "jpg", "png", "webp", "heif"];
export const MASTODON_VIDEO_FORMATS = ["gif", "mp4", "mov", "webm", "m4v"];
// "wav", "flac", "opus",
export const MASTODON_AUDIO_FORMATS = ["mp4", "ogg", "aac", "m4a", "3gp"];
export const MASTODON_MAX_ATTACHMENTS = 4;

// Instagram
export const INSTAGRAM_MAX_CHARS = 2200;
export const INSTAGRAM_API_URL = `https://graph.instagram.com/v20.0`;
export const INSTAGRAM_IMAGE_FORMATS = ["jpeg", "jpg", "png"];
export const INSTAGRAM_VIDEO_FORMATS = ["mp4", "mov"];
export const INSTAGRAM_MAX_ATTACHMENTS = 10;

// Threads
// https://developers.facebook.com/docs/threads/overview
export const THREADS_API_URL = `https://graph.threads.net/v1.0`;
export const THREADS_MAX_CHARS = 500;
export const THREADS_IMAGE_FORMATS = ["jpeg", "jpg", "png"];
export const THREADS_VIDEO_FORMATS = ["mp4", "mov"];
export const THREADS_MAX_ATTACHMENTS = 10;

// Twitter
export const TWITTER_MAX_CHARS = 280;
export const TWITTER_IMAGE_FORMATS = ["jpeg", "jpg", "png", "gif", "webp"];
export const TWITTER_VIDEO_FORMATS = ["mp4", "mov"];
export const TWITTER_MAX_ATTACHMENTS = 4;
