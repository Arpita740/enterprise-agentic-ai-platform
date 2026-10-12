
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pinoHttp from "pino-http";
import chatRoutes from "./routes/chatRoutes";
import logger from "./utils/logger";

dotenv.config();

const app = express();

app.use(pinoHttp({ logger }));
app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    message: "Enterprise AI Chatbot Backend is running 🚀",
  });
});

app.use("/api/chat", chatRoutes);

const PORT = Number(process.env.PORT) || 5000;

app.listen(PORT, () => {
  logger.info({ port: PORT }, "Enterprise AI backend started");
});
