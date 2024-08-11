import kleur from "kleur";
import path from "node:path";
import { ThreadsClient, ThreadsUserData } from "../clients/threads-client";
import { THREADS_IMAGE_FORMATS } from "../constants";
import { FirebaseFileInfo } from "../storages/firebase";
import { PostsSettings } from "../types";
import { ensureData, getDiffStat, handleAsync } from "../utils";

export type ThreadsMediaType = "TEXT" | "IMAGE" | "VIDEO" | "CAROUSEL";

export type ThreadsMediaData = {
  is_carousel_item?: boolean;
  media_type: ThreadsMediaType;
  /** conainter IDs for carousel post children. single string joined by comma. */
  children?: string;
  text?: string;
  /** must be a public URL */
  image_url?: string;
  /** must be a public URL */
  video_url?: string;
  access_token: string;
};

export type ThreadsPublishData = {
  creation_id: string;
  access_token: string;
};

export type ThreadsStatus = {
  id: string;
};

export type ThreadsStats = {
  views: number | null;
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  quotes: number | null;
};

export const threadsLastStats: ThreadsStats = {
  views: null,
  likes: null,
  replies: null,
  reposts: null,
  quotes: null,
};

const diffStats: ThreadsStats = {
  views: 0,
  likes: 0,
  replies: 0,
  reposts: 0,
  quotes: 0,
};

const { bold, green, yellow } = kleur;

/**
 * First upload image to Firebase to get public URL. Then, publish to Threads.
 * @param client -
 * @param settings -
 * @param firebaseFileInfos -
 * @param dev -
 * @returns
 */
export async function uploadThreads(
  client: ThreadsClient,
  settings: PostsSettings,
  firebaseFileInfos: FirebaseFileInfo[][],
  dev: boolean,
) {
  if (dev) {
    return "DEV MODE THREADS";
  }

  const { posts } = settings;

  const publishContainerIds: string[] = [];
  const statuses: ThreadsStatus[] = [];

  // NOTE: if reply thread fails in the middle (happend to me), i want to delete the whole thread,
  // but stupidly, Threads API doesn't have a way to delete a post.
  for (let j = 0; j < posts.length; j++) {
    const post = posts[j];
    const { postType, bodyText, fileInfos } = post;

    if (postType === "text") {
      // 1. text only post
      const result = await handleAsync(
        client.createTextContainer(
          bodyText,
          j !== 0 ? { replyToId: statuses[j - 1].id } : {},
        ),
      );
      const containerId = ensureData(
        result,
        "Error creating text container on Threads",
      );
      publishContainerIds.push(containerId);
      await checkContainerStatus(client, containerId);
    } else {
      if (fileInfos.length === 1) {
        // NOTE: Threads *has* alt text, but it's not documented on API..
        const { filename, altText } = fileInfos[0];
        // 2. single media post
        console.log(`Creating a media container for ${yellow(filename)}`);
        const ext = path.extname(filename).toLowerCase().slice(1);
        const result = await handleAsync(
          THREADS_IMAGE_FORMATS.includes(ext)
            ? client.createImageContainer(
                firebaseFileInfos[j][0].downloadUrl,
                bodyText,
                j !== 0 ? { replyToId: statuses[j - 1].id } : {},
              )
            : client.createVideoContainer(
                firebaseFileInfos[j][0].downloadUrl,
                bodyText,
                j !== 0 ? { replyToId: statuses[j - 1].id } : {},
              ),
        );
        const containerId = ensureData(
          result,
          "Error creating media container on Threads",
        );
        console.log(`Media container created. id: ${green(containerId)}`);
        publishContainerIds.push(containerId);
        await checkContainerStatus(client, containerId);
      } else {
        // 3. carousel post
        const mediaContainerIds: string[] = [];
        for (let i = 0; i < fileInfos.length; i++) {
          const { filename, altText } = fileInfos[i];
          // 3.a. create item container IDs
          console.log(`Creating a media container for ${yellow(filename)}`);
          const ext = path.extname(filename).toLowerCase().slice(1);
          const result = await handleAsync(
            THREADS_IMAGE_FORMATS.includes(ext)
              ? client.createImageContainer(
                  firebaseFileInfos[j][i].downloadUrl,
                  "",
                  {
                    isCarouselItem: true,
                    ...(j !== 0 ? { replyToId: statuses[j - 1].id } : {}),
                  },
                )
              : client.createVideoContainer(
                  firebaseFileInfos[j][i].downloadUrl,
                  "",
                  {
                    isCarouselItem: true,
                    ...(j !== 0 ? { replyToId: statuses[j - 1].id } : {}),
                  },
                ),
          );
          const containerId = ensureData(
            result,
            "Error creating carousel item on Threads",
          );
          mediaContainerIds.push(containerId);
          console.log(`Media container created. id: ${green(containerId)}`);
        }

        // TODO: this is blocking - what if later items finish first?
        // use while loop and run it until all returns "FINISHED",
        // if any one of them returns "ERROR", throw error.
        for (const containerId of mediaContainerIds) {
          await checkContainerStatus(client, containerId);
        }

        // 3.c. create carousel media container ID
        console.log(
          `Creating a carousel container for ${green(mediaContainerIds.join(","))}`,
        );
        const result = await handleAsync(
          client.createCarouselContainer(
            mediaContainerIds,
            bodyText,
            j !== 0 ? { replyToId: statuses[j - 1].id } : {},
          ),
        );
        const carouselContainerID = ensureData(
          result,
          "Error creating carousel container on Threads",
        );
        publishContainerIds.push(carouselContainerID);

        // media container may not be immedidiately ready to publish. (ie. big files)
        // per IG API: query a container's status once per minute, for no more than 5 minutes.
        await checkContainerStatus(client, carouselContainerID);

        console.log(
          `Carousel container created. id: ${green(carouselContainerID)}`,
        );
      }
    }

    console.log(`Publishing on ${bold("Threads")}..`);
    const statusId = await client
      .publish(publishContainerIds[j])
      .then(async (id) => {
        console.log(`Published on ${bold("Threads")}. id: ${green(id)}`);
        return id;
      })
      .catch((e) => {
        // console.error(e.response?.data);
        throw new Error(`Error publishing on Threads \n${e}`);
      });

    statuses.push({ id: statusId });
  }
  return statuses;
}

