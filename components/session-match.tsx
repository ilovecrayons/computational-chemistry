"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Heart } from "@phosphor-icons/react";
import type { Candidate, Match } from "@/lib/contracts";
import {
  api,
  Dialog,
  ErrorNote,
  Loading,
  MemeMedia,
  ProfileVisual,
} from "./ui";

export function SessionMatch({
  candidate,
  openerMemeId,
  loading,
  error,
  onRetry,
  onClose,
  onMatched,
}: {
  candidate: Candidate | null;
  openerMemeId: string | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onClose: () => void;
  onMatched: (matchId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  useEffect(() => {
    setBusy(false);
    setDecisionError(null);
  }, [candidate?.id]);

  async function chooseMatch() {
    if (!candidate || busy) return;
    setBusy(true);
    setDecisionError(null);
    try {
      const result = await api<{ match: Match | null }>(
        "/api/profile-decisions",
        {
          targetId: candidate.id,
          decision: "like",
          ...(openerMemeId ? { openerMemeId } : {}),
        },
      );
      if (!result.match) {
        setDecisionError(
          "That connection is not available right now. Try another person.",
        );
        return;
      }
      onMatched(result.match.id);
    } catch (cause) {
      setDecisionError(
        cause instanceof Error
          ? cause.message
          : "That connection could not be opened. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="A possible match" className="match-reveal" onClose={onClose}>
      {candidate ? (
        <>
          <div className="matched-portraits">
            <ProfileVisual
              name={candidate.name}
              src={candidate.photo}
              className="matched-profile-mark"
            />
            <Heart size={32} weight="fill" aria-hidden />
          </div>
          <h1>
            Meet {candidate.name}.
            <br />
            Compare bad ideas.
          </h1>
          <p>
            Your meme taste lines up. Start a chat now, before either of you
            overthinks it.
          </p>
          {candidate.compatibility.sharedMemes[0] && (
            <div className="reveal-meme">
              <MemeMedia meme={candidate.compatibility.sharedMemes[0]} compact />
            </div>
          )}
          <ErrorNote error={error || decisionError} />
          <button
            className="button primary full"
            type="button"
            disabled={busy}
            onClick={() => void chooseMatch()}
          >
            {busy ? "Opening chat…" : "Match with " + candidate.name}
          </button>
          <button className="text-button full" type="button" onClick={onClose}>
            Keep exploring
          </button>
        </>
      ) : loading ? (
        <Loading rows={3} />
      ) : (
        <>
          <p>
            {error
              ? "We could not load a safe suggestion yet."
              : "No eligible suggestions are available right now."}
          </p>
          <ErrorNote error={error} />
          {error && (
            <button
              className="button secondary full"
              type="button"
              onClick={onRetry}
            >
              Try again
              <ArrowRight size={20} />
            </button>
          )}
          <button className="text-button full" type="button" onClick={onClose}>
            Keep exploring
          </button>
        </>
      )}
    </Dialog>
  );
}