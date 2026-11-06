const perks=["Access to strength-training equipment","Supportive training environment","Guidance from experienced trainers","A community built around consistency"];
export default function Membership(){return <section id="membership" className="section-pad bg-[#0e1011]">
  <div className="container-wide">
    <div className="text-center"><p className="eyebrow">04 / MEMBERSHIP</p><h2 className="display mt-5 text-5xl md:text-7xl">YOUR NEXT LEVEL<br/><span className="gold">STARTS HERE.</span></h2><p className="mx-auto mt-6 max-w-lg text-sm leading-7 text-[#9a9da0]">Choose a training plan that fits your goals. Contact the team for current membership options and pricing.</p></div>
    <div className="mx-auto mt-12 max-w-3xl border border-[#d9b83f]/50 bg-gradient-to-br from-[#1b1c19] to-[#101213] p-7 md:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">THE ALPHA MEMBERSHIP</p><h3 className="mt-3 text-3xl font-black">TRAIN WITH PURPOSE.</h3></div><span className="border border-[#d9b83f]/50 px-3 py-2 text-[9px] font-bold tracking-widest text-[#d9b83f]">ENQUIRE FOR PLANS</span></div>
      <div className="gold-line my-7"/>
      <div className="grid gap-4 sm:grid-cols-2">{perks.map(p=><p key={p} className="flex gap-3 text-sm text-[#c3c5c5]"><span className="text-[#d9b83f]">✦</span>{p}</p>)}</div>
      <div className="mt-9 flex flex-wrap items-center justify-between gap-5"><p className="text-xs text-[#85898b]">Ask us about available durations, fees and trial sessions.</p><a className="btn-gold" href="https://wa.me/919193009092?text=Hi%20The%20Alpha%20Gym%2C%20please%20share%20your%20membership%20plans%20and%20fees.">GET MEMBERSHIP DETAILS ↗</a></div>
    </div>
  </div>
</section>}
