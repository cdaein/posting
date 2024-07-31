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

// Instagram
export const INSTAGRAM_API_URL = `https://graph.instagram.com/v20.0`;
export const INSTAGRAM_IMAGE_FORMATS = ["jpeg", "jpg"];

// Threads
export const THREADS_API_URL = `https://graph.threads.net/v1.0`;

// Twitter
// NOTE: JPG/PNG/GIF/MP4/MOV/WEBP
export const TWITTER_IMAGE_FORMATS = ["jpeg", "jpg", "png", "gif", "webp"];
export const TWITTER_VIDEO_FORMATS = ["mp4", "mov"];
