// Vite's `?raw` imports, used by tests to read text files such as wrangler.jsonc.
declare module "*?raw" {
  const content: string;
  export default content;
}
