import async from "async";
import { Command } from "commander";
import kleur from "kleur";
import fs from "node:fs";
import path from "path";
import prompts from "prompts";
import {
  MASTODON_MAX_ATTACHMENTS,
  THREADS_MAX_ATTACHMENTS,
  TIME_FUTURE_THRESHOLD,
  TIME_PAST_THRESHOLD,
  TWITTER_MAX_ATTACHMENTS,
} from "./constants";
import { processFolder } from "./process-folder";
import {
  bodyTextQuestionFn,
  dateQuestion,
  multiFilesQuestionFn,
  platformsQuestion,
  postTypeQuestion,
} from "./questions";
import { initFirebase } from "./storages/firebase";
import { Config, EnvVars, Platform, PostType } from "./types";
import { uploadPost } from "./upload-post";
import { formatPostFolderName } from "./utils";
import { watchStart } from "./watch-folder";

const { red, yellow } = kleur;

export function initCreateCommand(program: Command, watchDir: string) {
  program.command("create").action(async () => {
    try {
      const promptOptions = {
        onCancel: () => {
          throw new Error(red("✖") + " cancelled");
        },
      };

      let platforms: Platform[] = [];
      // make sure at least 1 platform selected
      while (platforms.length === 0) {
        const platformsAnswer = await prompts(platformsQuestion, promptOptions);
        platforms = platformsAnswer.platforms;
      }

      const postTypeAnswer = await prompts(postTypeQuestion, promptOptions);
      const postType: PostType = postTypeAnswer.postType;

      // text post needs text body
      // REVIEW: ask this later only if there's no media attachment
      // then, i can skip this check and postType question.
      const bodyTextAnswer = await prompts(
        bodyTextQuestionFn(platforms, postType),
        promptOptions,
      );
      const bodyText = bodyTextAnswer.bodyText;

      // ask for multiple file paths
      const filePaths: string[] = [];
      // minimum of all platforms max attachments
      const maxAttachments = Math.min(
        ...platforms.map((platform) => {
          if (platform === "mastodon") return MASTODON_MAX_ATTACHMENTS;
          else if (platform === "threads") return THREADS_MAX_ATTACHMENTS;
          else if (platform === "twitter") return TWITTER_MAX_ATTACHMENTS;
          return 1;
        }),
      );
      // ask files to attach until answer is empty
      let numAttached = 0;
      let askMoreAttachment = true;
      while (
        postType === "media" &&
        numAttached < maxAttachments &&
        askMoreAttachment
      ) {
        const multiFilesAnswer = await prompts(
          multiFilesQuestionFn(
            platforms,
            postType,
            maxAttachments,
            numAttached,
          ),
          promptOptions,
        );
        if (multiFilesAnswer.mediaPath?.length === 0) {
          askMoreAttachment = false;
        } else {
          filePaths.push(multiFilesAnswer.mediaPath);
          numAttached++;
        }
      }

      const dateAnswer = await prompts(dateQuestion, promptOptions);
      const { postDate } = dateAnswer;

      // Create a folder inside watchDir with datetime string
      // FIX: instead of exiting, check this while asking in prompts
      const folderName = formatPostFolderName(postDate.toISOString());
      const folderPath = path.join(watchDir, folderName);
      if (fs.existsSync(folderPath)) {
        console.error(`The folder already exists at ${folderPath}`);
        process.exit(1);
      }
      fs.mkdirSync(folderPath, { recursive: true });

      // Copy media files to watchdir
      const targetFilePaths: string[] = [];
      for (const filePath of filePaths) {
        let targetFilePath = "";
        const filePathTrimmed = filePath?.trim();
        if (filePathTrimmed) {
          targetFilePath = path.resolve(
            folderPath,
            path.basename(filePathTrimmed),
          );
          console.log(
            `Copying media file from ${yellow(filePathTrimmed)} to ${yellow(targetFilePath)}`,
          );
          fs.copyFileSync(filePathTrimmed, targetFilePath);
          targetFilePaths.push(targetFilePath);
        }
      }

      // Create settings.json file in the scheduled post folder
      // TODO: use yaml or toml for user friendliness
      // REVIEW: any platform-specific settings to add?
      const settings = {
        postType,
        platforms,
        bodyText,
        // filename: path.basename(targetFilePath),
        filenames: targetFilePaths.map((filePath) => path.basename(filePath)),
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
    // TODO: pass to uploadPost
    .option("--debug", "Debug log")
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
          uploadPost(
            envVars,
            folderPath,
            userConfig,
            storage,
            firebaseUid,
            opts.dev,
          )
            .then(async () => {
              // move the published folder to _published
              const publishedFolderPath = path.join(watchDir, "_published");
              if (!fs.existsSync(publishedFolderPath)) {
                fs.mkdirSync(publishedFolderPath, { recursive: true });
              }
              // FIX: folder should move when it fails to prevent from duplicate posting.
              // be on the safe side.
              try {
                const newFolderPath = path.join(
                  publishedFolderPath,
                  path.basename(folderPath),
                );
                await fs.promises.rename(folderPath, newFolderPath);
                console.log(`Folder moved to ${yellow(newFolderPath)}`);
              } catch (e) {
                console.error(`Error moving post folder \n${e}`);
                process.exit(1);
              }
              // let async know the current task is completed
              cb();
            })
            .catch((e) => {
              console.error(`Error processing post folder: \n${e}`);
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
