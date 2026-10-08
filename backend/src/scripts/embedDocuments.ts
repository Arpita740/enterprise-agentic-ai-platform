import { ChromaClient } from "chromadb";
import { Ollama } from "ollama";
import incidents from "../data/incidents.json";

const chroma = new ChromaClient({ path: "http://localhost:8000" });
const ollama = new Ollama({ host: "http://127.0.0.1:11434" });

const embed = async (text: string): Promise<number[]> => {
  const res = await ollama.embeddings({
    model: "nomic-embed-text",
    prompt: text,
  });
  return res.embedding;
};

const run = async () => {
  const collection = await chroma.getOrCreateCollection({
    name: "incidents",
  });

  for (const doc of incidents) {
    console.log(`Embedding: ${doc.id} - ${doc.title}`);

    const vector = await embed(`${doc.title}\n${doc.content}`);

    await collection.upsert({
      ids: [doc.id],
      embeddings: [vector],
      documents: [doc.content],
      metadatas: [{ title: doc.title }],
    });
  }

  console.log(`Done. Embedded ${incidents.length} documents.`);
};

run().catch((err) => {
  console.error("Embedding failed:", err);
  process.exit(1);
});