/**
 * Check the uploaded container status. Used before publishing. Usually, any file takes some seconds before ready,
 * so there is a 5 second wait before calling API.
 * @param client - ThreadsClient
 * @param creationId -
 * @param maxRetries - default: 10
 * @param interval -  default: 30 seconds
 */
async function checkContainerStatus(
  client: ThreadsClient,
  creationId: string,
  maxRetries = 10,
  interval = 1000 * 30,
) {
  let retries = 0;

  // wait 3 sec before querying container status to reduce API calls.
  await new Promise((resolve) => setTimeout(resolve, 3000));

  while (retries < maxRetries) {
    try {
      const { status, error_message, id } =
        await client.checkContainerStatus(creationId);
      console.log(`Container status: ${status} (try ${retries + 1})`);

      if (status === "FINISHED") {
        console.log(`${green(creationId)} is ready to publish.`);
        return "FINISHED";
      } else if (status === "ERROR") {
        console.error(`Media container failed: ${error_message}`);
        throw new Error(error_message);
      }

      retries++;
      if (retries < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, interval));
      }
    } catch (e: any) {
      throw new Error(`Error checking container status: ${e}`);
    }
  }

  throw new Error(`Max retries reached. Media is not ready to publish.`);
}

// https://developers.facebook.com/docs/threads/insights
export async function getThreadsStats(
  client: ThreadsClient,
  lastStats: ThreadsStats,
) {
  const userDataResult = await handleAsync<ThreadsUserData[]>(
    client.getUserData(1),
  );
  const userData = ensureData(
    userDataResult,
    "Error retrieving user data on Threads",
  );

  const { id: mediaId, text, permalink } = userData[0];

  const postInsightsResult = await handleAsync<ThreadsStats>(
    client.getPostInsights(mediaId),
  );
  const curStats = ensureData(
    postInsightsResult,
    "Error retrieving post insights on Threads",
  );

  const keys = Object.keys(diffStats) as (keyof ThreadsStats)[];
  for (const key of keys) {
    if (curStats[key] && lastStats[key]) {
      diffStats[key] = curStats[key] - lastStats[key];
    } else {
      diffStats[key] = curStats[key];
    }
  }

  const { likes, replies, reposts, quotes } = diffStats;

  console.log(`Latest ${bold("Threads")} (${green(permalink)}) stats`);
  text && console.log(`Text: ${text}`);
  // const viewsStr = `Views: ${green(views)}`;
  const likesStr = likes
    ? `Likes: ${green(getDiffStat(lastStats.likes, likes))}`
    : "";
  const repliesStr = replies
    ? `Replies: ${green(getDiffStat(lastStats.replies, replies))}`
    : "";
  const repostsStr = reposts
    ? `Reposts: ${green(getDiffStat(lastStats.reposts, reposts))}`
    : "";
  const quotesStr = quotes
    ? `Quotes: ${green(getDiffStat(lastStats.quotes, quotes))}`
    : "";

  const hasUpdates = [likesStr, repliesStr, repostsStr, quotesStr].some(
    (str) => str.length > 0,
  );
  hasUpdates
    ? console.log(likesStr, repliesStr, repostsStr, quotesStr)
    : console.log("No updates found");

  // update last stat to current stat
  for (const key of keys) {
    lastStats[key] = curStats[key];
  }
}
