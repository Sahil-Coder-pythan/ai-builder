"use client";
import {Suspense,useMemo,useRef,useState} from "react";
import {Canvas,useFrame} from "@react-three/fiber";
import {ContactShadows,Environment,Float,OrbitControls,Text} from "@react-three/drei";
import * as THREE from "three";

type Station="rack"|"bench"|"weights"|"cable";
const details:Record<Station,{name:string,sub:string,copy:string}>={
 rack:{name:"POWER RACK",sub:"COMPOUND STRENGTH",copy:"A solid station for squats, presses and the big lifts."},
 bench:{name:"BENCH PRESS",sub:"UPPER BODY",copy:"Build pressing strength with a focused, stable setup."},
 weights:{name:"FREE WEIGHTS",sub:"CONTROL & RANGE",copy:"Dumbbells for focused movement and full-body training."},
 cable:{name:"CABLE STATION",sub:"FUNCTIONAL TRAINING",copy:"Versatile resistance for controlled isolation work."}
};
function Steel({color="#303638",roughness=.32}:{color?:string,roughness?:number}){return <meshStandardMaterial color={color} metalness={.72} roughness={roughness}/>}
function Plate({radius=.34,depth=.12}:{radius?:number,depth?:number}){return <group><mesh rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[radius,radius,depth,32]}/><Steel color="#15191a"/></mesh><mesh rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[radius*.72,radius*.72,depth*1.02,32]}/><meshStandardMaterial color="#272d2d" metalness={.3} roughness={.65}/></mesh><mesh rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.07,.07,depth*1.1,20]}/><Steel color="#b9a36a"/></mesh></group>}
function Rack({active,onClick}:{active:boolean,onClick:()=>void}){const c=active?"#d8b75b":"#4a5150";return <group onClick={onClick}>
{[-.82,.82].map(x=><group key={x} position={[x,1.25,0]}><mesh castShadow><boxGeometry args={[.13,2.5,.15]}/><Steel color={c}/></mesh>{[.35,.62,.89,1.16,1.43,1.7,1.97,2.24].map(y=><mesh key={y} position={[0,y-1.25,.09]}><boxGeometry args={[.22,.045,.24]}/><Steel color="#9c9f99"/></mesh>)}</group>)}
{[0,2.45].map(y=><mesh key={y} position={[0,y,0]}><boxGeometry args={[1.8,.13,.15]}/><Steel color={c}/></mesh>)}
<mesh position={[0,2.08,.04]}><boxGeometry args={[2.05,.07,.07]}/><Steel color="#c3c4bd"/></mesh>
<group position={[0,2.08,.04]}><mesh rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.045,.045,2.35,24]}/><Steel color="#c6c7c0"/></mesh>{[-.98,.98].map(x=><group key={x} position={[x,0,0]}><Plate radius={.3}/></group>)}</group>
</group>}
function Bench({active,onClick}:{active:boolean,onClick:()=>void}){return <group onClick={onClick} rotation={[0,-.18,0]}><mesh position={[0,.62,0]} castShadow><boxGeometry args={[1.65,.17,.56]}/><meshStandardMaterial color={active?"#d8b75b":"#171b1b"} roughness={.78}/></mesh><mesh position={[0,.31,0]}><boxGeometry args={[.11,.52,.12]}/><Steel/></mesh><mesh position={[0,.08,0]}><boxGeometry args={[.9,.1,.5]}/><Steel/></mesh><mesh position={[0,.79,-.47]} rotation={[.12,0,0]}><boxGeometry args={[.55,.14,.6]}/><meshStandardMaterial color="#202525" roughness={.8}/></mesh></group>}
function Dumbbell({x,active}:{x:number,active:boolean}){return <group position={[x,.18,0]} rotation={[0,0,Math.PI/2]}><mesh><cylinderGeometry args={[.045,.045,.48,16]}/><Steel color="#aeb1ad"/></mesh>{[-.28,.28].map(z=><group key={z} position={[0,z,0]}><mesh><cylinderGeometry args={[.15,.15,.13,24]}/><Steel color={active?"#d8b75b":"#222828"}/></mesh><mesh><cylinderGeometry args={[.105,.105,.14,24]}/><Steel color="#444b49"/></mesh></group>)}</group>}
function WeightRack({active,onClick}:{active:boolean,onClick:()=>void}){return <group onClick={onClick} position={[0,0,0]}><mesh position={[0,.42,0]}><boxGeometry args={[2.5,.12,.45]}/><Steel color="#242a29"/></mesh><mesh position={[0,.72,-.12]} rotation={[.12,0,0]}><boxGeometry args={[2.55,.1,.38]}/><Steel color="#555d58"/></mesh>{[-.92,-.46,0,.46,.92].map((x,i)=><Dumbbell key={x} x={x} active={active}/>)}</group>}
function Cable({active,onClick}:{active:boolean,onClick:()=>void}){return <group onClick={onClick}>{[-.62,.62].map(x=><group key={x} position={[x,1.15,0]}><mesh><boxGeometry args={[.13,2.3,.15]}/><Steel color={active?"#d8b75b":"#333b39"}/></mesh><mesh position={[0,.2,.13]}><boxGeometry args={[.22,.08,.12]}/><Steel color="#b6b8b0"/></mesh></group>)}<mesh position={[0,2.28,0]}><boxGeometry args={[1.4,.14,.16]}/><Steel color="#aeb4ae"/></mesh><mesh position={[0,.08,0]}><boxGeometry args={[1.55,.16,.7]}/><Steel/></mesh><mesh position={[0,1.2,.1]}><boxGeometry args={[.035,1.85,.035]}/><meshBasicMaterial color="#d8b75b"/></mesh><mesh position={[0,.6,.16]}><boxGeometry args={[.5,.1,.35]}/><meshStandardMaterial color="#191d1d"/></mesh></group>}
function Athlete(){const arm=useRef<THREE.Group>(null);useFrame(({clock})=>{if(arm.current)arm.current.rotation.z=-.5+Math.sin(clock.elapsedTime*1.7)*.42});return <group position={[0,0,1.4]}>
{/* trainer mannequin doing a controlled curl */}
<Float speed={1.2} rotationIntensity={0} floatIntensity={.018}>
<mesh position={[0,1.38,0]} castShadow><capsuleGeometry args={[.27,.72,6,12]}/><meshStandardMaterial color="#b4774e" roughness={.65}/></mesh>
<mesh position={[0,2.02,0]}><sphereGeometry args={[.2,24,24]}/><meshStandardMaterial color="#c58b62" roughness={.7}/></mesh>
<mesh position={[0,2.17,0]}><sphereGeometry args={[.205,16,12]}/><meshStandardMaterial color="#171b1a"/></mesh>
{[-.14,.14].map(x=><mesh key={x} position={[x,.62,0]} rotation={[0,0,x<0?.06:-.06]}><capsuleGeometry args={[.115,.68,5,10]}/><meshStandardMaterial color="#161b1a" roughness={.8}/></mesh>)}
<mesh position={[-.34,1.38,0]} rotation={[0,0,-.12]}><capsuleGeometry args={[.105,.42,5,10]}/><meshStandardMaterial color="#c58b62"/></mesh>
<group ref={arm} position={[.27,1.7,0]}><mesh position={[.2,-.16,0]} rotation={[0,0,-.65]}><capsuleGeometry args={[.105,.4,5,10]}/><meshStandardMaterial color="#c58b62"/></mesh><mesh position={[.36,-.35,0]}><sphereGeometry args={[.09,16,12]}/><meshStandardMaterial color="#c58b62"/></mesh><mesh position={[.38,-.16,0]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.045,.045,.42,12]}/><Steel color="#b7b9b2"/></mesh><group position={[.38,.04,0]}><Plate radius={.13} depth={.1}/></group><group position={[.38,-.36,0]}><Plate radius={.13} depth={.1}/></group></group>
</Float></group>}
function Room({selected,setSelected}:{selected:Station,setSelected:(v:Station)=>void}){const floor=useMemo(()=>new THREE.MeshStandardMaterial({color:"#252b29",roughness:.88}),[]);return <>
<color attach="background" args={["#080c0b"]}/><fog attach="fog" args={["#080c0b",11,22]}/>
<ambientLight intensity={1.2}/><directionalLight position={[5,8,6]} intensity={2.3} castShadow shadow-mapSize={[1024,1024]}/><spotLight position={[-3,6,-1]} intensity={42} angle={.55} penumbra={.7} color="#d8b75b"/><pointLight position={[2,3,3]} intensity={18} color="#fff1ce"/><pointLight position={[-4,2,-3]} intensity={9} color="#a9c4bb"/>
<mesh rotation={[-Math.PI/2,0,0]} position={[0,-.07,0]} receiveShadow material={floor}><planeGeometry args={[13,11]}/></mesh>
<gridHelper args={[13,26,"#66552b","#323a36"]} position={[0,-.055,0]}/>
{/* gym back wall with luminous brand wall */}
<mesh position={[0,2,-4.9]}><boxGeometry args={[13,4,.22]}/><meshStandardMaterial color="#121817" roughness={.9}/></mesh>
<mesh position={[0,3.45,-4.75]}><boxGeometry args={[4.7,.04,.04]}/><meshBasicMaterial color="#d8b75b"/></mesh>
<Text position={[0,3.08,-4.72]} fontSize={.42} letterSpacing={.14} color="#e3c777" anchorX="center" anchorY="middle">THE ALPHA</Text>
<Text position={[0,2.75,-4.72]} fontSize={.13} letterSpacing={.35} color="#a9b0a8" anchorX="center" anchorY="middle">STRENGTH  •  DISCIPLINE  •  COMMUNITY</Text>
{/* ceiling light bars */}
{[-3.3,0,3.3].map(x=><group key={x} position={[x,3.85,-1.7]}><mesh><boxGeometry args={[2.2,.045,.08]}/><meshBasicMaterial color="#f5e6ba"/></mesh><pointLight position={[0,-.2,0]} intensity={4} distance={5} color="#fff0cf"/></group>)}
{/* actual gym equipment zones */}
<Float speed={.3} rotationIntensity={0} floatIntensity={.015}><group position={[-2.6,0,-2.2]}><Rack active={selected==="rack"} onClick={()=>setSelected("rack")}/></group></Float>
<group position={[0,0,-.25]}><Bench active={selected==="bench"} onClick={()=>setSelected("bench")}/></group>
<group position={[2.6,0,-2.3]}><Cable active={selected==="cable"} onClick={()=>setSelected("cable")}/></group>
<group position={[-2.3,0,2.25]}><WeightRack active={selected==="weights"} onClick={()=>setSelected("weights")}/></group>
<Athlete/>
{/* wall mirror panels */}
{[-4.5,-3.7,3.7,4.5].map(x=><mesh key={x} position={[x,1.8,-4.76]}><boxGeometry args={[.9,2.5,.025]}/><meshStandardMaterial color="#71817b" metalness={.8} roughness={.18} transparent opacity={.24}/></mesh>)}
<ContactShadows position={[0,-.05,0]} opacity={.45} scale={13} blur={2.5}/>
<Suspense fallback={null}><Environment preset="city"/></Suspense>
</>}
export default function GymScene(){const[selected,setSelected]=useState<Station>("rack");return <div className="relative h-[460px] overflow-hidden bg-[#080c0b] md:h-[660px]">
<Canvas camera={{position:[8,5.3,9.8],fov:39}} shadows dpr={[1,1.5]} gl={{antialias:true,powerPreference:"high-performance"}}><Room selected={selected} setSelected={setSelected}/><OrbitControls makeDefault autoRotate autoRotateSpeed={.22} enablePan={false} minDistance={6.8} maxDistance={15} maxPolarAngle={Math.PI/2.05} target={[0,1,0]}/></Canvas>
<div className="pointer-events-none absolute left-4 top-4 border border-white/15 bg-black/60 px-4 py-3 backdrop-blur"><p className="text-[8px] tracking-[.24em] text-[#d8b75b]">THE ALPHA / DIGITAL FLOOR</p><p className="mt-1 text-xs font-black tracking-widest">STRENGTH STUDIO</p></div>
<div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-end justify-between gap-3"><div className="pointer-events-none max-w-[260px] border border-white/15 bg-black/75 p-4 backdrop-blur-xl"><p className="text-[8px] tracking-[.22em] text-[#d8b75b]">{details[selected].sub}</p><h3 className="mt-2 text-lg font-black tracking-tight">{details[selected].name}</h3><p className="mt-1 text-[10px] leading-5 text-white/60">{details[selected].copy}</p></div><div className="flex flex-wrap gap-1.5">{(["rack","bench","weights","cable"] as Station[]).map((k)=><button key={k} onClick={()=>setSelected(k)} className={`border px-3 py-2 text-[8px] font-black tracking-[.13em] backdrop-blur ${selected===k?"border-[#d8b75b] bg-[#d8b75b] text-black":"border-white/25 bg-black/70 text-white"}`}>{k==="rack"?"POWER RACK":k==="bench"?"BENCH":k==="weights"?"FREE WEIGHTS":"CABLE"}</button>)}</div></div>
<div className="pointer-events-none absolute right-4 top-5 text-[8px] tracking-[.2em] text-white/45">DRAG TO ORBIT ↗</div>
</div>}
