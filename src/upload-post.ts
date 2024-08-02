import { BskyAgent } from "@atproto/api";
import { FirebaseStorage } from "firebase/storage";
import kleur from "kleur";
import { mastodon } from "masto";
import fs from "node:fs";
import path from "path";
import { TwitterApiReadWrite } from "twitter-api-v2";
import {
  BLUESKY_IMAGE_FORMATS,
  BLUESKY_MAX_ATTACHMENTS,
  BLUESKY_MAX_CHARS,
  BLUESKY_VIDEO_FORMATS,
  MASTODON_IMAGE_FORMATS,
  MASTODON_MAX_ATTACHMENTS,
  MASTODON_MAX_CHARS,
  MASTODON_VIDEO_FORMATS,
  supportedPlatforms,
  supportedPostTypes,
  THREADS_IMAGE_FORMATS,
  THREADS_MAX_ATTACHMENTS,
  THREADS_MAX_CHARS,
  THREADS_VIDEO_FORMATS,
  TWITTER_IMAGE_FORMATS,
  TWITTER_MAX_ATTACHMENTS,
  TWITTER_MAX_CHARS,
  TWITTER_VIDEO_FORMATS,
} from "./constants";
import { uploadBluesky } from "./platforms/bluesky";
import { uploadInstagram } from "./platforms/instagram";
import { uploadMastodon } from "./platforms/mastodon";
import { uploadThreads } from "./platforms/threads";
import { uploadTwitter } from "./platforms/twitter";
import { initFirebase } from "./storages/firebase";
import { Config, EnvVars, Platform, PostSettings } from "./types";

const { bold } = kleur;

export function isPostValid(postFolderPath: string, settings: PostSettings) {
  // TODO: media metadata (dimensions, filesize, etc.)
  return (
    isPlatformsValid(settings) &&
    isPostTypeValid(settings) &&
    isBodyTextValid(settings) &&
    isFileInfosValid(postFolderPath, settings) &&
    isFileFormatsValid(settings) &&
    isCharCountValid(settings)
  );
}

export function readSettings(postFolderPath: string) {
  const settingsPath = path.join(postFolderPath, "settings.json");
  if (!fs.existsSync(settingsPath)) {
    throw new Error(`Not found: settings.json in ${postFolderPath}`);
  }
  // read and parse settings.json
  const settings: PostSettings = JSON.parse(
    fs.readFileSync(settingsPath, "utf8"),
  );
  return settings;
}

/**
 * @param postFolderPath - Folder where post is in (image, video, settings.json)
 * @returns `true` if uploaded
 */
export async function uploadPost(
  envVars: EnvVars,
  clients: {
    blueskyAgent?: BskyAgent;
    mastodonClient?: mastodon.rest.Client;
    twitterClient?: TwitterApiReadWrite;
  },
  postFolderPath: string,
  userConfig: Config,
  dev: boolean,
) {
  try {
    const settings = readSettings(postFolderPath);

    if (!isPostValid(postFolderPath, settings)) {
      throw new Error(`Found problem with post folder in ${postFolderPath}`);
    }

    const { postType, platforms, bodyText, fileInfos } = settings;

    console.log("===============");
    console.log(`Processing ${bold(path.basename(postFolderPath))}`);
    console.log(`Current time: ${bold(new Date().toLocaleString())}`);
    console.log(`Post type: ${postType}`);
    console.log(`Platforms: ${platforms.join(",")}`);
    console.log(`Text: ${bodyText}`);
    if (fileInfos.length > 0) {
      console.log(`Files:`);
      for (const fileInfo of fileInfos) {
        console.log(`- ${fileInfo.filename}`);
      }
    }
    console.log("===============");

    // Threads/Instagram requires public URL so set up Firebase here.
    // REVIEW: maybe, create public URLs here and pass it to uploadThreads/Instagram
    let storage: FirebaseStorage | undefined;
    let firebaseUid: string = "";
    if (platforms.includes("threads") || platforms.includes("instagram")) {
      const fb = await initFirebase(envVars, userConfig);
      storage = fb.storage;
      firebaseUid = fb.firebaseUid;
    }

    for (const platform of platforms) {
      if (platform === "bluesky") {
        console.log(`\t${bold("Bluesky")}`);
        await uploadBluesky(
          clients.blueskyAgent!,
          postFolderPath,
          settings,
          dev,
        );
      } else if (platform === "instagram") {
        await uploadInstagram(
          envVars,
          postFolderPath,
          settings,
          userConfig,
          storage!,
          firebaseUid,
          dev,
        );
      } else if (platform === "mastodon") {
        console.log(`\t${bold("Mastodon")}`);
        await uploadMastodon(
          clients.mastodonClient!,
          postFolderPath,
          settings,
          dev,
        );
      } else if (platform === "threads") {
        console.log(`\t${bold("Threads")}`);
        // TODO: if posting to threads AND instagram, no need to upload same file twice.
        // refactor necessary. maybe, upload files here, and just pass the URLs.
        await uploadThreads(
          envVars,
          postFolderPath,
          settings,
          userConfig,
          storage!,
          firebaseUid,
          dev,
        );
      } else if (platform === "twitter") {
        console.log(`\t${bold("Twitter")}`);
        await uploadTwitter(
          clients.twitterClient!,
          postFolderPath,
          settings,
          dev,
        );
      }
    }
    return true;
  } catch (e) {
    throw new Error(`Error in uploadPost \n${e}`);
  }
}

