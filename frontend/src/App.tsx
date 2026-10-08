import { useState } from "react";

type Msg = { role: "user" | "assistant"; text: string };

function App() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const sendMessage = async () => {
    const text = message.trim();
    if (!text || loading) return;

    const history = [...messages, { role: "user" as const, text }]
      .filter((m) => m.text)
      .map((m) => ({ role: m.role, content: m.text }));

    setMessages((prev) => [
      ...prev,
      { role: "user", text },
      { role: "assistant", text: "" },
    ]);
    setMessage("");
    setError("");
    setLoading(true);

    const appendToken = (token: string) =>
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        copy[copy.length - 1] = { ...last, text: last.text + token };
        return copy;
      });

    try {
      const response = await fetch("http://localhost:5000/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      if (!response.ok || !response.body) throw new Error("Request failed");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const event of events) {
          if (!event.startsWith("data: ")) continue;
          const payload = event.slice(6);
          if (payload === "[DONE]") continue;
          const parsed = JSON.parse(payload);
          if (parsed.error) throw new Error("AI service error");
          appendToken(parsed.token);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>Enterprise AI Chatbot</h1>

      {messages.map((m, i) => (
        <p key={i}>
          <strong>{m.role === "user" ? "You" : "AI"}:</strong> {m.text}
        </p>
      ))}

      {loading && <p><em>Thinking...</em></p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && sendMessage()}
        placeholder="Ask something..."
        disabled={loading}
        style={{ width: "75%" }}
      />
      <button onClick={sendMessage} disabled={loading}>
        Send
      </button>
    </div>
  );
}

export default App;