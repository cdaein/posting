import path from "node:path";
import { TwitterApi, TwitterApiTokens } from "twitter-api-v2";
import { EnvVars, PostSettings } from "../types";
import kleur from "kleur";

// NOTE: reading doesn't work in free API (only posting works..)
// const user = await readOnlyClient.v2.userByUsername("cdaein");
// console.log(user);

const { bold, green, yellow } = kleur;

export async function uploadTwitter(
  envVars: EnvVars,
  folderPath: string,
  settings: PostSettings,
  dev: boolean,
) {
  // REVIEW: tokens type
  const tokens = {
    appKey: envVars.twitterAppKey,
    appSecret: envVars.twitterAppSecret,
    accessToken: envVars.twitterAccessToken,
    accessSecret: envVars.twitterAccessSecret,
  } as unknown as TwitterApiTokens;

  const client = new TwitterApi(tokens).readWrite;

  const { postType, bodyText, fileInfos } = settings;

  if (dev) {
    return "DEV MODE TWITTER";
  }

  console.log(`Publishing on ${bold("Twitter")}..`);
  try {
    if (postType === "text") {
      const status = await client.v2.tweet(bodyText);
      console.log(`Published on Twitter. id: ${status.data.id}`);
      return status;
    } else {
      const mediaIds: string[] = [];
      for (const fileInfo of fileInfos) {
        const { filename, altText } = fileInfo;
        console.log(`Uploading file ${yellow(filename)}`);
        const mediaId = await client.v1.uploadMedia(
          path.join(folderPath, filename),
        );

        if (altText) {
          await client.v1.createMediaMetadata(mediaId, {
            alt_text: { text: altText },
          });
        }
        mediaIds.push(mediaId);
        console.log(`File uploaded. id: ${green(mediaId)}`);
      }
      const status = await client.v2.tweet(bodyText, {
        media: {
          media_ids: mediaIds as
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string],
        },
      });
      console.log(`Published on ${bold("Twitter")}. id: ${status.data.id}`);
      return status.data;
    }
  } catch (e: any) {
    console.error(e);
    throw new Error(`Error uploading to Twitter \n${e}`);
  }
}
