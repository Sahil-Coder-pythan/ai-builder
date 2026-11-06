# Cloudflare Pages deployment

Use **Workers & Pages → Create application → Pages → Connect to Git**.

Build settings:
- Production branch: `main`
- Framework preset: `None` (or Next.js Static Export if shown)
- Build command: `npm run build`
- Build output directory: `out`
- Root directory: `/` (leave blank/default)

The project uses Next.js static export (`output: "export"`). Do not use the Workers `npx wrangler deploy` setup.

After replacing files in GitHub, commit the changes to `main`; Cloudflare Pages should start a new deployment automatically.
