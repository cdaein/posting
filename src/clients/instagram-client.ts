import axios from "axios";
import fs from "node:fs";
import { EnvVars } from "../types";

export type InstagramTokens = {
  appId: string;
  appSecret: string;
  userId: string;
  accessToken: string;
};

// NOTE: returned media type of REELS is VIDEO
// - returned media type of STORIES is IMAGE/VIDEO
// - use media_product_type instead.
export type InstagramMediaType = "REELS" | "STORIES" | "CAROUSEL";

export type InstagramMediaData = {
  is_carousel_item?: boolean;
  /** image post doesn't require media_type */
  media_type?: InstagramMediaType;
  /** conainter IDs for carousel post children. single string joined by comma. */
  children?: string;
  /** message body */
  caption?: string;
  /** must be a public URL */
  image_url?: string;
  /** must be a public URL */
  video_url?: string;
  access_token: string;
};

export type InstagramContainerStatus =
  | "EXPIRED"
  | "ERROR"
  | "FINISHED"
  | "IN_PROGRESS"
  | "PUBLISHED";

export type InstagramPublishData = {
  creation_id: string;
  access_token: string;
};

// TODO: check
export type InstagramUserData = {
  id: string;
  text: string;
  media_url: string;
  permalink: string;
};

export type InstagramPostInsights = {
  name: "engagement" | "impressions" | "reach";
  period: "lifetime"; // REVIEW: can i set custom period on post, not user, insight?
  values: { value: number }[];
  title: string;
  description: string;
  id: string;
};

export function initInstagramClient(envVars: EnvVars) {
  if (
    envVars.instagramAppId &&
    envVars.instagramAppSecret &&
    envVars.instagramUserId &&
    envVars.instagramAccessToken
  ) {
    const tokens = {
      appId: envVars.instagramAppId,
      appSecret: envVars.instagramAppSecret,
      userId: envVars.instagramUserId,
      accessToken: envVars.instagramAccessToken,
    };
    return new InstagramClient(tokens);
  }
  return undefined;
}

export class InstagramClient {
  tokens: InstagramTokens;
  INSTAGRAM_API_URL: string;
  IMAGE_FORMATS: string[];
  VIDEO_FORMATS: string[];
  MAX_ATTACHMENTS: 10;

  constructor(
    tokens: InstagramTokens,
    INSTAGRAM_API_URL = "https://graph.instagram.com/v20.0",
  ) {
    this.tokens = tokens;
    this.INSTAGRAM_API_URL = INSTAGRAM_API_URL;
    this.IMAGE_FORMATS = ["jpeg", "jpg", "png"];
    this.VIDEO_FORMATS = ["mp4", "mov"];
    this.MAX_ATTACHMENTS = 10;
  }

  /**
   * Use `/me` endpoint to get Instagram User ID
   * @returns user ID string
   */
  async getUserId(): Promise<string> {
    return (
      axios
        .get(`${this.INSTAGRAM_API_URL}/me`, {
          params: {
            fields: "user_id,username,account_type",
            access_token: this.tokens.accessToken,
          },
        })
        // { user_id, username, account_type, id }
        .then((res) => res.data.user_id)
    );
  }

  async createImageContainer(
    imageUrl: string,
    caption = "",
    opt?: { isCarouselItem?: boolean },
  ): Promise<string> {
    const mediaData: InstagramMediaData = {
      ...(opt?.isCarouselItem ? { is_carousel_item: true } : {}),
      caption,
      image_url: imageUrl,
      access_token: this.tokens.accessToken,
    };

    return axios
      .post(`${this.INSTAGRAM_API_URL}/${this.tokens.userId}/media`, null, {
        params: mediaData,
      })
      .then((res) => {
        // return media container ID
        return res.data.id;
      });
  }

  async createVideoContainer(
    videoUrl: string,
    caption = "",
    opt?: { isCarouselItem?: boolean },
  ): Promise<string> {
    const mediaData: InstagramMediaData = {
      ...(opt?.isCarouselItem ? { is_carousel_item: true } : {}),
      media_type: "REELS",
      caption,
      video_url: videoUrl,
      access_token: this.tokens.accessToken,
    };

    return axios
      .post(`${this.INSTAGRAM_API_URL}/${this.tokens.userId}/media`, null, {
        params: mediaData,
      })
      .then((res) => {
        // return media container ID
        return res.data.id;
      });
  }

  async createStoriesContainer(opt?: {
    image_url?: string;
    video_url?: string;
  }): Promise<string> {
    const mediaData: InstagramMediaData = {
      media_type: "STORIES",
      ...opt,
      access_token: this.tokens.accessToken,
    };

    return axios
      .post(`${this.INSTAGRAM_API_URL}/${this.tokens.userId}/media`, null, {
        params: mediaData,
      })
      .then((res) => {
        // return media container ID
        return res.data.id;
      });
  }

