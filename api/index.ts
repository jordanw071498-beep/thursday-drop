// Vercel serverless entry point.
// vercel.mjs is produced by esbuild during the build step (artifacts/api-server/build.mjs)
// and placed in api-build/ to avoid polluting the api/ directory.
// @ts-ignore — generated file, no type declarations available at check time
import app from "../api-build/vercel.mjs";
export default app;
