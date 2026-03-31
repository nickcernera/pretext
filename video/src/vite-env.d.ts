// Augment ImportMeta to include the env property used by game source files
// (src/share.ts uses import.meta.env which is a Vite/webpack convention).
// This avoids a TS2339 error when the video tsconfig compiles game source files.
interface ImportMeta {
  readonly env: Record<string, string | undefined>;
}
