import { type Express } from "express";

// Static file serving is disabled — frontend is served from Perplexity CDN.
// Railway only serves /api/* routes. The SPA catch-all caused Railway's CDN
// to cache index.html for all paths, breaking API routes.
export function serveStatic(_app: Express) {
  // no-op: do NOT serve static files from Railway
}
