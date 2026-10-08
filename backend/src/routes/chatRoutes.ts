import { Router } from "express";
import {
  chat,
  streamChat,
} from "../controllers/chatController";

const router = Router();

router.post("/", chat);
router.post("/stream", streamChat);

export default router;