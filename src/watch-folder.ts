import chokidar from "chokidar";
import type { QueueObject } from "async";
import { isOutsideMinutes, isPostFolder, parsePostFolderName } from "./utils";
import fs from "node:fs";
import path from "node:path";
import kleur from "kleur";
import { TIME_FUTURE_THRESHOLD, TIME_PAST_THRESHOLD } from "./constants";

const { yellow } = kleur;

export function watchStart(
  watchDir: string,
  queue: QueueObject<string>,
  dev: boolean,
) {
  const watcher = chokidar.watch(watchDir, {
    persistent: true,
    ignoreInitial: true,
    depth: 0,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 500,
    },
  });

  watcher
    .on("addDir", (folderPath) => {
      if (!isPostFolder(folderPath)) return;

      const targetTime = parsePostFolderName(path.basename(folderPath));
      const currentTime = new Date();
      if (
        !isTimeToPublish(folderPath, targetTime, currentTime, [
          TIME_PAST_THRESHOLD,
          TIME_FUTURE_THRESHOLD,
        ])
      ) {
        return;
      }

      queue.push(folderPath, (e) => {
        e && console.error(e);
      });
    })
    .on("error", (e) => {
      console.error(`Error while watching ${watchDir} ${e}`);
    });
}

/**
 * @param watchDir -
 * @param queue -
 * @param thresholds - `[pastThreshold, futureThreshold]`
 */
export async function processFolder(
  watchDir: string,
  queue: QueueObject<string>,
  thresholds: [number, number],
) {
  // scan watchDir for already existing posts.
  await fs.promises.readdir(watchDir).then((folders) => {
    const foldersToProcess: string[] = [];

    for (const folder of folders) {
      const folderPath = path.join(watchDir, folder);
      if (!isPostFolder(folderPath)) continue;
      foldersToProcess.push(folderPath);
    }

    const currentTime = new Date();
    for (const folderPath of foldersToProcess) {
      const targetTime = parsePostFolderName(path.basename(folderPath));

      if (!isTimeToPublish(folderPath, targetTime, currentTime, thresholds)) {
        continue;
      }

      // instead of directly uploading, add to queue
      queue.push(folderPath, (e) => {
        e && console.error(e);
      });
    }
  });
}

/**
 *
 * @param folderPath -
 * @param targetTime -
 * @param currentTime -
 * @param thresholds - `[ pastThreshold, futureThreshold ]`
 * @returns
 */
export function isTimeToPublish(
  folderPath: string,
  targetTime: Date,
  currentTime: Date,
  thresholds: [number, number],
) {
  // has it passed beyond time threshold? log and skip
  if (isOutsideMinutes(targetTime, currentTime, thresholds[0])) {
    if (thresholds[0] !== 0) {
      console.log(`Scheduled time has passed. Skipping ${yellow(folderPath)}`);
    }
    return false;
  }
  // has it too far in the future? skip
  if (isOutsideMinutes(targetTime, currentTime, thresholds[1])) {
    return false;
  }
  return true;
}
