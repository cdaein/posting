import kleur from "kleur";
import fs from "node:fs";
import path from "node:path";
import { Choice, PromptObject } from "prompts";
import { defaultConfig } from "./constants";
import { Platform, PostType } from "./types";
import {
  getCommonImageFormats,
  getCommonVideoFormats,
  getMaxChars,
} from "./upload-post";
import { formatPostFolderName, loadConfig } from "./utils";

const { yellow } = kleur;

// load config
const userConfig = await loadConfig(defaultConfig, "../user.config.json");

const platforms: Choice[] = [
  { title: "Bluesky", value: "bluesky" },
  { title: "Instagram", value: "instagram" },
  { title: "Mastodon", value: "mastodon" },
  { title: "Threads", value: "threads" },
  { title: "Twitter", value: "twitter" },
];

const postTypes: Choice[] = [
  { title: "text", value: "text" },
  { title: "media", value: "media" },
];

export const watchDirQuestionFn = (currentWatchDir: string): PromptObject => {
  return {
    type: "text",
    name: "watchDir",
    message: "Watch Directory",
    initial: currentWatchDir,
    onState: (state) => {
      return state || currentWatchDir;
    },
  };
};

export const blueskyAuthQuestions: PromptObject[] = [
  {
    type: "text",
    name: "BLUESKY_EMAIL",
    message: "Bluesky Email",
  },
  {
    type: "text",
    name: "BLUESKY_PASSWORD",
    message: "Bluesky Password",
  },
  {
    type: "text",
    name: "BLUESKY_HANDLE",
    message: "Bluesky Handle (ex. user.bsky.social)",
  },
];

export const firebaseAuthQuestions: PromptObject[] = [
  {
    type: "text",
    name: "FIREBASE_API_KEY",
    message: "Firebase API Key",
  },
  {
    type: "text",
    name: "FIREBASE_STORAGE_BUCKET",
    message: "Firebase Storage Bucket (ex. your-app.appspot.com)",
  },
  {
    type: "text",
    name: "FIREBASE_EMAIL",
    message: "Firebase Email (of app user, not admin)",
  },
  {
    type: "text",
    name: "FIREBASE_PASSWORD",
    message: "Firebase Password (of app user, not admin)",
  },
];

export const instagramAuthQuestions: PromptObject[] = [
  {
    type: "text",
    name: "INSTAGRAM_APP_ID",
    message: "Instagram App ID",
  },
  {
    type: "text",
    name: "INSTAGRAM_APP_SECRET",
    message: "Instagram App Secret",
  },
  {
    type: "text",
    name: "INSTAGRAM_USER_ID",
    message: "Instagram User ID (number)",
  },
  {
    type: "text",
    name: "INSTAGRAM_ACCESS_TOKEN",
    message: "Instagram Access Token (long-lived token)",
  },
];

export const mastodonAuthQuestions: PromptObject[] = [
  {
    type: "text",
    name: "MASTODON_INSTANCE_URL",
    message: "Mastodon Instance URL (ex. https://mastodon.social)",
  },
  {
    type: "text",
    name: "MASTODON_ACCESS_TOKEN",
    message: "Mastodon Access Token",
  },
];

export const threadsAuthQuestions: PromptObject[] = [
  {
    type: "text",
    name: "THREADS_APP_ID",
    message: "Threads App ID",
  },
  {
    type: "text",
    name: "THREADS_APP_SECRET",
    message: "Threads App Secret",
  },
  {
    type: "text",
    name: "THREADS_USER_ID",
    message: "Threads User ID (number)",
  },
  {
    type: "text",
    name: "THREADS_ACCESS_TOKEN",
    message: "Threads Access Token (long-lived token)",
  },
];

