export type EnvVars = {
  //
  blueskyUsername: string;
  blueskyPassword: string;
  //
  firebaseApiKey: string;
  firebaseEmail: string;
  firebasePassword: string;
  //
  instagramUserId: string;
  instagramAccessToken: string;
  //
  mastodonInstaceUrl: string;
  mastodonAccessToken: string;
  //
  threadsUserId: string;
  threadsAccessToken: string;
  //
  twitterAppKey: string;
  twitterAppSecret: string;
  twitterAccessToken: string;
  twitterAccessSecret: string;
};

export type Config = {
  watchDir: string;
  /** interval in minutes */
  processInterval: number;
  firebase: {
    options: {
      storageBucket: string;
    };
  };
  ngrok: {
    port: number;
  };
};

export type Platform =
  | "bluesky"
  | "instagram"
  | "mastodon"
  | "threads"
  | "twitter";

export type PostType = "text" | "media";

/** User-generated post settings. Normally, it comes from `posting create` command. */
export type PostSettings = {
  postType: PostType;
  platforms: Platform[];
  bodyText: string;
  /** File names of image or video */
  filenames: string[];
};
