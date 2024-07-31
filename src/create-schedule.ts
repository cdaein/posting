import path from "node:path";
import fs from "node:fs";
import { Choice, PromptObject } from "prompts";
import { PostType } from "./types";
import { loadConfig } from "./utils";
import { defaultConfig } from "./constants";

// load config
const userConfig = await loadConfig(defaultConfig, "../user.config.json");

const platforms: Choice[] = [
  { title: "instagram", value: "instagram", disabled: true },
  { title: "mastodon", value: "mastodon" },
  { title: "threads", value: "threads" },
  { title: "twitter", value: "twitter" },
];

const postTypes: Choice[] = [
  { title: "text", value: "text" },
  { title: "image", value: "image" },
  { title: "video", value: "video" },
];

const supportedImageFileTypes = ["png", "webp", "jpeg", "jpg"];
// REVIEW: is webm supported everywhere?
const supportedVideoFileTypes = ["mp4"];

// TODO: mastodon post visibility

export const questions: PromptObject[] = [
  {
    type: "multiselect",
    name: "platforms",
    message: "Platform(s)",
    instructions: false,
    hint: "- Space to select. Return to submit",
    choices: platforms,
  },
  // {
  //   type: (prev) => (prev.length === 0 ? "multiselect" : null),
  //   name: "platforms",
  //   message: "Platform(s)",
  //   instructions: "Choose at least 1 plaform to proceed",
  //   choices: platforms,
  // },
  {
    type: "select",
    name: "postType",
    message: "Post type",
    choices: postTypes,
  },
  {
    type: (prev: PostType) => (prev === "image" ? "text" : null),
    name: "imagePath",
    message: "Image file path",
    validate: (value: string) => {
      const trimmed = value.trim();
      if (!fs.existsSync(trimmed)) {
        return "Please enter a valid file path";
      }
      if (!supportedImageFileTypes.includes(path.extname(trimmed).slice(1))) {
        return `Please use a valid file type. ${supportedImageFileTypes.join(",")}`;
      }
      return true;
    },
  },
  {
    type: (prev: PostType) => (prev === "video" ? "text" : null),
    name: "videoPath",
    message: "Video file path",
    validate: (value: string) => {
      const trimmed = value.trim();
      if (!fs.existsSync(trimmed)) {
        return "Please enter a valid file path";
      }
      if (!supportedVideoFileTypes.includes(path.extname(trimmed).slice(1))) {
        return `Please use a valid file type. ${supportedVideoFileTypes.join(",")}`;
      }
      return true;
    },
  },
  {
    type: "text",
    name: "bodyText",
    message: "Message body",
  },
  {
    type: "date",
    name: "postDate",
    message: "Post time",
    initial: new Date(
      new Date().getTime() + userConfig.processInterval * 2 * 60 * 1000,
    ),
    mask: "YYYY.MMM.D ddd HH:mm",
    validate: (date) =>
      date < Date.now() + userConfig.processInterval * 60 * 1000
        ? `Must be greater than process interval of ${userConfig.processInterval} minutes`
        : true,
  },
];
