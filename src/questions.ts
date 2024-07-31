import fs from "node:fs";
import path from "node:path";
import { Choice, PromptObject } from "prompts";
import {
  defaultConfig,
  MASTODON_IMAGE_FORMATS,
  MASTODON_MAX_CHARS,
  MASTODON_VIDEO_FORMATS,
  THREADS_IMAGE_FORMATS,
  THREADS_MAX_CHARS,
  THREADS_VIDEO_FORMATS,
  TWITTER_IMAGE_FORMATS,
  TWITTER_MAX_CHARS,
  TWITTER_VIDEO_FORMATS,
} from "./constants";
import { Platform, PostType } from "./types";
import { loadConfig } from "./utils";

// load config
const userConfig = await loadConfig(defaultConfig, "../user.config.json");

const platforms: Choice[] = [
  // { title: "instagram", value: "instagram", disabled: true },
  { title: "mastodon", value: "mastodon" },
  { title: "threads", value: "threads" },
  { title: "twitter", value: "twitter" },
];

const postTypes: Choice[] = [
  { title: "text", value: "text" },
  { title: "media", value: "media" },
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
// TODO: instagram-specific
//  -
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
      const maxChars = Math.min(
        ...platforms.map((platform) => {
          if (platform === "mastodon") {
            return MASTODON_MAX_CHARS;
          } else if (platform === "threads") {
            return THREADS_MAX_CHARS;
          } else if (platform === "twitter") {
            return TWITTER_MAX_CHARS;
          }
          return 0;
        }),
      );

      if (value.length > maxChars) {
        return `Text exceeds the max. ${maxChars} characters for ${platforms.join(", ")}`;
      }
      return true;
    },
  };
};

const getCommonFormats = (...lists: string[][]) => {
  if (lists.length === 0) return [];
  return lists.reduce((commonFormats, list) =>
    commonFormats.filter((format) => list.includes(format)),
  );
};

export const multiFilesQuestionFn = (
  platforms: Platform[],
  postType: PostType,
  maxAttachments: number,
  numAttached = 0,
): PromptObject => {
  return {
    type: () => (postType === "media" ? "text" : null),
    name: "mediaPath",
    message: () => {
      if (numAttached === 0) {
        return `Media file path (${maxAttachments - numAttached} remaining)`;
      } else {
        // show "leave blank" after first attachment
        return `Media file path (${maxAttachments - numAttached} remaining). Leave blank to skip.`;
      }
    },
    validate: (value: string) => {
      const trimmed = value.trim();

      // at least 1 attachment is required
      if (numAttached === 0 && !fs.existsSync(trimmed)) {
        return "Please enter a valid file path";
      }

      // 2nd+ attachment is optional. if blank, move on.
      if (numAttached >= 1 && trimmed.length === 0) {
        return true;
      }

      const commonImageFormats = getCommonFormats(
        ...platforms.map((platform) => {
          if (platform === "mastodon") {
            return MASTODON_IMAGE_FORMATS;
          } else if (platform === "threads") {
            return THREADS_IMAGE_FORMATS;
          } else if (platform === "twitter") {
            return TWITTER_IMAGE_FORMATS;
          }
          return [];
        }),
      );

      const commonVideoFormats = getCommonFormats(
        ...platforms.map((platform) => {
          if (platform === "mastodon") {
            return MASTODON_VIDEO_FORMATS;
          } else if (platform === "threads") {
            return THREADS_VIDEO_FORMATS;
          } else if (platform === "twitter") {
            return TWITTER_VIDEO_FORMATS;
          }
          return [];
        }),
      );

      const commonFormats = [...commonImageFormats, ...commonVideoFormats];

      if (!commonFormats.includes(path.extname(trimmed).slice(1))) {
        return `Please use a common file type for ${platforms.join(", ")}: ${commonFormats.join(", ")}`;
      }

      return true;
    },
  };
};

export const dateQuestion: PromptObject = {
  type: "date",
  name: "postDate",
  message: "Post time",
  initial: new Date(
    new Date().getTime() + userConfig.processInterval * 2 * 60 * 1000,
  ),
  mask: "YYYY.MMM.D ddd HH:mm",
  validate: (date) =>
    date < Date.now() + userConfig.processInterval * 60 * 1000
      ? `Must be greater than process interval of ${userConfig.processInterval} minutes`
      : true,
};