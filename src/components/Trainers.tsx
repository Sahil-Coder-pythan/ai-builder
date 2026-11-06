import Image from "next/image";
export default function Trainers(){return <section id="trainers" className="section-pad">
  <div className="container-wide grid gap-10 md:grid-cols-[.8fr_1.2fr] md:items-center">
    <div><p className="eyebrow">03 / THE PEOPLE BEHIND THE PROGRESS</p><h2 className="display mt-5 text-5xl md:text-7xl">BUILT BY<br/><span className="gold">DISCIPLINE.</span></h2><p className="mt-6 max-w-md text-sm leading-7 text-[#9a9da0]">Good training starts with good guidance. Meet the people and community behind the energy at The Alpha Gym. Contact the team to ask about coaching and personal training.</p><a className="btn-outline mt-8" href="https://wa.me/919193009092?text=Hi%2C%20I%20would%20like%20to%20know%20about%20personal%20training.">ASK ABOUT COACHING ↗</a></div>
    <div className="grid grid-cols-2 gap-3">
      <div className="relative mt-10 h-[310px] overflow-hidden"><Image src="/images/gym-trainer-red.jpg" alt="Gym trainer in red shirt" fill className="photo"/><div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black p-4"><p className="text-[9px] tracking-widest text-[#d9b83f]">TRAINING CULTURE</p><p className="mt-1 font-bold">Strength starts within.</p></div></div>
      <div className="relative h-[310px] overflow-hidden"><Image src="/images/gym-trainer-back.jpg" alt="Bodybuilding pose at the gym" fill className="photo"/><div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black p-4"><p className="text-[9px] tracking-widest text-[#d9b83f]">THE ALPHA MINDSET</p><p className="mt-1 font-bold">Progress is earned.</p></div></div>
    </div>
  </div>
</section>}
