import Image from "next/image";
const zones=[
  {n:"01",title:"STRENGTH ZONE",desc:"Build a stronger foundation with focused compound lifts.",tag:"POWER / CONTROL",img:"/images/gym-interior-dark.jpg"},
  {n:"02",title:"FREE WEIGHTS",desc:"Train with intent using versatile free-weight movements.",tag:"FORM / FOCUS",img:"/images/gym-interior-yellow.jpg"},
  {n:"03",title:"TRAINER CULTURE",desc:"Get guidance, motivation and a community that keeps you moving.",tag:"GUIDANCE / ENERGY",img:"/images/gym-trainer-back.jpg"}
];
export default function Zones(){return <section id="zones" className="section-pad bg-[#0e1011]">
  <div className="container-wide">
    <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow">02 / EXPLORE THE FLOOR</p><h2 className="display mt-5 text-5xl md:text-7xl">FIND YOUR<br/><span className="gold">ZONE.</span></h2></div><p className="max-w-sm text-sm leading-7 text-[#929698]">Every corner has a purpose. Explore the training atmosphere that makes The Alpha Gym what it is.</p></div>
    <div className="mt-12 grid gap-4 md:grid-cols-3">{zones.map(z=><article key={z.n} className="group relative min-h-[390px] overflow-hidden border border-white/10 bg-[#171a1c]">
      <Image src={z.img} alt={z.title} fill className="photo transition duration-700 group-hover:scale-105"/>
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent"/>
      <div className="absolute inset-x-0 bottom-0 p-6"><p className="eyebrow">{z.n} / {z.tag}</p><h3 className="mt-3 text-2xl font-black">{z.title}</h3><p className="mt-2 max-w-xs text-xs leading-6 text-white/65">{z.desc}</p></div>
    </article>)}</div>
  </div>
</section>}
