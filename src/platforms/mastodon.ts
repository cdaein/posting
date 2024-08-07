import { createRestAPIClient, mastodon } from "masto";
import fs from "node:fs";
import type { Config, EnvVars, PostSettings, PostsSettings } from "../types";
import path from "node:path";
import kleur from "kleur";
import { getDiffStat } from "../utils";

// REVIEW: masto doesn't export this type
interface MediaAttachment {
  id: string;
}

export type MastodonStats = {
  faves: number;
  reblogs: number;
  replies: number;
};

const lastStats: Record<keyof MastodonStats, number | undefined> = {
  faves: undefined,
  reblogs: undefined,
  replies: undefined,
};

const diffStats: MastodonStats = {
  faves: 0,
  reblogs: 0,
  replies: 0,
};

const { bold, green, yellow } = kleur;

export function initMastodonClient(envVars: EnvVars) {
  if (envVars.mastodonInstanceUrl && envVars.mastodonAccessToken) {
    return createRestAPIClient({
      url: envVars.mastodonInstanceUrl,
      accessToken: envVars.mastodonAccessToken,
    });
  }
  return undefined;
}

export async function uploadMastodon(
  client: mastodon.rest.Client,
  folderPath: string,
  settings: PostsSettings,
  dev: boolean,
) {
  if (dev) {
    return { url: "DEV MODE MASTODON" };
  }

  const { posts } = settings;

  const statuses: mastodon.v1.Status[] = [];

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const { postType, bodyText, fileInfos } = post;

    const mediaAttachments: MediaAttachment[] = [];

    for (const fileInfo of fileInfos) {
      const { filename, altText } = fileInfo;
      console.log(`Uploading ${yellow(filename)}`);
      try {
        if (postType === "media") {
          const file = fs.readFileSync(path.join(folderPath, filename));
          // upload media file
          const mediaAttachment = await client.v2.media.create({
            file: new Blob([file]),
            description: altText || "",
          });
          mediaAttachments.push(mediaAttachment);
          console.log(`Uploaded the file. id: ${green(mediaAttachment.id)}`);
        }
      } catch (e) {
        throw new Error(`Error uploading media to Mastodon \n${e}`);
      }
    }

    try {
      // publish
      console.log(`Publishing on ${bold("Mastodon")}..`);
      const status = await client.v1.statuses.create({
        status: bodyText,
        visibility: "public",
        // conditionally add mediaIds
        ...(mediaAttachments.length > 0
          ? {
              mediaIds: mediaAttachments.map((media) => media.id),
            }
          : {}),
        ...(i !== 0 ? { inReplyToId: statuses[i - 1].id } : {}),
      });
      console.log(
        `Published on ${bold("Mastodon")}. url: ${green(status.url!)}`,
      );
      statuses.push(status);
    } catch (e) {
      throw new Error(`Error publishing to Mastodon \n${e}`);
    }
  }
  return statuses;
}

export async function getMastodonStats(client: mastodon.rest.Client) {
  try {
    const { id: userId } = await client.v1.accounts.verifyCredentials();
    const statuses = await client.v1.accounts
      .$select(userId)
      .statuses.list({ limit: 1 });

    const { id, content, url, favouritesCount, reblogsCount, repliesCount } =
      statuses[0];

    const curStats: MastodonStats = {
      faves: favouritesCount,
      reblogs: reblogsCount,
      replies: repliesCount,
    };

    const keys = Object.keys(diffStats) as (keyof MastodonStats)[];
    for (const key of keys) {
      if (lastStats[key]) {
        diffStats[key] = curStats[key] - lastStats[key];
      } else {
        diffStats[key] = curStats[key];
      }
    }

    const { faves, reblogs, replies } = diffStats;

    console.log(`Latest ${bold("Mastodon")} (${green(url!)}) stats`);
    console.log(`Text: ${content}`);
    const favesStr = faves
      ? `Faves: ${green(getDiffStat(lastStats.faves, faves))}`
      : "";
    const reblogsStr = reblogs
      ? `Reblogs: ${green(getDiffStat(lastStats.reblogs, reblogs))}`
      : "";
    const repliesStr = replies
      ? `Replies: ${green(getDiffStat(lastStats.replies, replies))}`
      : "";

    const hasUpdates = [favesStr, reblogsStr, repliesStr].some(
      (str) => str.length > 0,
    );
    hasUpdates
      ? console.log(favesStr, reblogsStr, repliesStr)
      : console.log("No updates found");

    // update last stat to current stat
    for (const key of keys) {
      lastStats[key] = curStats[key];
    }
  } catch (e) {
    throw new Error(`Error requesting Mastodon credentials/statuses.`);
  }
}
