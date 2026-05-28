/**
 * env.js — Must be the FIRST import in server/index.js.
 * ES module imports are hoisted; dotenv must load synchronously
 * before any other server module reads process.env.
 */
import dotenv from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", ".env.local") });
