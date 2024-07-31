export type EnvVars = {
  firebaseApiKey: string;
  firebaseEmail: string;
  firebasePassword: string;
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

export type PostType = "text" | "image" | "video";

/** User-generated post settings. Normally, it comes from `social create` command. */
export type PostSettings = {
  postType: PostType;
  platforms: Platform[];
  bodyText: string;
  /** File name of image or video */
  filename: string;
};

export type PromptsResponse = {
  postType: PostType;
  platforms: Platform[];
  imagePath?: string;
  videoPath?: string;
  bodyText: string;
  postDate: Date;
};
