export type GameStatus = "active" | "finished";

export type Winner = "good" | "evil" | "other" | "unknown";

export type PersonalTeam = "good" | "evil" | "traveller" | "unknown";

export type PlayerTeam = "good" | "evil" | "unknown";

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

export type Game = {
  id: string;
  title: string;
  date: string;
  storyteller?: string;
  scriptName?: string;
  scriptAuthor?: string;
  scriptRoles?: ScriptRole[];
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
  createdAt: string;
  updatedAt: string;
};

export type Player = {
  id: string;
  gameId: string;
  name: string;
  seatIndex: number;
  alive: boolean;
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
  text: string;
  linkedPlayerIds: string[];
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
  createdAt: string;
  updatedAt: string;
};

export type PlayerVoteAvailability = "alive" | "dead_available" | "dead_spent";

export type VoteDraft = {
  phaseId: string;
  nominatorPlayerId: string;
  nomineePlayerId: string;
  selectedVoterIds: string[];
};
