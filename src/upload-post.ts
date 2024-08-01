import { FirebaseStorage } from "firebase/storage";
import kleur from "kleur";
import { mastodon } from "masto";
import fs from "node:fs";
import path from "path";
import { TwitterApiReadWrite } from "twitter-api-v2";
import { uploadBluesky } from "./platforms/bluesky";
import { uploadInstagram } from "./platforms/instagram";
import { uploadMastodon } from "./platforms/mastodon";
import { uploadThreads } from "./platforms/threads";
import { uploadTwitter } from "./platforms/twitter";
import { initFirebase } from "./storages/firebase";
import { Config, EnvVars, PostSettings } from "./types";
import { BskyAgent } from "@atproto/api";

const { bold } = kleur;

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
    // check settings.json
    const settingsPath = path.join(postFolderPath, "settings.json");
    if (!fs.existsSync(settingsPath)) {
      console.error(`settings.json not found in ${postFolderPath}`);
      return false;
    }
    // read and parse settings.json
    const settings: PostSettings = JSON.parse(
      fs.readFileSync(settingsPath, "utf8"),
    );
    const { postType, platforms, bodyText, fileInfos } = settings;

    if (!postType) {
      console.error(`Missing postType in ${settingsPath}`);
      return false;
    }
    if (!platforms || platforms.length === 0) {
      console.error(`Missing platforms in ${settingsPath}`);
      return false;
    }

    // TODO: check for incorrect postType (ex. set to text, but image file present.)
    // b/c things may have been changed by user since scheduling

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
