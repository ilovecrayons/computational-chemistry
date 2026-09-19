"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  ArrowClockwise,
  FilmStrip,
  ImageSquare,
} from "@phosphor-icons/react";
import type { Generation } from "@/lib/contracts";
import {
  FORMATS,
  TONES,
  TOPICS,
  type MemeSpec,
} from "@/features/memes/taxonomy";
import {
  api,
  ErrorNote,
  Loading,
  MemeMedia,
  RequestError,
  SectionTitle,
} from "./ui";

type GenerationRequest = MemeSpec & {
  type: "image" | "video";
  idempotencyKey: string;
};
const pending = (generation: Generation) =>
  generation.status === "queued" || generation.status === "generating";
const statusLabels: Record<Generation["status"], string> = {
  queued: "Queued",
  generating: "Generating",
  ready: "Ready · saved locally",
  failed: "Failed",
  expired: "Expired",
};

function GenerationCard({
  generation,
  onUpdate,
}: {
  generation: Generation;
  onUpdate: (generation: Generation) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false);
  const [cycle, setCycle] = useState(0);
  const budget = useRef({ attempts: 0, deadline: Date.now() + 5 * 60_000 });

  useEffect(() => {
    if (!pending(generation)) return;
    let disposed = false;
    let inFlight = false;
    let halted = false;
    let timer: number | undefined;
    function schedule() {
      if (disposed || halted || document.hidden || inFlight) return;
      if (
        budget.current.attempts >= 60 ||
        Date.now() >= budget.current.deadline
      ) {
        setStopped(true);
        return;
      }
      clearTimeout(timer);
      timer = window.setTimeout(() => void check(), 5000);
    }
    async function check() {
      if (disposed || halted || document.hidden || inFlight) return;
      if (
        budget.current.attempts >= 60 ||
        Date.now() >= budget.current.deadline
      ) {
        setStopped(true);
        return;
      }
      inFlight = true;
      budget.current.attempts += 1;
      try {
        const result = await api<{ generation: Generation }>(
          `/api/admin/generations/${encodeURIComponent(generation.id)}`,
        );
        if (disposed) return;
        onUpdate(result.generation);
        inFlight = false;
        if (pending(result.generation)) schedule();
      } catch (cause) {
        if (!disposed) {
          halted = true;
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not check this job.",
          );
          setStopped(true);
        }
      } finally {
        inFlight = false;
      }
    }
    function visibilityChanged() {
      clearTimeout(timer);
      if (!document.hidden) schedule();
    }
    schedule();
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      disposed = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [generation.id, generation.status, cycle, onUpdate]);

  function resume() {
    budget.current = { attempts: 0, deadline: Date.now() + 5 * 60_000 };
    setError(null);
    setStopped(false);
    setCycle((value) => value + 1);
  }

  return (
    <article
      className="generation-card stack"
      aria-label={`${generation.type} generation ${generation.id}`}
    >
      <div className="generation-head">
        <h3>
          {generation.type === "video" ? (
            <FilmStrip size={22} aria-hidden />
          ) : (
            <ImageSquare size={22} aria-hidden />
          )}
          {generation.type === "video" ? "Video" : "Image"}
        </h3>
        <span
          className={`status-label status-${generation.status}`}
          role="status"
        >
          {statusLabels[generation.status]}
        </span>
      </div>
      <p className="supporting">Job {generation.id}</p>
      {generation.status === "ready" && generation.src && (
        <MemeMedia
          meme={{
            id: generation.id,
            type: generation.type,
            src: generation.src,
            poster: null,
            caption: `Locally saved ${generation.type} generation`,
          }}
        />
      )}
      {generation.status === "failed" && (
        <p className="error-note">
          {generation.failure || "Generation failed. No ready media was saved."}{" "}
          A new attempt requires a separate paid job; nothing retries
          automatically.
        </p>
      )}
      {generation.status === "expired" && (
        <p className="notice">
          {generation.failure ||
            "The provider job or temporary download expired before it could be saved."}{" "}
          This is not a completed asset. A new job may incur another charge.
        </p>
      )}
      {pending(generation) && (
        <>
          <p className="supporting">
            {stopped
              ? "Automatic checks stopped; the provider job may still be running. Checking status does not create another paid job."
              : "Checking every 5 seconds, up to 60 times over 5 minutes. Checks pause in hidden tabs and stop when you leave the studio."}
          </p>
          <ErrorNote error={error} />
          {stopped && (
            <button className="button secondary" onClick={resume}>
              <ArrowClockwise size={20} />
              Check status
            </button>
          )}
        </>
      )}
    </article>
  );
}

