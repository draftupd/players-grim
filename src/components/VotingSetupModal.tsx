import { Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Phase, Player } from "../types";

type VotingSetupModalProps = {
  open: boolean;
  phase?: Phase;
  players: Player[];
  onClose: () => void;
  onConfirm: (nominatorPlayerId: string, nomineePlayerId: string) => void;
};

export default function VotingSetupModal({
  open,
  phase,
  players,
  onClose,
  onConfirm,
}: VotingSetupModalProps) {
  const alivePlayers = useMemo(
    () => players.filter((player) => player.alive).sort((a, b) => a.seatIndex - b.seatIndex),
    [players],
  );
  const allPlayers = useMemo(
    () => [...players].sort((a, b) => a.seatIndex - b.seatIndex),
    [players],
  );
  const [nominatorPlayerId, setNominatorPlayerId] = useState("");
  const [nomineePlayerId, setNomineePlayerId] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    setNominatorPlayerId(alivePlayers[0]?.id ?? "");
    setNomineePlayerId(allPlayers[0]?.id ?? "");
  }, [alivePlayers, allPlayers, open]);

  if (!open || !phase) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/70 p-0 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <section className="w-full rounded-t-3xl border border-ember-200/15 bg-ink-850 p-4 shadow-2xl sm:mx-auto sm:max-w-xl sm:rounded-3xl sm:p-6" onClick={(event) => event.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-stone-400">{phase.title}</p>
            <h2 className="text-2xl font-bold text-stone-50">Новое голосование</h2>
          </div>
          <button type="button" onClick={onClose} className="secondary-button px-3">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <label className="block space-y-2">
            <span className="label">Кто номинировал</span>
            <select
              value={nominatorPlayerId}
              onChange={(event) => setNominatorPlayerId(event.target.value)}
              className="field"
            >
              {alivePlayers.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-2">
            <span className="label">Кто номинирован</span>
            <select
              value={nomineePlayerId}
              onChange={(event) => setNomineePlayerId(event.target.value)}
              className="field"
            >
              {allPlayers.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}{player.alive ? "" : " (мертв)"}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => onConfirm(nominatorPlayerId, nomineePlayerId)}
            disabled={!nominatorPlayerId || !nomineePlayerId}
            className="primary-button w-full"
          >
            <Save className="h-4 w-4" />
            Начать отмечать голоса
          </button>
        </div>
      </section>
    </div>
  );
}
