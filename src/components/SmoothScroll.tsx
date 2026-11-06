"use client";
import {useEffect} from "react";
import Lenis from "lenis";
export default function SmoothScroll({children}:{children:React.ReactNode}){
 useEffect(()=>{if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
 const lenis=new Lenis({duration:1.15,smoothWheel:true,touchMultiplier:1.25});
 let raf=0;const tick=(t:number)=>{lenis.raf(t);raf=requestAnimationFrame(tick)};raf=requestAnimationFrame(tick);
 return()=>{cancelAnimationFrame(raf);lenis.destroy()};
 },[]);
 return <>{children}</>;
}
