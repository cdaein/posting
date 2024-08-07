import async from "async";
import { Command } from "commander";
import { CronJob } from "cron";
import kleur from "kleur";
import fs from "node:fs";
import path from "path";
import prompts from "prompts";
import { initThreadsClient } from "./clients/threads-client";
import { TIME_FUTURE_THRESHOLD, TIME_PAST_THRESHOLD } from "./constants";
import { getBlueskyStats, initBlueskyAgent } from "./platforms/bluesky";
import { getMastodonStats, initMastodonClient } from "./platforms/mastodon";
import { getThreadsStats } from "./platforms/threads";
import { getTwitterStats, initTwitterClient } from "./platforms/twitter";
import { processFolder } from "./process-folder";
import {
  bodyTextQuestionFn,
  dateQuestionFn,
  multiFilesQuestionFn,
  platformsQuestion,
  postTypeQuestion,
} from "./questions";
import { Config, EnvVars, Platform, PostType } from "./types";
import { getMaxAttachments, uploadPost } from "./upload-post";
import { formatPostFolderName, versionUpPath } from "./utils";
import { watchStart } from "./watcher";

const { bold, green, red, yellow } = kleur;

const promptOptions = {
  onCancel: () => {
    throw new Error(red("✖") + " cancelled");
  },
};

