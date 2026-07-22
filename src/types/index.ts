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
  image?: string;
};

export type TokenPosition = {
  x: number;
  y: number;
};

export type GrimoireStyle = {
  tokenScale: number;
  extraTokenScale: number;
  nameScale: number;
  grimoireHeightScale?: number;
  lockTokens?: boolean;
};

export type TravellerVoteModifier = {
  id: string;
  travellerPlayerId: string;
  roleId: "bureaucrat" | "thief";
  targetPlayerId: string;
  voteValue: 3 | -1;
  createdAt: string;
};

export type TravellerMechanicsState = {
  beggarTokensByPlayerId?: Record<string, number>;
  beggarDonations?: Array<{
    id: string;
    phaseId: string;
    beggarPlayerId: string;
    donorPlayerId: string;
    donorTeam: PlayerTeam;
    createdAt: string;
  }>;
  voteModifiersByPhaseId?: Record<string, TravellerVoteModifier[]>;
  gunslingerShotsByPhaseId?: Record<
    string,
    {
      travellerPlayerId: string;
      targetPlayerId: string;
      voteRecordId: string;
      createdAt: string;
    }
  >;
  judgeUsedByPlayerId?: Record<string, string>;
  judgeForcedVoteRecordIds?: Record<string, "pass" | "fail">;
  deviantFunnyByPhaseId?: Record<string, boolean>;
  boneCollectorUsedByPlayerId?: Record<
    string,
    {
      targetPlayerId: string;
      phaseId: string;
      createdAt: string;
    }
  >;
  boneCollectorEffectsByPhaseId?: Record<
    string,
    {
      travellerPlayerId: string;
      targetPlayerId: string;
      createdAt: string;
    }
  >;
  baristaEffectsByPhaseId?: Record<
    string,
    {
      travellerPlayerId: string;
      targetPlayerId: string;
      mode: "sober_healthy_true_info" | "ability_twice";
      createdAt: string;
    }
  >;
  harlotVisitsByPhaseId?: Record<
    string,
    {
      travellerPlayerId: string;
      targetPlayerId: string;
      accepted: boolean;
      killBoth: boolean;
      revealedRoleId?: string;
      createdAt: string;
    }
  >;
  apprenticeAbilityByPlayerId?: Record<
    string,
    {
      abilityRoleId: string;
      team: PlayerTeam;
      createdAt: string;
    }
  >;
  matronSwapsByPhaseId?: Record<
    string,
    Array<{
      id: string;
      aPlayerId: string;
      bPlayerId: string;
      createdAt: string;
    }>
  >;
  cacklejackEffectsByPhaseId?: Record<
    string,
    {
      travellerPlayerId: string;
      immunePlayerId?: string;
      changedPlayerId?: string;
      newRoleId?: string;
      createdAt: string;
    }
  >;
  gangsterKillsByPhaseId?: Record<
    string,
    {
      travellerPlayerId: string;
      targetPlayerId: string;
      consentingNeighborId: string;
      createdAt: string;
    }
  >;
  gnomeAmigoByPlayerId?: Record<string, string>;
  gnomeKills?: Array<{
    id: string;
    phaseId: string;
    travellerPlayerId: string;
    amigoPlayerId: string;
    nominatorPlayerId: string;
    createdAt: string;
  }>;
};

export type Game = {
  id: string;
  title: string;
  date: string;
  storyteller?: string;
  scriptName?: string;
  scriptVersion?: string;
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
  hasStarted?: boolean;
  currentPhaseId?: string;
  startedAt?: string;
  finishedAt?: string;
  pinnedAt?: string;
  trashedAt?: string;
  customTokenPositions?: Record<string, TokenPosition>;
  grimoireStyle?: GrimoireStyle;
  travellerMechanics?: TravellerMechanicsState;
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
  kind?: "general" | "vote_history" | "execution" | "role_intel" | "day_death";
  roleId?: string;
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
  voteType?: "execution" | "traveller_exile";
  nominatorPlayerId: string;
  nomineePlayerId: string;
  voterPlayerIds: string[];
  deadVoterPlayerIds: string[];
  resultedInExecution?: boolean;
  executedPlayerId?: string;
  executedPlayerDied?: boolean;
  executionProtectionRoleId?: string;
  createdAt: string;
  updatedAt: string;
};

export type PlayerVoteAvailability = "alive" | "dead_available" | "dead_spent" | "unavailable";

export type VoteDraft = {
  phaseId: string;
  voteType?: "execution" | "traveller_exile";
  stage: "select_nominator" | "select_nominee" | "select_voters";
  nominatorPlayerId?: string;
  nomineePlayerId?: string;
  selectedVoterIds: string[];
};
