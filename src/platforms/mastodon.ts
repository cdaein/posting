import { createRestAPIClient } from "masto";
import fs from "node:fs";
import type { PostSettings } from "../types";
import path from "node:path";
import "dotenv/config";

// REVIEW: masto doesn't export this type
interface MediaAttachment {
  id: string;
}

export async function uploadMastodon(
  folderPath: string,
  settings: PostSettings,
  dev: boolean,
) {
  // FIX: don't rely on process.env inside function. pass as arguments from main script.
  // - same with other platform files.
  const masto = createRestAPIClient({
    url: process.env.MASTODON_INSTANCE_URL!,
    accessToken: process.env.MASTODON_ACCESS_TOKEN,
  });

  const { postType, bodyText, filename } = settings;

  let mediaAttachment: MediaAttachment | undefined;

  try {
    if (dev) {
      return { url: "DEV MODE MASTODON" };
    }

    if (postType === "image" || postType === "video") {
      const file = fs.readFileSync(path.join(folderPath, filename));
      mediaAttachment = await masto.v2.media.create({
        file: new Blob([file]),
        // TODO: alt text support
        // description: "alt text",
      });
    }

    // publish
    const status = await masto.v1.statuses.create({
      status: bodyText,
      visibility: "public",
      // conditionally add mediaIds
      ...(mediaAttachment ? { mediaIds: [mediaAttachment?.id] } : {}),
    });

    return { url: status.url };
  } catch (e) {
    throw new Error(`Error uploading to Mastodon \n${e}`);
  }
}
