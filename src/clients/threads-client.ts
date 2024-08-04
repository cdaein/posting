import axios from "axios";
import { EnvVars } from "../types";
import path from "node:path";

export type ThreadsTokens = {
  appId: string;
  appSecret: string;
  userId: string;
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

export type ThreadsContainerStatus = "FINISHED" | "ERROR";

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
    envVars.threadsUserId &&
    envVars.threadsAccessToken
  ) {
    const tokens = {
      appId: envVars.threadsAppId,
      appSecret: envVars.threadsAppSecret,
      userId: envVars.threadsUserId,
      accessToken: envVars.threadsAccessToken,
    };
    return new ThreadsClient(tokens);
  }
  return undefined;
}

export class ThreadsClient {
  tokens: ThreadsTokens;
  THREADS_API_URL: string;
  IMAGE_FORMATS: string[];
  VIDEO_FORMATS: string[];
  MAX_ATTACHMENTS: 10;

  constructor(
    tokens: ThreadsTokens,
    THREADS_API_URL = "https://graph.threads.net/v1.0",
  ) {
    this.tokens = tokens;
    this.THREADS_API_URL = THREADS_API_URL;
    this.IMAGE_FORMATS = ["jpeg", "jpg", "png"];
    this.VIDEO_FORMATS = ["mp4", "mov"];
    this.MAX_ATTACHMENTS = 10;
  }

  /**
   * Use `/me` endpoint to get Threads User ID
   * @returns user ID string
   */
  async getUserId(): Promise<string> {
    return axios
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

  async createTextContainer(text: string): Promise<string> {
    const mediaData: ThreadsMediaData = {
      media_type: "TEXT",
      text,
      access_token: this.tokens.accessToken,
    };

    return axios
      .post(`${this.THREADS_API_URL}/${this.tokens.userId}/threads`, null, {
        params: mediaData,
      })
      .then((res) => {
        // return media container ID
        return res.data.id;
      })
      .catch((e) => {
        throw new Error(e);
      });
  }

  async createImageContainer(
    imageUrl: string,
    text = "",
    isCarouselItem = false,
  ): Promise<string> {
    const mediaData: ThreadsMediaData = {
      ...(isCarouselItem ? { is_carousel_item: true } : {}),
      media_type: "IMAGE",
      text,
      image_url: imageUrl,
      access_token: this.tokens.accessToken,
    };

    return axios
      .post(`${this.THREADS_API_URL}/${this.tokens.userId}/threads`, null, {
        params: mediaData,
      })
      .then((res) => {
        // return media container ID
        return res.data.id;
      })
      .catch((e) => {
        throw new Error(e);
      });
  }

  async createVideoContainer(
    videoUrl: string,
    text = "",
    isCarouselItem = false,
  ): Promise<string> {
    const mediaData: ThreadsMediaData = {
      ...(isCarouselItem ? { is_carousel_item: true } : {}),
      media_type: "VIDEO",
      text,
      video_url: videoUrl,
      access_token: this.tokens.accessToken,
    };

    return axios
      .post(`${this.THREADS_API_URL}/${this.tokens.userId}/threads`, null, {
        params: mediaData,
      })
      .then((res) => {
        // return media container ID
        return res.data.id;
      })
      .catch((e) => {
        throw new Error(e);
      });
  }

  async createCarouselContainer(childrenIds: string[], text = "") {
    if (childrenIds.length > this.MAX_ATTACHMENTS) {
      throw new Error(
        `Attached mediaUrls exceed the maximum of ${this.MAX_ATTACHMENTS}`,
      );
    }

    const mediaData: ThreadsMediaData = {
      media_type: "CAROUSEL",
      children: childrenIds.join(","),
      text,
      access_token: this.tokens.accessToken,
    };

    return axios
      .post(`${this.THREADS_API_URL}/${this.tokens.userId}/threads`, null, {
        params: mediaData,
      })
      .then((res) => {
        // return media container ID
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
  ): Promise<{ status: ThreadsContainerStatus; error_message: string }> {
    return axios
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
      .post(`${this.THREADS_API_URL}/${userId}/threads_publish`, null, {
        params: publishData,
      })
      .then(async (res) => {
        // res.data.id is mediaId
        return res.data.id;
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
    return axios
      .get(`${this.THREADS_API_URL}/${mediaId}/insights`, {
        params: {
          metric: "views,likes,replies,reposts,quotes",
          access_token: this.tokens.accessToken,
        },
      })
      .then((res) => {
        const postData = res.data.data;
        return postData.reduce(
          (acc: Record<string, number>, curr: ThreadsPostInsights) => {
            acc[curr.name] = curr.values[0].value;
            return acc;
          },
          {},
        );
      })
      .catch((e) => {
        throw new Error(e);
      });
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

    return (
      axios
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
        })
    );
  }
}
