import axios from "axios";
import { deleteObject } from "firebase/storage";
import kleur from "kleur";
import path from "node:path";
import { ThreadsClient } from "../clients/threads-client";
import { THREADS_API_URL, THREADS_IMAGE_FORMATS } from "../constants";
import { FirebaseFileInfo } from "../storages/firebase";
import { PostSettings } from "../types";

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
      // NOTE: Threads *has* alt text, but it's not documented on API
      const { filename, altText } = fileInfos[0];
      // 2. single media post
      console.log(`Creating a media container for ${yellow(filename)}`);
      const ext = path.extname(filename);
      const containerId = THREADS_IMAGE_FORMATS.includes(ext)
        ? await client.createImageContainer(firebaseFileInfos[0].downloadUrl)
        : await client.createVideoContainer(firebaseFileInfos[0].downloadUrl);
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
        const ext = path.extname(filename);
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
    .then(async (res) => {
      console.log(`Published on ${bold("Threads")}. id: ${green(statusId)}`);
      return res;
    })
    .catch((e) => {
      console.error(e.response?.data);
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

  while (retries < maxRetries) {
    try {
      const { status, error_message } =
        await client.checkContainerStatus(creationId);
      console.log(`Container status: ${status} (try ${retries + 1})`);

      if (status === "FINISHED") {
        console.log(`${green(creationId)} is ready to publish.`);
        return "FINISHED";
      } else if (status === "ERROR") {
        console.error(`Media container failed.`);
        throw new Error(error_message);
      }

      retries++;
      if (retries < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, interval));
      }
    } catch (e) {
      throw new Error(`Error checking container status: \n${e}`);
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

// Refresh access token before expiration
// WARN: BELOW NOT TESTED YET!!!

// // Load existing .env file
// const envFilePath = path.resolve(__dirname, ".env");
// const envFileContent = fs.readFileSync(envFilePath, "utf8");
//
// // Function to update the .env file
// function updateEnvFile(key, value) {
//   const newEnvContent = envFileContent
//     .split("\n")
//     .map((line) => {
//       // If the line starts with the key, replace the value
//       if (line.startsWith(`${key}=`)) {
//         return `${key}=${value}`;
//       }
//       return line;
//     })
//     .join("\n");
//
//   // Write the new content back to the .env file
//   fs.writeFileSync(envFilePath, newEnvContent, "utf8");
//   console.log(`${key} has been updated in the .env file.`);
// }
//
// // Example usage
// const newAccessToken = "new-access-token-value"; // Replace this with the new token you get from the API
// updateEnvFile("ACCESS_TOKEN", newAccessToken);
