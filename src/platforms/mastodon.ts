import { createRestAPIClient, mastodon } from "masto";
import fs from "node:fs";
import type { EnvVars, PostSettings } from "../types";
import path from "node:path";
import kleur from "kleur";

// REVIEW: masto doesn't export this type
interface MediaAttachment {
  id: string;
}

const { bold, green, yellow } = kleur;

export function initMastodonClient(envVars: EnvVars) {
  if (envVars.mastodonInstaceUrl && envVars.mastodonAccessToken) {
    return createRestAPIClient({
      url: envVars.mastodonInstaceUrl,
      accessToken: envVars.mastodonAccessToken,
    });
  }
  return undefined;
}

export async function uploadMastodon(
  client: mastodon.rest.Client,
  folderPath: string,
  settings: PostSettings,
  dev: boolean,
) {
  const { postType, bodyText, fileInfos } = settings;

  if (dev) {
    return { url: "DEV MODE MASTODON" };
  }

  const mediaAttachments: MediaAttachment[] = [];

  // for (const filename of filenames) {
  for (const fileInfo of fileInfos) {
    const { filename, altText } = fileInfo;
    console.log(`Uploading ${yellow(filename)}`);
    try {
      if (postType === "media") {
        const file = fs.readFileSync(path.join(folderPath, filename));
        // upload media file
        const mediaAttachment = await client.v2.media.create({
          file: new Blob([file]),
          description: altText,
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
    });
    console.log(`Published on ${bold("Mastodon")}. url: ${green(status.url!)}`);
    return { url: status.url };
  } catch (e) {
    throw new Error(`Error publishing to Mastodon \n${e}`);
  }
}
