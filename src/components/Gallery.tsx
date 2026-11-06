import Image from "next/image";
const photos=[
  ["/images/gym-interior-yellow.jpg","The training floor"],
  ["/images/gym-interior-dark.jpg","Strength equipment"],
  ["/images/gym-team.jpg","The gym community"],
  ["/images/gym-trainer-red.jpg","Trainer portrait"]
];
export default function Gallery(){return <section className="section-pad">
  <div className="container-wide"><div className="flex items-end justify-between gap-4"><div><p className="eyebrow">05 / INSIDE THE ALPHA</p><h2 className="display mt-5 text-5xl md:text-7xl">REAL PEOPLE.<br/><span className="gold">REAL ENERGY.</span></h2></div><p className="hidden max-w-xs text-xs leading-6 text-[#929698] md:block">A look inside the training environment and community.</p></div>
    <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4">{photos.map(([src,label],i)=><div key={src} className={`relative overflow-hidden border border-white/10 ${i===0?"h-[260px] md:h-[340px]":"h-[220px] md:h-[280px]"}`}><Image src={src} alt={label} fill className="photo transition duration-700 hover:scale-105"/><div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 p-3 text-[10px] font-bold uppercase tracking-widest">{label}</div></div>)}</div>
  </div>
</section>}
