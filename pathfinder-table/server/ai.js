// Optional GM assistant backed by the Claude API. Everything in the app works
// without it; when an API key (or `ant auth login` profile) is available, the GM
// gets prose generation grounded in their own plot and session notes.

import { SYSTEM, context, userPrompt } from "../public/js/shared/aiprompts.js";

let client = null;
let loadError = null;

async function getClient() {
  if (client || loadError) return client;
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    client = new Anthropic();
  } catch (e) {
    loadError = e;
  }
  return client;
}

export async function aiAvailable() {
  if (process.env.PF_TABLE_DISABLE_AI) return false;
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN && !process.env.ANTHROPIC_PROFILE) {
    // a stored `ant auth login` profile can also work; only attempt it if the SDK loads
    if (!process.env.PF_TABLE_TRY_PROFILE) return false;
  }
  return !!(await getClient());
}

const MODEL = process.env.PF_TABLE_MODEL || "claude-opus-5-5";

export async function runAI(game, task, prompt) {
  const c = await getClient();
  if (!c) throw new Error("The AI assistant isn't configured on this server.");
  const response = await c.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: [
      { type: "text", text: SYSTEM },
      { type: "text", text: "Campaign context:\n" + context(game), cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: userPrompt(game, task, prompt) }],
  });
  if (response.stop_reason === "refusal") throw new Error("The assistant declined that request.");
  return response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}