export const twitterAuthQuestions: PromptObject[] = [
  {
    type: "text",
    name: "TWITTER_API_KEY",
    message: "Twitter API Key",
  },
  {
    type: "text",
    name: "TWITTER_API_KEY_SECRET",
    message: "Twitter API Key Secret",
  },
  {
    type: "text",
    name: "TWITTER_ACCESS_TOKEN",
    message: "Twitter Access Token",
  },
  {
    type: "text",
    name: "TWITTER_ACCESS_TOKEN_SECRET",
    message: "Twitter Access Token Secret",
  },
];

export const platformsQuestion: PromptObject = {
  type: "multiselect",
  name: "platforms",
  message: "Select one or more platforms",
  instructions: false,
  hint: "- Space to select. Return to submit",
  choices: platforms,
};

// TODO: mastodon-specific
//  - message visibility (public, unlisted, follows-only, direct)
//  - content warning
// all platforms
//  - check image/video dimmensions and durations/fps/etc.
//  - (maybe, ask at the end)

export const postTypeQuestion: PromptObject[] = [
  {
    type: "select",
    name: "postType",
    message: "Post type",
    choices: postTypes,
  },
];

export const bodyTextQuestionFn = (
  platforms: Platform[],
  postType: PostType,
): PromptObject => {
  return {
    type: "text",
    name: "bodyText",
    message: "Message body",
    validate: (value: string) => {
      if (postType === "text" && value.length === 0) {
        return "Text post needs text body.";
      }

      const maxChars = getMaxChars(platforms);
      if (value.length > maxChars) {
        return `Text exceeds the max. ${maxChars} characters for ${platforms.join(", ")}`;
      }
      return true;
    },
  };
};

export const multiFilesQuestionFn = (
  platforms: Platform[],
  postType: PostType,
  maxAttachments: number,
  numAttached = 0,
): PromptObject[] => {
  return [
    {
      type: () => (postType === "media" ? "text" : null),
      name: "mediaPath",
      message: () => {
        if (numAttached === 0) {
          return `Media file path (${numAttached + 1}/${maxAttachments})`;
        } else {
          // show "leave blank" after first attachment
          return `Media file path (${numAttached + 1}/${maxAttachments}). Enter to skip`;
        }
      },
      validate: (value: string) => {
        const trimmed = value.trim();
        // TODO: handle relative path ~ or ./
        // - or, at least, validate only path start with "/"

        // at least 1 attachment is required
        if (numAttached === 0 && !fs.existsSync(trimmed)) {
          return "Please enter a valid file path";
        }

        // 2nd+ attachment is optional. if blank, move on.
        if (numAttached >= 1 && trimmed.length === 0) {
          return true;
        }

        const commonImageFormats = getCommonImageFormats(platforms);
        const commonVideoFormats = getCommonVideoFormats(platforms);
        const commonFormats = [...commonImageFormats, ...commonVideoFormats];
        if (!commonFormats.includes(path.extname(trimmed).slice(1))) {
          return `Please use a common file type for ${platforms.join(", ")}: ${commonFormats.join(", ")}`;
        }

        return true;
      },
    },
    {
      type: (prev) => (prev.trim().length > 0 ? "text" : null),
      name: "altText",
      message: (prev) => {
        return `Alt text for ${yellow(path.basename(prev))}`;
      },
    },
  ];
};

export const hasReplyQuestion: PromptObject = {
  type: "toggle",
  name: "hasReply",
  message: "Do you want to add a reply?",
  initial: false,
  active: "Yes",
  inactive: "No",
};

export const dateQuestionFn = (watchDir: string): PromptObject => {
  return {
    type: "date",
    name: "postDate",
    message: "Post time",
    initial: new Date(
      new Date().getTime() + userConfig.processInterval * 60 * 1000,
    ),
    mask: "YYYY.MMM.D ddd HH:mm",
    validate: (value: Date) => {
      if (value.getTime() < Date.now()) {
        return `Must be greater than the current time`;
      }

      // TODO: check for already existing folder and verion up
      const folderName = formatPostFolderName(value.toISOString());
      if (fs.existsSync(path.join(watchDir, folderName))) {
        return `Pick a different time. Another post is already scheduled.`;
      }

      return true;
    },
  };
};
