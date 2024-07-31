import async from "async";
import { Command } from "commander";
import kleur from "kleur";
import path from "path";
import { TIME_PAST_THRESHOLD, TIME_FUTURE_THRESHOLD } from "./constants";
import { initFirebase } from "./storages/firebase";
import { uploadPost } from "./upload-post";
import { watchStart } from "./watch-folder";
import { Config, EnvVars, PromptsResponse } from "./types";
import fs from "node:fs";
import prompts from "prompts";
import { questions } from "./create-schedule";
import { formatPostFolderName } from "./utils";
import { processFolder } from "./process-folder";

const { red, yellow } = kleur;

export function initCreateCommand(program: Command, watchDir: string) {
  program.command("create").action(async () => {
    try {
      const response = await prompts(questions, {
        onCancel: () => {
          throw new Error(red("✖") + " cancelled");
        },
      });

      const { postType, platforms, imagePath, videoPath, bodyText, postDate } =
        response as PromptsResponse;

      // need at least 1 platform. prompts doesn't have a way to validate multiselect.
      if (platforms.length === 0) {
        console.error(`Need at least 1 platform. Try again.`);
        process.exit(1);
      }
      // text post needs body text
      if (postType === "text" && bodyText.trim().length === 0) {
        console.error(`Text post needs bodyText. Try again.`);
        process.exit(1);
      }

      const filePath = imagePath || videoPath;

      // Create a folder inside watchDir with datetime string
      const folderName = formatPostFolderName(postDate.toISOString());
      const folderPath = path.join(watchDir, folderName);
      if (fs.existsSync(folderPath)) {
        console.error(`The folder already exists at ${folderPath}`);
        process.exit(1);
      }
      fs.mkdirSync(folderPath, { recursive: true });

      // Copy media file to watchdir (rename to 001.[ext])
      let targetFilePath = "";
      if (filePath) {
        const filePathTrimmed = filePath.trim();
        if (filePathTrimmed) {
          targetFilePath = path.resolve(
            folderPath,
            path.basename(filePathTrimmed),
          );
          console.log(
            `Copying media file from ${yellow(filePathTrimmed)} to ${yellow(targetFilePath)}`,
          );
          fs.copyFileSync(filePathTrimmed, targetFilePath);
        }
      }

      // Create settings.json file in the scheduled post folder
      // REVIEW: any platform-specific settings to add?
      const settings = {
        postType,
        platforms,
        bodyText,
        filename: path.basename(targetFilePath),
      };
      const settingsString = JSON.stringify(settings, null, 2);
      fs.writeFileSync(
        path.resolve(folderPath, "settings.json"),
        settingsString,
        "utf8",
      );

      console.log(`The post is ready at ${yellow(folderPath)}`);
    } catch (e: unknown) {
      console.log((e as Error).message);
      return;
    }
  });
}

export function initWatchCommand(
  program: Command,
  watchDir: string,
  envVars: EnvVars,
  userConfig: Config,
) {
  program
    .command("watch")
    .option("--dev", "Dev mode. No post is uploaded.")
    .action(async (opts) => {
      console.log(`Watching ${yellow(watchDir)}`);

      try {
        const { storage, firebaseUid } = await initFirebase(
          envVars,
          userConfig,
        );

        // queue (in case of many posts around the same time)
        const queue = async.queue((folderPath: string, cb) => {
          console.log(`Added to queue ${yellow(folderPath)}`);
          uploadPost(folderPath, userConfig, storage, firebaseUid, opts.dev)
            .then(async () => {
              // move the published folder to _published
              const publishedFolderPath = path.join(watchDir, "_published");
              if (!fs.existsSync(publishedFolderPath)) {
                fs.mkdirSync(publishedFolderPath, { recursive: true });
              }
              try {
                const newFolderPath = path.join(
                  publishedFolderPath,
                  path.basename(folderPath),
                );
                await fs.promises.rename(folderPath, newFolderPath);
                console.log(`Folder moved to ${yellow(newFolderPath)}`);
              } catch (e) {
                throw new Error(`Error moving post folder: ${e}`);
              }
              // let async know the current task is completed
              cb();
            })
            .catch((e) => {
              console.error(`Error processing folder: ${e}`);
              cb(e);
            });
        }, 1);
        queue.drain(() => {
          console.log("Scheduled posts have been processed.");
        });

        // Three ways of monitoring posts
        // 1. set up watcher for incoming posts
        watchStart(watchDir, queue, opts.dev);
        // 2. scan existing scheduled posts at startup
        await processFolder(watchDir, queue, [
          TIME_PAST_THRESHOLD,
          TIME_FUTURE_THRESHOLD,
        ]);
        // 3. set up interval; once it's running, only look forward
        const intervalId = setInterval(
          async () => {
            await processFolder(watchDir, queue, [0, TIME_FUTURE_THRESHOLD]);
          },
          userConfig.processInterval * 60 * 1000,
        );

        process.on("SIGINT", () => {
          console.log("Received SIGINT. Exiting...");
          clearInterval(intervalId);
          process.exit(); // Exit the process after clearing the interval
        });
      } catch (e) {
        console.error(e);
      }
    });

  return program;
}
