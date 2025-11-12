import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  EpisodeRecord,
  TrajectoryEvent,
  ObservationEvent,
  OutcomeEvent,
  ActionEvent,
} from "../../plugin-babylon/src/training/trajectory-types";

export interface SftExample {
  prompt: string;
  response: string;
  metadata: Record<string, unknown>;
}

function collectContext(
  events: TrajectoryEvent[],
  index: number,
  maxContext: number = 3,
): { observations: ObservationEvent[]; outcomes: OutcomeEvent[] } {
  const observations: ObservationEvent[] = [];
  const outcomes: OutcomeEvent[] = [];

  for (let i = Math.max(0, index - maxContext); i < index; i += 1) {
    const event = events[i];
    if (event.type === "observation") {
      observations.push(event);
    } else if (event.type === "outcome") {
      outcomes.push(event);
    }
  }

  return { observations, outcomes };
}

function buildPrompt(
  episode: EpisodeRecord,
  action: ActionEvent,
  context: { observations: ObservationEvent[]; outcomes: OutcomeEvent[] },
): string {
  const lines: string[] = [];
  lines.push(
    `[SYSTEM] You are ${episode.metadata.characterName}, an autonomous Babylon trading agent acting inside a combined social + market simulation. Respond with the action you would take, given recent observations.`,
  );

  if (context.observations.length > 0) {
    lines.push("[OBSERVATIONS]");
    context.observations.forEach((observation) => {
      lines.push(
        `- (${new Date(observation.timestamp).toISOString()}) ${observation.label}: ${JSON.stringify(observation.summary)}`,
      );
    });
  }

  if (context.outcomes.length > 0) {
    lines.push("[OUTCOMES/FEEDBACK]");
    context.outcomes.forEach((outcome) => {
      lines.push(
        `- (${new Date(outcome.timestamp).toISOString()}) ${outcome.label}: ${JSON.stringify(outcome.data)}`,
      );
    });
  }

  lines.push("[USER]");
  lines.push(
    action.input.message
      ? String(action.input.message)
      : `Execute ${action.actionName} with input ${JSON.stringify(action.input)}`,
  );

  return lines.join("\n");
}

function buildResponse(action: ActionEvent): string {
  if (action.error) {
    return `[ERROR] ${action.error}`;
  }

  const payload = {
    action: action.actionName,
    output: action.output ?? {},
  };
  return JSON.stringify(payload);
}

export function buildSftExamples(episodes: EpisodeRecord[]): SftExample[] {
  const examples: SftExample[] = [];

  episodes.forEach((episode) => {
    episode.events.forEach((event, index) => {
      if (event.type !== "action") return;
      const context = collectContext(episode.events, index);
      const prompt = buildPrompt(episode, event, context);
      const response = buildResponse(event);
      examples.push({
        prompt,
        response,
        metadata: {
          episodeId: episode.metadata.episodeId,
          actionName: event.actionName,
          timestamp: event.timestamp,
          hasError: Boolean(event.error),
        },
      });
    });
  });

  return examples;
}

export async function writeJsonlDataset(
  examples: SftExample[],
  outputDir: string,
  split: "train" | "validation" | "test" = "train",
): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const filePath = join(outputDir, `${split}.jsonl`);

  const lines = examples.map((example) => JSON.stringify(example));
  await writeFile(filePath, `${lines.join("\n")}\n`, "utf-8");

  return filePath;
}


