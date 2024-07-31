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

// access .env from anywhere (when calling as global command)
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.dirname(scriptDir);
dotenv.config({ path: path.join(projectDir, ".env") });

const envVars: EnvVars = {
  firebaseApiKey: process.env.FIREBASE_API_KEY!,
  firebaseEmail: process.env.FIREBASE_EMAIL!,
  firebasePassword: process.env.FIREBASE_PASSWORD!,
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

program.version(version).description(description);

// init commands
initCreateCommand(program, watchDir);
initWatchCommand(program, watchDir, envVars, userConfig);

program.parse();
