import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { apiRouter } from "./api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT ?? "3000", 10);

const app = express();

app.use(express.json());

// Serve static frontend files
app.use(express.static(path.resolve(__dirname, "../../public")));

// API routes
app.use("/api", apiRouter());

// SPA fallback (skip /api paths)
app.get("/{*splat}", (req, res, next) => {
  if (req.path.startsWith("/api")) {
    next();
    return;
  }
  res.sendFile(path.resolve(__dirname, "../../public/index.html"));
});

app.listen(PORT, () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
});
