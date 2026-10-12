
import { Request, Response } from "express";
import {
  generateResponse,
  streamResponse,
} from "../services/aiService";
import logger from "../utils/logger";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const MAX_MESSAGES = 50;
const MAX_MESSAGE_LENGTH = 10_000;

const isValidMessage = (value: unknown): value is ChatMessage => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const message = value as Record<string, unknown>;

  return (
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    message.content.trim().length > 0 &&
    message.content.length <= MAX_MESSAGE_LENGTH
  );
};

export const chat = async (req: Request, res: Response) => {
  const message: unknown = req.body?.message;

  if (
    typeof message !== "string" ||
    !message.trim() ||
    message.length > MAX_MESSAGE_LENGTH
  ) {
    return res.status(400).json({
      error: "INVALID_MESSAGE",
      message:
        "Message must be a non-empty string within the allowed length.",
    });
  }

  try {
    const normalizedMessage = message.trim();
    const reply = await generateResponse(normalizedMessage);

    return res.status(200).json({
      userMessage: normalizedMessage,
      reply,
    });
  } catch (error) {
    logger.error(
      { err: error, operation: "chat" },
      "AI service request failed"
    );

    if (res.headersSent) {
      return res.end();
    }

    return res.status(500).json({
      error: "AI_SERVICE_ERROR",
      message: "Unable to generate an AI response. Please try again.",
    });
  }
};

export const streamChat = async (req: Request, res: Response) => {
  const messages: unknown = req.body?.messages;

  if (
    !Array.isArray(messages) ||
    messages.length === 0 ||
    messages.length > MAX_MESSAGES ||
    !messages.every(isValidMessage) ||
    messages[messages.length - 1].role !== "user"
  ) {
    return res.status(400).json({
      error: "INVALID_MESSAGES",
      message:
        "Provide 1–50 valid messages, ending with a user message. Each message must have a valid role and non-empty content within the allowed length.",
    });
  }

  const chatMessages = messages as ChatMessage[];

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  res.flushHeaders();

  let clientDisconnected = false;

  res.on("close", () => {
    clientDisconnected = !res.writableEnded;
  });

  try {
    await streamResponse(chatMessages, (token) => {
      if (clientDisconnected || res.writableEnded) {
        return;
      }

      res.write(`data: ${JSON.stringify({ token })}\n\n`);
    });

    if (!clientDisconnected && !res.writableEnded) {
      res.write("data: [DONE]\n\n");
    }
  } catch (error) {
    logger.error(
      { err: error, operation: "chat_stream" },
      "AI streaming request failed"
    );

    if (!clientDisconnected && !res.writableEnded) {
      res.write(
        `data: ${JSON.stringify({
          error: "AI_SERVICE_ERROR",
        })}\n\n`
      );
    }
  } finally {
    if (!res.writableEnded) {
      res.end();
    }
  }
};
