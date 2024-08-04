export type EnvVars = {
  //
  blueskyEmail?: string;
  blueskyPassword?: string;
  //
  firebaseApiKey: string;
  firebaseEmail: string;
  firebasePassword: string;
  //
  instagramUserId: string;
  instagramAccessToken: string;
  //
  mastodonInstaceUrl?: string;
  mastodonAccessToken?: string;
  //
  threadsAppId?: string;
  threadsAppSecret?: string;
  threadsUserId?: string;
  threadsAccessToken?: string;
  //
  twitterAppKey?: string;
  twitterAppSecret?: string;
  twitterAccessToken?: string;
  twitterAccessSecret?: string;
};

export type Config = {
  watchDir: string;
  /** interval in minutes */
  processInterval: number;
  cronTime: string;
  firebase: {
    options: {
      storageBucket: string;
    };
  };
  bluesky?: {
    handle: string;
  };
  mastodon?: {
    instanceUrl: string;
  };
};

export type Platform =
  | "bluesky"
  | "instagram"
  | "mastodon"
  | "threads"
  | "twitter";

export type PostType = "text" | "media";

export type FileInfo = {
  filename: string;
  altText: string;
};

/** User-generated post settings. Normally, it comes from `posting create` command. */
export type PostSettings = {
  postType: PostType;
  platforms: Platform[];
  bodyText: string;
  /** `{ filename, altText }` */
  fileInfos: FileInfo[];
};
