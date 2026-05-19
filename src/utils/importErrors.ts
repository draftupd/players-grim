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
  const parsed = await readJsonFile(file, "Файл архива");

  if (!isArchiveBundle(parsed)) {
    throw new Error(
      "Это не архив Player's Grimoire. Нужен JSON-файл, выгруженный через кнопку «Выгрузить архив».",
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
