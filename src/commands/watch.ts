import { BskyAgent } from "@atproto/api";
import async from "async";
import { Command } from "commander";
import { CronJob } from "cron";
import kleur from "kleur";
import fs from "node:fs";
import path from "path";
import { initInstagramClient } from "../clients/instagram-client";
import { initThreadsClient } from "../clients/threads-client";
import { TIME_FUTURE_THRESHOLD, TIME_PAST_THRESHOLD } from "../constants";
import {
  blueskyLastStats,
  BlueskyStats,
  getBlueskyStats,
  initBlueskyAgent,
} from "../platforms/bluesky";
import {
  getInstagramStats,
  instagramLastStats,
  InstagramStats,
} from "../platforms/instagram";
import {
  getMastodonStats,
  initMastodonClient,
  mastodonLastStats,
  MastodonStats,
} from "../platforms/mastodon";
import {
  getThreadsStats,
  threadsLastStats,
  ThreadsStats,
} from "../platforms/threads";
import {
  getTwitterStats,
  initTwitterClient,
  twitterLastStats,
  TwitterStats,
} from "../platforms/twitter";
import { processFolder } from "../process-folder";
import { Config, EnvVars } from "../types";
import { uploadPost } from "../upload-post";
import { versionUpPath } from "../utils";
import { watchStart } from "../watcher";

export interface LastStats {
  bluesky: Record<keyof BlueskyStats, number | null>;
  instagram: Record<keyof InstagramStats, number | null>;
  mastodon: Record<keyof MastodonStats, number | null>;
  threads: Record<keyof ThreadsStats, number | null>;
  twitter: Record<keyof TwitterStats, number | null>;
}

const { bold, yellow } = kleur;

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

      let blueskyAgent: BskyAgent | undefined;
      try {
        blueskyAgent = await initBlueskyAgent(envVars);
      } catch (e) {
        console.error(e);
      }
      const instagramClient = initInstagramClient(envVars);
      const mastodonClient = initMastodonClient(envVars);
      const threadsClient = initThreadsClient(envVars);
      const twitterClient = initTwitterClient(envVars);

      // initialize last stats
      // mainly to get keys from each platform
      const lastStats: LastStats = {
        bluesky: blueskyLastStats,
        instagram: instagramLastStats,
        mastodon: mastodonLastStats,
        threads: threadsLastStats,
        twitter: twitterLastStats,
      };

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
                await getBlueskyStats(envVars, blueskyAgent, lastStats.bluesky);
              } catch (e: unknown) {
                e instanceof Error && console.error(e.message);
              }
            }
            if (instagramClient) {
              // try {
              //   await getInstagramStats(instagramClient, lastStats.instagram);
              // } catch (e) {
              //   e instanceof Error && console.error(e.message);
              // }
            }
            if (mastodonClient) {
              try {
                await getMastodonStats(mastodonClient, lastStats.mastodon);
              } catch (e) {
                e instanceof Error && console.error(e.message);
              }
            }
            if (threadsClient) {
              try {
                await getThreadsStats(threadsClient, lastStats.threads);
              } catch (e) {
                e instanceof Error && console.error(e.message);
              }
            }
            if (twitterClient) {
              try {
                await getTwitterStats(twitterClient, lastStats.twitter);
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
            {
              blueskyAgent,
              instagramClient,
              mastodonClient,
              threadsClient,
              twitterClient,
            },
            folderPath,
            opts.dev,
          )
            .then(async (uploaded) => {
              // reset last stats after each upload per platform
              // REVIEW: test before git push
              // - for test, watch should be running at least 1+ hour after uploading a new post.
              for (const key in lastStats) {
                const platformStats = lastStats[key as keyof LastStats];
                if (uploaded[key as keyof LastStats]) {
                  for (const statKey in platformStats) {
                    (platformStats as Record<string, number | null>)[statKey] =
                      null;
                  }
                }
              }

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
