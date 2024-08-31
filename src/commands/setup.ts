import { Command } from "commander";
import dotenv from "dotenv";
import kleur from "kleur";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import prompts, { Choice, PromptObject } from "prompts";
import { defaultConfig } from "../constants";
import {
  blueskyAuthQuestions,
  firebaseAuthQuestions,
  instagramAuthQuestions,
  mastodonAuthQuestions,
  threadsAuthQuestions,
  twitterAuthQuestions,
  watchDirQuestionFn,
} from "../questions";
import { loadConfig } from "../utils";

const { red } = kleur;

const platforms: Choice[] = [
  { title: "Bluesky", value: "bluesky" },
  { title: "Firebase", value: "firebase" },
  { title: "Instagram", value: "instagram" },
  { title: "Mastodon", value: "mastodon" },
  { title: "Threads", value: "threads" },
  { title: "Twitter", value: "twitter" },
];

export const platformsAuthQuestion: PromptObject = {
  type: "multiselect",
  name: "platforms",
  message: "Select one or more platforms to set up APIs",
  instructions: false,
  hint: "- Space to select. Return to submit",
  choices: platforms,
};

const promptOptions = {
  onCancel: () => {
    throw new Error(red("✖") + " cancelled");
  },
};

/**
 * Update `.env` file with `newEnv` data. If key doesn't exist in `.env`, a new one will be created.
 * @param envPath - `.env` file path
 * @param newEnv - new env object with key/value paris
 */
const updateEnv = (envPath: string, newEnv: Record<string, any>) => {
  const envConfig = dotenv.parse(fs.readFileSync(envPath));

  for (const key of Object.keys(newEnv)) {
    // Update the value if key exists, otherwise add a new key-value pair
    envConfig[key] = newEnv[key];
  }

  // Convert back to .env format
  const newEnvConfig = Object.entries(envConfig)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  // Write the updated content back to the .env file
  fs.writeFileSync(envPath, newEnvConfig, { encoding: "utf8" });
};

export function initSetupCommand(program: Command) {
  program.command("setup").action(async () => {
    console.log(`
All API credentials are stored locally in the installed directory.
They are sent to each platform for API authentication only. 
Run this script again to update any details.
`);

    const newEnv: Record<string, any> = {};

    // load or create env file
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const projectDir = path.dirname(scriptDir);
    const envPath = path.resolve(projectDir, ".env");
    if (!fs.existsSync(envPath)) {
      fs.writeFileSync(envPath, "");
    }

    // load userConfig
    // FIX: no long need to merge config file
    const userConfig = await loadConfig(defaultConfig, "../user.config.json");

    try {
      // ask to set up watch dir
      const watchDirAnswer = await prompts(
        watchDirQuestionFn(userConfig.watchDir),
        promptOptions,
      );
      // set the answer to userConfig
      userConfig.watchDir = watchDirAnswer.watchDir;
      const updatedConfig = JSON.stringify(userConfig, null, 2);

      // Write the updated JSON back to the file
      await fs.promises
        .writeFile(path.join(projectDir, "user.config.json"), updatedConfig)
        .catch(() => {
          throw new Error(`Error writing to user.config.json`);
        });
      console.log(`Updated watch directory in user.config.json`);

      const platformsAnswer = await prompts(
        platformsAuthQuestion,
        promptOptions,
      );
      if (platformsAnswer.platforms.length === 0) {
        process.exit();
      }

      const { platforms } = platformsAnswer;

      for (const platform of platforms) {
        if (platform === "bluesky") {
          console.log(`
Bluesky does not have API key setup, and you need to provide
Login email and password to use APIs.
`);
          const blueskyAuthData = await prompts(
            blueskyAuthQuestions,
            promptOptions,
          );
          for (const key of Object.keys(blueskyAuthData)) {
            newEnv[key] = blueskyAuthData[key];
          }
          updateEnv(envPath, newEnv);
        }
        if (platform === "firebase") {
          console.log(`
Firebase Sotrage is used for getting public URL for Threads/IG posting.
FIREBASE_EMAIL and PASSWORD is *NOT* your Firebase login info.
It is a user account you need to make from Firebase Console.
`);
          const firebaseAuthData = await prompts(
            firebaseAuthQuestions,
            promptOptions,
          );
          for (const key of Object.keys(firebaseAuthData)) {
            newEnv[key] = firebaseAuthData[key];
          }
          updateEnv(envPath, newEnv);
        }
        if (platform === "instagram") {
          console.log(`
Don't forget to also setup Firebase as Instagram API relies on
public URLs for media files.
`);
          const instagramAuthData = await prompts(
            instagramAuthQuestions,
            promptOptions,
          );
          for (const key of Object.keys(instagramAuthData)) {
            newEnv[key] = instagramAuthData[key];
          }
          updateEnv(envPath, newEnv);
        }
        if (platform === "mastodon") {
          console.log(`
Go to your Mastodon instance preferences > Development to get an Access Token.
`);
          const mastodonAuthData = await prompts(
            mastodonAuthQuestions,
            promptOptions,
          );
          for (const key of Object.keys(mastodonAuthData)) {
            newEnv[key] = mastodonAuthData[key];
          }
          updateEnv(envPath, newEnv);
        }
        if (platform === "threads") {
          console.log(`
Don't forget to also setup Firebase as Threads API relies on
public URLs for media files.
`);
          const threadsAuthData = await prompts(
            threadsAuthQuestions,
            promptOptions,
          );
          for (const key of Object.keys(threadsAuthData)) {
            newEnv[key] = threadsAuthData[key];
          }
          updateEnv(envPath, newEnv);
        }
        if (platform === "twitter") {
          console.log(`
Get a free Twitter API token and give read/write permission.
`);
          const twitterAuthData = await prompts(
            twitterAuthQuestions,
            promptOptions,
          );
          for (const key of Object.keys(twitterAuthData)) {
            newEnv[key] = twitterAuthData[key];
          }
          updateEnv(envPath, newEnv);
        }
      }
    } catch (e: unknown) {
      console.log((e as Error).message);
      return;
    }
  });
}
