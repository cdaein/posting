import "dotenv/config";
import path from "node:path";
import { TwitterApi, TwitterApiTokens } from "twitter-api-v2";
import { PostSettings } from "../types";

// TODO: move to main script and pass as argument to uploadTwitter()
const tokens: TwitterApiTokens = {
  appKey: process.env.TWITTER_API_KEY!,
  appSecret: process.env.TWITTER_API_KEY_SECRET!,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
};

// NOTE: reading doesn't work in free API (only posting works..)
// const user = await readOnlyClient.v2.userByUsername("cdaein");
// console.log(user);

export async function uploadTwitter(
  folderPath: string,
  settings: PostSettings,
  dev: boolean,
) {
  const client = new TwitterApi(tokens);

  const { postType, bodyText, filenames } = settings;

  if (dev) {
    return "DEV MODE TWITTER";
  }

  try {
    if (postType === "text") {
      const status = await client.v2.tweet(bodyText);
      return status;
    } else {
      const mediaIds: string[] = [];
      for (const filename of filenames) {
        const mediaId = await client.v1.uploadMedia(
          path.join(folderPath, filename),
        );
        mediaIds.push(mediaId);
      }
      const status = await client.v1.tweet(bodyText, {
        media_ids: mediaIds,
      });
      return status;
    }
  } catch (e) {
    throw new Error(`Error uploading to Twitter \n${e}`);
  }
}
