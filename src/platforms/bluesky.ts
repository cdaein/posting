import { BlobRef, BskyAgent, PostRecord, RichText } from "@atproto/api";
import { EnvVars, PostSettings } from "../types";
import kleur from "kleur";
import fs from "node:fs";
import path from "node:path";
import mime from "mime-types";

type ImageRecord = {
  alt: string;
  image: BlobRef;
  aspectRatio?: {
    width: number;
    height: number;
  };
};

const { bold, green, yellow } = kleur;

export async function uploadBluesky(
  envVars: EnvVars,
  folderPath: string,
  settings: PostSettings,
  dev: boolean,
) {
  const agent = new BskyAgent({
    service: "https://bsky.social",
  });

  try {
    await agent.login({
      identifier: envVars.blueskyUsername,
      password: envVars.blueskyPassword,
    });
  } catch (e) {
    throw new Error(`Bluesky log in failed`);
  }

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
        alt: altText,
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

function convertDataURIToUint8Array(dataURI: string) {
  // Strip off the data URI scheme and get the base64 string
  const base64 = dataURI.split(",")[1];
  // Decode the base64 string
  // const binaryString = Buffer.from(base64, "base64").toString("binary");
  const binaryString = atob(base64);

  // Convert the binary string to a Uint8Array
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
