import { Ollama } from "ollama";

const OLLAMA_HOST = "http://127.0.0.1:11434";
const OLLAMA_MODEL =
  process.env.OLLAMA_MODEL?.trim() || "qwen3:1.7b";

const REQUEST_TIMEOUT_MS = 300_000;
const HISTORY_LIMIT = 10;

const SYSTEM_PROMPT = `
You are the conversational AI assistant for an enterprise IT support platform.

CORE BEHAVIOR
- Be helpful, accurate, natural, and conversational.
- Answer the user's actual question directly.
- Use previous user and assistant messages to understand follow-up questions.
- Treat a conversation as continuous unless the user clearly changes the subject.
- Do not repeatedly ask for clarification when the intended meaning is reasonably clear.
- Never invent facts, tools, documents, incidents, or system results.

TYPO CORRECTION
- Recognize likely spelling mistakes, phonetic spellings, and typing errors.
- Use the surrounding context to infer the intended technical term.
- For example, if the user writes "nofefew js" and later says "it is node", understand that they mean Node.js.
- When the intended term is highly likely, gently correct it and answer the intended question.
- You can say "Did you mean Node.js?" when uncertain, but still offer a useful answer if a likely interpretation exists.
- Do not treat a typo as the name of a real library or invent a library to match it.
- If the user corrects you, acknowledge the correction briefly and answer the intended question.

CONVERSATION
- Remember the topic established in earlier turns within the provided conversation history.
- Interpret short follow-ups such as "why?", "explain it", and "what about its event loop?" in that context.
- If the user says "yeah, it was Node", acknowledge the correction and continue with Node.js rather than asking what they mean again.
- Do not claim to remember information that is not present in the conversation history.

ANSWER STYLE
- For simple factual questions, answer in 1-3 clear sentences.
- For technical questions, explain concepts accurately using beginner-friendly language when appropriate.
- Give examples when they materially improve understanding.
- For detailed questions, use clear headings and structured explanations.
- Correct misunderstandings politely without making the user feel bad.
- Avoid unnecessary disclaimers, repetition, and generic closing questions.

ENTERPRISE SAFETY
- Distinguish verified information from assumptions.
- If the answer depends on internal incident records, runbooks, or company data that have not been retrieved, say that the data is not available rather than making it up.
- Never claim that you searched a document, called a tool, or verified a system result unless that actually happened.
`;

const ollama = new Ollama({
  host: OLLAMA_HOST,
  fetch: (input, init) =>
    fetch(input, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }),
});

const cleanResponse = (raw: string): string => {
  let text = raw;

  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  text = text.replace(/^[\s\S]*?<\/think>/i, "");

  return text.trim();
};

const visible = (raw: string): string => {
  let text = raw;

  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  text = text.replace(/<think>[\s\S]*$/i, "");

  const partialTag = text.match(/<(?:t(?:h(?:i(?:n(?:k)?)?)?)?)?$/i);

  if (partialTag && partialTag.index !== undefined) {
    text = text.slice(0, partialTag.index);
  }

  if (text.includes("</think>")) {
    text = text.substring(text.lastIndexOf("</think>") + 8);
  }

  return text.replace(/^\s+/, "");
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const createServiceError = (
  error: unknown,
  operation: string
): Error => {
  const isTimeout =
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError");

  const serviceError = new Error(
    isTimeout
      ? `Ollama ${operation} timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.`
      : `Ollama ${operation} failed. Check that Ollama is running and the configured model is available.`
  );

  (serviceError as Error & { cause?: unknown }).cause = error;

  return serviceError;
};

export const generateResponse = async (
  message: string
): Promise<string> => {
  try {
    const response = await ollama.chat({
      model: OLLAMA_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: message },
      ],
      think: false,
      keep_alive: "30m",
      options: {
        temperature: 0.3,
      },
    });

    return cleanResponse(response.message.content);
  } catch (error) {
    throw createServiceError(error, "request");
  }
};

export const streamResponse = async (
  history: ChatMessage[],
  onToken: (token: string) => void
): Promise<void> => {
  const recent = history.slice(-HISTORY_LIMIT);

  try {
    const stream = await ollama.chat({
      model: OLLAMA_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...recent,
      ],
      think: false,
      keep_alive: "30m",
      stream: true,
      options: {
        temperature: 0.3,
      },
    });

    let raw = "";
    let sent = 0;

    for await (const chunk of stream) {
      raw += chunk.message.content;

      const shown = visible(raw);

      if (shown.length > sent) {
        onToken(shown.slice(sent));
        sent = shown.length;
      }
    }
  } catch (error) {
    throw createServiceError(error, "stream");
  }
};
