import { BskyAgent } from "@atproto/api";
import { StorageReference } from "firebase/storage";
import kleur from "kleur";
import { mastodon } from "masto";
import fs from "node:fs";
import path from "path";
import { TwitterApiReadWrite } from "twitter-api-v2";
import { ThreadsClient } from "./clients/threads-client";
import {
  BLUESKY_IMAGE_FORMATS,
  BLUESKY_MAX_ATTACHMENTS,
  BLUESKY_MAX_CHARS,
  BLUESKY_VIDEO_FORMATS,
  INSTAGRAM_IMAGE_FORMATS,
  INSTAGRAM_MAX_ATTACHMENTS,
  INSTAGRAM_MAX_CHARS,
  INSTAGRAM_VIDEO_FORMATS,
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
import { initFirebase, uploadFirebase } from "./storages/firebase";
import { Config, EnvVars, Platform, PostSettings } from "./types";
import { waitForFile } from "./utils";

const { bold, yellow } = kleur;

export async function isPostValid(
  postFolderPath: string,
  settings: PostSettings,
) {
  // TODO: media metadata (dimensions, filesize, etc.)
  return (
    isPlatformsValid(settings) &&
    isPostTypeValid(settings) &&
    isBodyTextValid(settings) &&
    (await isFilesValid(postFolderPath, settings)) &&
    isFileFormatsValid(settings) &&
    isCharCountValid(settings)
  );
}

export async function readSettings(postFolderPath: string) {
  const settingsPath = path.join(postFolderPath, "settings.json");

  await waitForFile(settingsPath, 10000, 1000);

  // read and parse settings.json
  const settings: PostSettings = JSON.parse(
    fs.readFileSync(settingsPath, "utf8"),
  );
  return settings;
}

/**
 * @param envVars -
 * @param clients -
 * @param postFolderPath - Folder where post is in (image, video, settings.json)
 * @param userConfig -
 * @param dev - A flag to enable dev mode
 * @returns `true` if uploaded
 */
export async function uploadPost(
  envVars: EnvVars,
  clients: {
    blueskyAgent?: BskyAgent;
    mastodonClient?: mastodon.rest.Client;
    threadsClient?: ThreadsClient;
    twitterClient?: TwitterApiReadWrite;
  },
  postFolderPath: string,
  userConfig: Config,
  dev: boolean,
) {
  try {
    const settings = await readSettings(postFolderPath);

    if (!(await isPostValid(postFolderPath, settings))) {
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

    const { blueskyAgent, mastodonClient, threadsClient, twitterClient } =
      clients;

    // Threads/Instagram both require public URL so set up Firebase here.
    // FIX: uploaded files are deleted in both IG/Threads funcs. If both run, threads won't have files to use.
    // - move delete objects in this function after all uploads finish.
    const firebaseFileInfos: {
      storageRef: StorageReference;
      downloadUrl: string;
    }[] = [];
    // if something goes wrong with firebase uploads, do not proceed with IG/Threads
    let firebaseReady = false;
    if (platforms.includes("threads") || platforms.includes("instagram")) {
      try {
        const { storage, uid } = await initFirebase(envVars, userConfig);
        const { fileInfos } = settings;
        console.log("Uploading media file(s) to Firebase Storage..");
        for (let i = 0; i < fileInfos.length; i++) {
          const { filename } = fileInfos[i];
          const localFilePath = path.join(postFolderPath, filename);
          const { storageRef, downloadUrl } = await uploadFirebase(
            storage,
            uid,
            localFilePath,
          );
          firebaseFileInfos.push({ storageRef, downloadUrl });
          console.log(`File uploaded to Firebase: ${yellow(filename)}`);
        }

        firebaseReady = true;
      } catch (e) {
        console.error(e);
      }
    }

    for (const platform of platforms) {
      if (platform === "bluesky") {
        console.log(`\t${bold("Bluesky")}`);
        await uploadBluesky(blueskyAgent!, postFolderPath, settings, dev);
      } else if (platform === "instagram" && firebaseReady) {
        // await uploadInstagram(envVars, settings, firebaseFileInfos, dev);
      } else if (platform === "mastodon") {
        console.log(`\t${bold("Mastodon")}`);
        await uploadMastodon(mastodonClient!, postFolderPath, settings, dev);
      } else if (platform === "threads" && firebaseReady) {
        console.log(`\t${bold("Threads")}`);
        await uploadThreads(threadsClient!, settings, firebaseFileInfos, dev);
      } else if (platform === "twitter") {
        console.log(`\t${bold("Twitter")}`);
        await uploadTwitter(twitterClient!, postFolderPath, settings, dev);
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
      } else if (platform === "instagram") {
        return INSTAGRAM_MAX_CHARS;
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
      } else if (platform === "instagram") {
        return INSTAGRAM_IMAGE_FORMATS;
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
      } else if (platform === "instagram") {
        return INSTAGRAM_VIDEO_FORMATS;
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

export async function isFilesValid(
  postFolderPath: string,
  settings: PostSettings,
) {
  const { platforms, postType, fileInfos } = settings;
  if (postType === "media") {
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

      // it may be still copying so wait and retry
      await waitForFile(filePath, 10000, 1000);

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
      else if (platform === "instagram") return INSTAGRAM_MAX_ATTACHMENTS;
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
