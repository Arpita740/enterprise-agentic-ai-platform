
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./App.css";

type Msg = {
  role: "user" | "assistant";
  text: string;
};

function normalizeMarkdown(text: string): string {
  return text
    .replace(/\\\*/g, "*")
    .replace(/\\#/g, "#")
    .replace(/\\`/g, "`");
}

function App() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [queuedMessages, setQueuedMessages] = useState<string[]>([]);

  const messagesRef = useRef<Msg[]>([]);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const queueRef = useRef<string[]>([]);
  const processingRef = useRef(false);

  // Update the UI and the synchronous conversation history together.
  const updateMessages = (updater: (previous: Msg[]) => Msg[]) => {
    const updated = updater(messagesRef.current);
    messagesRef.current = updated;
    setMessages(updated);
  };

  // Scroll only the messages panel, not the entire page.
  useEffect(() => {
    const container = messagesContainerRef.current;

    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, loading, error, queuedMessages]);

  const processMessage = async (text: string) => {
    const history = [
      ...messagesRef.current,
      { role: "user" as const, text },
    ].map((item) => ({
      role: item.role,
      content: item.text,
    }));

    // Add the user's message and its assistant response placeholder.
    // Queued messages are added only when their turn begins.
    updateMessages((previous) => [
      ...previous,
      { role: "user", text },
      { role: "assistant", text: "" },
    ]);

    setError("");

    const appendToken = (token: string) => {
      updateMessages((previous) => {
        if (previous.length === 0) return previous;

        const updated = [...previous];
        const lastIndex = updated.length - 1;

        updated[lastIndex] = {
          ...updated[lastIndex],
          text: updated[lastIndex].text + token,
        };

        return updated;
      });
    };

    try {
      const response = await fetch(
        "http://localhost:5000/api/chat/stream",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ messages: history }),
        }
      );

      if (!response.ok || !response.body) {
        throw new Error(
          `Request failed (${response.status}). Please try again.`
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let buffer = "";
      let streamError: string | null = null;
      let finished = false;

      try {
        while (!finished) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const event of events) {
            if (!event.startsWith("data: ")) continue;

            const payload = event.slice(6).trim();
            if (!payload) continue;

            if (payload === "[DONE]") {
              finished = true;
              break;
            }

            let parsed: { token?: string; error?: string };

            try {
              parsed = JSON.parse(payload);
            } catch {
              continue;
            }

            if (parsed.error) {
              streamError = parsed.error;
              break;
            }

            if (typeof parsed.token === "string") {
              appendToken(parsed.token);
            }
          }

          if (streamError) break;
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }

      if (streamError) {
        throw new Error(streamError);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    }
  };

  // Process queued messages one at a time, never overlapping AI streams.
  const processQueue = async () => {
    if (processingRef.current) return;

    processingRef.current = true;
    setLoading(true);

    try {
      while (queueRef.current.length > 0) {
        const nextMessage = queueRef.current.shift();

        setQueuedMessages([...queueRef.current]);

        if (nextMessage) {
          await processMessage(nextMessage);
        }
      }
    } finally {
      processingRef.current = false;
      setLoading(false);
    }
  };

  const sendMessage = () => {
    const text = message.trim();

    if (!text) return;

    queueRef.current.push(text);
    setQueuedMessages([...queueRef.current]);
    setMessage("");
    setError("");

    void processQueue();
  };

  const startNewChat = () => {
    if (processingRef.current) return;

    messagesRef.current = [];
    setMessages([]);
    setMessage("");
    setError("");
    queueRef.current = [];
    setQueuedMessages([]);
  };

  return (
    <div
      className="app"
      style={{
        display: "flex",
        height: "100dvh",
        overflow: "hidden",
      }}
    >
      <aside className="sidebar">
        <div className="sidebar-top">
          <button
            className="new-chat-button"
            onClick={startNewChat}
            disabled={loading}
          >
            <span aria-hidden="true">+</span>
            New Chat
          </button>

          <div className="sidebar-section">
            <div className="sidebar-title">WORKSPACE</div>

            <div className="conversation">
              <span className="conversation-icon" aria-hidden="true">
                ◈
              </span>
              <span>Current Conversation</span>
            </div>
          </div>
        </div>

        <div className="sidebar-footer">
          <strong>Enterprise AI Platform</strong>
          <small>Local development · v1.0</small>
        </div>
      </aside>

      <div
        className="main-area"
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <header className="chat-header">
          <div className="brand">
            <div className="brand-icon" aria-hidden="true">
              ✦
            </div>

            <div className="brand-info">
              <h1>Enterprise AI Platform</h1>
              <span>
                <span className="status-dot" />
                Local AI · Ollama
              </span>
            </div>
          </div>
        </header>

        <main
          className="chat-container"
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            className="messages"
            ref={messagesContainerRef}
            aria-live="polite"
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              overscrollBehavior: "contain",
            }}
          >
            {messages.length === 0 && !loading && (
              <div className="empty-state">
                <div className="empty-state-icon" aria-hidden="true">
                  ✦
                </div>

                <h2>How can I help you today?</h2>

                <p>
                  Ask a question to get started. This platform is being
                  built for enterprise IT support, incident investigation,
                  and grounded AI assistance.
                </p>
              </div>
            )}

            {messages.map((item, index) => (
              <div
                className={`message ${
                  item.role === "user" ? "user-message" : "ai-message"
                }`}
                key={index}
              >
                <div className="message-label">
                  {item.role === "user" ? "You" : "AI"}
                </div>

                <div className="message-text">
                  {item.role === "user" ? (
                    item.text
                  ) : item.text ? (
                    <div className="markdown-content">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {normalizeMarkdown(item.text)}
                      </ReactMarkdown>
                    </div>
                  ) : loading && index === messages.length - 1 ? (
                    "Thinking..."
                  ) : null}
                </div>
              </div>
            ))}

            {queuedMessages.length > 0 && (
              <div className="queue-status" role="status">
                {queuedMessages.length} message
                {queuedMessages.length === 1 ? "" : "s"} waiting to be answered.
              </div>
            )}

            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
          </div>

          <form
            className="input-area"
            style={{ flexShrink: 0 }}
            onSubmit={(event) => {
              event.preventDefault();
              sendMessage();
            }}
          >
            <input
              type="text"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Ask about incidents, services, or technical issues..."
              aria-label="Message"
            />

            <button type="submit" disabled={!message.trim()}>
              {loading ? "Queue" : "Send"}
            </button>
          </form>
        </main>
      </div>
    </div>
  );
}

export default App;
