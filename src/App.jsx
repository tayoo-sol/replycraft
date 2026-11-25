import { useState } from "react";
import { initializeApp } from "firebase/app";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from "firebase/app-check";
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
} from "firebase/ai";
import { firebaseConfig } from "./firebase-config";
import "./App.css";

/* ------------------------------------------------------------------ */
/* Firebase AI Logic setup (once, at module scope)                     */
/* ------------------------------------------------------------------ */
if (import.meta.env.VITE_APPCHECK_DEBUG_TOKEN) {
  // Debug token for local development only — never commit it.
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
}
const firebaseApp = initializeApp(firebaseConfig);
initializeAppCheck(firebaseApp, {
  provider: new ReCaptchaEnterpriseProvider("debug-placeholder"),
  isTokenAutoRefreshEnabled: true,
});
const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });
const deviceModel = getGenerativeModel(ai, {
  mode: InferenceMode.PREFER_ON_DEVICE,
});
const cloudModel = getGenerativeModel(ai, {
  mode: InferenceMode.PREFER_IN_CLOUD,
});

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */
const LONG_INPUT_CHARS = 1500; // above this, the on-device model can't take it
const DEVICE_TRUNCATE_CHARS = 1200; // safety cap for on-device prompts

const TONES = ["Friendly", "Professional", "Concise", "Apologetic"];
const LENGTHS = ["Short", "Medium", "Detailed"];
const LANGUAGES = ["English", "Bahasa Indonesia"];

const SAMPLES = [
  {
    label: "Customer refund request",
    lang: "English",
    text: "Hi, I received the package today but the item is damaged — the screen is cracked and it won't turn on. I'd like a refund or a replacement, please.",
  },
  {
    label: "Buyer asking for an exchange",
    lang: "Bahasa Indonesia",
    text: "Kak, barangnya sudah sampai tapi warnanya beda dari foto. Bisa tukar warna lain nggak? Kalau nggak bisa, saya mau refund saja.",
  },
  {
    label: "Friend's dinner invitation",
    lang: "English",
    text: "Hey! We're having a small dinner at our place this Saturday at 7pm. Would love for you to come — let me know if you can make it!",
  },
  {
    label: "Deadline extension request",
    lang: "Bahasa Indonesia",
    text: "Permisi Pak, saya mau minta perpanjangan deadline laporan sampai hari Jumat karena data dari vendor baru masuk kemarin. Mohon pengertiannya, terima kasih.",
  },
];

/* ------------------------------------------------------------------ */
/* Routing: short + simple stays on-device, long/detailed goes cloud  */
/* ------------------------------------------------------------------ */
function decideRoute(input, length) {
  if (input.length > LONG_INPUT_CHARS) {
    return {
      target: "cloud",
      reason: `Routed to cloud: ${input.length.toLocaleString("en-US")} characters is too long for the on-device model, so the bigger cloud model takes over.`,
    };
  }
  if (length === "Detailed") {
    return {
      target: "cloud",
      reason: "Routed to cloud: a detailed reply needs the bigger cloud model.",
    };
  }
  return {
    target: "device",
    reason:
      "Routed on-device: short message, private by default — nothing leaves this device.",
  };
}

function buildPrompt({ input, tone, length, language, onDevice }) {
  const text = onDevice ? input.slice(0, DEVICE_TRUNCATE_CHARS) : input;
  const lengthGuide = {
    Short: "1–2 short sentences",
    Medium: "one short paragraph (3–5 sentences)",
    Detailed: "a thorough reply of a few paragraphs",
  }[length];
  return [
    "You are ReplyCraft, an assistant that drafts replies to messages and emails.",
    "Write a reply to the received message below.",
    `Tone: ${tone}. Length: ${lengthGuide}. Reply language: ${language}.`,
    "Write ONLY the reply itself — no explanation, no preamble, no quotation marks around it.",
    "",
    "--- Received message ---",
    text,
  ].join("\n");
}

function friendlyError(err) {
  const msg = (err && err.message) || String(err || "Unknown error");
  if (/app check/i.test(msg) || /\b401\b/.test(msg)) {
    return "Could not verify this browser with Firebase App Check. Please reload the page and try again.";
  }
  if (/fetch|network|Failed to fetch/i.test(msg)) {
    return "Network error while reaching the AI service. Check your connection and try again.";
  }
  if (/quota|429|resource-exhausted/i.test(msg)) {
    return "The AI service is temporarily out of quota. Please try again in a minute.";
  }
  return "Something went wrong while generating the reply. Please try again.";
}

