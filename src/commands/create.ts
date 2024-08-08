import { Command } from "commander";
import kleur from "kleur";
import fs from "node:fs";
import path from "path";
import prompts from "prompts";
import {
  bodyTextQuestionFn,
  dateQuestionFn,
  hasReplyQuestion,
  multiFilesQuestionFn,
  platformsQuestion,
  postTypeQuestion,
} from "../questions";
import { Platform, PostSettings, PostsSettings, PostType } from "../types";
import { getMaxAttachments } from "../upload-post";
import { formatPostFolderName, versionUpPath } from "../utils";

const { green, red, yellow } = kleur;

const promptOptions = {
  onCancel: () => {
    throw new Error(red("✖") + " cancelled");
  },
};

export function initCreateCommand(program: Command, watchDir: string) {
  program.command("create").action(async () => {
    if (!fs.existsSync(watchDir)) {
      console.error(`Watch directory doesn't exist at ${watchDir}`);
      process.exit(1);
    }
    if (!fs.lstatSync(watchDir).isDirectory()) {
      console.error(`Watch directory is not a directory.`);
      process.exit(1);
    }

    try {
      let platforms: Platform[] = [];
      // make sure at least 1 platform selected
      while (platforms.length === 0) {
        const platformsAnswer = await prompts(platformsQuestion, promptOptions);
        platforms = platformsAnswer.platforms;
      }

      // create a temporary post folder
      // this is for reply thread posts to copy files as they are added.
      // REVIEW: this is more of a temporary solution as I had trouble checking same filename conflicts for reply thread.
      // ultimately, it'd be best to avoid temporary folder
      // FIX: what if there's already temp folder with some files?
      // currently, files keep adding.
      const tempFolderPath = path.join(watchDir, "temp-posting");
      fs.mkdirSync(tempFolderPath, { recursive: true });

      let hasReply = true;
      const posts: PostSettings[] = [];

      while (hasReply) {
        // ask full post questions
        const postTypeAnswer = await prompts(postTypeQuestion, promptOptions);
        const postType: PostType = postTypeAnswer.postType;

        // text post needs text body
        const bodyTextAnswer = await prompts(
          bodyTextQuestionFn(platforms, postType),
          promptOptions,
        );
        const bodyText = bodyTextAnswer.bodyText;

        // ask for multiple file paths and descriptions (alt text)
        const fileInfos: { mediaPath: string; altText: string }[] = [];
        const maxAttachments = getMaxAttachments(platforms);
        // ask files to attach until answer is empty
        let numAttached = 0;
        let askMoreAttachment = true;
        while (
          postType === "media" &&
          numAttached < maxAttachments &&
          askMoreAttachment
        ) {
          const multiFilesAnswer = await prompts(
            multiFilesQuestionFn(
              platforms,
              postType,
              maxAttachments,
              numAttached,
            ),
            promptOptions,
          );
          if (multiFilesAnswer.mediaPath?.length === 0) {
            askMoreAttachment = false;
          } else {
            fileInfos.push({
              mediaPath: multiFilesAnswer.mediaPath,
              altText: multiFilesAnswer.altText,
            });
            numAttached++;
          }
        }

        // at this point, check same filename conflicts, copy files to temporary post folder
        const targetFilePaths: string[] = [];
        for (const fileInfo of fileInfos) {
          const filePath = fileInfo.mediaPath;
          let targetFilePath = "";
          const filePathTrimmed = filePath?.trim();
          if (filePathTrimmed) {
            targetFilePath = path.resolve(
              tempFolderPath,
              path.basename(filePathTrimmed),
            );
            // if filenames are same (but could be from different path), version up name when copying
            const renamedPath = await versionUpPath(
              filePathTrimmed,
              targetFilePath,
              "copy",
              false,
            );
            console.log(
              `Copied media file from ${yellow(filePathTrimmed)} to ${yellow(renamedPath)}`,
            );
            targetFilePaths.push(renamedPath);
          }
        }

        const postSettings: PostSettings = {
          postType,
          bodyText,
          fileInfos: fileInfos.map((fileInfo, i) => {
            return {
              filename: path.basename(targetFilePaths[i]),
              altText: fileInfo.altText.trim(),
            };
          }),
        };
        posts.push(postSettings);

        // ask if there's more reply
        const hasReplyAnswer = await prompts(hasReplyQuestion, promptOptions);
        hasReply = hasReplyAnswer.hasReply;
      }

      const dateAnswer = await prompts(dateQuestionFn(watchDir), promptOptions);
      const { postDate } = dateAnswer;

      // Rename temp folder to actual datetime inside watchDir with datetime string
      const folderName = formatPostFolderName(postDate.toISOString());
      const folderPath = path.join(watchDir, folderName);
      await fs.promises.rename(tempFolderPath, folderPath);
      // fs.mkdirSync(folderPath, { recursive: true });

      // Copy media files to watchdir
      // TODO: break logic: version up and copy
      // - need to look through all the fileInfos (filenames) and decide how to version up
      // - then, at the end copy all files with new names

      // { platforms, posts: { postType, bodyText, fileInfos } }
      const postsSettings: PostsSettings = {
        platforms,
        posts,
      };
      // Create settings.json file in the scheduled post folder
      const settingsString = JSON.stringify(postsSettings, null, 2);
      fs.writeFileSync(
        path.resolve(folderPath, "settings.json"),
        settingsString,
        "utf8",
      );

      console.log(`The post is ready at ${yellow(folderPath)}`);
      console.log(
        `It will be published around the scheduled time if ${green("posting watch")} is running.`,
      );
    } catch (e: unknown) {
      console.log((e as Error).message);
      return;
    }
  });
}
