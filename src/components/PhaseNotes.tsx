import { Edit3, Save, Send, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Note, Phase, Player } from "../types";
import { formatDate, formatTime } from "../utils/dates";
import { mergeManualAndMentionLinks } from "../utils/mentions";
import MentionTextarea from "./MentionTextarea";

type PhaseNotesProps = {
  phase?: Phase;
  notes: Note[];
  players: Player[];
  onAddNote: (text: string, linkedPlayerIds: string[]) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
  onUpdateNote: (noteId: string, text: string, linkedPlayerIds: string[]) => Promise<void>;
};

export default function PhaseNotes({
  phase,
  notes,
  players,
  onAddNote,
  onDeleteNote,
  onUpdateNote,
}: PhaseNotesProps) {
  const [text, setText] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const playersById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players],
  );

  const appendMention = (
    currentText: string,
    setTextValue: (value: string) => void,
    playerName: string,
  ) => {
    const mention = `@${playerName}`;
    const trimmedEnd = currentText.replace(/\s+$/u, "");

    if (trimmedEnd.includes(mention)) {
      return;
    }

    const separator = trimmedEnd.length > 0 ? " " : "";
    setTextValue(`${trimmedEnd}${separator}${mention} `);
  };

  const handleAdd = async () => {
    const trimmed = text.trim();

    if (!trimmed) {
      setError("Заполни текст заметки.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await onAddNote(trimmed, mergeManualAndMentionLinks(trimmed, players, []));
      setText("");
    } catch {
      setError("Не удалось сохранить заметку.");
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (note: Note) => {
    setEditingNoteId(note.id);
    setEditingText(note.text);
  };

  const cancelEditing = () => {
    setEditingNoteId(null);
    setEditingText("");
  };

  const saveEditing = async (noteId: string) => {
    const trimmed = editingText.trim();

    if (!trimmed) {
      setError("Заполни текст заметки.");
      return;
    }

    try {
      await onUpdateNote(noteId, trimmed, mergeManualAndMentionLinks(trimmed, players, []));
      cancelEditing();
      setError("");
    } catch {
      setError("Не удалось обновить заметку.");
    }
  };

  if (!phase) {
    return (
      <section className="panel p-5 text-center text-stone-300">
        Фаза пока не выбрана.
      </section>
    );
  }

  return (
    <section className="panel min-w-0 p-3 sm:p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-stone-50">{phase.title}</h2>
        <p className="text-sm text-stone-400">Заметки фазы</p>
      </div>

      <div className="space-y-4 rounded-2xl border border-ember-200/10 bg-black/15 p-3 sm:p-4">
        <label className="block">
          <div className="relative">
            <MentionTextarea
              value={text}
              onChange={setText}
              players={players}
              minHeightClassName="min-h-11 pr-16 pt-3 pb-3"
              placeholder="Что стало известно? Игроков можно выбрать кнопками ниже или ввести @ для быстрого выбора."
            />
            <div className="pointer-events-none absolute right-3 top-[22px] -translate-y-1/2">
              <button
                type="button"
                onClick={handleAdd}
                disabled={saving}
                aria-label="Добавить заметку"
                title="Добавить заметку"
                className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-xl border border-ember-200/35 bg-ember-200 text-ink-900 transition hover:bg-ember-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </label>

        <div className="flex flex-wrap gap-2">
          {players.map((player) => (
            <button
              key={player.id}
              type="button"
              onClick={() => appendMention(text, setText, player.name)}
              className="rounded-xl border border-ember-200/10 bg-black/20 px-3 py-2 text-sm text-stone-200 transition hover:border-ember-200/25 hover:bg-ember-200/8 hover:text-stone-50"
            >
              {player.name}
            </button>
          ))}
        </div>

        {error ? <p className="text-sm text-red-200">{error}</p> : null}
      </div>

      <div className="mt-5 space-y-3">
        {notes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ember-200/20 bg-black/10 p-5 text-center text-sm text-stone-400">
            В этой фазе пока нет заметок.
          </div>
        ) : (
          notes.map((note) => {
            const isEditing = editingNoteId === note.id;
            const linkedPlayers = note.linkedPlayerIds
              .map((playerId) => playersById.get(playerId))
              .filter((player): player is Player => Boolean(player));

            return (
              <article key={note.id} className="rounded-2xl border border-ember-200/10 bg-black/18 p-3 sm:p-4">
                {isEditing ? (
                  <div className="space-y-3">
                    <MentionTextarea
                      value={editingText}
                      onChange={setEditingText}
                      players={players}
                      minHeightClassName="min-h-11"
                    />
                    <div className="flex flex-wrap gap-2">
                      {players.map((player) => (
                        <button
                          key={player.id}
                          type="button"
                          onClick={() => appendMention(editingText, setEditingText, player.name)}
                          className="rounded-xl border border-ember-200/10 bg-black/20 px-3 py-2 text-sm text-stone-200 transition hover:border-ember-200/25 hover:bg-ember-200/8 hover:text-stone-50"
                        >
                          {player.name}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => saveEditing(note.id)} className="primary-button">
                        <Save className="h-4 w-4" />
                        Сохранить
                      </button>
                      <button type="button" onClick={cancelEditing} className="secondary-button">
                        <X className="h-4 w-4" />
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-stone-100">{note.text}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {linkedPlayers.length > 0 ? (
                        linkedPlayers.map((player) => (
                          <span key={player.id} className="chip">
                            {player.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-stone-500">Без привязки к игрокам</span>
                      )}
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-xs text-stone-500">
                        {formatDate(note.createdAt)} · {formatTime(note.createdAt)}
                      </span>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => startEditing(note)} className="secondary-button min-h-10 px-3">
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => onDeleteNote(note.id)} className="danger-button">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
