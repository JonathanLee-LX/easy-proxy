# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

easy-dev-proxy (`ep`) is a lightweight Node.js development proxy server with HTTP/HTTPS/HTTP2 MITM support, URL rewriting, mock rules, and a web dashboard. See `README.md` for full usage docs.

### Services

| Service | Command | Default Port | Notes |
|---|---|---|---|
| Proxy server (backend) | `EP_HEADLESS=1 node index.js` | 8989 (via portfinder) | `EP_HEADLESS=1` skips interactive root CA trust prompt |
| React frontend (dev) | `pnpm run dev:web` | 5173 | Vite dev server with HMR; connects to proxy API on :8989 |

### Key caveats

- **Root CA trust prompt**: The proxy server will block on an interactive `inquirer` prompt if the root CA is untrusted. Always set `EP_HEADLESS=1` (or `EP_MCP=1`) when running headlessly.
- **Frontend TypeScript build**: `pnpm run build:web` (which runs `tsc -b && vite build`) may fail due to pre-existing TS errors in `web/src/App.tsx` (missing plugin-related features). The Vite dev server (`pnpm run dev:web`) works fine since it skips type checking.
- **`postinstall` script**: `pnpm install` runs `cd web && pnpm install && pnpm run build` as a postinstall hook. If the TS build fails, dependencies are still installed — only the static build output (`web/dist/`) will be missing, causing the proxy to fall back to the legacy petite-vue UI.
- **pnpm build scripts**: pnpm may warn about ignored build scripts for `esbuild` and `msw`. This doesn't affect the Vite dev server.

### Standard commands (see `package.json`)

- **Tests**: `pnpm test` (mocha, root)
- **Lint**: `pnpm run lint` (eslint, in `web/`)
- **Dev frontend**: `pnpm run dev:web`
- **Start proxy**: `EP_HEADLESS=1 node index.js`
