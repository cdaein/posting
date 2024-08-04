import { BlobRef, BskyAgent, RichText } from "@atproto/api";
import kleur from "kleur";
import mime from "mime-types";
import fs from "node:fs";
import path from "node:path";
import { Config, EnvVars, PostSettings } from "../types";

export type ImageRecord = {
  alt: string;
  image: BlobRef;
  aspectRatio?: {
    width: number;
    height: number;
  };
};

export type BlueskyStats = {
  likeCount: number;
  replyCount: number;
  repostCount: number;
};

export type BlueskyPostResponse = {
  record: {
    text: string;
  };
  likeCount: number;
  replyCount: number;
  repostCount: number;
};

const { bold, green, yellow } = kleur;

const lastStats: BlueskyStats = {
  likeCount: 0,
  replyCount: 0,
  repostCount: 0,
};

const diffStats: BlueskyStats = {
  likeCount: 0,
  repostCount: 0,
  replyCount: 0,
};

export async function initBlueskyAgent(envVars: EnvVars) {
  if (envVars.blueskyEmail && envVars.blueskyPassword) {
    const agent = new BskyAgent({
      service: "https://bsky.social",
    });

    try {
      await agent.login({
        identifier: envVars.blueskyEmail,
        password: envVars.blueskyPassword,
      });

      return agent;
    } catch (e) {
      throw new Error(`Bluesky log in failed`);
    }
  }
  return undefined;
}

export async function uploadBluesky(
  agent: BskyAgent,
  folderPath: string,
  settings: PostSettings,
  dev: boolean,
) {
  const { postType, bodyText, fileInfos } = settings;

  if (dev) {
    return { url: "DEV MODE BLUESKY" };
  }

  const rt = new RichText({ text: bodyText });
  await rt.detectFacets(agent); // automatically detects mentions and links

  // https://docs.bsky.app/docs/tutorials/creating-a-post#images-embeds
  const images: ImageRecord[] = [];
  for (const fileInfo of fileInfos) {
    const { filename, altText } = fileInfo;
    const localFilePath = path.join(folderPath, filename);
    const buffer = fs.readFileSync(localFilePath);
    const mimeType = mime.lookup(localFilePath) as string;
    try {
      console.log(`Uploading file ${yellow(filename)}`);
      const { data } = await agent.uploadBlob(buffer, {
        encoding: mimeType,
      });
      images.push({
        alt: altText || "",
        image: data.blob,
      });
      console.log(`Uploaded file`);
    } catch (e) {
      console.error(e);
      throw new Error(`Error uploading media to Bluesky \n${e}`);
    }
  }

  const postRecord = {
    $type: "app.bsky.feed.post",
    text: rt.text,
    facets: rt.facets,
    ...(fileInfos.length > 0
      ? {
          embed: {
            $type: "app.bsky.embed.images",
            images,
          },
        }
      : {}),
    createdAt: new Date().toISOString(),
  };

  try {
    console.log(`Publishing on ${bold("Bluesky")}..`);
    const status = await agent.post(postRecord);
    console.log(`Published on ${bold("Bluesky")}. uri: ${green(status.uri)}`);
    return status;
  } catch (e) {
    throw new Error(`Error publishing on Bluesky \n${e}`);
  }
}

export async function getBlueskyStats(agent: BskyAgent, userConfig: Config) {
  if (userConfig.bluesky?.handle) {
    try {
      const authorFeed = await agent.getAuthorFeed({
        actor: userConfig.bluesky.handle,
        limit: 1,
      });
      // URI returned format - at://did:plc:b3qws3ybzok4crllfg67jakw/app.bsky.feed.post/3kyobz
      // URL I need - https://bsky.app/profile/[USER_HANDLE]/post/3kyobz
      const { uri } = authorFeed.data.feed[0].post;
      const res = await agent.getPostThread({ uri });
      // REVIEW: is there a type from library?
      const post = res.data.thread.post as BlueskyStats;
      // @ts-ignore
      const text = post.record.text as string;
      const postUrl = `https://bsky.app/profile/${userConfig.bluesky.handle}/post/${path.basename(uri)}`;

      const keys = Object.keys(post) as (keyof BlueskyStats)[];
      for (const key of keys) {
        diffStats[key] = post[key] - lastStats[key];
      }

      console.log(`Latest ${bold("Bluesky")} (${green(postUrl)}) stats`);
      console.log(`Text: ${text}`);
      const { likeCount, repostCount, replyCount } = diffStats;
      const likes = `Likes: ${likeCount >= 0 && "+"}${green(likeCount!)}`;
      const reposts = `Reblogs: ${repostCount >= 0 && "+"}${green(repostCount!)}`;
      const replies = `Replies: ${replyCount >= 0 && "+"}green(replyCount!)}`;
      console.log(likes, reposts, replies);

      // update last stat to current stat
      for (const key of keys) {
        lastStats[key] = post[key];
      }
    } catch (e) {
      throw new Error(`Error requesting Bluesky feed/post.`);
    }
  }
}

// function convertDataURIToUint8Array(dataURI: string) {
//   // Strip off the data URI scheme and get the base64 string
//   const base64 = dataURI.split(",")[1];
//   // Decode the base64 string
//   // const binaryString = Buffer.from(base64, "base64").toString("binary");
//   const binaryString = atob(base64);
//
//   // Convert the binary string to a Uint8Array
//   const bytes = new Uint8Array(binaryString.length);
//   for (let i = 0; i < binaryString.length; i++) {
//     bytes[i] = binaryString.charCodeAt(i);
//   }
//   return bytes;
// }
