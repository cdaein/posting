import { fileURLToPath } from "node:url";
import type { Config } from "./types";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import kleur from "kleur";

const { yellow } = kleur;

export const getDiffStat = (prev: number | undefined, diff: number) => {
  return (prev !== undefined && diff >= 0 ? "+" : "") + diff.toString();
};

/**
 * It will make sure desired `data` is available and returned. Otherwise, it throws an error.
 * @template T - could be any data type
 * @param `[error, data]` - Takes in result from `handleAsync()`
 * @param customMessage - error handling message
 * @returns returns `data`
 */
export function ensureData<T>(
  [error, data]: [any, T | null],
  customMessage: string,
): T {
  if (error) {
    throw new Error(`${customMessage}: ${error.message || error}`);
  }
  return data as T;
}

/**
 *
 * @template T - any data type to return
 * @param promise - any function that will return a promise
 * @returns `[error, data]` each could be `null` while the other returns some value
 */
export async function handleAsync<T>(
  promise: Promise<T>,
): Promise<[any, T | null]> {
  try {
    const data = await promise;
    return [null, data];
  } catch (error) {
    return [error, null];
  }
}

/**
 * Rename and move path.  If already exists, add number suffix at the end.
 * If `how === rename`, original will be moved. use `copy` to keep the original file/folder
 * If `isDirectory = false`, suffix is added before extension.
 *
 * @param oldPath - file or directory
 * @param newPath - file or directory
 * @param how - rename (affect original) or copy (original intact)
 * @param isDirectory -  default: `true`
 */
export const versionUpPath = async (
  oldPath: string,
  newPath: string,
  how: "rename" | "copy",
  isDirectory = true,
) => {
  const newFolderPath = path.dirname(newPath);
  // ext includes dot
  const ext = path.extname(newPath);
  const baseWithoutExt = isDirectory
    ? path.basename(newPath)
    : path.basename(newPath, ext);

  let count = 0;
  // number up if existing file found and not overwriting
  while (fs.existsSync(newPath)) {
    count++;
    newPath = path.join(
      newFolderPath,
      `${baseWithoutExt}-${count}${isDirectory ? "" : ext}`,
    );
  }

  try {
    if (how === "rename") {
      await fs.promises.rename(oldPath, newPath);
    } else if (how === "copy") {
      await fs.promises.copyFile(oldPath, newPath);
    }
    // console.log(
    //   `Path ${how === "rename" ? "renamed" : "copied"} to ${yellow(newPath)}`,
    // );
    return newPath;
  } catch (e) {
    throw new Error(`Error renaming the path: ${e}`);
  }
};

export async function waitForFile(
  filePath: string,
  timeout: number,
  interval: number,
) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (fs.existsSync(filePath)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Timeout: ${filePath} not found after ${timeout}ms`);
}

/**
 * Filter only directory & timestamped folder name
 * @param folderPath - full folder path
 * @returns
 */
export function isPostFolder(folderPath: string) {
  // filter only directories && timestamped folder names
  return (
    fs.lstatSync(folderPath).isDirectory() &&
    /^\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}$/.test(path.basename(folderPath))
  );
}

export function isOutsideMinutes(
  targetTime: Date,
  currentTime: Date,
  diffThresholdMins: number,
): boolean {
  const diffMs = targetTime.getTime() - currentTime.getTime();
  const diffMins = diffMs / (1000 * 60);

  if (diffThresholdMins > 0) {
    return diffMins > 0 && diffMins > diffThresholdMins;
  } else {
    return diffMins < 0 && diffMins < diffThresholdMins;
  }
}

/**
 * Check if target time is within threshold.
 * It only look at one direction in time. Use positive `diffThresholdMins` to check for future, negative for past.
 * @param targetTime -
 * @param currentTime -
 * @param diffThresholdMins - difference threshold in minutes
 * @returns
 */
export function isWithinMinutes(
  targetTime: Date,
  currentTime: Date,
  diffThresholdMins: number,
) {
  const diffMs = targetTime.getTime() - currentTime.getTime();
  const diffMins = diffMs / (1000 * 60);

  if (diffThresholdMins > 0) {
    // When the threshold is positive, check if the target time is within the future threshold
    return diffMins >= 0 && diffMins <= diffThresholdMins;
  } else {
    // When the threshold is negative, check if the target time is within the past threshold
    return diffMins <= 0 && diffMins >= diffThresholdMins;
  }
}

export function parsePostFolderName(folderName: string) {
  const [date, time] = folderName.split("-");
  const [year, month, day] = date.split(".").map(Number);
  const [hours, minutes] = time.split(".").map(Number);
  return new Date(year, month - 1, day, hours, minutes);
}

export function formatPostFolderName(str: string, localTime = true) {
  const date = new Date(str);

  if (localTime) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}.${month}.${day}-${hours}.${minutes}`;
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${year}.${month}.${day}-${hours}.${minutes}`;
}

/**
 * Resolve path in case it starts with `~`.
 * @param pathArg -
 * @returns
 */
export function resolvePath(pathArg: string) {
  if (pathArg.startsWith("~")) {
    return path.join(os.homedir(), pathArg.slice(1));
  }
  return path.resolve(pathArg);
}

// FIX: no longer need to merge config as this should now be handled
// by program, not user.
export async function loadConfig(
  defaultConfig: Config,
  userConfigPath: string,
): Promise<Config> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const configPath = path.resolve(__dirname, userConfigPath);

  try {
    await fs.promises.access(configPath);
    const fileContent = fs.readFileSync(configPath, "utf-8");
    const userConfig = JSON.parse(fileContent);

    // Shallow merge user config with default config
    return Object.assign({}, defaultConfig, userConfig);
  } catch (error) {
    if (error instanceof Error) {
      if ("code" in error && error.code === "ENOENT") {
        console.log(
          "User configuration file not found. Using default configuration.",
        );
      } else {
        console.warn("Error loading user configuration:", error.message);
      }
    } else {
      // Non-Error object thrown
      console.warn("An unexpected error occurred:", error);
    }
    return defaultConfig;
  }
}
