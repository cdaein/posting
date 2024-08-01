import { program } from "commander";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { description, version } from "../package.json";
import { initCreateCommand, initWatchCommand } from "./commands";
import { defaultConfig } from "./constants";
import { EnvVars } from "./types";
import { loadConfig, resolvePath } from "./utils";
import figlet from "figlet";

// access .env from anywhere (when calling as global command)
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.dirname(scriptDir);
dotenv.config({ path: path.join(projectDir, ".env") });

const envVars: EnvVars = {
  //
  blueskyUsername: process.env.BLUESKY_USERNAME!,
  blueskyPassword: process.env.BLUESKY_PASSWORD!,
  //
  firebaseApiKey: process.env.FIREBASE_API_KEY!,
  firebaseEmail: process.env.FIREBASE_EMAIL!,
  firebasePassword: process.env.FIREBASE_PASSWORD!,
  //
  instagramUserId: process.env.INSTAGRAM_USER_ID!,
  instagramAccessToken: process.env.INSTAGRAM_ACCESS_TOKEN!,
  //
  mastodonInstaceUrl: process.env.MASTODON_INSTANCE_URL!,
  mastodonAccessToken: process.env.MASTODON_ACCESS_TOKEN!,
  //
  threadsUserId: process.env.THREADS_USER_ID!,
  threadsAccessToken: process.env.THREADS_ACCESS_TOKEN!,
  //
  twitterAppKey: process.env.TWITTER_API_KEY!,
  twitterAppSecret: process.env.TWITTER_API_KEY_SECRET!,
  twitterAccessToken: process.env.TWITTER_ACCESS_TOKEN!,
  twitterAccessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET!,
};

// load user config
const userConfig = await loadConfig(defaultConfig, "../user.config.json");

// set up watch directory
const watchDir = resolvePath(userConfig.watchDir);
if (!fs.existsSync(watchDir)) {
  console.error(`Watch directory doesn't exist.`);
  process.exit(1);
}
if (!fs.lstatSync(watchDir).isDirectory()) {
  console.error(`Watch directory is not a directory.`);
  process.exit(1);
}

console.log(
  figlet.textSync("posting", {
    font: "Hollywood",
    // font: "Slant",
    whitespaceBreak: true,
  }),
);
console.log();

program.version(version).description(description);

// init commands
initCreateCommand(program, watchDir);
initWatchCommand(program, watchDir, envVars, userConfig);

program.parse();
