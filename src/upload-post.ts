import "dotenv/config";
import { FirebaseStorage } from "firebase/storage";
import kleur from "kleur";
import fs from "node:fs";
import path from "path";
import { uploadInstagram } from "./platforms/instagram";
import { uploadMastodon } from "./platforms/mastodon";
import { uploadThreads } from "./platforms/threads";
import { uploadTwitter } from "./platforms/twitter";
import { Config, EnvVars, PostSettings } from "./types";

const { bold } = kleur;

/**
 * @param postFolderPath - Folder where post is in (image, video, settings.json)
 * @returns `true` if uploaded
 */
export async function uploadPost(
  envVars: EnvVars,
  postFolderPath: string,
  userConfig: Config,
  storage: FirebaseStorage,
  firebaseUid: string,
  dev: boolean,
) {
  try {
    console.log(
      `Processing ${bold(path.basename(postFolderPath))} (current time: ${bold(new Date().toLocaleString())})`,
    );

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
    const { postType, platforms, bodyText, filenames } = settings;

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
    console.log(`Post type: ${postType}`);
    console.log(`Platforms: ${platforms.join(",")}`);
    console.log(`Text: ${bodyText}`);
    console.log(`Files: ${filenames.join(", ")}`);
    console.log("===============");

    for (const platform of platforms) {
      if (platform === "instagram") {
        console.log(`Uploading to ${bold("Instagram")}..`);
        await uploadInstagram(
          postFolderPath,
          settings,
          userConfig,
          storage,
          firebaseUid,
          dev,
        );
      } else if (platform === "mastodon") {
        console.log(`Uploading to ${bold("Mastodon")}..`);
        await uploadMastodon(postFolderPath, settings, dev);
      } else if (platform === "threads") {
        // TODO: if posting to threads AND instagram, refactor Firebase upload
        console.log(`Uploading to ${bold("Threads")}..`);
        await uploadThreads(
          postFolderPath,
          settings,
          userConfig,
          storage,
          firebaseUid,
          dev,
        );
      } else if (platform === "twitter") {
        console.log(`Uploading to ${bold("Twitter")}..`);
        await uploadTwitter(envVars, postFolderPath, settings, dev);
      }
    }
    return true;
  } catch (e) {
    throw new Error(`Error in uploadPost \n${e}`);
  }
}
