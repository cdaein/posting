import axios from "axios";
import { Config, PostSettings } from "../types";
import path from "node:path";
import "dotenv/config";
import { deleteObject, FirebaseStorage } from "firebase/storage";
import { INSTAGRAM_API_URL } from "../constants";
import { uploadFirebase } from "../storages/firebase";

export type InstagramMediaType = "REELS" | "IMAGE";

export type InstagramMediaData = {
  /** Include with Reel post. Returned media_type is "VIDEO" */
  media_type?: InstagramMediaType;
  // text?: string;
  caption?: string;
  /** must be a public URL */
  image_url?: string;
  /** must be a public URL */
  video_url?: string;
  /** long-lived access token */
  access_token: string;
};

// const FACEBOOK_API_URL = `https://graph.facebook.com/v20.0/${USER_ID}`;

export async function uploadInstagram(
  folderPath: string,
  settings: PostSettings,
  userConfig: Config,
  storage: FirebaseStorage,
  firebaseUid: string,
  dev: boolean,
) {
  const USER_ID = process.env.INSTAGRAM_USER_ID!;
  const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN!;

  const { postType, bodyText, filename } = settings;

  const localFilePath = path.join(folderPath, filename);

  console.log("Uploading media file to Firebase Storage..");
  const firebaseResponse = await uploadFirebase(
    storage,
    firebaseUid,
    localFilePath,
  );
  const { storageRef, downloadUrl } = firebaseResponse;

  console.log({ downloadUrl });

  const mediaData: InstagramMediaData = {
    // media_type: "PHOTO",
    ...(postType === "video" ? { media_type: "REELS" } : {}),
    ...(postType === "image"
      ? { image_url: downloadUrl }
      : postType === "video"
        ? { video_url: downloadUrl }
        : {}),
    caption: bodyText,
    access_token: ACCESS_TOKEN,
  };

  if (dev) {
    return "DEV MODE INSTAGRAM";
  }

  console.log("Creating media container..");
  const mediaContainerID = await createMediaContainer(USER_ID, mediaData);
  console.log({ mediaContainerID });

  const publishData = {
    creation_id: mediaContainerID,
    access_token: ACCESS_TOKEN,
  };
  console.log("Publishing on Instagram..");

  const status = await axios
    .post(`${INSTAGRAM_API_URL}/${USER_ID}/media_publish`, null, {
      // .post(`${FACEBOOK_API_URL}/media_publish`, null, {
      params: publishData,
    })
    .then(async (res) => {
      // delete file from firebase storage
      await deleteObject(storageRef);
      console.log("Deleted media file from Firebase Storage");
      console.log("Published to Instagram");

      // res.data.id is mediaId
      return res.data;
    })
    .catch((e) => {
      console.error(`Error publishing on Instagram ${e}`);
      if (e.response?.data) {
        console.error(e.response.data);
      }
    });
  return status;
}

// upload image and get media container ID
async function createMediaContainer(
  userId: string,
  mediaData: InstagramMediaData,
) {
  return await axios
    .post(`${INSTAGRAM_API_URL}/${userId}/media`, null, { params: mediaData })
    // .post(`${FACEBOOK_API_URL}/media`, null, { params: mediaData })
    .then((res) => {
      // return media container ID
      return res.data.id;
    })
    .catch((e) => {
      if (e.response?.data) {
        console.error(e.response.data);
      }
      throw new Error(`Error creating media container to Instagram \n${e}`);
    });
}