export function initCreateCommand(program: Command, watchDir: string) {
  program.command("create").action(async () => {
    if (!fs.existsSync(watchDir)) {
      console.error(`Watch directory doesn't exist at ${watchDir}`);
      process.exit(1);
    }
    if (!fs.lstatSync(watchDir).isDirectory()) {
      console.error(`Watch directory is not a directory.`);
      process.exit(1);
    }

    try {
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

      // ask for multiple file paths and descriptions (alt text)
      const fileInfos: { mediaPath: string; altText: string }[] = [];
      const maxAttachments = getMaxAttachments(platforms);
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
          fileInfos.push({
            mediaPath: multiFilesAnswer.mediaPath,
            altText: multiFilesAnswer.altText,
          });
          numAttached++;
        }
      }

      const dateAnswer = await prompts(dateQuestionFn(watchDir), promptOptions);
      const { postDate } = dateAnswer;

      // Create a folder inside watchDir with datetime string
      const folderName = formatPostFolderName(postDate.toISOString());
      const folderPath = path.join(watchDir, folderName);
      fs.mkdirSync(folderPath, { recursive: true });

      // Copy media files to watchdir
      const targetFilePaths: string[] = [];
      for (const fileInfo of fileInfos) {
        const filePath = fileInfo.mediaPath;
        let targetFilePath = "";
        const filePathTrimmed = filePath?.trim();
        if (filePathTrimmed) {
          targetFilePath = path.resolve(
            folderPath,
            path.basename(filePathTrimmed),
          );
          // if filenames are same (but could be from different path), version up name when copying
          const renamedPath = await versionUpPath(
            filePathTrimmed,
            targetFilePath,
            "copy",
            false,
          );
          console.log(
            `Copied media file from ${yellow(filePathTrimmed)} to ${yellow(renamedPath)}`,
          );
          targetFilePaths.push(renamedPath);
        }
      }

      // Create settings.json file in the scheduled post folder
      const settings = {
        postType,
        platforms,
        bodyText,
        fileInfos: fileInfos.map((fileInfo, i) => {
          return {
            filename: path.basename(targetFilePaths[i]),
            altText: fileInfo.altText.trim(),
          };
        }),
      };
      const settingsString = JSON.stringify(settings, null, 2);
      fs.writeFileSync(
        path.resolve(folderPath, "settings.json"),
        settingsString,
        "utf8",
      );

      console.log(`The post is ready at ${yellow(folderPath)}`);
      console.log(
        `It will be published around the scheduled time if ${green("posting watch")} is running.`,
      );
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
    .option("--stats", "Check stats of the latest posts every hour")
    // TODO: pass to uploadPost
    .option("--debug", "Debug log")
    .option("--dev", "Dev mode. No post is uploaded.")
    .action(async (opts) => {
      if (!fs.existsSync(watchDir)) {
        console.error(`Watch directory doesn't exist at ${watchDir}`);
        process.exit(1);
      }
      if (!fs.lstatSync(watchDir).isDirectory()) {
        console.error(`Watch directory is not a directory.`);
        process.exit(1);
      }

      console.log(`Watching ${yellow(watchDir)}`);

      const blueskyAgent = await initBlueskyAgent(envVars);
      const mastodonClient = initMastodonClient(envVars);
      const threadsClient = initThreadsClient(envVars);
      const twitterClient = initTwitterClient(envVars);

      // check stats
      if (opts.stats) {
        console.log(`Will check stats every hour between 6am and midnight.`);

        CronJob.from({
          start: true,
          cronTime: userConfig.cronTime,
          onTick: async function () {
            console.log(
              `\nChecking stats.. (as of ${bold(new Date().toLocaleString())})`,
            );

            if (blueskyAgent) {
              try {
                await getBlueskyStats(envVars, blueskyAgent, userConfig);
              } catch (e: unknown) {
                e instanceof Error && console.error(e.message);
              }
            }
            if (threadsClient) {
              try {
                await getThreadsStats(threadsClient);
              } catch (e) {
                e instanceof Error && console.error(e.message);
              }
            }
            if (mastodonClient) {
              try {
                await getMastodonStats(mastodonClient);
              } catch (e) {
                e instanceof Error && console.error(e.message);
              }
            }
            if (twitterClient) {
              try {
                await getTwitterStats(twitterClient);
              } catch (e) {
                e instanceof Error && console.error(e.message);
              }
            }
          },
        });
      }

      try {
        // queue (in case of many posts around the same time)
        const queue = async.queue((folderPath: string, cb) => {
          console.log(`Added to queue ${yellow(folderPath)}`);
          uploadPost(
            envVars,
            { blueskyAgent, mastodonClient, threadsClient, twitterClient },
            folderPath,
            opts.dev,
          )
            .then(async () => {
              // move the published folder to _published
              const publishedFolderPath = path.join(watchDir, "_published");
              if (!fs.existsSync(publishedFolderPath)) {
                fs.mkdirSync(publishedFolderPath, { recursive: true });
              }
              try {
                const postFoldername = path.basename(folderPath);
                const newFolderPath = path.join(
                  publishedFolderPath,
                  postFoldername,
                );
                // move to _published. if folder already exists, version up
                const renamedPath = await versionUpPath(
                  folderPath,
                  newFolderPath,
                  "rename",
                );
                console.log(`Folder moved to ${yellow(renamedPath)}`);
              } catch (e) {
                console.error(`Error moving post folder \n${e}`);
                // if post folder is not moved, exit to prevent duplicate posting at next scan.
                process.exit(1);
              }
              // let async know the current task is completed
              cb();
            })
            .catch(async (e) => {
              // move the failed post folder to _failed
              const failedFolderPath = path.join(watchDir, "_failed");
              if (!fs.existsSync(failedFolderPath)) {
                fs.mkdirSync(failedFolderPath, { recursive: true });
              }
              try {
                const newFolderPath = path.join(
                  failedFolderPath,
                  path.basename(folderPath),
                );
                await versionUpPath(folderPath, newFolderPath, "rename");
                // await fs.promises.rename(folderPath, newFolderPath);
                console.error(`Folder moved to ${yellow(newFolderPath)}`);
              } catch (e) {
                console.error(`Error moving post folder \n${e}`);
                // if post folder is not moved, exit to prevent duplicate posting at next scan.
                process.exit(1);
              }
              console.error(e);
              cb(e);
              // REVIEW: quit after error or not?
              // process.exit(1);
            });
        }, 1);
        queue.drain(() => {
          // console.log("Scheduled posts have been processed.");
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
          process.exit();
        });
      } catch (e) {
        console.error(e);
      }
    });

  return program;
}
