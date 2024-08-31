import kleur from "kleur";
import path from "node:path";
import {
  InstagramClient,
  InstagramUserData,
} from "../clients/instagram-client";
import { INSTAGRAM_IMAGE_FORMATS } from "../constants";
import { FirebaseFileInfo } from "../storages/firebase";
import { PostsSettings } from "../types";
import { ensureData, getDiffStat, handleAsync } from "../utils";

export type InstagramMediaType = "REELS" | "VIDEO" | "CAROUSEL";

export type InstagramMediaData = {
  is_carousel_item?: boolean;
  /** REELS for a single video post. VIDEO for carousel video item */
  media_type?: InstagramMediaType;
  children?: string;
  /** text content */
  caption?: string;
  image_url?: string;
  video_url?: string;
  /** long-lived access token */
  access_token: string;
};

export type InstagramStatus = {
  id: string;
};

export type InstagramStats = {
  engagement: number | null;
  impressions: number | null;
  reach: number | null;
};

export const instagramLastStats: InstagramStats = {
  engagement: null,
  impressions: null,
  reach: null,
};

const diffStats: InstagramStats = {
  engagement: 0,
  impressions: 0,
  reach: 0,
};

export type InstagramPublishData = {
  creation_id: string;
  access_token: string;
};

const { bold, green, yellow } = kleur;

// https://developers.facebook.com/docs/instagram/platform/instagram-api/content-publishing
export async function uploadInstagram(
  client: InstagramClient,
  settings: PostsSettings,
  firebaseFileInfos: FirebaseFileInfo[][],
  dev: boolean,
) {
  if (dev) {
    return "DEV MODE INSTAGRAM";
  }

  const { posts } = settings;

  const publishContainerIds: string[] = [];
  const statuses: InstagramStatus[] = [];

  // there's no thread/reply on IG, so only use the first post from the list
  const post = posts[0];
  const { postType, bodyText, fileInfos } = post;

  // REVIEW: should be automatically detected and handled
  if (postType === "text") {
    console.warn(`Instagram does not support text-only post. Skipping..`);
    return;
  }

  if (fileInfos.length === 1) {
    // 1. single media post
    const { filename, altText } = fileInfos[0];
    console.log(`Creating a media container for ${yellow(filename)}`);
    const ext = path.extname(filename).toLowerCase().slice(1);
    const result = await handleAsync(
      INSTAGRAM_IMAGE_FORMATS.includes(ext)
        ? client.createImageContainer(
            firebaseFileInfos[0][0].downloadUrl,
            bodyText,
            {},
          )
        : client.createVideoContainer(
            firebaseFileInfos[0][0].downloadUrl,
            bodyText,
            {},
          ),
    );
    const containerId = ensureData(
      result,
      "Error creating media container on Instagram",
    );
    console.log(`Media container created. id: ${green(containerId)}`);
    publishContainerIds.push(containerId);
    await checkContainerStatus(client, containerId);
  } else {
    // 2. carousel post
    const mediaContainerIds: string[] = [];
    for (let i = 0; i < fileInfos.length; i++) {
      const { filename, altText } = fileInfos[i];
      // 3.a. create item container IDs
      console.log(`Creating a media container for ${yellow(filename)}`);
      const ext = path.extname(filename).toLowerCase().slice(1);
      const result = await handleAsync(
        INSTAGRAM_IMAGE_FORMATS.includes(ext)
          ? client.createImageContainer(
              firebaseFileInfos[0][i].downloadUrl,
              "",
              {
                isCarouselItem: true,
              },
            )
          : client.createVideoContainer(
              firebaseFileInfos[0][i].downloadUrl,
              "",
              {
                isCarouselItem: true,
              },
            ),
      );
      const containerId = ensureData(
        result,
        "Error creating carousel item on Instagram",
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
      client.createCarouselContainer(mediaContainerIds, bodyText),
    );
    const carouselContainerID = ensureData(
      result,
      "Error creating carousel container on Instagram",
    );
    publishContainerIds.push(carouselContainerID);

    // media container may not be immedidiately ready to publish. (ie. big files)
    // per IG API: query a container's status once per minute, for no more than 5 minutes.
    await checkContainerStatus(client, carouselContainerID);

    console.log(
      `Carousel container created. id: ${green(carouselContainerID)}`,
    );
  }

  console.log(`Publishing on ${bold("Instagram")}..`);
  const statusId = await client
    .publish(publishContainerIds[0])
    .then(async (id) => {
      console.log(`Published on ${bold("Instagram")}. id: ${green(id)}`);
      return id;
    })
    .catch((e) => {
      // console.error(e.response?.data);
      throw new Error(`Error publishing on Instagram \n${e}`);
    });

  statuses.push({ id: statusId });

  return statuses;
}

/**
 * Check the uploaded container status. Used before publishing. Usually, any file takes some seconds before ready,
 * so there is a 5 second wait before calling API.
 * @param client - InstagramClient
 * @param creationId -
 * @param maxRetries - default: 10
 * @param interval -  default: 30 seconds
 */
async function checkContainerStatus(
  client: InstagramClient,
  creationId: string,
  maxRetries = 10,
  interval = 1000 * 30,
) {
  let retries = 0;

  // wait 3 sec before querying container status to reduce API calls.
  await new Promise((resolve) => setTimeout(resolve, 3000));

  while (retries < maxRetries) {
    try {
      const { status_code, error_message, id } =
        await client.checkContainerStatus(creationId);
      console.log(`Container status: ${status_code} (try ${retries + 1})`);

      if (status_code === "FINISHED") {
        console.log(`${green(creationId)} is ready to publish.`);
        return "FINISHED";
      } else if (status_code === "ERROR") {
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
export async function getInstagramStats(
  client: InstagramClient,
  lastStats: InstagramStats,
) {
  const userDataResult = await handleAsync<InstagramUserData[]>(
    client.getUserData(1),
  );
  const userData = ensureData(
    userDataResult,
    "Error retrieving user data on Threads",
  );

  const { id: mediaId, text, permalink } = userData[0];

  const postInsightsResult = await handleAsync<InstagramStats>(
    client.getPostInsights(mediaId),
  );
  const curStats = ensureData(
    postInsightsResult,
    "Error retrieving post insights on Threads",
  );

  const keys = Object.keys(diffStats) as (keyof InstagramStats)[];
  for (const key of keys) {
    if (curStats[key] && lastStats[key]) {
      diffStats[key] = curStats[key] - lastStats[key];
    } else {
      diffStats[key] = curStats[key];
    }
  }

  const { engagement, impressions, reach } = diffStats;

  console.log(`Latest ${bold("Threads")} (${green(permalink)}) stats`);
  text && console.log(`Text: ${text}`);
  // const viewsStr = `Views: ${green(views)}`;
  const engagementStr = engagement
    ? `Engagement: ${green(getDiffStat(lastStats.engagement, engagement))}`
    : "";
  const impressionsStr = impressions
    ? `Impressions: ${green(getDiffStat(lastStats.impressions, impressions))}`
    : "";
  const reachStr = reach
    ? `Reach: ${green(getDiffStat(lastStats.reach, reach))}`
    : "";

  const hasUpdates = [engagementStr, impressionsStr, reachStr].some(
    (str) => str.length > 0,
  );
  hasUpdates
    ? console.log(engagementStr, impressionsStr, reachStr)
    : console.log("No updates found");

  // update last stat to current stat
  for (const key of keys) {
    lastStats[key] = curStats[key];
  }
}
