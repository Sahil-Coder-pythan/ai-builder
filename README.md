# The Alpha Gym — immersive website demo

A Next.js 14 + TypeScript + Tailwind + React Three Fiber concept website, configured for **static export** and free Git-connected hosting on Cloudflare Pages.

## Requirements
- Node.js 20 LTS or newer
- npm
- GitHub account
- Cloudflare account (free plan is enough for a static demo)

## Run locally
```bash
npm install
npm run dev
```
Open http://localhost:3000

## Build
```bash
npm run build
```
The static website is generated in `out/`.

## Deploy free on Cloudflare Pages
1. Create a GitHub repository and upload the contents of this folder (not the ZIP file itself).
2. Open https://dash.cloudflare.com/ and sign in.
3. Go to **Workers & Pages → Create application → Pages → Connect to Git**.
4. Connect GitHub and select this repository.
5. Select **Next.js (Static HTML Export)** if shown, or enter:
   - Production branch: `main`
   - Build command: `npm run build`
   - Build output directory: `out`
6. Click **Save and Deploy**. Cloudflare gives a free `*.pages.dev` preview URL.
7. Later, connect the client's paid custom domain under **Custom domains**. You do not need to buy a domain for the demo.

Cloudflare Pages official guide:
https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/

## Demo notes / before client handoff
- The supplied photos are included in `public/images/` and used in the gallery/trainer sections.
- Phone and WhatsApp links are set to +91 91930 09092.
- The gym's exact opening schedule, trainer names, and membership prices were not supplied. The site intentionally says “Enquire for plans” rather than inventing prices or staff details.
- This is a visual demo, not a booking/payment backend. WhatsApp and phone actions work as contact links.
- The 3D gym is a procedural stylized concept based on the supplied photos, not a measured architectural scan. Replace/adjust geometry after an on-site measurement or additional reference photos for a true digital twin.

## Performance
- The 3D scene is dynamically loaded only on the client.
- Mobile uses lower DPR and reduced shadows.
- GLB assets can be placed in `public/models/` and loaded with Drei `useGLTF` when commissioned/available.
- Keep individual GLB files compressed and aim for under 2–3 MB each.
