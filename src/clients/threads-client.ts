import axios from "axios";
import { EnvVars } from "../types";

export type ThreadsTokens = {
  appId: string;
  appSecret: string;
  userId?: string;
  accessToken: string;
};

export type ThreadsMediaType = "TEXT" | "IMAGE" | "VIDEO" | "CAROUSEL";

export type ThreadsMediaData = {
  is_carousel_item?: boolean;
  media_type: ThreadsMediaType;
  /** conainter IDs for carousel post children. single string joined by comma. */
  children?: string;
  /** message body */
  text?: string;
  /** must be a public URL */
  image_url?: string;
  /** must be a public URL */
  video_url?: string;
  access_token: string;
};

export type ThreadsPublishData = {
  creation_id: string;
  access_token: string;
};

export type ThreadsPostInsights = {
  name: "views" | "likes" | "replies" | "reposts" | "quotes";
  period: string;
  values: { value: number }[];
  title: string;
  description: string;
  id: string;
};

export function initThreadsClient(envVars: EnvVars) {
  if (
    envVars.threadsAppId &&
    envVars.threadsAppSecret &&
    envVars.threadsAccessToken
  ) {
    const tokens = {
      appId: envVars.threadsAppId,
      appSecret: envVars.threadsAppSecret,
      accessToken: envVars.threadsAccessToken,
    };
    return new ThreadsClient(tokens);
  }
  return undefined;
}

export class ThreadsClient {
  tokens: ThreadsTokens;
  THREADS_API_URL: string;

  constructor(
    tokens: ThreadsTokens,
    THREADS_API_URL = "https://graph.threads.net/v1.0",
  ) {
    this.tokens = tokens;
    this.THREADS_API_URL = THREADS_API_URL;
  }

  /**
   * Use `/me` endpoint to get Threads User ID
   * @returns user ID string
   */
  async getUserId(): Promise<string> {
    return await axios
      .get(`${this.THREADS_API_URL}/me`, {
        params: {
          access_token: this.tokens.accessToken,
        },
      })
      .then((res) => res.data.id)
      .catch((e) => {
        throw new Error(e);
      });
  }

  // TODO: how to get media data - from user? automate?
  // TODO: check max number of attachments
  // TODO: take in mediaUrls.
  // - if mediaUrls.length === 1, just get a single media container ID.
  // - if mediaUrls.length > 1, create individual media container IDs, then create a carousel media container ID.
  // TODO: recursive calling based on number of urls
  async createMediaContainer(
    mediaData: ThreadsMediaData,
    mediaUrls: string[],
  ): Promise<string> {
    let userId = "";
    try {
      userId = this.tokens.userId || (await this.getUserId());
    } catch (e: any) {
      throw new Error(e);
    }

    if (mediaUrls.length === 1) {
      //
    } else if (mediaUrls.length <= 10) {
      //
    } else {
      throw new Error(`Attached media length exceeds the maximum of 10`);
    }

    return await axios
      .post(`${this.THREADS_API_URL}/${userId}/threads`, null, {
        params: mediaData,
      })
      .then((res) => {
        return res.data.id;
      })
      .catch((e) => {
        throw new Error(e);
      });
  }

  /**
   * Use `/{CREATION_ID}` endpoint to query its current status. Large image or video can take a while to be ready to publish.
   * It should return `"FINISHED"` before it can be published.
   * @param creationId - Container ID string
   * @returns
   */
  async checkContainerStatus(
    creationId: string,
  ): Promise<{ status: "FINISHED" | "ERROR"; error_message: string }> {
    return await axios
      .get(`${this.THREADS_API_URL}/${creationId}`, {
        params: {
          fileds: "status,error_message",
          access_token: this.tokens.accessToken,
        },
      })
      .then((res) => res.data)
      .catch((e) => {
        throw new Error(e);
      });
  }

  /**
   * Use `/threads_publish` endpoint to publish a post
   * @param creationId - media container ID (single post container or carousel container)
   * @returns
   */
  async publish(creationId: string): Promise<{ id: string }> {
    let userId = "";
    try {
      userId = this.tokens.userId || (await this.getUserId());
    } catch (e: any) {
      throw new Error(e);
    }

    return await axios
      .post(`${this.THREADS_API_URL}/${userId}/threads_publish`, null, {
        params: {
          creation_id: creationId,
          access_token: this.tokens.accessToken,
        },
      })
      .then(async (res) => {
        // res.data.id is mediaId
        return res.data;
      })
      .catch((e) => {
        throw new Error(e);
      });
  }

  async getPostInsights(mediaId: string): Promise<{
    views: number;
    likes: number;
    replies: number;
    reposts: number;
    quotes: number;
  }> {
    const postData = await axios
      .get(`${this.THREADS_API_URL}/${mediaId}/insights`, {
        params: {
          metric: "views,likes,replies,reposts,quotes",
          access_token: this.tokens.accessToken,
        },
      })
      .then((res) => res.data.data)
      .catch((e) => {
        throw new Error(e);
      });

    // { views, likes, replies, reposts, quotes }
    return postData.reduce(
      (acc: Record<string, number>, curr: ThreadsPostInsights) => {
        acc[curr.name] = curr.values[0].value;
        return acc;
      },
      {},
    );
  }

  /**
   * Use `/{USER_ID}/threads` endpoint to retrieve user data including posts data
   * TODO: need to account for since/until (period)
   * @param limit - How many posts data to retrieve
   * @returns
   */
  async getUserData(limit: number): Promise<
    {
      id: string;
      text: string;
      media_url: string;
      permalink: string;
    }[]
  > {
    let userId = "";
    try {
      userId = this.tokens.userId || (await this.getUserId());
    } catch (e: any) {
      throw new Error(e);
    }

    return await axios
      .get(`${this.THREADS_API_URL}/${userId}/threads`, {
        // .get(`${this.THREADS_API_URL}/me/threads`, {
        params: {
          limit,
          fields: "id,text,media_url,permalink",
          access_token: this.tokens.accessToken,
        },
      })
      // REVIEW: what's in res.data?
      .then((res) => res.data.data)
      .catch((e) => {
        throw new Error(e);
      });
  }
}
