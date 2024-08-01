import { createRestAPIClient } from "masto";
import fs from "node:fs";
import type { PostSettings } from "../types";
import path from "node:path";
import "dotenv/config";
import kleur from "kleur";

// REVIEW: masto doesn't export this type
interface MediaAttachment {
  id: string;
}

const { bold, green, yellow } = kleur;

export async function uploadMastodon(
  folderPath: string,
  settings: PostSettings,
  dev: boolean,
) {
  // TODO: don't rely on process.env inside function. pass as arguments from main script.
  // - same with other platform files.
  const masto = createRestAPIClient({
    url: process.env.MASTODON_INSTANCE_URL!,
    accessToken: process.env.MASTODON_ACCESS_TOKEN,
  });

  const { postType, bodyText, filenames } = settings;

  if (dev) {
    return { url: "DEV MODE MASTODON" };
  }

  const mediaAttachments: MediaAttachment[] = [];

  for (const filename of filenames) {
    console.log(`Uploading ${yellow(filename)}`);
    try {
      if (postType === "media") {
        const file = fs.readFileSync(path.join(folderPath, filename));
        // upload media file
        const mediaAttachment = await masto.v2.media.create({
          file: new Blob([file]),
          // description: "alt text", // TODO: alt text support
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
    const status = await masto.v1.statuses.create({
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
