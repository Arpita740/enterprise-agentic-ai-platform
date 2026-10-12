
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL?.trim() || "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "headers.authorization",
      "headers.cookie",
    ],
    censor: "[REDACTED]",
  },
});

export default logger;
