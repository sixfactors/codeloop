/** Own module: features.ts reads it at load time and wiki.ts reaches features.ts through the engine, so defining it in wiki.ts left it uninitialised when the cycle was entered at wiki. */
export const WIKI_DIR = '.codeloop/wiki';
