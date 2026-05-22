import type { Game, PersonalTeam, Phase, PhaseType, Winner } from "../types";

export const todayInputValue = () => new Date().toISOString().slice(0, 10);

export const timestamp = () => new Date().toISOString();

const parseDateValue = (value?: string) => {
  if (!value) {
    return null;
  }

  const parsed = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00`);

  return Number.isFinite(parsed.getTime()) ? parsed : null;
};

export const timeInputValue = (value?: string) => {
  const date = parseDateValue(value);

  if (!date) {
    return "";
  }

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
};

export const combineDateAndTime = (date: string, time: string) => {
  const [hours, minutes] = time.split(":").map((part) => Number(part));

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return timestamp();
  }

  const nextDate = new Date(`${date}T00:00:00`);
  nextDate.setHours(hours, minutes, 0, 0);
  return nextDate.toISOString();
};

export const formatDate = (value?: string) => {
  const date = parseDateValue(value);

  if (!date) {
    return "";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
};

export const formatTime = (value?: string) => {
  const date = parseDateValue(value);

  if (!date) {
    return "";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export const gameDisplayTitle = (game: Game) => {
  const startedAt = game.startedAt ?? game.createdAt;
  const baseTitle = game.scriptName?.trim() || game.title;

  return `${baseTitle} · ${formatDate(game.date)} · ${formatTime(startedAt)}`;
};

export const formatDuration = (start?: string, end?: string) => {
  if (!start || !end) {
    return "";
  }

  const diffMs = Math.max(0, new Date(end).getTime() - new Date(start).getTime());
  const totalMinutes = Math.round(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes} мин`;
  }

  if (minutes === 0) {
    return `${hours} ч`;
  }

  return `${hours} ч ${minutes} мин`;
};

export const formatMinutesAsDuration = (totalMinutes: number) => {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
    return "0 мин";
  }

  const rounded = Math.round(totalMinutes);
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;

  if (hours === 0) {
    return `${minutes} мин`;
  }

  if (minutes === 0) {
    return `${hours} ч`;
  }

  return `${hours} ч ${minutes} мин`;
};

export const phaseTitle = (number: number, type: PhaseType) =>
  `${number} ${type === "night" ? "ночь" : "день"}`;

export const sortPhases = (phases: Phase[]) =>
  [...phases].sort((a, b) => {
    if (a.number !== b.number) {
      return a.number - b.number;
    }

    return a.type === b.type ? 0 : a.type === "night" ? -1 : 1;
  });

export const winnerLabel = (winner?: Winner) => {
  switch (winner) {
    case "good":
      return "Добро";
    case "evil":
      return "Зло";
    case "other":
      return "Другое";
    case "unknown":
      return "Неизвестно";
    default:
      return "Не указан";
  }
};

export const personalTeamLabel = (team?: PersonalTeam) => {
  switch (team) {
    case "good":
      return "Добро";
    case "evil":
      return "Зло";
    case "traveller":
      return "Traveller";
    case "unknown":
      return "Неизвестно";
    default:
      return "Не указана";
  }
};

export const personalResultLabel = (winner?: Winner, team?: PersonalTeam) => {
  if (!winner || winner === "unknown" || !team || team === "unknown") {
    return "Итог не ясен";
  }

  if (team === "traveller") {
    return "Traveller";
  }

  if (winner === team) {
    return "Твоя команда выиграла";
  }

  if (winner === "good" || winner === "evil") {
    return "Твоя команда проиграла";
  }

  return "Особый итог";
};
