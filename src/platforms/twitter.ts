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
  username: string;
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

export type TwitterStats = {
  likes: number;
  retweets: number;
  replies: number;
  quotes: number;
  bookmarks: number;
};

const { bold, green, yellow } = kleur;

const lastStats: Record<keyof TwitterStats, number | undefined> = {
  likes: undefined,
  retweets: undefined,
  replies: undefined,
  quotes: undefined,
  bookmarks: undefined,
};

const diffStats: TwitterStats = {
  likes: 0,
  retweets: 0,
  replies: 0,
  quotes: 0,
  bookmarks: 0,
};

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

/**
 * Get my latest tweet stat using `v2/me` endpoint.
 * Check the [rate limit](https://developer.x.com/en/docs/twitter-api/rate-limits#v2-limits-free)
 * 25 req per 24 hours
 * @param client -
 */
export async function getTwitterStats(client: TwitterApiReadWrite) {
  try {
    // simple user query (this works; good for testing auth)
    // const user = await client.currentUserV2();

    // https://developer.x.com/en/docs/twitter-api/users/lookup/api-reference/get-users-me
    const user = await client.v2.me({
      // @ts-ignore
      expansions: ["most_recent_tweet_id"],
      "tweet.fields": [
        "public_metrics",
        "non_public_metrics",
        "organic_metrics",
      ],
      // @ts-ignore
      "user.fields": ["username", "most_recent_tweet_id", "public_metrics"],
    });

    const username = user.data.username;
    const { id, text, organic_metrics, public_metrics } = user.includes
      ?.tweets![0] as unknown as MostRecentTweetStats;

    // 1. get current stats
    // 2. if no last stat (first run), set diff to cur stats
    // 2. if last stat, get diff bewteen cur and last

    const curStats: TwitterStats = {
      likes: organic_metrics.like_count,
      retweets: organic_metrics.retweet_count,
      replies: organic_metrics.reply_count,
      quotes: public_metrics.quote_count,
      bookmarks: public_metrics.bookmark_count,
    };

    const keys = Object.keys(diffStats) as (keyof TwitterStats)[];
    for (const key of keys) {
      if (lastStats[key] === undefined) {
        diffStats[key] = curStats[key];
      } else {
        diffStats[key] = curStats[key] - lastStats[key];
      }
    }

    // REVIEW: if stat never changed (always 0), it doesn't display "+".
    const getDiffStat = (prev: number | undefined, diff: number) => {
      return (prev !== undefined && diff >= 0 ? "+" : "") + diff.toString();
    };

    const { likes, retweets, replies, quotes, bookmarks } = diffStats;

    // const impressionsStr = `Impressions: ${green(public_metrics.impression_count)}`;
    // const engagementsStr = `Engagements: ${green(non_public_metrics.engagements)}`;
    const likesStr = `Likes: ${green(getDiffStat(lastStats.likes, likes))}`;
    const retweetsStr = `Retweets: ${green(getDiffStat(lastStats.retweets, retweets))}`;
    const replyStr = `Replies: ${green(getDiffStat(lastStats.replies, replies))}`;
    const quotesStr = `Quotes: ${green(getDiffStat(lastStats.quotes, quotes))}`;
    const bookmarksStr = `Bookmarks: ${green(getDiffStat(lastStats.bookmarks, bookmarks))}`;

    // URL - https://x.com/[USERNAME]/status/[POST_ID]
    const postUrl = `https://x.com/${username}/status/${id}`;
    console.log(`Latest ${bold("Twitter")} (${green(postUrl)}) stats`);
    console.log(`Text: ${text}`);
    console.log(likesStr, retweetsStr, replyStr, quotesStr, bookmarksStr);

    // update last stat to current stat
    for (const key of keys) {
      lastStats[key] = curStats[key];
    }

    // NOTE: reading user/tweet doesn't work in free API (only posting works..)
    // const user = await readOnlyClient.v2.userByUsername("cdaein");
    // console.log(user);
    // const user = await client.v2.user("31077600", {
    //   "tweet.fields": ["id", "text"],
    // });
  } catch (e) {
    throw new Error(`Error requesting Twitter data.`);
  }
}
