import type { Game, Note, Phase, Player, Winner } from "../types";

const teamAccusativeLabel = (winner: Winner) => {
  switch (winner) {
    case "good":
      return "Синих";
    case "evil":
      return "Красных";
    case "other":
      return "Других";
    case "unknown":
      return "Неизвестных";
  }
};

const joinNames = (names: string[]) => {
  if (names.length <= 1) {
    return names[0] ?? "";
  }

  if (names.length === 2) {
    return `${names[0]} и ${names[1]}`;
  }

  return `${names.slice(0, -1).join(", ")} и ${names[names.length - 1]}`;
};

const buildEndingTriggerText = (game: Game, players: Player[], notes: Note[], phases: Phase[]) => {
  if (game.status !== "finished") {
    return "";
  }

  const playersById = new Map(players.map((player) => [player.id, player]));
  const phasesById = new Map(phases.map((phase) => [phase.id, phase]));
  const relevantNotes = notes
    .filter((note) => note.gameId === game.id && (note.kind === "execution" || note.kind === "day_death"))
    .filter((note) => !game.finishedAt || note.createdAt <= game.finishedAt)
    .sort((a, b) => {
      const createdCompare = a.createdAt.localeCompare(b.createdAt);

      if (createdCompare !== 0) {
        return createdCompare;
      }

      return a.updatedAt.localeCompare(b.updatedAt);
    });

  const lastNote = relevantNotes.at(-1);

  if (!lastNote) {
    return "";
  }

  if (lastNote.kind === "execution") {
    const executedName =
      playersById.get(lastNote.executionPlayerId ?? "")?.name ??
      playersById.get(lastNote.linkedPlayerIds[0] ?? "")?.name;

    if (!executedName) {
      return "Партия завершилась после казни.";
    }

    return `Партия завершилась после казни ${executedName}.`;
  }

  const deadNames = lastNote.linkedPlayerIds
    .map((playerId) => playersById.get(playerId)?.name)
    .filter((name): name is string => Boolean(name));
  const phase = phasesById.get(lastNote.phaseId);

  if (deadNames.length === 0) {
    return phase?.type === "night"
      ? "Партия завершилась после ночной смерти."
      : "Партия завершилась после смерти.";
  }

  return deadNames.length === 1
    ? `Партия завершилась после смерти ${deadNames[0]}.`
    : `Партия завершилась после смертей ${joinNames(deadNames)}.`;
};

export const buildFinishedGameConclusion = (game: Game, players: Player[], notes: Note[], phases: Phase[]) => {
  const parts: string[] = [];

  if ((game.myTeam === "good" || game.myTeam === "evil") && (game.winner === "good" || game.winner === "evil")) {
    parts.push(
      game.myTeam === game.winner
        ? `Я выиграла за команду ${teamAccusativeLabel(game.winner)}.`
        : `Я проиграла команде ${teamAccusativeLabel(game.winner)}.`,
    );
  } else if (game.winner === "good" || game.winner === "evil") {
    parts.push(`Победила команда ${teamAccusativeLabel(game.winner)}.`);
  }

  const endingTriggerText = buildEndingTriggerText(game, players, notes, phases);

  if (endingTriggerText) {
    parts.push(endingTriggerText);
  }

  const trimmedFinalNotes = game.finalNotes?.trim();

  if (trimmedFinalNotes) {
    parts.push(trimmedFinalNotes);
  }

  return parts.join(" ").trim();
};
