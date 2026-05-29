import { isArchiveBundle } from "./archive";
import { parseScriptJson } from "./scripts";

const hasJsonLikeName = (file: File) => file.name.toLowerCase().endsWith(".json");

const readJsonFile = async (file: File, label: string) => {
  if (file.size === 0) {
    throw new Error(`${label} пустой. Выберите JSON-файл с данными.`);
  }

  if (!hasJsonLikeName(file) && !file.type.includes("json")) {
    throw new Error(`${label} должен быть в формате JSON.`);
  }

  const rawText = await file.text();

  if (!rawText.trim()) {
    throw new Error(`${label} пустой. Выберите JSON-файл с данными.`);
  }

  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    throw new Error(`${label} поврежден или заполнен невалидным JSON.`);
  }
};

export const readImportedArchive = async (file: File) => {
  const parsed = await readJsonFile(file, "Файл истории");

  if (!isArchiveBundle(parsed)) {
    throw new Error(
      "Это не история Player's Grimoire. Нужен JSON-файл, выгруженный через кнопку «Выгрузить историю».",
    );
  }

  return parsed;
};

export const readImportedScript = async (file: File) => {
  const parsed = await readJsonFile(file, "Файл сценария");

  try {
    return parseScriptJson(parsed);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error(
      "Не удалось прочитать сценарий. Проверьте, что это JSON-массив ролей из Blood on the Clocktower.",
    );
  }
};

const parseScriptJsonWithMessage = (parsed: unknown) => {
  try {
    return parseScriptJson(parsed);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error(
      "Не удалось прочитать сценарий. Проверьте, что ссылка ведет на JSON-массив ролей из Blood on the Clocktower.",
    );
  }
};

const decodeOfficialScriptToolUrl = async (url: URL) => {
  const encodedScript = url.searchParams.get("script");

  if (!encodedScript) {
    return null;
  }

  if (typeof DecompressionStream === "undefined") {
    throw new Error("Браузер не умеет распаковывать ссылки Script Tool. Скачайте JSON сценария и загрузите файл.");
  }

  try {
    const normalizedBase64 = encodedScript.replaceAll("-", "+").replaceAll("_", "/");
    const binary = atob(normalizedBase64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    const rawJson = await new Response(stream).text();

    return JSON.parse(rawJson) as unknown;
  } catch {
    throw new Error("Не удалось прочитать ссылку Script Tool. Проверьте, что она скопирована через Copy Script Link.");
  }
};

export const readImportedScriptUrl = async (url: string) => {
  const trimmedUrl = url.trim();

  if (!trimmedUrl) {
    throw new Error("Вставьте ссылку на JSON сценария.");
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(trimmedUrl);
  } catch {
    throw new Error("Ссылка на сценарий некорректна.");
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new Error("Ссылка на сценарий должна начинаться с http:// или https://.");
  }

  const officialScriptToolJson = await decodeOfficialScriptToolUrl(parsedUrl);

  if (officialScriptToolJson) {
    return parseScriptJsonWithMessage(officialScriptToolJson);
  }

  let response: Response;

  try {
    response = await fetch(parsedUrl.toString(), {
      headers: {
        Accept: "application/json",
      },
    });
  } catch {
    throw new Error("Не удалось загрузить сценарий по ссылке. Проверьте адрес или доступность сайта.");
  }

  if (!response.ok) {
    throw new Error(`Не удалось загрузить сценарий: сервер ответил ${response.status}.`);
  }

  let parsed: unknown;

  try {
    parsed = await response.json();
  } catch {
    throw new Error("Ссылка вернула невалидный JSON сценария.");
  }

  return parseScriptJsonWithMessage(parsed);
};
