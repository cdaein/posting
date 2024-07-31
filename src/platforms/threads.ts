import axios from "axios";
import "dotenv/config";
import {
  deleteObject,
  FirebaseStorage,
  StorageReference,
} from "firebase/storage";
import path from "node:path";
import { THREADS_API_URL } from "../constants";
import { uploadFirebase } from "../storages/firebase";
import { Config, PostSettings } from "../types";

export type ThreadsMediaType = "TEXT" | "IMAGE" | "VIDEO";

export type ThreadsMediaData = {
  media_type: ThreadsMediaType;
  text?: string;
  /** must be a public URL */
  image_url?: string;
  /** must be a public URL */
  video_url?: string;
  access_token: string;
};

// const THREADS_API_URL = `https://graph.threads.net/v1.0/${USER_ID}`;

// https://graph.threads.net/v1.0/[USER_ID]/threads_publish?creation_id=[MEDIA_CONTAINER_ID]&access_token=[ACCESS_TOKEN]

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
  folderPath: string,
  settings: PostSettings,
  userConfig: Config,
  storage: FirebaseStorage,
  firebaseUid: string,
  dev: boolean,
) {
  const USER_ID = process.env.THREADS_USER_ID!;
  const ACCESS_TOKEN = process.env.THREADS_ACCESS_TOKEN!;

  const { postType, bodyText, filename } = settings;

  const localFilePath = path.join(folderPath, filename);

  let storageRef: StorageReference;
  let downloadUrl: string = "";

  if (postType !== "text") {
    console.log("Uploading media file to Firebase Storage..");
    ({ storageRef, downloadUrl } = await uploadFirebase(
      storage,
      firebaseUid,
      localFilePath,
    ));
  }

  const mediaData: ThreadsMediaData = {
    media_type: postType.toUpperCase() as ThreadsMediaType,
    ...(postType === "image"
      ? { image_url: downloadUrl }
      : postType === "video"
        ? { video_url: downloadUrl }
        : {}),
    text: bodyText,
    access_token: ACCESS_TOKEN,
  };

  if (dev) {
    return "DEV MODE THREADS";
  }

  console.log("Creating media container..");
  const mediaContainerID = await createMediaContainer(USER_ID, mediaData);
  const publishData = {
    creation_id: mediaContainerID,
    access_token: ACCESS_TOKEN,
  };
  console.log("Publishing on Threads..");
  const status = await axios
    .post(`${THREADS_API_URL}/${USER_ID}/threads_publish`, null, {
      params: publishData,
    })
    .then(async (res) => {
      if (postType !== "text") {
        // delete file from firebase storage
        await deleteObject(storageRef);
        console.log("Deleted media file from Firebase Storage");
      }
      console.log("Published to Threads");

      // res.data.id is mediaId
      return res.data;
    })
    .catch((e) => {
      console.error(`Error publishing on Threads ${e}`);
    });
  return status;
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
      console.error(`Error uploading media to Threads ${e}`);
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