export function AdminScreen({ onBack }: { onBack: () => void }) {
  const [type, setType] = useState<"image" | "video">("image");
  const [tone, setTone] = useState<MemeSpec["tone"]>("absurd");
  const [format, setFormat] = useState<MemeSpec["format"]>("reaction");
  const [topics, setTopics] = useState<MemeSpec["topics"]>(["pets"]);
  const [chaos, setChaos] = useState(3);
  const [consent, setConsent] = useState(false);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const request = useRef<GenerationRequest | null>(null);
  const submitting = useRef(false);

  const update = useCallback((generation: Generation) => {
    setGenerations((previous) =>
      previous.some((job) => job.id === generation.id)
        ? previous.map((job) => (job.id === generation.id ? generation : job))
        : [generation, ...previous],
    );
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    setHistoryError(null);
    try {
      const result = await api<{ generations: Generation[] }>(
        "/api/admin/generations",
      );
      setGenerations((previous) => [
        ...previous.filter(
          (job) => !result.generations.some((item) => item.id === job.id),
        ),
        ...result.generations,
      ]);
    } catch (cause) {
      setHistoryError(
        cause instanceof Error
          ? cause.message
          : "Could not load generation history.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      submitting.current ||
      (!request.current && (!consent || topics.length < 1 || topics.length > 2))
    )
      return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    setNotice("");
    request.current ??= {
      type,
      tone,
      format,
      topics: [...topics],
      chaos,
      idempotencyKey: crypto.randomUUID(),
    };
    const attempt = request.current;
    try {
      const { type: mediaType, ...body } = attempt;
      const result = await api<{ generation: Generation }>(
        `/api/admin/generations/${mediaType === "video" ? "videos" : "images"}`,
        body,
      );
      update(result.generation);
      request.current = null;
      setRetry(false);
      setConsent(false);
      setNotice(
        "Job received. Its status is below. Another generation requires your explicit approval.",
      );
    } catch (cause) {
      // Keep the exact payload and token: a lost response does not mean the paid job was never created.
      setRetry(true);
      setError(
        cause instanceof RequestError && cause.status === 503
          ? `${cause.message} Real generation requires a funded server-side XAI_API_KEY and model access. The illustrated local demo still works without it.`
          : `${cause instanceof Error ? cause.message : "The request could not be confirmed."} Retry keeps the same job token and settings; it does not intentionally start a second job.`,
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="studio stack">
      <button className="text-button" onClick={onBack}>
        <ArrowLeft size={20} />
        Back to me
      </button>
      <SectionTitle
        eyebrow="Admin only · deliberate, paid requests"
        title="The meme studio."
      />
      <div className="notice">
        <strong>Two very different sources of nonsense.</strong>
        <p>
          The seeded offline library is locally illustrated SVG artwork and
          rendered video, not xAI output. It needs no API key. This studio
          requests real xAI generations and never substitutes demo art for a
          failed job.
        </p>
      </div>
      <form className="studio-form stack" onSubmit={submit}>
        <fieldset disabled={busy || retry} className="stack">
          <legend>One new generation</legend>
          <div className="choice-grid" aria-label="Media type">
            {(["image", "video"] as const).map((value) => (
              <button
                className={`choice ${type === value ? "selected" : ""}`}
                type="button"
                key={value}
                aria-pressed={type === value}
                onClick={() => setType(value)}
              >
                {value === "image" ? "Image" : "Video · 6 seconds"}
              </button>
            ))}
          </div>
          <div className="form-row">
            <label>
              Tone
              <select
                value={tone}
                onChange={(event) =>
                  setTone(event.target.value as MemeSpec["tone"])
                }
              >
                {TONES.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Format
              <select
                value={format}
                onChange={(event) =>
                  setFormat(event.target.value as MemeSpec["format"])
                }
              >
                {FORMATS.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>
          <fieldset>
            <legend>Topics · choose one or two</legend>
            <div className="choice-grid">
              {TOPICS.map((value) => (
                <button
                  type="button"
                  className={`choice ${topics.includes(value) ? "selected" : ""}`}
                  key={value}
                  aria-pressed={topics.includes(value)}
                  disabled={!topics.includes(value) && topics.length === 2}
                  onClick={() =>
                    setTopics((current) =>
                      current.includes(value)
                        ? current.filter((topic) => topic !== value)
                        : [...current, value],
                    )
                  }
                >
                  {value}
                </button>
              ))}
            </div>
            {topics.length === 0 && (
              <p className="field-error">Choose at least one topic.</p>
            )}
          </fieldset>
          <label>
            Chaos · {chaos} of 5
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={chaos}
              onChange={(event) => setChaos(Number(event.target.value))}
            />
          </label>
          <p className="supporting">
            Controlled tags become the prompt. No personal data or unrestricted
            prompts. Provider pricing applies; moderation failures and expired
            jobs are not automatically retried.
          </p>
          <label className="check-row studio-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            I understand this starts one paid xAI job.
          </label>
        </fieldset>
        <ErrorNote error={error} />
        {retry && (
          <p className="supporting">
            Settings are locked until this request is resolved. Stay on this
            screen and use Retry same job after a connection failure.
          </p>
        )}
        <button
          className="button primary full"
          disabled={busy || (!retry && (!consent || topics.length === 0))}
        >
          {busy ? "Submitting…" : retry ? "Retry same job" : `Generate ${type}`}
        </button>
        <p className="supporting" role="status">
          {notice}
        </p>
      </form>
      <section className="stack" aria-label="Generation history">
        <div className="generation-head">
          <h2>Generation history</h2>
          <button
            className="icon-button"
            aria-label="Refresh generation history"
            disabled={loading}
            onClick={() => void load()}
          >
            <ArrowClockwise size={22} />
          </button>
        </div>
        <ErrorNote error={historyError} />
        {loading && generations.length === 0 ? (
          <Loading rows={2} />
        ) : generations.length === 0 && !historyError ? (
          <p className="supporting">
            No studio jobs yet. The offline demo library is provisioned
            separately and is not evidence of xAI generation.
          </p>
        ) : (
          <div className="generation-list stack">
            {generations.map((generation) => (
              <GenerationCard
                key={generation.id}
                generation={generation}
                onUpdate={update}
              />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
