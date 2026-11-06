import Image from "next/image";
export default function About() {
  return <section id="experience" className="section-pad">
    <div className="container-wide grid gap-12 md:grid-cols-[.9fr_1.1fr] md:items-center">
      <div className="relative h-[420px] overflow-hidden">
        <Image src="/images/gym-interior-yellow.jpg" alt="The Alpha Gym interior with strength equipment" fill className="photo"/>
        <div className="absolute bottom-5 left-5 border border-white/20 bg-black/75 px-5 py-4 backdrop-blur"><p className="eyebrow">THE ALPHA STANDARD</p><p className="mt-1 text-2xl font-black">STRONGER EVERY DAY.</p></div>
      </div>
      <div>
        <p className="eyebrow">01 / ABOUT THE GYM</p>
        <h2 className="display mt-5 text-5xl md:text-7xl">MORE THAN<br/><span className="gold">A WORKOUT.</span></h2>
        <p className="mt-7 max-w-xl text-sm leading-8 text-[#a4a7a8]">The Alpha Gym is a strength-focused fitness space in Patel Nagar, Kashipur. Built around consistency, focused training and a supportive atmosphere, it brings together modern equipment and expert guidance to help members move forward with confidence.</p>
        <div className="mt-9 grid grid-cols-2 gap-5 border-t border-white/10 pt-7">
          <div><p className="text-4xl font-black gold">5.0<span className="text-lg">★</span></p><p className="mt-2 text-[10px] uppercase tracking-widest text-[#85898b]">Google rating</p></div>
          <div><p className="text-4xl font-black">81</p><p className="mt-2 text-[10px] uppercase tracking-widest text-[#85898b]">Member reviews</p></div>
        </div>
      </div>
    </div>
  </section>;
}
