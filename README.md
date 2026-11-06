# THE ALPHA GYM — Premium interactive website

Next.js 14 App Router + TypeScript + Tailwind + React Three Fiber + Drei + Framer Motion + Lenis.

## Run locally
```bash
npm install
npm run dev
```
Open http://localhost:3000

## Production build
```bash
npm run build
```
The project uses Next.js static export. The build output is `/out`.

## Cloudflare Pages
- Connect the GitHub repository.
- Framework preset: `None` (or Next.js Static HTML Export if shown)
- Build command: `npm run build`
- Build output directory: `out`
- Root directory: `/` (leave blank)
- Node.js compatibility: use Node 20 or 22.

## Netlify
Connect the same GitHub repository. Build command `npm run build`, publish directory `out`. `netlify.toml` is included.

## Before client handover
- Confirm the gym's exact opening hours, membership prices and trainer names.
- Confirm permission to publish the supplied gym photographs.
- Test phone, WhatsApp, directions and trial links on mobile.
- Replace any temporary content with owner-approved details.

The 3D gym floor is a stylized interactive concept based on the supplied reference photos, not a laser-scanned architectural digital twin.
