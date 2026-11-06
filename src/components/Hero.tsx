"use client";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
const GymScene = dynamic(() => import("@/three/GymScene"), {
  ssr: false,
  loading: () => <div className="grid h-[440px] place-items-center bg-[#111315] text-xs tracking-[.3em] text-[#d9b83f] md:h-[620px]">PREPARING THE ALPHA FLOOR…</div>
});
export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pt-[76px]">
      <div className="pointer-events-none absolute inset-0 grid-lines opacity-40" />
      <div className="container-wide relative grid gap-8 pb-7 pt-16 md:grid-cols-[.85fr_1.15fr] md:items-end md:pt-24">
        <div className="relative z-10">
          <p className="eyebrow mb-6">Patel Nagar · Kashipur · Uttarakhand</p>
          <motion.h1 initial={{opacity:0,y:35}} animate={{opacity:1,y:0}} transition={{duration:.8}} className="display text-[clamp(4.2rem,10vw,9.5rem)]">
            TRAIN<br/><span className="gold">BEYOND</span><br/>LIMITS<span className="gold">.</span>
          </motion.h1>
          <p className="mt-7 max-w-md text-sm leading-7 text-[#a4a7a8]">A space built for strength, discipline and real progress. Step inside The Alpha Gym and discover your next level.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a className="btn-gold" href="https://wa.me/919193009092?text=Hi%20The%20Alpha%20Gym%2C%20I%20want%20to%20book%20a%20free%20trial.">BOOK FREE TRIAL ↗</a>
            <a className="btn-outline" href="#experience">EXPLORE THE GYM ↓</a>
          </div>
          <div className="mt-10 flex items-center gap-3 text-xs text-[#9a9da0]"><span className="text-lg text-[#d9b83f]">★★★★★</span><b className="text-white">5.0</b><span>81 Google reviews</span></div>
        </div>
        <div className="relative">
          <div className="absolute -right-4 -top-7 z-10 hidden text-[9px] tracking-[.25em] text-[#d9b83f] md:block">INTERACTIVE 3D ENVIRONMENT / 01</div>
          <GymScene />
          <div className="pointer-events-none absolute bottom-4 left-4 text-[9px] tracking-[.2em] text-white/50">DRAG TO ROTATE · TAP EQUIPMENT TO EXPLORE</div>
        </div>
      </div>
      <div className="container-wide flex justify-between border-t border-white/10 py-5 text-[9px] tracking-[.22em] text-[#7f8385]"><span>STRENGTH / FOCUS / COMMUNITY</span><span>SCROLL TO DISCOVER ↓</span></div>
    </section>
  );
}
