import axios from "axios";
import { Config, PostSettings } from "../types";
import path from "node:path";
import "dotenv/config";
import {
  deleteObject,
  FirebaseStorage,
  StorageReference,
} from "firebase/storage";
import {
  INSTAGRAM_API_URL,
  INSTAGRAM_IMAGE_FORMATS,
  INSTAGRAM_VIDEO_FORMATS,
} from "../constants";
import { uploadFirebase } from "../storages/firebase";

export type InstagramMediaType = "REELS" | "VIDEO" | "CAROUSEL";

export type InstagramMediaData = {
  is_carousel_item?: boolean;
  /** REELS for a single video post. VIDEO for carousel video item */
  media_type?: InstagramMediaType;
  children?: string;
  caption?: string;
  /** must be a public URL */
  image_url?: string;
  /** for REELS only. must be a public URL */
  video_url?: string;
  /** long-lived access token */
  access_token: string;
};

type InstagramPublishData = {
  creation_id: string;
  access_token: string;
};

// https://developers.facebook.com/docs/instagram/platform/instagram-api/content-publishing
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

  const { postType, bodyText, filenames } = settings;

  const storageRefs: StorageReference[] = [];
  const downloadUrls: string[] = [];

  if (dev) {
    return "DEV MODE INSTAGRAM";
  }

  if (postType === "text") {
    console.log(`Instagram does not support text-only post. Skipping..`);
    return;
  }

  let publishData: InstagramPublishData;

  if (filenames.length === 1) {
    // 1. single media post
    console.log("Uploading media file to Firebase Storage..");
    const localFilePath = path.join(folderPath, filenames[0]);
    const { storageRef, downloadUrl } = await uploadFirebase(
      storage,
      firebaseUid,
      localFilePath,
    );
    storageRefs.push(storageRef);
    downloadUrls.push(downloadUrl);

    const ext = path.extname(filenames[0]).toLowerCase();
    const mediaContainerID = await createMediaContainer(USER_ID, {
      ...(INSTAGRAM_VIDEO_FORMATS.includes(ext) ? { media_type: "REELS" } : {}),
      // NOTE: IG API doc says, REELS should have video_url, but got an error with missing image_url
      // terrible, terrible API to use..
      image_url: downloadUrls[0],
      // ...(INSTAGRAM_IMAGE_FORMATS.includes(ext)
      //   ? { image_url: downloadUrls[0] }
      //   : INSTAGRAM_VIDEO_FORMATS.includes(ext)
      //     ? { video_url: downloadUrls[0] }
      //     : {}),
      caption: bodyText,
      access_token: ACCESS_TOKEN,
    });
    publishData = {
      creation_id: mediaContainerID,
      access_token: ACCESS_TOKEN,
    };
  } else {
    // 2. carousel post
    const mediaContainerIDs: string[] = [];
    console.log("Uploading media files to Firebase Storage..");
    for (const filename of filenames) {
      // 2.a. upload
      const localFilePath = path.join(folderPath, filename);
      const { storageRef, downloadUrl } = await uploadFirebase(
        storage,
        firebaseUid,
        localFilePath,
      );
      storageRefs.push(storageRef);
      downloadUrls.push(downloadUrl);
      // 2.b. create item container IDs
      const ext = path.extname(filenames[0]);
      const mediaContainerID = await createMediaContainer(USER_ID, {
        is_carousel_item: true,
        ...(INSTAGRAM_VIDEO_FORMATS.includes(ext)
          ? { media_type: "VIDEO" }
          : {}),
        ...(INSTAGRAM_IMAGE_FORMATS.includes(ext)
          ? { image_url: downloadUrls[0] }
          : { video_url: downloadUrls[0] }),
        caption: bodyText,
        access_token: ACCESS_TOKEN,
      });
      mediaContainerIDs.push(mediaContainerID);
    }
    // 2.c. create carousel media container ID
    const carouselContainerID = await createMediaContainer(USER_ID, {
      media_type: "CAROUSEL",
      children: mediaContainerIDs.join(","),
      caption: bodyText,
      access_token: ACCESS_TOKEN,
    });
    publishData = {
      creation_id: carouselContainerID,
      access_token: ACCESS_TOKEN,
    };
  }

  console.log("Publishing on Instagram..");
  const status = await axios
    .post(`${INSTAGRAM_API_URL}/${USER_ID}/media_publish`, null, {
      // .post(`${FACEBOOK_API_URL}/media_publish`, null, {
      params: publishData,
    })
    .then(async (res) => {
      // delete file from firebase storage
      for (const storageRef of storageRefs) {
        await deleteObject(storageRef);
      }
      console.log("Deleted media file(s) from Firebase Storage");
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
