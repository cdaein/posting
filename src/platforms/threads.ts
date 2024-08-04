import kleur from "kleur";
import path from "node:path";
import { ThreadsClient } from "../clients/threads-client";
import { THREADS_IMAGE_FORMATS } from "../constants";
import { FirebaseFileInfo } from "../storages/firebase";
import { PostSettings } from "../types";
import { waitForFile } from "../utils";

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
  settings: PostSettings,
  firebaseFileInfos: FirebaseFileInfo[],
  dev: boolean,
) {
  const { postType, bodyText, fileInfos } = settings;

  if (dev) {
    return "DEV MODE THREADS";
  }

  let publishContainerId = "";

  if (postType === "text") {
    // 1. text only post
    const containerId = await client.createTextContainer(bodyText);
    publishContainerId = containerId;
    await checkContainerStatus(client, containerId);
  } else {
    if (fileInfos.length === 1) {
      // NOTE: Threads *has* alt text, but it's not documented on API..
      const { filename, altText } = fileInfos[0];
      // 2. single media post
      console.log(`Creating a media container for ${yellow(filename)}`);
      const ext = path.extname(filename).toLowerCase().slice(1);
      const containerId = THREADS_IMAGE_FORMATS.includes(ext)
        ? await client.createImageContainer(
            firebaseFileInfos[0].downloadUrl,
            bodyText,
          )
        : await client.createVideoContainer(
            firebaseFileInfos[0].downloadUrl,
            bodyText,
          );
      console.log(`Media container created. id: ${green(containerId)}`);
      publishContainerId = containerId;
      await checkContainerStatus(client, containerId);
    } else {
      // 3. carousel post
      const mediaContainerIds: string[] = [];
      for (let i = 0; i < fileInfos.length; i++) {
        const { filename, altText } = fileInfos[i];
        // 3.a. create item container IDs
        console.log(`Creating a media container for ${yellow(filename)}`);
        const ext = path.extname(filename).toLowerCase().slice(1);
        const mediaContainerId = THREADS_IMAGE_FORMATS.includes(ext)
          ? await client.createImageContainer(
              firebaseFileInfos[0].downloadUrl,
              "",
              true,
            )
          : await client.createVideoContainer(
              firebaseFileInfos[0].downloadUrl,
              "",
              true,
            );
        mediaContainerIds.push(mediaContainerId);
        console.log(`Media container created. id: ${green(mediaContainerId)}`);
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
      const carouselContainerID = await client.createCarouselContainer(
        mediaContainerIds,
        bodyText,
      );
      publishContainerId = carouselContainerID;

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
    .publish(publishContainerId)
    .then(async (id) => {
      console.log(`Published on ${bold("Threads")}. id: ${green(id)}`);
      return id;
    })
    .catch((e) => {
      // console.error(e.response?.data);
      throw new Error(`Error publishing on Threads \n${e}`);
    });

  return statusId;
}

async function checkContainerStatus(
  client: ThreadsClient,
  creationId: string,
  maxRetries = 10,
  interval = 1000 * 30,
) {
  let retries = 0;

  // wait 5 sec before querying container status to reduce API calls.
  await new Promise((resolve) => setTimeout(resolve, 5000));

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
export async function getThreadsStats(client: ThreadsClient) {
  const { id: mediaId, text, permalink } = (await client.getUserData(1))[0];

  try {
    const { likes, replies, reposts, quotes } =
      await client.getPostInsights(mediaId);

    // const viewsStr = `Views: ${green(views)}`;
    const likesStr = `Likes: ${green(likes)}`;
    const repliesStr = `Replies: ${green(replies)}`;
    const repostsStr = `Reposts: ${green(reposts)}`;
    const quotesStr = `Quotes: ${green(quotes)}`;
    console.log(`Latest ${bold("Threads")} (${green(permalink)}) stats`);
    console.log(`Text: ${text}`);
    console.log(likesStr, repliesStr, repostsStr, quotesStr);
  } catch (e: any) {
    console.error(e.response?.data);
    throw new Error(`Error retrieving post data on Threads \n${e}`);
  }
}
