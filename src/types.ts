export type EnvVars = {
  //
  blueskyEmail?: string;
  blueskyPassword?: string;
  blueskyHandle?: string;
  //
  firebaseStorageBucket: string;
  firebaseApiKey: string;
  firebaseEmail: string;
  firebasePassword: string;
  //
  instagramUserId: string;
  instagramAccessToken: string;
  //
  mastodonInstanceUrl?: string;
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

export type PostSettings = {
  postType: PostType;
  bodyText: string;
  /** `{ filename, altText }[]` */
  fileInfos: FileInfo[];
};

/**
 * User-generated post settings. Normally, it comes from `posting create` command.
 */
export type PostsSettings = {
  platforms: Platform[];
  posts: PostSettings[];
};
