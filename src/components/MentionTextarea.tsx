import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Player } from "../types";

type MentionTextareaProps = {
  value: string;
  onChange: (value: string) => void;
  players: Player[];
  className?: string;
  placeholder?: string;
  minHeightClassName?: string;
};

type MentionMatch = {
  end: number;
  query: string;
  start: number;
};

const normalize = (value: string) => value.trim().toLocaleLowerCase("ru-RU").replaceAll("ё", "е");

const findMentionAtCursor = (text: string, cursor: number): MentionMatch | null => {
  const beforeCursor = text.slice(0, cursor);
  const match = /(^|\s)@([\p{L}\p{N}_-]*)$/u.exec(beforeCursor);

  if (!match) {
    return null;
  }

  return {
    start: beforeCursor.length - match[2].length - 1,
    end: cursor,
    query: match[2],
  };
};

export default function MentionTextarea({
  value,
  onChange,
  players,
  className,
  placeholder,
  minHeightClassName = "min-h-24",
}: MentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [cursor, setCursor] = useState(0);
  const mention = findMentionAtCursor(value, cursor);

  useEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  const suggestions = useMemo(() => {
    if (!mention) {
      return [];
    }

    const normalizedQuery = normalize(mention.query);
    return players.filter((player) => {
      const normalizedName = normalize(player.name);
      return normalizedQuery ? normalizedName.includes(normalizedQuery) : true;
    });
  }, [mention, players]);

  const insertMention = (playerName: string) => {
    if (!mention) {
      return;
    }

    const nextValue = `${value.slice(0, mention.start)}@${playerName} ${value.slice(mention.end)}`;
    const nextCursor = mention.start + playerName.length + 2;
    onChange(nextValue);

    requestAnimationFrame(() => {
      const textarea = textareaRef.current;

      if (!textarea) {
        return;
      }

      textarea.focus();
      textarea.setSelectionRange(nextCursor, nextCursor);
      setCursor(nextCursor);
    });
  };

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setCursor(event.target.selectionStart ?? event.target.value.length);
        }}
        onClick={(event) => setCursor(event.currentTarget.selectionStart ?? 0)}
        onKeyUp={(event) => setCursor(event.currentTarget.selectionStart ?? 0)}
        onSelect={(event) => setCursor(event.currentTarget.selectionStart ?? 0)}
        className={clsx("field resize-none overflow-hidden", minHeightClassName, className)}
        placeholder={placeholder}
      />

      {mention && suggestions.length > 0 ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 max-h-44 overflow-y-auto rounded-2xl border border-ember-200/15 bg-ink-900/95 p-2 shadow-2xl backdrop-blur">
          {suggestions.map((player) => (
            <button
              key={player.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insertMention(player.name)}
              className="flex min-h-11 w-full items-center rounded-xl px-3 py-2 text-left text-sm text-stone-200 transition hover:bg-ember-200/10 hover:text-stone-50"
            >
              {player.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
