import { Ollama } from "ollama";

const SYSTEM_PROMPT = `
You are a helpful AI assistant.

Answer the user's question directly and concisely.
Keep simple factual questions to 1-2 sentences.
Do not provide unnecessary explanations, sources, or extra context unless the user asks for them.

If the user asks for a detailed explanation, provide a detailed and well-structured answer.
`;

const ollama = new Ollama({
  host: "http://127.0.0.1:11434",
  fetch: (input, init) => {
    return fetch(input, {
      ...init,
      signal: AbortSignal.timeout(300000),
    });
  },
});

const cleanResponse = (raw: string): string => {
  let text = raw;

  // Remove a complete <think>...</think> block
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "");

  // Handle responses where only </think> is present
  text = text.replace(/^[\s\S]*?<\/think>/i, "");

  return text.trim();
};

export const generateResponse = async (message: string) => {
  const response = await ollama.chat({
    model: process.env.OLLAMA_MODEL || "qwen3:4b",

    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: message,
      },
    ],

    think: false,
    keep_alive: "30m",
  });

  return cleanResponse(response.message.content);
};

// Removes thinking content while a streaming response is arriving
const visible = (raw: string): string => {
  let text = raw;

  // Remove completed thinking blocks
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "");

  // If thinking has started but hasn't finished yet,
  // don't show it to the user.
  text = text.replace(/<think>[\s\S]*$/i, "");

  // Handle a partially received "<think" tag
  const partialTag = text.match(/<(?:t(?:h(?:i(?:n(?:k)?)?)?)?)?$/i);

  if (partialTag && partialTag.index !== undefined) {
    text = text.slice(0, partialTag.index);
  }

  // Handle a response where thinking content appears before </think>
  if (text.includes("</think>")) {
    text = text.substring(text.lastIndexOf("</think>") + 8);
  }

  return text.replace(/^\s+/, "");
};

export type ChatMessage = { role: "user" | "assistant"; content: string };

export const streamResponse = async (
  history: ChatMessage[],
  onToken: (token: string) => void
) => {
  const recent = history.slice(-10); // keep only the last 10 messages

  const stream = await ollama.chat({
    model: process.env.OLLAMA_MODEL || "qwen3:4b",

    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      ...recent,
    ],

    think: false,
    keep_alive: "30m",
    stream: true,
  });

  let raw = "";
  let sent = 0;

  for await (const chunk of stream) {
    raw += chunk.message.content;

    const shown = visible(raw);

    if (shown.length > sent) {
      const newText = shown.slice(sent);
      onToken(newText);
      sent = shown.length;
    }
  }
};