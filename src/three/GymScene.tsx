"use client";
import { Suspense, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, OrbitControls, Float } from "@react-three/drei";
import * as THREE from "three";

type Item = "rack" | "bench" | "weights" | "cable";
const copy: Record<Item,{title:string,desc:string}> = {
  rack:{title:"POWER RACK",desc:"A dedicated strength station for squats, presses and compound lifts."},
  bench:{title:"BENCH PRESS",desc:"A versatile setup for upper-body strength and controlled progression."},
  weights:{title:"FREE WEIGHTS",desc:"Dumbbells for focused training, balance and full-body conditioning."},
  cable:{title:"CABLE STATION",desc:"Smooth resistance for isolation work and functional movement."}
};
function Metal({color="#282c2e"}:{color?:string}) {
  return <meshStandardMaterial color={color} metalness={.78} roughness={.28}/>;
}
function Rack({onClick,active}:{onClick:()=>void,active:boolean}) {
  const gold=active?"#e5c84d":"#33383a";
  return <group onClick={(e)=>{e.stopPropagation();onClick();}}>
    {[-.68,.68].map(x=><mesh key={x} position={[x,1.02,0]} castShadow><boxGeometry args={[.11,2.04,.12]}/><Metal color={gold}/></mesh>)}
    {[-.68,.68].map(x=><mesh key={"top"+x} position={[x,1.95,0]}><boxGeometry args={[.12,.12,1.25]}/><Metal/></mesh>)}
    <mesh position={[0,1.85,0]} castShadow><boxGeometry args={[1.5,.09,.1]}/><Metal color="#b2b5b6"/></mesh>
    <mesh position={[0,.32,0]}><boxGeometry args={[1.9,.12,.85]}/><Metal/></mesh>
    <mesh position={[0,.82,.35]}><boxGeometry args={[1.25,.08,.08]}/><Metal color="#d9b83f"/></mesh>
  </group>;
}
function Bench({onClick,active}:{onClick:()=>void,active:boolean}) {
  return <group onClick={(e)=>{e.stopPropagation();onClick();}} rotation={[0,.2,0]}>
    <mesh position={[0,.58,0]} castShadow><boxGeometry args={[1.45,.18,.52]}/><meshStandardMaterial color={active?"#d9b83f":"#191c1e"} roughness={.75}/></mesh>
    <mesh position={[0,.3,0]}><boxGeometry args={[.12,.55,.12]}/><Metal/></mesh>
    <mesh position={[0,.08,0]}><boxGeometry args={[.8,.08,.45]}/><Metal/></mesh>
  </group>;
}
function Dumbbells({onClick,active}:{onClick:()=>void,active:boolean}) {
  return <group onClick={(e)=>{e.stopPropagation();onClick();}}>
    {[-.42,0,.42].map((x,i)=><group key={i} position={[x,.18,0]} rotation={[0,0,Math.PI/2]}>
      <mesh><cylinderGeometry args={[.065,.065,.42,20]}/><Metal color="#b7b9b9"/></mesh>
      {[-.23,.23].map((z,j)=><mesh key={j} position={[0,z,0]}><cylinderGeometry args={[.15,.15,.12,24]}/><Metal color={active?"#d9b83f":"#202426"}/></mesh>)}
    </group>)}
  </group>;
}
function Cable({onClick,active}:{onClick:()=>void,active:boolean}) {
  return <group onClick={(e)=>{e.stopPropagation();onClick();}}>
    {[-.62,.62].map(x=><mesh key={x} position={[x,1.1,0]}><boxGeometry args={[.1,2.2,.1]}/><Metal color={active?"#d9b83f":"#303638"}/></mesh>)}
    <mesh position={[0,2.12,0]}><boxGeometry args={[1.35,.12,.12]}/><Metal/></mesh>
    <mesh position={[0,.12,0]}><boxGeometry args={[1.5,.2,.65]}/><Metal/></mesh>
    <mesh position={[0,1.55,.03}><boxGeometry args={[.035,1.1,.035]}/><meshBasicMaterial color="#b6b8b9"/></mesh>
  </group>;
}
function Scene({selected,setSelected}:{selected:Item,setSelected:(v:Item)=>void}) {
  const floorMat = useMemo(()=>new THREE.MeshStandardMaterial({color:"#202326",roughness:.95}),[]);
  return <>
    <color attach="background" args={["#090b0c"]}/>
    <fog attach="fog" args={["#090b0c",10,22]}/>
    <ambientLight intensity={1.1}/>
    <directionalLight position={[4,8,5]} intensity={2.1} castShadow shadow-mapSize={[1024,1024]}/>
    <spotLight position={[-4,5,-2]} intensity={35} angle={.45} penumbra={.8} color="#e5c84d"/>
    <pointLight position={[2,3,3]} intensity={12} color="#fff0c4"/>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.08,0]} receiveShadow material={floorMat}><planeGeometry args={[12,9]}/></mesh>
    <gridHelper args={[12,24,"#5b5129","#303436"]} position={[0,-.065,0]}/>
    <mesh position={[0,1.9,-4.4]}><boxGeometry args={[12,3.8,.18]}/><meshStandardMaterial color="#121516" roughness={.95}/></mesh>
    <mesh position={[0,3.83,-2.1]}><boxGeometry args={[8,.08,4.2]}/><meshStandardMaterial color="#191c1e"/></mesh>
    {[-2.6,0,2.6].map(x=><mesh key={x} position={[x,3.77,-.3]}><boxGeometry args={[.045,.035,4.5]}/><meshBasicMaterial color="#fff0c7"/></mesh>)}
    <Float speed={.65} rotationIntensity={.03} floatIntensity={.06}>
      <group position={[-2.2,0,-1.35]}><Rack active={selected==="rack"} onClick={()=>setSelected("rack")}/></group>
    </Float>
    <group position={[.35,0,.25]}><Bench active={selected==="bench"} onClick={()=>setSelected("bench")}/></group>
    <group position={[2.5,0,-1.4]}><Dumbbells active={selected==="weights"} onClick={()=>setSelected("weights")}/></group>
    <group position={[2.4,0,1.4]}><Cable active={selected==="cable"} onClick={()=>setSelected("cable")}/></group>
    <ContactShadows position={[0,-.06,0]} opacity={.38} scale={12} blur={2.4}/>
    <Suspense fallback={null}><Environment preset="warehouse"/></Suspense>
  </>;
}
export default function GymScene() {
  const [selected,setSelected]=useState<Item>("rack");
  return <div className="relative h-[440px] overflow-hidden border border-white/10 bg-[#090b0c] md:h-[620px]">
    <Canvas camera={{position:[7,5.1,8.5],fov:42}} shadows dpr={[1,1.5]} gl={{antialias:true,powerPreference:"high-performance"}}>
      <Scene selected={selected} setSelected={setSelected}/>
      <OrbitControls makeDefault autoRotate autoRotateSpeed={.3} enablePan={false} minDistance={5.5} maxDistance={13} maxPolarAngle={Math.PI/2.05}/>
    </Canvas>
    <div className="absolute bottom-4 right-4 left-4 flex items-end justify-between gap-3 pointer-events-none">
      <div className="max-w-[250px] border border-white/10 bg-black/75 p-4 backdrop-blur-md">
        <p className="text-[9px] tracking-[.2em] text-[#d9b83f]">SELECTED EQUIPMENT</p>
        <h3 className="mt-2 text-lg font-black">{copy[selected].title}</h3>
        <p className="mt-1 text-[11px] leading-5 text-white/60">{copy[selected].desc}</p>
      </div>
      <div className="flex flex-col gap-2 pointer-events-auto">
        {(["rack","bench","weights","cable"] as Item[]).map(k=><button key={k} onClick={()=>setSelected(k)} className={`border px-3 py-2 text-[9px] font-bold uppercase tracking-wider backdrop-blur ${selected===k?"border-[#d9b83f] bg-[#d9b83f] text-black":"border-white/20 bg-black/70 text-white"}`}>{k==="weights"?"Weights":k}</button>)}
      </div>
    </div>
  </div>;
}
