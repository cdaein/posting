import { Command } from "commander";
import kleur from "kleur";
import fs from "node:fs";
import path from "path";
import prompts from "prompts";
import {
  bodyTextQuestionFn,
  dateQuestionFn,
  multiFilesQuestionFn,
  platformsQuestion,
  postTypeQuestion,
} from "../questions";
import { Platform, PostType } from "../types";
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

      const postTypeAnswer = await prompts(postTypeQuestion, promptOptions);
      const postType: PostType = postTypeAnswer.postType;

      // text post needs text body
      // REVIEW: ask this later only if there's no media attachment
      // then, i can skip this check and postType question.
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

      const dateAnswer = await prompts(dateQuestionFn(watchDir), promptOptions);
      const { postDate } = dateAnswer;

      // Create a folder inside watchDir with datetime string
      const folderName = formatPostFolderName(postDate.toISOString());
      const folderPath = path.join(watchDir, folderName);
      fs.mkdirSync(folderPath, { recursive: true });

      // Copy media files to watchdir
      const targetFilePaths: string[] = [];
      for (const fileInfo of fileInfos) {
        const filePath = fileInfo.mediaPath;
        let targetFilePath = "";
        const filePathTrimmed = filePath?.trim();
        if (filePathTrimmed) {
          targetFilePath = path.resolve(
            folderPath,
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

      // Create settings.json file in the scheduled post folder
      const settings = {
        postType,
        platforms,
        bodyText,
        fileInfos: fileInfos.map((fileInfo, i) => {
          return {
            filename: path.basename(targetFilePaths[i]),
            altText: fileInfo.altText.trim(),
          };
        }),
      };
      const settingsString = JSON.stringify(settings, null, 2);
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
