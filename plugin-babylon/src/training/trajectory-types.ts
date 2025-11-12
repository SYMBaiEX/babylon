// Type alias for JSON values
type JsonValue = string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[];

export type RewardComponent = {
  name: string;
  value: number;
  metadata?: Record<string, JsonValue>;
};

export interface ObservationEvent {
  type: "observation";
  timestamp: number;
  label: string;
  summary: Record<string, JsonValue>;
}

export interface ActionEvent {
  type: "action";
  timestamp: number;
  actionName: string;
  input: Record<string, JsonValue>;
  output?: Record<string, JsonValue>;
  error?: string;
}

export interface OutcomeEvent {
  type: "outcome";
  timestamp: number;
  label: string;
  data: Record<string, JsonValue>;
}

export type TrajectoryEvent = ObservationEvent | ActionEvent | OutcomeEvent;

export interface EpisodeMetadata {
  agentId: string;
  characterName: string;
  startTime: number;
  episodeId: string;
  trainingMode: "autonomous" | "scripted" | "evaluation";
  environment: {
    apiBaseUrl: string;
    a2aEndpoint?: string;
  };
  initialWallet?: {
    balance: number;
    availableBalance: number;
    lockedBalance: number;
  };
  tags: string[];
}

export interface EpisodeRecord {
  metadata: EpisodeMetadata;
  events: TrajectoryEvent[];
  reward?: {
    total: number;
    components: RewardComponent[];
  };
  finalWallet?: {
    balance: number;
    availableBalance: number;
    lockedBalance: number;
  };
  finishedAt?: number;
  durationMs?: number;
}


