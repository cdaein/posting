import { QueueObject } from "async";
import path from "path";
import { isPostFolder, parsePostFolderName } from "./utils";
import { isTimeToPublish } from "./watcher";
import fs from "node:fs";

/**
 * Go through watch directory and add scheduled posts that meet the conditions to the process queue.
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
