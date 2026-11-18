import { defineConfig } from "vitest/config";
import path from "node:path";

// No @vitejs/plugin-react needed: Vitest's built-in esbuild transform
// handles JSX in .tsx test files.
export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // The live RLS test lives outside src/; it is skipIf-gated on
    // FORMA_LIVE_DB=1, so the normal suite collects it and skips
    // it. Without this entry `npm run test:live` finds no files.
    include: ["src/**/*.test.{ts,tsx}", "supabase/tests/rls-live.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // `server-only` throws outside a React Server Component, which
      // has no meaning in vitest (tests run in Node, and server
      // actions are imported by client components). The app build
      // remains the guard; the stub only lets the tests load the
      // modules. See vitest.server-only-stub.ts.
      "server-only": path.resolve(__dirname, "./vitest.server-only-stub.ts"),
    },
  },
});
