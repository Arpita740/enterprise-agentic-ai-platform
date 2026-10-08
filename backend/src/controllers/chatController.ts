import { Request, Response } from "express";
import {
  generateResponse,
  streamResponse,
} from "../services/aiService";

export const chat = async (req: Request, res: Response) => {
  const { message } = req.body;

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({
      error: "Message is required",
    });
  }

  try {
    const reply = await generateResponse(message);

    return res.json({
      userMessage: message,
      reply,
    });
  } catch (error) {
    console.error("AI Error:", error);

    return res.status(500).json({
      error: "AI_SERVICE_ERROR",
      message: "Unable to generate AI response.",
    });
  }
};

export const streamChat = async (req: Request, res: Response) => {
  const { messages } = req.body;

  const valid =
    Array.isArray(messages) &&
    messages.length > 0 &&
    messages.length <= 50 &&
    messages.every(
      (m: any) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0
    ) &&
    messages[messages.length - 1].role === "user";

  if (!valid) {
    return res.status(400).json({ error: "Invalid messages" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  res.flushHeaders();

  try {
    await streamResponse(messages, (token) => {
      res.write(`data: ${JSON.stringify({ token })}\n\n`);
    });

    res.write("data: [DONE]\n\n");
  } catch (error) {
    console.error("AI Streaming Error:", error);

    res.write(
      `data: ${JSON.stringify({
        error: "AI_SERVICE_ERROR",
      })}\n\n`
    );
  } finally {
    res.end();
  }
};