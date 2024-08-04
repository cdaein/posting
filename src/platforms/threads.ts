import axios from "axios";
import {
  deleteObject,
  FirebaseStorage,
  StorageReference,
} from "firebase/storage";
import path from "node:path";
import { THREADS_API_URL, THREADS_IMAGE_FORMATS } from "../constants";
import { uploadFirebase } from "../storages/firebase";
import { Config, EnvVars, PostSettings } from "../types";
import kleur from "kleur";
import { ThreadsClient } from "../clients/threads-client";

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

// TODO: separate Firebase logic out of uploadThreads as I may change provider later?
// - also to avoid uploading twice for threads AND instagram.
// - instead, take publicURL as argument that is generated outside the function

/**
 * First upload image to Firebase to get public URL. Then, publish to Threads.
 * @param folderPath -
 * @param settings -
 * @param firebaseUid -
 * @param storage -
 * @param dev -
 * @returns
 */
export async function uploadThreads(
  envVars: EnvVars,
  client: ThreadsClient,
  folderPath: string,
  settings: PostSettings,
  storage: FirebaseStorage,
  firebaseUid: string,
  dev: boolean,
) {
  const USER_ID = envVars.threadsUserId!;
  const ACCESS_TOKEN = envVars.threadsAccessToken!;

  const { postType, bodyText, fileInfos } = settings;

  const storageRefs: StorageReference[] = [];
  const downloadUrls: string[] = [];

  if (dev) {
    return "DEV MODE THREADS";
  }

  let publishData: ThreadsPublishData;
  let carouselContainerID = "";

  if (postType === "text") {
    // 1. text only post
    const mediaContainerID = await createMediaContainer(USER_ID, {
      media_type: "TEXT",
      text: bodyText,
      access_token: ACCESS_TOKEN,
    });
    publishData = {
      creation_id: mediaContainerID,
      access_token: ACCESS_TOKEN,
    };
  } else {
    if (fileInfos.length === 1) {
      const { filename, altText } = fileInfos[0];
      // 2. single media post
      console.log("Uploading media file to Firebase Storage..");
      const localFilePath = path.join(folderPath, filename);
      const { storageRef, downloadUrl } = await uploadFirebase(
        storage,
        firebaseUid,
        localFilePath,
      );
      storageRefs.push(storageRef);
      downloadUrls.push(downloadUrl);
      console.log(`File uploaded ${yellow(filename)}`);

      console.log(`Creating a media container for ${yellow(filename)}`);
      const ext = path.extname(filename);
      const mediaContainerID = await createMediaContainer(USER_ID, {
        media_type: THREADS_IMAGE_FORMATS.includes(ext) ? "IMAGE" : "VIDEO",
        ...(THREADS_IMAGE_FORMATS.includes(ext)
          ? { image_url: downloadUrls[0] }
          : { video_url: downloadUrls[0] }),
        text: bodyText,
        access_token: ACCESS_TOKEN,
      });
      console.log(`Media container created. id: ${green(mediaContainerID)}`);
      publishData = {
        creation_id: mediaContainerID,
        access_token: ACCESS_TOKEN,
      };
    } else {
      // 3. carousel post
      const mediaContainerIDs: string[] = [];
      console.log("Uploading media files to Firebase Storage..");
      // for (let i = 0; i < filenames.length; i++) {
      for (let i = 0; i < fileInfos.length; i++) {
        const { filename, altText } = fileInfos[i];
        // 3.a. upload
        const localFilePath = path.join(folderPath, filename);
        const { storageRef, downloadUrl } = await uploadFirebase(
          storage,
          firebaseUid,
          localFilePath,
        );
        storageRefs.push(storageRef);
        downloadUrls.push(downloadUrl);
        console.log(`File uploaded ${yellow(filename)}`);

        // 3.b. create item container IDs
        console.log(`Creating a media container for ${yellow(filename)}`);
        const ext = path.extname(filename);
        const mediaContainerID = await createMediaContainer(USER_ID, {
          is_carousel_item: true,
          media_type: THREADS_IMAGE_FORMATS.includes(ext) ? "IMAGE" : "VIDEO",
          ...(THREADS_IMAGE_FORMATS.includes(ext)
            ? { image_url: downloadUrls[i] }
            : { video_url: downloadUrls[i] }),
          text: bodyText,
          access_token: ACCESS_TOKEN,
        });
        mediaContainerIDs.push(mediaContainerID);
        console.log(`Media container created. id: ${green(mediaContainerID)}`);
      }

      for (const containerId of mediaContainerIDs) {
        await checkContainerStatus(client, containerId);
      }

      // 3.c. create carousel media container ID
      console.log(
        `Creating a carousel container for ${green(mediaContainerIDs.join(","))}`,
      );
      carouselContainerID = await createMediaContainer(USER_ID, {
        media_type: "CAROUSEL",
        children: mediaContainerIDs.join(","),
        text: bodyText,
        access_token: ACCESS_TOKEN,
      });
      publishData = {
        creation_id: carouselContainerID,
        access_token: ACCESS_TOKEN,
      };
      console.log(
        `Carousel container created. id: ${green(carouselContainerID)}`,
      );
    }
  }

  // media container may not be immedidiately ready to publish. (ie. big files)
  // per IG API: query a container's status once per minute, for no more than 5 minutes.
  await checkContainerStatus(client, carouselContainerID);

  console.log(`Publishing on ${bold("Threads")}..`);
  const status = await axios
    .post(`${THREADS_API_URL}/${USER_ID}/threads_publish`, null, {
      params: publishData,
    })
    .then(async (res) => {
      console.log(`Published on ${bold("Threads")}. id: ${green(status.id)}`);
      // delete files from firebase storage
      for (const storageRef of storageRefs) {
        await deleteObject(storageRef);
        console.log("Deleted temporary media file from Firebase Storage");
      }
      // res.data.id is mediaId
      return res.data;
    })
    .catch((e) => {
      console.error(e.response?.data);
      throw new Error(`Error publishing on Threads \n${e}`);
    });
  return status;
}

async function checkContainerStatus(
  client: ThreadsClient,
  creationId: string,
  maxRetries = 5,
  interval = 1000 * 60,
) {
  let retries = 0;

  while (retries < maxRetries) {
    try {
      const { status, error_message } =
        await client.checkContainerStatus(creationId);
      console.log(`Container status: ${status} (try ${retries + 1})`);

      if (status === "FINISHED") {
        console.log(`${green(creationId)} is ready to publish.`);
        return;
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

// upload image and get media container ID
async function createMediaContainer(
  userId: string,
  mediaData: ThreadsMediaData,
) {
  return await axios
    .post(`${THREADS_API_URL}/${userId}/threads`, null, { params: mediaData })
    .then((res) => {
      // return media container ID
      return res.data.id;
    })
    .catch((e) => {
      console.error(e.response?.data);
      throw new Error(`Error creating media container on Threads \n${e}`);
    });
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
