// Vercel serverless entry point.
// vercel.cjs is produced by esbuild during the build step (artifacts/api-server/build.mjs)
// and placed in api-build/ to avoid polluting the api/ directory.
// CJS format so Vercel's compiled api/index.js can require() it without ESM mismatch.
// @ts-ignore — generated file, no type declarations available at check time
import app from "../api-build/vercel.cjs";
export default app;
