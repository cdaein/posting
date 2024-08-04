import axios from "axios";
import kleur from "kleur";
import path from "node:path";
import {
  INSTAGRAM_API_URL,
  INSTAGRAM_IMAGE_FORMATS,
  INSTAGRAM_VIDEO_FORMATS,
} from "../constants";
import { FirebaseFileInfo } from "../storages/firebase";
import { EnvVars, PostSettings } from "../types";

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

const { bold, green, yellow } = kleur;

// https://developers.facebook.com/docs/instagram/platform/instagram-api/content-publishing
export async function uploadInstagram(
  envVars: EnvVars,
  settings: PostSettings,
  firebaseFileInfos: FirebaseFileInfo[],
  dev: boolean,
) {
  const USER_ID = envVars.instagramUserId;
  const ACCESS_TOKEN = envVars.instagramAccessToken;

  const { postType, bodyText, fileInfos } = settings;

  if (dev) {
    return "DEV MODE INSTAGRAM";
  }

  // REVIEW: should be automatically detected and handled
  if (postType === "text") {
    console.log(`Instagram does not support text-only post. Skipping..`);
    return;
  }

  let publishData: InstagramPublishData;

  if (fileInfos.length === 1) {
    // 1. single media post
    const { filename, altText } = fileInfos[0];
    console.log(`Creating a media container for ${yellow(filename)}`);
    const ext = path.extname(filename).toLowerCase().slice(1);
    const mediaContainerID = await createMediaContainer(USER_ID, {
      ...(INSTAGRAM_VIDEO_FORMATS.includes(ext) ? { media_type: "REELS" } : {}),
      // ...(INSTAGRAM_VIDEO_FORMATS.includes(ext) ? { media_type: "VIDEO" } : {}),
      // NOTE: IG API doc says, REELS should have video_url, but got an error with missing image_url
      // terrible, terrible API to use..
      image_url: firebaseFileInfos[0].downloadUrl,
      // ...(INSTAGRAM_IMAGE_FORMATS.includes(ext)
      //   ? { image_url: downloadUrls[0] }
      //   : INSTAGRAM_VIDEO_FORMATS.includes(ext)
      //     ? { video_url: downloadUrls[0] }
      //     : {}),
      caption: bodyText,
      access_token: ACCESS_TOKEN,
    });
    console.log(`Media container created. id: ${green(mediaContainerID)}`);
    publishData = {
      creation_id: mediaContainerID,
      access_token: ACCESS_TOKEN,
    };
  } else {
    // 2. carousel post
    const mediaContainerIDs: string[] = [];
    console.log("Uploading media files to Firebase Storage..");
    // for (let i = 0; i < filenames.length; i++) {
    for (let i = 0; i < fileInfos.length; i++) {
      const { filename, altText } = fileInfos[i];
      // 2.a. create item container IDs
      console.log(`Creating a media container for ${yellow(filename)}`);
      const ext = path.extname(filename).toLowerCase().slice(1);
      const mediaContainerID = await createMediaContainer(USER_ID, {
        is_carousel_item: true,
        ...(INSTAGRAM_VIDEO_FORMATS.includes(ext)
          ? { media_type: "VIDEO" }
          : {}),
        // image_url: downloadUrls[i],
        ...(INSTAGRAM_IMAGE_FORMATS.includes(ext)
          ? { image_url: firebaseFileInfos[i].downloadUrl }
          : { video_url: firebaseFileInfos[i].downloadUrl }),
        caption: bodyText,
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

    // 2.c. create carousel media container ID
    console.log(
      `Creating a carousel container for ${green(mediaContainerIDs.join(","))}`,
    );
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
    console.log(
      `Carousel container created. id: ${green(carouselContainerID)}`,
    );
  }

  await checkContainerStatus(publishData);

  console.log(`Publishing on ${bold("Instagram")}..`);
  const status = await axios
    .post(`${INSTAGRAM_API_URL}/${USER_ID}/media_publish`, null, {
      // .post(`${FACEBOOK_API_URL}/media_publish`, null, {
      params: publishData,
    })
    .then(async (res) => {
      console.log(`Published on ${bold("Instagram")}`);
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

async function checkContainerStatus(
  publishData: InstagramPublishData,
  maxRetries = 5,
  interval = 1000 * 30,
) {
  const { creation_id, access_token } = publishData;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      const response = await axios.get(`${INSTAGRAM_API_URL}/${creation_id}`, {
        params: {
          fields: "status,error_message",
          access_token,
        },
      });
      // FIX:
      console.log(response.data); //TEST:

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
      console.log(e);
      throw new Error(`Error checking container status: \n${e}`);
    }
  }

  throw new Error(`Max retries reached. Media is not ready to publish.`);
}

// upload image and get media container ID
async function createMediaContainer(
  userId: string,
  mediaData: InstagramMediaData,
) {
  return await axios
    .post(`${INSTAGRAM_API_URL}/${userId}/media`, null, { params: mediaData })
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