/* ------------------------------------------------------------------ */
/* Small icons (inline SVG, no emoji)                                  */
/* ------------------------------------------------------------------ */
function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function CloudIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17.5 19a4.5 4.5 0 0 0 .4-8.98 6 6 0 0 0-11.7 1.62A4 4 0 0 0 7 19.5h10.5z" />
    </svg>
  );
}

function SourceBadge({ source }) {
  if (source === "in_device") {
    return (
      <span className="badge badge-device" id="badge">
        <LockIcon /> On-device · Gemini Nano
      </span>
    );
  }
  if (source === "in_cloud") {
    return (
      <span className="badge badge-cloud" id="badge">
        <CloudIcon /> Cloud · Gemini Flash
      </span>
    );
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */
export default function App() {
  const [input, setInput] = useState("");
  const [tone, setTone] = useState("Friendly");
  const [length, setLength] = useState("Short");
  const [language, setLanguage] = useState("English");
  const [status, setStatus] = useState("idle"); // idle | preparing | generating | done | error
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [route, setRoute] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const [copied, setCopied] = useState(false);

  const trimmed = input.trim();
  const previewRoute = trimmed ? decideRoute(trimmed, length) : null;
  const busy = status === "preparing" || status === "generating";

  async function handleGenerate() {
    const text = input.trim();
    if (!text || busy) return;
    const chosen = decideRoute(text, length);
    setRoute(chosen);
    setError("");
    setErrorDetail("");
    setResult(null);
    setCopied(false);
    setDownloadProgress(null);
    setStatus(chosen.target === "device" ? "preparing" : "generating");

    const started = performance.now();
    try {
      const model = chosen.target === "device" ? deviceModel : cloudModel;
      if (chosen.target === "device") {
        // Trigger (and if needed, download) the on-device model.
        // Must run on the user gesture — the Generate click.
        // In browsers without an on-device model this call can hang
        // instead of rejecting, so don't wait on it forever: proceed
        // once it settles, or after a quiet timeout (PREFER_ON_DEVICE
        // then falls back to the cloud below). While a download is
        // actually progressing, keep waiting (up to an absolute cap).
        const startedAt = Date.now();
        let lastProgressAt = Date.now();
        let settled = false;
        deviceModel
          .initializeDeviceModel((p) => {
            setDownloadProgress(Math.round(p * 100));
            lastProgressAt = Date.now();
          })
          .then(
            () => {
              settled = true;
            },
            () => {
              settled = true;
            },
          );
        while (!settled) {
          await new Promise((r) => window.setTimeout(r, 500));
          const elapsed = Date.now() - startedAt;
          const idle = Date.now() - lastProgressAt;
          if (elapsed > 120000) break;
          if (elapsed > 15000 && idle > 10000) break;
        }
        setDownloadProgress(null);
        setStatus("generating");
      }
      const prompt = buildPrompt({
        input: text,
        tone,
        length,
        language,
        onDevice: chosen.target === "device",
      });
      const res = await model.generateContent(prompt);
      const ms = Math.round(performance.now() - started);
      setResult({
        text: res.response.text(),
        source: res.response.inferenceSource || null,
        ms,
        route: chosen.target,
      });
      setStatus("done");
    } catch (e) {
      setError(friendlyError(e));
      setErrorDetail((e && e.message) || "");
      setStatus("error");
    }
  }

  async function handleCopy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = result.text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* clipboard unavailable — leave the button unchanged */
        document.body.removeChild(ta);
        return;
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="page">
      <header className="header">
        <div className="brand">
          <span className="logo-mark" aria-hidden="true">
            R
          </span>
          <div>
            <h1>ReplyCraft</h1>
            <p className="tagline">Private replies, on-device first.</p>
          </div>
        </div>
        <p className="privacy-note">
          <strong>Short replies never leave your device</strong> — Gemini Nano
          drafts them locally. Longer, detailed drafts use Gemini Flash in the
          cloud.
        </p>
      </header>

      <main className="layout">
        <section className="panel input-panel" aria-label="Compose a reply">
          <h2>Received message</h2>
          <textarea
            id="input"
            className="message-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste the message or email you need to reply to…"
            aria-label="Received message"
          />
          <div className="char-row">
            <span id="char-count">{input.length.toLocaleString("en-US")} characters</span>
            {previewRoute && (
              <span
                id="route-preview"
                className={`route-preview ${previewRoute.target}`}
              >
                {previewRoute.target === "device"
                  ? "Would run on-device"
                  : "Would run in the cloud"}
              </span>
            )}
          </div>

          <div className="samples">
            <p className="samples-label">Try a sample:</p>
            <div className="sample-chips">
              {SAMPLES.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  className="sample-chip"
                  data-sample={s.label}
                  onClick={() => {
                    setInput(s.text);
                    setLanguage(s.lang);
                  }}
                >
                  {s.label} <em>({s.lang})</em>
                </button>
              ))}
            </div>
          </div>

          <div className="options">
            <div className="option-group">
              <label id="tone-label">Tone</label>
              <div className="segmented" role="group" aria-labelledby="tone-label">
                {TONES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={tone === t ? "active" : ""}
                    aria-pressed={tone === t}
                    onClick={() => setTone(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="option-group">
              <label id="length-label">Reply length</label>
              <div className="segmented" role="group" aria-labelledby="length-label">
                {LENGTHS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    className={length === l ? "active" : ""}
                    aria-pressed={length === l}
                    onClick={() => setLength(l)}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="option-group">
              <label id="language-label">Reply language</label>
              <div className="segmented" role="group" aria-labelledby="language-label">
                {LANGUAGES.map((l) => (
                  <button
                    key={l}
                    type="button"
                    className={language === l ? "active" : ""}
                    aria-pressed={language === l}
                    onClick={() => setLanguage(l)}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            id="generate-btn"
            type="button"
            className="generate-btn"
            onClick={handleGenerate}
            disabled={!trimmed || busy}
          >
            {status === "preparing"
              ? `Preparing on-device model… ${downloadProgress ?? 0}%`
              : status === "generating"
                ? "Drafting reply…"
                : "Draft reply"}
          </button>

          {route && busy && (
            <p className="route-line" id="route-line">
              <span className={`route-dot ${route.target}`} aria-hidden="true" />
              <span>{route.reason}</span>
            </p>
          )}
        </section>

        <section className="panel output-panel" aria-label="Drafted reply">
          <h2>Your reply</h2>

          {status === "done" && result && (
            <>
              <div className="badges">
                <SourceBadge source={result.source} />
                <span className="time-badge" id="time">
                  {(result.ms / 1000).toFixed(1)}s
                </span>
              </div>
              {route && (
                <p className="route-line" id="route-line">
                  <span className={`route-dot ${route.target}`} aria-hidden="true" />
                  <span>{route.reason}</span>
                </p>
              )}
              {result.route === "device" && result.source === "in_cloud" && (
                <p className="fallback-note">
                  Requested on-device, but this browser has no on-device model
                  available — the cloud handled it instead.
                </p>
              )}
              <p className="reply-text" id="reply-text">
                {result.text}
              </p>
              <div className="actions">
                <button
                  id="copy-btn"
                  type="button"
                  className="action-btn primary"
                  onClick={handleCopy}
                >
                  {copied ? "Copied!" : "Copy reply"}
                </button>
                <button
                  id="regen-btn"
                  type="button"
                  className="action-btn"
                  onClick={handleGenerate}
                >
                  Regenerate
                </button>
              </div>
            </>
          )}

          {(status === "generating" || status === "preparing") && (
            <div className="empty-state">
              <span className="spinner" aria-hidden="true" />
              &nbsp;
              {status === "preparing"
                ? `Preparing the on-device model… ${downloadProgress ?? 0}%`
                : "Drafting your reply…"}
            </div>
          )}

          {status === "error" && (
            <div className="error-box" id="error-box">
              <p>{error}</p>
              {errorDetail && <p className="error-detail">{errorDetail}</p>}
            </div>
          )}

          {status === "idle" && (
            <p className="empty-state">
              Your drafted reply will appear here. Pick a sample or paste a
              message, then press “Draft reply”.
            </p>
          )}
        </section>
      </main>

      <footer className="footer">
        Built with Firebase AI Logic hybrid inference — Gemini Nano on-device,
        Gemini Flash in the cloud. Routing rule: short messages stay on-device;
        long messages (&gt;{LONG_INPUT_CHARS.toLocaleString("en-US")} characters) or
        detailed replies go to the cloud. Inference source is reported by the
        SDK as <code>response.inferenceSource</code>.
      </footer>
    </div>
  );
}
