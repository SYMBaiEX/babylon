import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readdir } from "node:fs/promises";
import type { EpisodeRecord } from "../../plugin-babylon/src/training/trajectory-types";

const DEFAULT_EPISODE_DIR = join(process.cwd(), "training", "episodes");

export async function loadEpisodeFiles(
  directory: string = DEFAULT_EPISODE_DIR,
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => join(directory, entry.name))
    .sort();
}

export async function loadEpisode(recordPath: string): Promise<EpisodeRecord> {
  const content = await readFile(recordPath, "utf-8");
  const parsed = JSON.parse(content) as EpisodeRecord;
  return parsed;
}

export async function loadEpisodes(
  directory: string = DEFAULT_EPISODE_DIR,
): Promise<EpisodeRecord[]> {
  const files = await loadEpisodeFiles(directory);
  const episodes: EpisodeRecord[] = [];
  for (const file of files) {
    try {
      const episode = await loadEpisode(file);
      episodes.push(episode);
    } catch (error) {
      console.warn(`Failed to parse episode ${file}:`, error);
    }
  }
  return episodes;
}