  async createCarouselContainer(childrenIds: string[], caption = "") {
    if (childrenIds.length > this.MAX_ATTACHMENTS) {
      throw new Error(
        `Attached mediaUrls exceed the maximum of ${this.MAX_ATTACHMENTS}`,
      );
    }

    const mediaData: InstagramMediaData = {
      media_type: "CAROUSEL",
      children: childrenIds.join(","),
      caption,
      access_token: this.tokens.accessToken,
    };

    return axios
      .post(`${this.INSTAGRAM_API_URL}/${this.tokens.userId}/media`, null, {
        params: mediaData,
      })
      .then((res) => {
        // return media container ID
        return res.data.id;
      });
  }

  /**
   * Use `/{CREATION_ID}` endpoint to query its current status. Large image or video can take a while to be ready to publish.
   * It should return `"FINISHED"` before it can be published.
   * @param creationId - Container ID string
   * @returns
   */
  async checkContainerStatus(creationId: string): Promise<{
    status_code: InstagramContainerStatus;
    error_message: string;
    id: string;
  }> {
    return axios
      .get(`${this.INSTAGRAM_API_URL}/${creationId}`, {
        params: {
          fields: "status_code",
          access_token: this.tokens.accessToken,
        },
      })
      .then((res) => {
        return res.data;
      });
  }

  /**
   * Use `/threads_publish` endpoint to publish a post
   * @param creationId - media container ID (single post container or carousel container)
   * @returns
   */
  async publish(creationId: string): Promise<string> {
    let userId = "";
    try {
      userId = this.tokens.userId || (await this.getUserId());
    } catch (e: any) {
      throw new Error(e);
    }

    const publishData = {
      creation_id: creationId,
      access_token: this.tokens.accessToken,
    };

    return axios
      .post(`${this.INSTAGRAM_API_URL}/${userId}/media_publish`, null, {
        params: publishData,
      })
      .then(async (res) => {
        // res.data.id is mediaId
        return res.data.id;
      });
  }

  // REVIEW: there's also account level metrics

  async getPostInsights(mediaId: string): Promise<{
    engagement: number;
    impressions: number;
    reach: number;
  }> {
    return axios
      .get(`${this.INSTAGRAM_API_URL}/${mediaId}/insights`, {
        params: {
          metric: "engagement,impressions,reach",
          access_token: this.tokens.accessToken,
        },
      })
      .then((res) => {
        const postData = res.data.data;
        return postData.reduce(
          (acc: Record<string, number>, curr: InstagramPostInsights) => {
            acc[curr.name] = curr.values[0].value;
            return acc;
          },
          {},
        );
      });
  }

  /**
   * Use `/{USER_ID}/threads` endpoint to retrieve user data including posts data
   * TODO: need to account for since/until (period)
   * @param limit - How many posts data to retrieve
   * @returns
   */
  // WARN: not finished yet
  // REVIEW: does this work for IG?
  async getUserData(limit: number): Promise<InstagramUserData[]> {
    let userId = "";
    try {
      userId = this.tokens.userId || (await this.getUserId());
    } catch (e: any) {
      throw new Error(e);
    }

    return (
      axios
        .get(`${this.INSTAGRAM_API_URL}/${userId}/insights`, {
          // .get(`${this.THREADS_API_URL}/me/threads`, {
          params: {
            limit,
            fields: "impressions,reach,profile_views",
            period: "day",
            access_token: this.tokens.accessToken,
          },
        })
        // REVIEW: what's in res.data?
        .then((res) => res.data.data)
    );
  }

  // WARN: BELOW NOT TESTED YET!!!
  // refreshToken("...", "THREADS_ACCESS_TOKEN")
  async refreshToken(envFilePath: string, key: string) {
    const envFileContent = fs.readFileSync(envFilePath, "utf8");

    // 1. make request
    // TODO: look at response
    const response = await axios.get(
      `https://graph.instagram.com/refresh_access_token`,
      {
        params: {
          grant_type: "th_refresh_token",
          access_token: this.tokens.accessToken,
        },
      },
    );

    const newTokenValue = "";
    const newEnvContent = envFileContent
      .split("\n")
      .map((line) => {
        // If the line starts with the key, replace the value
        if (line.startsWith(`${key}=`)) {
          return `${key}=${newTokenValue}`;
        }
        return line;
      })
      .join("\n");

    fs.writeFileSync(envFilePath, newEnvContent, "utf8");
    console.log(`${key} has been updated in ${envFilePath}`);
  }
}
