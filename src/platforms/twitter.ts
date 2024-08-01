import path from "node:path";
import {
  TwitterApi,
  TwitterApiReadWrite,
  TwitterApiTokens,
} from "twitter-api-v2";
import { EnvVars, PostSettings } from "../types";
import kleur from "kleur";

type MostRecentTweetStats = {
  id: string;
  text: string;
  organic_metrics: {
    impression_count: number;
    like_count: number;
    reply_count: number;
    retweet_count: number;
    user_profile_clicks: number;
  };
  non_public_metrics: {
    impression_count: number;
    user_profile_clicks: number;
    engagements: number;
  };
  public_metrics: {
    bookmark_count: number;
    impression_count: number;
    like_count: number;
    reply_count: number;
    retweet_count: number;
    quote_count: number;
  };
};

const { bold, green, yellow } = kleur;

export function initTwitterClient(envVars: EnvVars) {
  if (
    envVars.twitterAppKey &&
    envVars.twitterAppSecret &&
    envVars.twitterAccessToken &&
    envVars.twitterAccessSecret
  ) {
    const tokens = {
      appKey: envVars.twitterAppKey,
      appSecret: envVars.twitterAppSecret,
      accessToken: envVars.twitterAccessToken,
      accessSecret: envVars.twitterAccessSecret,
    } as unknown as TwitterApiTokens;
    return new TwitterApi(tokens).readWrite;
  }
  return undefined;
}

export async function uploadTwitter(
  client: TwitterApiReadWrite,
  folderPath: string,
  settings: PostSettings,
  dev: boolean,
) {
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
      console.log(
        `Published on ${bold("Twitter")}. id: ${green(status.data.id)}`,
      );
      return status.data;
    }
  } catch (e: any) {
    console.error(e);
    throw new Error(`Error uploading to Twitter \n${e}`);
  }
}

export async function getTwitterStats(client: TwitterApiReadWrite) {
  // simple user query (this works; good for testing auth)
  // const user = await client.currentUserV2();

  // https://developer.x.com/en/docs/twitter-api/users/lookup/api-reference/get-users-me
  const user = await client.v2.me({
    // @ts-ignore
    expansions: ["most_recent_tweet_id"],
    "tweet.fields": ["public_metrics", "non_public_metrics", "organic_metrics"],
    // @ts-ignore
    "user.fields": ["most_recent_tweet_id", "public_metrics"],
  });
  // console.log(user.data.public_metrics);

  const { id, text, organic_metrics, non_public_metrics, public_metrics } = user
    .includes?.tweets![0] as unknown as MostRecentTweetStats;

  const impressions = `Impressions: ${green(public_metrics.impression_count)}`;
  const engagements = `Engagements: ${green(non_public_metrics.engagements)}`;
  const likes = `Likes: ${green(organic_metrics.like_count)}`;
  const retweets = `Retweets: ${green(organic_metrics.retweet_count)}`;
  const reply = `Replies: ${green(organic_metrics.reply_count)}`;
  const quotes = `Quotes: ${green(public_metrics.quote_count)}`;
  const bookmarks = `Bookmarks: ${green(public_metrics.bookmark_count)}`;

  console.log();
  console.log(`Latest tweet (${green(id)}) stats`);
  console.log(`Text: ${text}`);
  console.log(
    impressions,
    engagements,
    likes,
    retweets,
    reply,
    quotes,
    bookmarks,
  );

  // NOTE: reading user/tweet doesn't work in free API (only posting works..)
  // const user = await readOnlyClient.v2.userByUsername("cdaein");
  // console.log(user);
  // const user = await client.v2.user("31077600", {
  //   "tweet.fields": ["id", "text"],
  // });
}
