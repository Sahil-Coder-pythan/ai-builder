"use client";
import { useState } from "react";
const links = [["Experience","#experience"],["Zones","#zones"],["Trainers","#trainers"],["Membership","#membership"],["Contact","#contact"]];
export default function Navbar() {
  const [open,setOpen] = useState(false);
  return (
    <header className="fixed top-0 z-50 w-full border-b border-white/10 bg-[#08090a]/85 backdrop-blur-xl">
      <div className="container-wide flex h-[76px] items-center justify-between">
        <a href="#top" className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center border border-[#d9b83f] text-sm font-black text-[#d9b83f]">A</span>
          <span className="text-[11px] font-black tracking-[.22em]">THE ALPHA <span className="text-[#d9b83f]">GYM</span></span>
        </a>
        <nav className="hidden items-center gap-8 md:flex">
          {links.map(([label,href])=><a key={href} className="nav-link text-[10px] font-bold uppercase tracking-[.16em]" href={href}>{label}</a>)}
        </nav>
        <a className="btn-gold hidden !px-5 !py-3 md:inline-flex" href="https://wa.me/919193009092" target="_blank" rel="noreferrer">BOOK A TRIAL ↗</a>
        <button aria-label="Toggle menu" onClick={()=>setOpen(!open)} className="text-2xl md:hidden">{open?"×":"☰"}</button>
      </div>
      {open && <nav className="grid gap-5 border-t border-white/10 bg-[#08090a] px-6 py-6 md:hidden">{links.map(([label,href])=><a onClick={()=>setOpen(false)} key={href} href={href} className="nav-link text-xs uppercase tracking-widest">{label}</a>)}<a href="https://wa.me/919193009092" className="btn-gold">BOOK A TRIAL ↗</a></nav>}
    </header>
  );
}
