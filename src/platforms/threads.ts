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
  folderPath: string,
  settings: PostSettings,
  userConfig: Config,
  storage: FirebaseStorage,
  firebaseUid: string,
  dev: boolean,
) {
  const USER_ID = envVars.threadsUserId;
  const ACCESS_TOKEN = envVars.threadsAccessToken;

  const { postType, bodyText, filenames } = settings;

  const storageRefs: StorageReference[] = [];
  const downloadUrls: string[] = [];

  if (dev) {
    return "DEV MODE THREADS";
  }

  let publishData: ThreadsPublishData;

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
    if (filenames.length === 1) {
      // 2. single media post
      console.log("Uploading media file to Firebase Storage..");
      const localFilePath = path.join(folderPath, filenames[0]);
      const { storageRef, downloadUrl } = await uploadFirebase(
        storage,
        firebaseUid,
        localFilePath,
      );
      storageRefs.push(storageRef);
      downloadUrls.push(downloadUrl);
      console.log(`File uploaded ${yellow(filenames[0])}`);

      console.log(`Creating a media container for ${yellow(filenames[0])}`);
      const ext = path.extname(filenames[0]);
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
      for (let i = 0; i < filenames.length; i++) {
        const filename = filenames[i];
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
        const ext = path.extname(filenames[0]);
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
        await checkContainerStatus({
          creation_id: containerId,
          access_token: ACCESS_TOKEN,
        });
      }

      // 3.c. create carousel media container ID
      console.log(
        `Creating a carousel container for ${green(mediaContainerIDs.join(","))}`,
      );
      const carouselContainerID = await createMediaContainer(USER_ID, {
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
  await checkContainerStatus(publishData);

  console.log(`Publishing on ${bold("Threads")}..`);
  const status = await axios
    .post(`${THREADS_API_URL}/${USER_ID}/threads_publish`, null, {
      params: publishData,
    })
    .then(async (res) => {
      // delete files from firebase storage
      for (const storageRef of storageRefs) {
        await deleteObject(storageRef);
      }
      console.log("Deleted temporary media file(s) from Firebase Storage");
      // res.data.id is mediaId
      return res.data;
    })
    .catch((e) => {
      console.error(e.response?.data);
      throw new Error(`Error publishing on Threads \n${e}`);
    });
  console.log(`Published on ${bold("Threads")}. id: ${status.id}`);
  return status;
}

async function checkContainerStatus(
  publishData: ThreadsPublishData,
  maxRetries = 5,
  interval = 1000 * 60,
) {
  const { creation_id, access_token } = publishData;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      const response = await axios.get(`${THREADS_API_URL}/${creation_id}`, {
        params: {
          fields: "status,error_message",
          access_token,
        },
      });

      const { status, error_message } = response.data;
      console.log(`Container status: ${status} (try ${retries + 1})`);

      if (status === "FINISHED") {
        console.log(`${green(creation_id)} is ready to publish.`);
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
