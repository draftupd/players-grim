export type GameStatus = "active" | "finished";

export type Winner = "good" | "evil" | "other" | "unknown";

export type PersonalTeam = "good" | "evil" | "traveller" | "unknown";

export type PlayerTeam = "good" | "evil" | "unknown";
export type TokenTint = "default" | "good" | "evil";

export type RoleType =
  | "townsfolk"
  | "outsider"
  | "minion"
  | "demon"
  | "traveller"
  | "fabled"
  | "loric"
  | "unknown";

export type ScriptRole = {
  id: string;
  name: string;
  type: RoleType;
};

export type TokenPosition = {
  x: number;
  y: number;
};

export type GrimoireStyle = {
  tokenScale: number;
  extraTokenScale: number;
  nameScale: number;
  lockTokens?: boolean;
};

export type Game = {
  id: string;
  title: string;
  date: string;
  storyteller?: string;
  scriptName?: string;
  scriptAuthor?: string;
  scriptRoles?: ScriptRole[];
  activeFabledIds?: string[];
  activeLoricIds?: string[];
  myPlayerId?: string;
  myRoleId?: string;
  myTeam?: PersonalTeam;
  playerCount: number;
  status: GameStatus;
  winner?: Winner;
  finalNotes?: string;
  startedAt?: string;
  finishedAt?: string;
  pinnedAt?: string;
  trashedAt?: string;
  customTokenPositions?: Record<string, TokenPosition>;
  grimoireStyle?: GrimoireStyle;
  createdAt: string;
  updatedAt: string;
};

export type Player = {
  id: string;
  gameId: string;
  name: string;
  seatIndex: number;
  alive: boolean;
  deadVoteAvailable?: boolean;
  tokenTint?: TokenTint;
  mainRole?: string;
  additionalRoles: string[];
  isTraveller?: boolean;
  travellerRole?: string;
  travellerTeam?: PlayerTeam;
  joinedPhaseId?: string;
  leftPhaseId?: string;
  createdAt: string;
  updatedAt: string;
};

export type PhaseType = "night" | "day";

export type Phase = {
  id: string;
  gameId: string;
  number: number;
  type: PhaseType;
  title: string;
  createdAt: string;
};

export type Note = {
  id: string;
  gameId: string;
  phaseId: string;
  kind?: "general" | "vote_history" | "execution";
  text: string;
  linkedPlayerIds: string[];
  executionPlayerId?: string;
  executionMode?: "without_nomination";
  createdAt: string;
  updatedAt: string;
};

export type VoteRecord = {
  id: string;
  gameId: string;
  phaseId: string;
  nominatorPlayerId: string;
  nomineePlayerId: string;
  voterPlayerIds: string[];
  deadVoterPlayerIds: string[];
  resultedInExecution?: boolean;
  executedPlayerId?: string;
  createdAt: string;
  updatedAt: string;
};

export type PlayerVoteAvailability = "alive" | "dead_available" | "dead_spent";

export type VoteDraft = {
  phaseId: string;
  stage: "select_nominator" | "select_nominee" | "select_voters";
  nominatorPlayerId?: string;
  nomineePlayerId?: string;
  selectedVoterIds: string[];
};
