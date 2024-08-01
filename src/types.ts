export type EnvVars = {
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
    /** Firebase options to initialize app. */
    options: {
      storageBucket: string;
    };
  };
  ngrok: {
    port: number;
  };
};

export type Platform = "instagram" | "mastodon" | "threads" | "twitter";

export type PostType = "text" | "media";

/** User-generated post settings. Normally, it comes from `social create` command. */
export type PostSettings = {
  postType: PostType;
  platforms: Platform[];
  bodyText: string;
  /** File names of image or video */
  filenames: string[];
  // filename: string;
};
