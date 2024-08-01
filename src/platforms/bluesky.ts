import { BskyAgent, PostRecord, RichText } from "@atproto/api";
import { EnvVars, PostSettings } from "../types";
import kleur from "kleur";

const { bold, green, yellow } = kleur;

export async function uploadBluesky(
  envVars: EnvVars,
  folderPath: string,
  settings: PostSettings,
  dev: boolean,
) {
  const agent = new BskyAgent({
    service: "https://bsky.social",
  });

  await agent.login({
    identifier: envVars.blueskyUsername,
    password: envVars.blueskyPassword,
  });

  const { postType, bodyText, filenames } = settings;

  if (dev) {
    return { url: "DEV MODE BLUESKY" };
  }

  const rt = new RichText({ text: bodyText });
  await rt.detectFacets(agent); // automatically detects mentions and links

  for (const filename of filenames) {
    //
  }

  const postRecord = {
    $type: "app.bsky.feed.post",
    text: rt.text,
    facets: rt.facets,
    createdAt: new Date().toISOString(),
  };

  console.log(`Publishing on ${bold("Bluesky")}..`);
  const status = await agent.post(postRecord);
  console.log(`Published on ${bold("Bluesky")}. uri: ${green(status.uri)}`);

  return status;
}
