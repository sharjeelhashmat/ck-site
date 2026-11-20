// Wrangler bundles .css files as text and .woff2 files as binary data (wrangler.toml [[rules]]).
declare module '*.css' { const text: string; export default text; }
declare module '*.woff2' { const data: ArrayBuffer; export default data; }
