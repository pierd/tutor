import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import { Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { track } from "../lib/posthog";
import { useQuery } from "../lib/useQuery";

// The MCP endpoint is an HTTP action, served from the deployment's .site URL.
const SITE_URL = (import.meta.env.VITE_CONVEX_URL as string).replace(/\.convex\.cloud\/?$/, ".convex.site");
const MCP_URL = `${SITE_URL}/mcp`;
const PLACEHOLDER = "YOUR_TOKEN";

const CLIENTS = ["claude", "chatgpt", "claudeCode", "codex", "gemini", "cursor", "vscode", "other"] as const;
type Client = (typeof CLIENTS)[number];

// Product names stay as they are in every language.
const CLIENT_NAMES: Record<Exclude<Client, "other">, string> = {
  claude: "Claude",
  chatgpt: "ChatGPT",
  claudeCode: "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
  cursor: "Cursor",
  vscode: "VS Code",
};

type Step = { text: string; code?: string; note?: string };

function steps(client: Client, token: string, t: (key: string) => string): Step[] {
  const bearer = `Bearer ${token}`;
  const urlWithToken = `${MCP_URL}/t/${token}`;
  const json = (value: unknown) => JSON.stringify(value, null, 2);
  switch (client) {
    case "claude":
      return [
        { text: t("agents.claude.s1") },
        { text: t("agents.claude.s2"), code: urlWithToken, note: t("agents.urlSecret") },
        { text: t("agents.claude.s3") },
      ];
    case "chatgpt":
      return [
        { text: t("agents.chatgpt.s1") },
        { text: t("agents.chatgpt.s2"), code: urlWithToken, note: t("agents.urlSecret") },
        { text: t("agents.chatgpt.s3") },
      ];
    case "claudeCode":
      return [
        {
          text: t("agents.runThis"),
          code: `claude mcp add --transport http --scope user tutor ${MCP_URL} --header "Authorization: ${bearer}"`,
        },
        { text: t("agents.claudeCode.s2") },
      ];
    case "codex":
      return [
        { text: t("agents.codex.s1"), code: `export TUTOR_TOKEN=${token}` },
        { text: t("agents.codex.s2"), code: `codex mcp add tutor --url ${MCP_URL} --bearer-token-env-var TUTOR_TOKEN` },
      ];
    case "gemini":
      return [
        {
          text: t("agents.runThis"),
          code: `gemini mcp add --transport http --scope user --header "Authorization: ${bearer}" tutor ${MCP_URL}`,
        },
        { text: t("agents.gemini.s2") },
      ];
    case "cursor":
      return [
        {
          text: t("agents.cursor.s1"),
          code: json({ mcpServers: { tutor: { url: MCP_URL, headers: { Authorization: bearer } } } }),
        },
      ];
    case "vscode":
      return [
        {
          text: t("agents.vscode.s1"),
          code: json({ servers: { tutor: { type: "http", url: MCP_URL, headers: { Authorization: bearer } } } }),
        },
        { text: t("agents.vscode.s2") },
      ];
    case "other":
      return [
        { text: t("agents.other.s1"), code: MCP_URL },
        { text: t("agents.other.s2"), code: `Authorization: ${bearer}` },
        { text: t("agents.other.s3"), code: urlWithToken, note: t("agents.urlSecret") },
      ];
  }
}

export function AgentsPage() {
  const { t } = useTranslation();
  const [current, setClient] = useState<Client>("claude");
  const clientName = (c: Client) => (c === "other" ? t("agents.other.name") : CLIENT_NAMES[c]);
  const create = useAction(api.apiTokens.create);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);

  const onCreate = async () => {
    setBusy(true);
    setError(false);
    try {
      setFresh(await create({ name: clientName(current) }));
      track("agent_token_created", { agent_client: current });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("agents.title")}</h1>
        <p className="text-sm text-gray-500">{t("agents.intro")}</p>
      </div>

      <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
        <div className="space-y-2">
          <h2 className="font-semibold">{t("agents.pick")}</h2>
          <div className="flex flex-wrap gap-1.5" role="tablist">
            {CLIENTS.map((c) => (
              <button
                key={c}
                role="tab"
                aria-selected={c === current}
                className={`rounded-full border px-3 py-1 text-sm ${
                  c === current ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 hover:border-gray-900"
                }`}
                onClick={() => setClient(c)}
              >
                {clientName(c)}
              </button>
            ))}
          </div>
        </div>

        <ol className="space-y-4">
          <Numbered n={1}>
            {fresh ? (
              <div className="space-y-2">
                <p className="text-sm">{t("agents.tokenReady")}</p>
                <CopyField value={fresh} />
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm">{t("agents.needToken")}</p>
                <button className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50" disabled={busy} onClick={() => void onCreate()}>
                  <KeyRound size={16} /> {t("agents.create")}
                </button>
                {error && <p className="text-sm text-red-600">{t("agents.createFailed")}</p>}
              </div>
            )}
          </Numbered>
          {steps(current, fresh ?? PLACEHOLDER, t).map((step, i) => (
            <Numbered key={`${current}-${i}`} n={i + 2}>
              <div className="space-y-2">
                <p className="text-sm">{step.text}</p>
                {step.code && <CopyField value={step.code} multiline={step.code.includes("\n")} />}
                {step.note && <p className="text-xs text-gray-500">{step.note}</p>}
              </div>
            </Numbered>
          ))}
        </ol>

        <p className="border-t border-gray-200 pt-3 text-sm text-gray-500">{t("agents.tryAsking")}</p>
      </section>

      <TokenList />
    </div>
  );
}

function Numbered({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gray-50 text-xs font-semibold text-gray-500">
        {n}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">{children}</div>
    </li>
  );
}

function TokenList() {
  const { t, i18n } = useTranslation();
  const formatDate = (ms: number) => new Date(ms).toLocaleDateString(i18n.language);
  const tokens = useQuery(api.apiTokens.list);
  const revoke = useMutation(api.apiTokens.revoke);
  if (tokens === undefined || tokens.length === 0) return null;

  const onRevoke = async (tokenId: Id<"apiTokens">, name: string) => {
    if (!window.confirm(t("agents.revokeConfirm", { name }))) return;
    await revoke({ tokenId });
  };

  return (
    <section className="space-y-2 rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="font-semibold">{t("agents.tokens")}</h2>
      <p className="text-sm text-gray-500">{t("agents.tokensIntro")}</p>
      <ul className="divide-y divide-gray-200">
        {tokens.map((tok) => (
          <li key={tok._id} className="flex items-center gap-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{tok.name}</div>
              <div className="text-xs text-gray-500">
                …{tok.hint} · {t("agents.created", { date: formatDate(tok._creationTime) })} ·{" "}
                {tok.lastUsedAt ? t("agents.lastUsed", { date: formatDate(tok.lastUsedAt) }) : t("agents.neverUsed")}
              </div>
            </div>
            <button
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              onClick={() => void onRevoke(tok._id, tok.name)}
              title={t("agents.revoke")}
              aria-label={t("agents.revoke")}
            >
              <Trash2 size={16} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CopyField({ value, multiline = false }: { value: string; multiline?: boolean }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    // Values contain the token: keep them out of analytics and replays.
    <div className="ph-no-capture flex items-start gap-2">
      <pre
        className={`min-w-0 flex-1 overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs ${
          multiline ? "" : "whitespace-pre"
        }`}
      >
        {value}
      </pre>
      <button className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900" onClick={copy} title={t("agents.copy")} aria-label={t("agents.copy")}>
        {copied ? <Check size={16} /> : <Copy size={16} />}
      </button>
    </div>
  );
}
