// Jest runs under plain Node, not Next.js's webpack build, so the real
// `server-only` package's conditional-export guard always throws (it only
// no-ops under Next's "react-server" build condition). This test-only stub
// replaces it so importing 'server-only' is a no-op during `npx jest`,
// matching what `next/jest` does automatically for projects that use it.
module.exports = {};
