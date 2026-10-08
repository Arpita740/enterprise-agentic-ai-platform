import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import chatRoutes from "./routes/chatRoutes";
dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/chat", chatRoutes);
app.get("/", (req, res) => {
  res.json({
    message: "Enterprise AI Chatbot Backend is running 🚀",
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});