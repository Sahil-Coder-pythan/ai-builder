# Deploy The Alpha Gym on Cloudflare Pages

This project is a Next.js static export (`output: "export"`).

## Cloudflare Pages settings
- Connect the GitHub repository and use production branch `main`.
- Framework preset: `None` (or Next.js Static Export if Cloudflare offers it).
- Build command: `npm run build`
- Build output directory: `out`
- Root directory: leave blank (repository root).

Commit/push updated files to `main`. Cloudflare Pages will automatically start a new deployment. The existing `*.pages.dev` URL stays the same. Check **Workers & Pages → your project → Deployments** for the build result.

## Important asset note
The gallery uses supplied gym photos plus the supplied athlete reference image. Replace or supplement these with the gym owner's approved original photos/video before public launch. No stock video is included or falsely presented as footage of this gym.