export function isCharCountValid(settings: PostSettings) {
  const { platforms, bodyText } = settings;
  const maxChars = getMaxChars(platforms);
  if (bodyText.length > maxChars) {
    console.error(
      `Text exceeds the max. ${maxChars} characters for ${platforms.join(", ")}`,
    );
    return false;
  }
  return true;
}

export function getMaxChars(platforms: Platform[]) {
  return Math.min(
    ...platforms.map((platform) => {
      if (platform === "bluesky") {
        return BLUESKY_MAX_CHARS;
      } else if (platform === "mastodon") {
        return MASTODON_MAX_CHARS;
      } else if (platform === "threads") {
        return THREADS_MAX_CHARS;
      } else if (platform === "twitter") {
        return TWITTER_MAX_CHARS;
      }
      return -1;
    }),
  );
}

export function isFileFormatsValid(settings: PostSettings) {
  const { platforms, fileInfos } = settings;
  const commonImageFormats = getCommonImageFormats(platforms);
  const commonVideoFormats = getCommonVideoFormats(platforms);
  const commonFormats = [...commonImageFormats, ...commonVideoFormats];
  for (const fileInfo of fileInfos) {
    const trimmed = fileInfo.filename;
    if (!commonFormats.includes(path.extname(trimmed).slice(1))) {
      console.error(
        `Please use a common file type for ${platforms.join(", ")}: ${commonFormats.join(", ")}`,
      );
      return false;
    }
  }
  return true;
}

export function getCommonImageFormats(platforms: Platform[]) {
  return getCommonFormats(
    ...platforms.map((platform) => {
      if (platform === "bluesky") {
        return BLUESKY_IMAGE_FORMATS;
      } else if (platform === "mastodon") {
        return MASTODON_IMAGE_FORMATS;
      } else if (platform === "threads") {
        return THREADS_IMAGE_FORMATS;
      } else if (platform === "twitter") {
        return TWITTER_IMAGE_FORMATS;
      }
      return [];
    }),
  );
}

export function getCommonVideoFormats(platforms: Platform[]) {
  return getCommonFormats(
    ...platforms.map((platform) => {
      if (platform === "bluesky") {
        return BLUESKY_VIDEO_FORMATS;
      } else if (platform === "mastodon") {
        return MASTODON_VIDEO_FORMATS;
      } else if (platform === "threads") {
        return THREADS_VIDEO_FORMATS;
      } else if (platform === "twitter") {
        return TWITTER_VIDEO_FORMATS;
      }
      return [];
    }),
  );
}

export const getCommonFormats = (...lists: string[][]) => {
  if (lists.length === 0) return [];
  return lists.reduce((commonFormats, list) =>
    commonFormats.filter((format) => list.includes(format)),
  );
};

export function isFileInfosValid(
  postFolderPath: string,
  settings: PostSettings,
) {
  const { platforms, postType, fileInfos } = settings;
  if (postType === "media") {
    // fileInfos.length > 0
    if (!fileInfos || fileInfos.length === 0) {
      console.error(`fileInfos are required for media post`);
      return false;
    }
    // number of files to upload
    const numFileInfos = fileInfos.length;
    const maxAttach = getMaxAttachments(platforms);
    if (numFileInfos > maxAttach) {
      console.error(`Exceeded maximum number of attachments: ${maxAttach}`);
    }

    for (const fileInfo of fileInfos) {
      const { filename } = fileInfo;
      const filePath = path.join(postFolderPath, filename.trim());
      if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return false;
      }
    }
  }

  return true;
}

// minimum of all platforms max attachments
export function getMaxAttachments(platforms: Platform[]) {
  return Math.min(
    ...platforms.map((platform) => {
      if (platform === "bluesky") return BLUESKY_MAX_ATTACHMENTS;
      else if (platform === "mastodon") return MASTODON_MAX_ATTACHMENTS;
      else if (platform === "threads") return THREADS_MAX_ATTACHMENTS;
      else if (platform === "twitter") return TWITTER_MAX_ATTACHMENTS;
      return -1;
    }),
  );
}

export function isBodyTextValid(settings: PostSettings) {
  const { postType, bodyText } = settings;
  if (!bodyText) {
    console.log(`Not found: bodyText field`);
    return false;
  }
  if (postType === "text" && bodyText.length === 0) {
    console.error(`bodyText is required in text post.`);
    return false;
  }
  return true;
}

export function isPostTypeValid(settings: PostSettings) {
  const { postType } = settings;
  if (!postType) {
    console.error(`Please include postType`);
    return false;
  }
  if (!supportedPostTypes.includes(postType)) {
    console.error(`Found unsupported postType: ${postType}`);
    return false;
  }
  return true;
}

export function isPlatformsValid(settings: PostSettings) {
  const { platforms } = settings;
  // 1. length > 0
  if (!platforms || platforms.length === 0) {
    console.error(`Please include platform(s)`);
    return false;
  }
  // 2. values
  for (const platform of platforms) {
    if (!supportedPlatforms.includes(platform)) {
      console.error(`Found unsupported platform: ${platform}`);
      return false;
    }
  }
  return true;
}
