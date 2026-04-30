'use client';

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import * as THREE from "three";

export default function LoginPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef  = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [webglOk, setWebglOk] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailFocus, setEmailFocus] = useState(false);
  const [passFocus, setPassFocus] = useState(false);
  const [greeting, setGreeting] = useState(false);
  const [mode, setMode] = useState<"login"|"signup">("login");
  const [role, setRole] = useState<"teacher"|"student">("teacher");
  const [fullName, setFullName] = useState("");
  const [nameFocus, setNameFocus] = useState(false);
  const mousePosRef = useRef({ x: -999, y: -999 });

  /* ── RAF cursor (only when GPU available) ── */
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !webglOk) return;
    let raf: number;
    const cur  = { x: -999, y: -999 };
    const glow = { x: -999, y: -999 };
    const onMove = (e: MouseEvent) => { cur.x = e.clientX; cur.y = e.clientY; mousePosRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("mousemove", onMove);
    const tick = () => {
      if (dotRef.current)  { dotRef.current.style.left  = cur.x + "px"; dotRef.current.style.top  = cur.y + "px"; }
      if (ringRef.current) { ringRef.current.style.left = cur.x + "px"; ringRef.current.style.top = cur.y + "px"; }
      glow.x += (cur.x - glow.x) * 0.1; glow.y += (cur.y - glow.y) * 0.1;
      if (glowRef.current) { glowRef.current.style.left = glow.x + "px"; glowRef.current.style.top = glow.y + "px"; }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { window.removeEventListener("mousemove", onMove); cancelAnimationFrame(raf); };
  }, [mounted, webglOk]);

  /* ── Three.js mascot ── */
  useEffect(() => {
    if (!mounted) return;
    const canvas = canvasRef.current; if (!canvas) return;
    // Pre-check WebGL support to avoid Three.js console.error
    const testCanvas = document.createElement('canvas');
    const gl = testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl');
    if (!gl) {
      console.warn('WebGL not available — using 2D fallback mascot.');
      setWebglOk(false);
      return;
    }
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(0, 1.5, 11);

    scene.add(new THREE.AmbientLight(0xf8faff, 0.7));
    const keyLight  = new THREE.DirectionalLight(0xe0f2fe, 2.2); keyLight.position.set(4,8,6);   scene.add(keyLight);
    const fillLight = new THREE.PointLight(0x3b82f6, 6, 25);     fillLight.position.set(-5,2,3); scene.add(fillLight);
    const rimLight  = new THREE.PointLight(0x0ea5e9, 3.5, 20);   rimLight.position.set(3,-2,-4); scene.add(rimLight);
    const warmLight = new THREE.PointLight(0xf0ab00, 5, 15);     warmLight.position.set(0,5,2);  scene.add(warmLight);

    const pPos = new Float32Array(110 * 3);
    for (let i = 0; i < 110; i++) { pPos[i*3]=(Math.random()-.5)*30; pPos[i*3+1]=(Math.random()-.5)*20; pPos[i*3+2]=(Math.random()-.5)*14-4; }
    const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute("position", new THREE.BufferAttribute(pPos,3));
    const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ color:0xf0ab00, size:.065, transparent:true, opacity:.5, sizeAttenuation:true }));
    scene.add(particles);

    const mascotGroup = new THREE.Group(); mascotGroup.position.set(-2,-.5,0); scene.add(mascotGroup);
    const body = new THREE.Mesh(new THREE.SphereGeometry(1.3,64,64), new THREE.MeshStandardMaterial({ color:0xf8fafc, roughness:.18, metalness:.02 }));
    mascotGroup.add(body);
    mascotGroup.add(new THREE.Mesh(new THREE.SphereGeometry(1.35,32,32), new THREE.MeshBasicMaterial({ color:0x3b82f6, transparent:true, opacity:.03, side:THREE.BackSide })));

    const eyeMat = new THREE.MeshBasicMaterial({ color:0x1d4ed8 });
    const eyeGeo = new THREE.SphereGeometry(.18,16,16);
    const eyeL = new THREE.Mesh(eyeGeo,eyeMat); eyeL.position.set(-.42,.22,1.15); eyeL.scale.set(.7,1,.7); body.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeo,eyeMat); eyeR.position.set(.42,.22,1.15);  eyeR.scale.set(.7,1,.7); body.add(eyeR);
    const shineMat = new THREE.MeshBasicMaterial({ color:0xffffff });
    const shineGeo = new THREE.SphereGeometry(.06,8,8);
    const shL = new THREE.Mesh(shineGeo,shineMat); shL.position.set(-.38,.32,1.28); body.add(shL);
    const shR = new THREE.Mesh(shineGeo,shineMat); shR.position.set(.46,.32,1.28);  body.add(shR);
    const smileMat = new THREE.MeshBasicMaterial({ color:0x475569 });
    for (let i=0;i<7;i++) { const a=-.6+(i/6)*1.2; const d=new THREE.Mesh(new THREE.SphereGeometry(.065,8,8),smileMat); d.position.set(Math.sin(a)*.45,-.28+Math.abs(Math.sin(a*.8))*-.18,1.2); body.add(d); }
    const blushMat = new THREE.MeshBasicMaterial({ color:0x60a5fa, transparent:true, opacity:.28 });
    const bL = new THREE.Mesh(new THREE.SphereGeometry(.28,16,16),blushMat); bL.position.set(-.75,-.1,1.05); bL.scale.z=.2; body.add(bL);
    const bR = new THREE.Mesh(new THREE.SphereGeometry(.28,16,16),blushMat); bR.position.set(.75,-.1,1.05);  bR.scale.z=.2; body.add(bR);
    const armMat = new THREE.MeshStandardMaterial({ color:0xe2e8f0, roughness:.3 });
    const armGeo = new THREE.CylinderGeometry(.18,.14,.9,16);
    const armL = new THREE.Mesh(armGeo,armMat); armL.position.set(-1.55,-.3,0); armL.rotation.z=Math.PI/3.5; mascotGroup.add(armL);
    const armR = new THREE.Mesh(armGeo,armMat); armR.position.set(1.55,-.3,0);  armR.rotation.z=-Math.PI/3.5; mascotGroup.add(armR);
    const hatGroup = new THREE.Group(); hatGroup.position.set(0,1.45,0); mascotGroup.add(hatGroup);
    const hatMat  = new THREE.MeshStandardMaterial({ color:0x0f172a, roughness:.5, metalness:.25 });
    const brimMat2= new THREE.MeshStandardMaterial({ color:0x0f172a, roughness:.4, metalness:.3, emissive:0x0f172a, emissiveIntensity:.2 });
    hatGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(.72,.72,.28,32),hatMat));
    const brimMesh = new THREE.Mesh(new THREE.BoxGeometry(2.1,.07,2.1),brimMat2); brimMesh.position.y=.18; hatGroup.add(brimMesh);
    const tasselMat = new THREE.MeshBasicMaterial({ color:0xf0ab00 });
    const tasselCord = new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,.6,8),tasselMat); tasselCord.position.set(.5,-.1,.5); hatGroup.add(tasselCord);
    const tasselBall = new THREE.Mesh(new THREE.SphereGeometry(.09,12,12),tasselMat); tasselBall.position.set(.5,-.42,.5); hatGroup.add(tasselBall);
    hatGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(.73,.73,.06,32),tasselMat));

    const HAT_BASE_Y=1.45, HAT_UP_Y=4;
    let t=0; type Phase="idle"|"liftHat"|"hold"|"returnHat"|"settle"; let phase:Phase="idle", phaseT=0;
    const curLX={val:0}, curLY={val:0};
    const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
    const easeOutBack=(x:number)=>{const c1=1.70158,c3=c1+1;return 1+c3*Math.pow(x-1,3)+c1*Math.pow(x-1,2);};
    const easeInOutCubic=(x:number)=>x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;

    const triggerGreet=()=>{
      if(phase!=="idle") return; phase="liftHat"; phaseT=0; setGreeting(true);
      if("speechSynthesis" in window){ window.speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance("Hello! Welcome to EduSahayak!"); u.rate=.9; u.pitch=1.2; window.speechSynthesis.speak(u); }
    };
    const raycaster=new THREE.Raycaster(); const mouse3=new THREE.Vector2();
    const handleClick=(e:MouseEvent)=>{ mouse3.x=(e.clientX/window.innerWidth)*2-1; mouse3.y=-(e.clientY/window.innerHeight)*2+1; raycaster.setFromCamera(mouse3,camera); if(raycaster.intersectObjects([body,brimMesh],true).length>0) triggerGreet(); };
    window.addEventListener("click",handleClick);

    const animate=()=>{
      requestAnimationFrame(animate); t+=.013; particles.rotation.y=t*.03;
      const wp=new THREE.Vector3(); mascotGroup.getWorldPosition(wp); wp.project(camera);
      const msx=((wp.x+1)/2)*window.innerWidth, msy=((1-(wp.y+1)/2))*window.innerHeight;
      const tx=Math.max(-.4,Math.min(.4,((mousePosRef.current.x-msx)/window.innerWidth)*1.2));
      const ty=Math.max(-.3,Math.min(.3,((mousePosRef.current.y-msy)/window.innerHeight)*1.0));
      curLX.val=lerp(curLX.val,tx,.06); curLY.val=lerp(curLY.val,ty,.06);
      body.rotation.y=curLX.val*.6; body.rotation.x=-curLY.val*.5;
      const ex=curLX.val*.12,ey=-curLY.val*.1;
      eyeL.position.set(-.42+ex,.22+ey,1.15); eyeR.position.set(.42+ex,.22+ey,1.15);
      shL.position.set(-.38+ex,.32+ey,1.28);  shR.position.set(.46+ex,.32+ey,1.28);
      if(phase==="idle"){
        mascotGroup.position.y=-.5+Math.sin(t)*.18; mascotGroup.rotation.z=Math.sin(t*.6)*.04;
        hatGroup.position.y=HAT_BASE_Y+Math.sin(t*1.8)*.05; hatGroup.rotation.z=Math.sin(t*.9)*.03;
        const blink=Math.sin(t*.28)>.96?.12:1; eyeL.scale.y=blink; eyeR.scale.y=blink;
        armL.rotation.z=Math.PI/3.5+Math.sin(t*.7)*.06; armR.rotation.z=-(Math.PI/3.5)-Math.sin(t*.7)*.06;
      }
      if(phase==="liftHat"){ phaseT+=.02; const p=Math.min(phaseT,1); hatGroup.position.y=lerp(HAT_BASE_Y,HAT_UP_Y,easeOutBack(p)); hatGroup.rotation.z=Math.sin(p*Math.PI)*.35; hatGroup.rotation.y+=.04; mascotGroup.position.y=-.5+Math.abs(Math.sin(phaseT*5))*.12; if(phaseT>=1){phase="hold";phaseT=0;} }
      if(phase==="hold"){ phaseT+=.02; hatGroup.position.y=HAT_UP_Y+Math.sin(phaseT*3)*.1; hatGroup.rotation.z=Math.sin(phaseT*2)*.12; armR.rotation.z=-(Math.PI/3.5)+Math.sin(phaseT*7)*.65; armR.rotation.x=Math.sin(phaseT*5)*.2; eyeL.scale.y=1.35; eyeR.scale.y=1.35; mascotGroup.position.y=-.5+Math.abs(Math.sin(phaseT*3.5))*.1; mascotGroup.rotation.y=Math.sin(phaseT*1.5)*.08; tasselBall.position.x=.5+Math.sin(phaseT*8)*.15; tasselCord.position.x=tasselBall.position.x; if(phaseT>=2.8){phase="returnHat";phaseT=0;} }
      if(phase==="returnHat"){ phaseT+=.018; const p=Math.min(phaseT,1); hatGroup.position.y=lerp(HAT_UP_Y,HAT_BASE_Y,easeInOutCubic(p)); hatGroup.rotation.z=lerp(hatGroup.rotation.z,0,.08); hatGroup.rotation.y=lerp(hatGroup.rotation.y,0,.08); armR.rotation.z=lerp(armR.rotation.z,-(Math.PI/3.5),.07); armR.rotation.x=lerp(armR.rotation.x,0,.07); eyeL.scale.y=lerp(eyeL.scale.y,1,.08); eyeR.scale.y=lerp(eyeR.scale.y,1,.08); tasselBall.position.x=lerp(tasselBall.position.x,.5,.1); tasselCord.position.x=tasselBall.position.x; if(phaseT>=1.1){phase="settle";phaseT=0;hatGroup.position.y=HAT_BASE_Y;} }
      if(phase==="settle"){ phaseT+=.03; hatGroup.position.y=HAT_BASE_Y+Math.sin(phaseT*9)*.08*Math.exp(-phaseT*2.5); mascotGroup.rotation.y=lerp(mascotGroup.rotation.y,0,.06); if(phaseT>=2.2){phase="idle";setGreeting(false);} }
      fillLight.intensity=5+Math.sin(t*2.1)*1.2; rimLight.intensity=3+Math.sin(t*1.7+1)*.8;
      renderer.render(scene,camera);
    };
    animate();
    const handleResize=()=>{ camera.aspect=window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth,window.innerHeight); };
    window.addEventListener("resize",handleResize);
    return ()=>{ window.removeEventListener("click",handleClick); window.removeEventListener("resize",handleResize); renderer?.dispose(); };
  }, [mounted]);

  const handleLogin = async () => {
    if (!email || !password) return alert("Please fill all fields");
    setLoading(true);
    try { const {error}=await supabase.auth.signInWithPassword({email,password}); if(error) throw error; router.push("/"); }
    catch(e:any){alert(e.message);} finally{setLoading(false);}
  };
  const handleSignup = async () => {
    if (!fullName.trim()) return alert("Please enter your full name");
    if (!email) return alert("Please enter your email");
    if (!password||password.length<6) return alert("Password must be at least 6 characters");
    setLoading(true);
    try { const {error}=await supabase.auth.signUp({email,password,options:{data:{full_name:fullName,role}}}); if(error) throw error; alert("Account created! Check your email to confirm, then sign in."); setMode("login"); }
    catch(e:any){alert(e.message);} finally{setLoading(false);}
  };

  if (!mounted) return null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Poppins:wght@400;500;600;700&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{overflow:hidden;cursor:${webglOk ? 'none' : 'default'};background:#0f0f23;}

        .root{
          min-height:100vh;
          background:
            radial-gradient(ellipse 150% 75% at 65% -5%, #1e1b4b 0%, transparent 58%),
            radial-gradient(ellipse 70% 55% at 0% 100%, #1a1a3a 0%, transparent 52%),
            #0f0f23;
          font-family:'Inter',sans-serif;
          display:flex;overflow:hidden;position:relative;
        }

        /* blobs */
        .blobs{position:fixed;inset:0;pointer-events:none;z-index:0;overflow:hidden;}
        .blob{position:absolute;border-radius:50%;filter:blur(110px);}
        .b1{width:650px;height:650px;background:radial-gradient(#2a2d8e,transparent 70%);top:-18%;left:-10%;opacity:.65;animation:b1 24s ease-in-out infinite alternate;}
        .b2{width:380px;height:380px;background:radial-gradient(#3b1a5e,transparent 70%);top:48%;right:-3%;opacity:.28;animation:b2 19s ease-in-out infinite alternate;}
        .b3{width:380px;height:380px;background:radial-gradient(#1e2a6f,transparent 70%);bottom:-10%;left:18%;opacity:.5;animation:b3 26s ease-in-out infinite alternate;}
        .b4{width:260px;height:260px;background:radial-gradient(#1e3a8a,transparent 70%);top:7%;right:26%;opacity:.42;animation:b4 21s ease-in-out infinite alternate;}
        @keyframes b1{to{transform:translate(40px,-30px) scale(1.04);}}
        @keyframes b2{to{transform:translate(-26px,38px) scale(.97);}}
        @keyframes b3{to{transform:translate(26px,-20px) scale(1.04);}}
        @keyframes b4{to{transform:translate(-20px,26px) scale(1.07);}}

        .dots{position:fixed;inset:0;pointer-events:none;z-index:0;background-image:radial-gradient(circle,rgba(59,130,246,.06) 1px,transparent 1px);background-size:44px 44px;mask-image:radial-gradient(ellipse 80% 80% at 50% 50%,black 20%,transparent 100%);}

        .content{position:relative;z-index:2;display:flex;width:100%;align-items:center;justify-content:space-between;padding:0 7vw;gap:52px;}

        /* ── LEFT ── */
        .branding{flex:1;max-width:500px;animation:slideL .85s cubic-bezier(.22,1,.36,1) both;}
        @keyframes slideL{from{opacity:0;transform:translateX(-36px)}to{opacity:1;transform:none}}

        .pill{display:inline-flex;align-items:center;gap:7px;padding:5px 14px;border:1px solid rgba(59,130,246,.22);border-radius:100px;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#60a5fa;background:rgba(59,130,246,.06);margin-bottom:20px;}
        .pdot{width:5px;height:5px;border-radius:50%;background:#60a5fa;animation:pu 2s ease-in-out infinite;}
        @keyframes pu{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.7);opacity:.3}}

        .title{font-family:'Poppins',sans-serif;font-size:clamp(48px,6vw,82px);font-weight:700;line-height:.9;letter-spacing:-.035em;margin-bottom:18px;background:linear-gradient(128deg,#e0e7ff 0%,#bfdbfe 30%,#93c5fd 55%,#facc15 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}

        .tag{font-size:14.5px;line-height:1.78;color:#94a3b8;max-width:380px;margin-bottom:26px;}
        .tag b{color:#60a5fa;font-weight:600;}

        .hint{display:inline-flex;align-items:center;gap:8px;padding:7px 16px;border-radius:100px;background:rgba(255,255,255,.03);border:1px solid rgba(59,130,246,.12);font-size:11.5px;font-weight:500;color:#e2e8f0;transition:all .3s;cursor:default;}
        .hint.lit{color:#60a5fa;border-color:rgba(59,130,246,.32);background:rgba(59,130,246,.06);}
        .hint span{animation:wv 2.4s ease-in-out infinite;display:inline-block;}
        @keyframes wv{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}

        .stats{display:flex;margin-top:34px;background:rgba(255,255,255,.02);border:1px solid rgba(59,130,246,.08);border-radius:16px;overflow:hidden;width:fit-content;animation:slideL .85s cubic-bezier(.22,1,.36,1) .14s both;}
        .stat{padding:14px 22px;display:flex;flex-direction:column;gap:2px;position:relative;}
        .stat+.stat::before{content:'';position:absolute;left:0;top:22%;bottom:22%;width:1px;background:rgba(59,130,246,.08);}
        .sn{font-family:'Poppins',sans-serif;font-size:22px;font-weight:700;color:#cbd5e1;line-height:1;}
        .sl{font-size:9px;color:#475569;letter-spacing:1px;text-transform:uppercase;font-weight:700;}

        /* ══════════════════════════════
           INTERNATIONAL GLASS LOGIN CARD
        ══════════════════════════════ */
        .card{
          width:360px;flex-shrink:0;
          background:linear-gradient(145deg,rgba(255,255,255,.08) 0%,rgba(99,102,241,.06) 25%,rgba(15,15,35,.88) 100%);
          backdrop-filter:blur(80px) saturate(180%) brightness(1.05);
          -webkit-backdrop-filter:blur(80px) saturate(180%) brightness(1.05);
          border:1px solid rgba(255,255,255,.14);
          border-radius:24px;
          padding:32px 28px 28px;
          box-shadow:
            0 8px 32px rgba(0,0,0,.28),
            inset 0 1px 0 rgba(255,255,255,.25),
            inset 0 -1px 0 rgba(0,0,0,.3),
            0 0 0 1px rgba(255,255,255,.06),
            0 4px 24px rgba(99,102,241,.08);
          animation:slideR .85s cubic-bezier(.22,1,.36,1) .08s both;
          position:relative;overflow:hidden;
        }
        @keyframes slideR{from{opacity:0;transform:translateX(36px)}to{opacity:1;transform:none}}

        /* top light reflection */
        .card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,rgba(255,255,255,.6) 0%,rgba(165,180,252,.3) 50%,rgba(255,255,255,.2) 100%);border-radius:24px 24px 0 0;pointer-events:none;}
        /* glass sheen effect */
        .card::after{content:'';position:absolute;top:-40%;left:-20%;width:35%;height:120%;background:linear-gradient(135deg,transparent 0%,rgba(255,255,255,.1) 30%,rgba(165,180,252,.15) 50%,rgba(255,255,255,.08) 70%,transparent 100%);border-radius:50%;transform:rotate(20deg);pointer-events:none;animation:shine 8s infinite linear;}

        @keyframes shine{0%{transform:translateX(-100%) rotate(20deg);}100%{transform:translateX(400%) rotate(20deg);}}

        .ginner{position:absolute;inset:0;border-radius:24px;pointer-events:none;background:linear-gradient(145deg,transparent 30%,rgba(0,0,20,.15) 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.1),inset 0 0 40px rgba(0,0,20,.2);}

        .rel{position:relative;z-index:1;}

        /* logo */
        .logo-row{display:flex;align-items:center;gap:9px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,.08);}
        .logo-mark{width:34px;height:34px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:16px;position:relative;box-shadow:0 4px 16px rgba(99,102,241,.4),0 0 0 1px rgba(139,92,246,.2);flex-shrink:0;}
        .logo-shine{position:absolute;top:2px;left:3px;width:8px;height:8px;border-radius:50%;background:radial-gradient(rgba(255,255,255,.7),transparent 70%);}
        .logo-text-wrap{display:flex;flex-direction:column;gap:1px;}
        .logo-name{font-family:'Poppins',sans-serif;font-size:16px;font-weight:700;color:#f8fafc;letter-spacing:-.02em;line-height:1;}
        .logo-sub{font-size:8px;color:#a1a1aa;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;}

        /* tabs */
        .tabs{display:flex;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:4px;gap:4px;margin-bottom:18px;}
        .tab{flex:1;padding:9px 12px;border:none;border-radius:10px;font-family:'Inter',sans-serif;font-size:12px;font-weight:600;cursor:pointer;transition:all .2s;background:transparent;color:#94a3b8;}
        .tab.on{background:linear-gradient(135deg,rgba(99,102,241,.4),rgba(139,92,246,.3));color:#f8fafc;box-shadow:0 0 0 1px rgba(99,102,241,.3),0 2px 12px rgba(99,102,241,.2);}

        .head{font-family:'Poppins',sans-serif;font-size:22px;font-weight:700;color:#f8fafc;margin-bottom:2px;letter-spacing:-.02em;}
        .sub{font-size:12px;color:#94a3b8;margin-bottom:18px;font-weight:400;}

        /* role */
        .roles{display:flex;gap:6px;margin-bottom:16px;}
        .rbtn{flex:1;padding:10px 8px;border-radius:12px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#94a3b8;font-family:'Inter',sans-serif;font-size:12px;font-weight:600;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:6px;}
        .rbtn:hover{background:rgba(99,102,241,.12);border-color:rgba(99,102,241,.3);color:#a5b4fc;}
        .rbtn.on{border-color:rgba(99,102,241,.5);background:linear-gradient(135deg,rgba(99,102,241,.2),rgba(139,92,246,.15));color:#e0e7ff;box-shadow:0 0 0 3px rgba(99,102,241,.15);}
        .ri{font-size:15px;}

        /* fields */
        .fg{margin-bottom:12px;}
        .lbl{display:flex;align-items:center;gap:4px;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#6b7280;margin-bottom:6px;transition:color .2s;}
        .lbl.on{color:#a5b4fc;}

        .inp{width:100%;padding:12px 14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:12px;color:#f8fafc;font-size:14px;font-family:'Inter',sans-serif;font-weight:400;outline:none;transition:all .2s;caret-color:#a5b4fc;}
        .inp::placeholder{color:#6b7280;font-weight:400;}
        .inp:focus{border-color:rgba(99,102,241,.4);background:rgba(99,102,241,.08);box-shadow:0 0 0 3px rgba(99,102,241,.15);}

        /* button */
        .btn{width:100%;padding:13px;margin-top:10px;border:none;border-radius:13px;background:linear-gradient(135deg,#4f46e5,#7c3aed,#a855f7);color:#fff;font-family:'Inter',sans-serif;font-size:14px;font-weight:600;cursor:pointer;position:relative;overflow:hidden;transition:transform .16s,box-shadow .16s;box-shadow:0 6px 24px rgba(79,70,229,.4),0 1px 0 rgba(255,255,255,.15) inset;letter-spacing:.1px;}
        .btn::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,.2),transparent 55%);opacity:0;transition:opacity .16s;}
        .btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 12px 36px rgba(79,70,229,.5),0 1px 0 rgba(255,255,255,.2) inset;}
        .btn:hover:not(:disabled)::before{opacity:1;}
        .btn:active:not(:disabled){transform:translateY(0);}
        .btn:disabled{opacity:.5;cursor:not-allowed;}

        /* switch */
        .sw{text-align:center;margin-top:14px;font-size:12px;color:#94a3b8;font-weight:400;}
        .sw button{background:none;border:none;color:#a5b4fc;font-family:'Inter',sans-serif;font-size:12px;font-weight:600;cursor:pointer;text-decoration:underline;text-underline-offset:2px;transition:color .2s;}
        .sw button:hover{color:#e0e7ff;}

        /* divider + security */
        .divr{display:flex;align-items:center;gap:10px;margin:16px 0 12px;}
        .divl{flex:1;height:1px;background:rgba(255,255,255,.08);}
        .divt{font-size:9.5px;color:#6b7280;letter-spacing:1.2px;text-transform:uppercase;font-weight:700;}

        .secr{display:flex;align-items:center;justify-content:center;gap:8px;font-size:11px;color:#6b7280;}
        .secb{background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);color:#4ade80;padding:3px 10px;border-radius:100px;font-size:10px;font-weight:700;}

        /* toast */
        .toast{position:fixed;bottom:26px;left:50%;transform:translateX(-50%) translateY(14px);background:rgba(15,15,35,.95);border:1px solid rgba(99,102,241,.2);border-radius:100px;padding:10px 24px;font-size:13px;font-weight:600;color:#e0e7ff;pointer-events:none;z-index:200;opacity:0;transition:opacity .35s,transform .35s;box-shadow:0 10px 40px rgba(0,0,0,.5),0 0 32px rgba(99,102,241,.15);display:flex;align-items:center;gap:8px;backdrop-filter:blur(24px);}
        .toast.show{opacity:1;transform:translateX(-50%) translateY(0);}
        .td{width:7px;height:7px;border-radius:50%;background:#a5b4fc;animation:pu 1.5s ease-in-out infinite;}

        /* cursor — hidden when no WebGL */
        .cg{position:fixed;pointer-events:none;z-index:9990;width:260px;height:260px;border-radius:50%;transform:translate(-50%,-50%);background:radial-gradient(circle,rgba(240,171,0,.16) 0%,rgba(240,171,0,.06) 38%,rgba(240,171,0,.015) 62%,transparent 75%);mix-blend-mode:screen;display:${webglOk ? 'block' : 'none'};}
        .cr{position:fixed;pointer-events:none;z-index:9996;width:28px;height:28px;border-radius:50%;transform:translate(-50%,-50%);border:1.5px solid rgba(240,171,0,.7);background:rgba(240,171,0,.04);box-shadow:0 0 0 3px rgba(240,171,0,.07),0 0 10px rgba(240,171,0,.5),0 0 22px rgba(240,171,0,.18);display:${webglOk ? 'block' : 'none'};}
        .cd{position:fixed;pointer-events:none;z-index:9999;width:5px;height:5px;border-radius:50%;transform:translate(-50%,-50%);background:radial-gradient(circle,#fef3c7 0%,#f0ab00 55%,#d97706 100%);box-shadow:0 0 0 1.5px rgba(240,171,0,.28),0 0 7px rgba(240,171,0,1),0 0 16px rgba(240,171,0,.65);display:${webglOk ? 'block' : 'none'};}

        /* 2D mascot fallback */
        @keyframes mascotFloat{0%,100%{transform:translateY(-50%) translateX(0);}50%{transform:translateY(calc(-50% - 16px)) translateX(4px);}}
        @keyframes mascotGlow{0%,100%{box-shadow:0 12px 48px rgba(99,102,241,0.25),0 0 0 3px rgba(99,102,241,0.1);}50%{box-shadow:0 20px 64px rgba(99,102,241,0.4),0 0 0 6px rgba(99,102,241,0.15);}}
      `}</style>

      <div className="root">
        <div className="cg" ref={glowRef} />
        <div className="cr" ref={ringRef} />
        <div className="cd" ref={dotRef}  />

        <div className="blobs">
          <div className="blob b1"/><div className="blob b2"/>
          <div className="blob b3"/><div className="blob b4"/>
        </div>
        <div className="dots"/>
        {webglOk ? (
          <canvas ref={canvasRef} style={{position:"fixed",inset:0,zIndex:1,pointerEvents:"auto"}}/>
        ) : (
          <div style={{position:"fixed",left:"13vw",top:"50%",transform:"translateY(-50%)",zIndex:2,pointerEvents:"none",display:"flex",flexDirection:"column",alignItems:"center",gap:16,animation:"mascotFloat 4s ease-in-out infinite"}}>
            <div style={{width:160,height:160,borderRadius:"50%",background:"linear-gradient(145deg,rgba(99,102,241,0.15),rgba(139,92,246,0.1))",border:"2px solid rgba(99,102,241,0.25)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:72,animation:"mascotGlow 3s ease-in-out infinite",backdropFilter:"blur(8px)"}}>🎓</div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
              <div style={{fontSize:14,color:"#e0e7ff",fontWeight:600,fontFamily:"'Poppins',sans-serif",letterSpacing:0.5}}>EduSahayak</div>
              <div style={{fontSize:10,color:"#6b7280",fontWeight:600,letterSpacing:2,textTransform:"uppercase" as const}}>AI Assistant</div>
            </div>
          </div>
        )}

        <div className="content">

          {/* LEFT */}
          <div className="branding">
            <div className="pill"><div className="pdot"/>AI-Powered Education</div>
            <h1 className="title">Edu<br/>Sahayak</h1>
            <p className="tag">Empowering educators with <b>smarter tools</b> — from lesson planning to intelligent evaluation and student insights.</p>
            <div className={`hint ${greeting?"lit":""}`}>
              <span>👆</span>
              {greeting ? "He's happy to see you! 😊" : "Click the mascot — he'll tip his hat!"}
            </div>
            <div className="stats">
              <div className="stat"><div className="sn">5+</div><div className="sl">AI Tools</div></div>
              <div className="stat"><div className="sn">100%</div><div className="sl">Free Vision</div></div>
              <div className="stat"><div className="sn">Smart</div><div className="sl">Evaluation</div></div>
            </div>
          </div>

          {/* RIGHT — International Glass Card */}
          <div className="card">
            <div className="ginner"/>
            <div className="rel">

              {/* Logo bar */}
              <div className="logo-row">
                <div className="logo-mark">
                  <div className="logo-shine"/>🎓
                </div>
                <div className="logo-text-wrap">
                  <div className="logo-name">EduSahayak</div>
                  <div className="logo-sub">Learning Platform</div>
                </div>
              </div>

              {/* Tabs */}
              <div className="tabs">
                <button className={`tab ${mode==="login"?"on":""}`} onClick={()=>setMode("login")}>Sign In</button>
                <button className={`tab ${mode==="signup"?"on":""}`} onClick={()=>setMode("signup")}>Register</button>
              </div>

              <div className="head">{mode==="login" ? "Welcome back" : "Create account"}</div>
              <div className="sub">{mode==="login" ? "Sign in to your workspace" : "Join EduSahayak for free"}</div>

              {/* Role */}
              <div className="roles">
                <button className={`rbtn ${role==="teacher"?"on":""}`} onClick={()=>setRole("teacher")}><span className="ri">👨‍🏫</span>Teacher</button>
                <button className={`rbtn ${role==="student"?"on":""}`} onClick={()=>setRole("student")}><span className="ri">🎒</span>Student</button>
              </div>

              {mode==="signup" && (
                <div className="fg">
                  <label className={`lbl ${nameFocus?"on":""}`}>Full Name</label>
                  <input className="inp" type="text"
                    placeholder={role==="teacher"?"e.g. Priya Sharma":"e.g. Ravi Kumar"}
                    value={fullName} onChange={e=>setFullName(e.target.value)}
                    onFocus={()=>setNameFocus(true)} onBlur={()=>setNameFocus(false)}/>
                </div>
              )}

              <div className="fg">
                <label className={`lbl ${emailFocus?"on":""}`}>Email</label>
                <input className="inp" type="email"
                  placeholder={role==="teacher"?"teacher@school.edu":"student@school.edu"}
                  value={email} onChange={e=>setEmail(e.target.value)}
                  onFocus={()=>setEmailFocus(true)} onBlur={()=>setEmailFocus(false)}
                  onKeyDown={e=>e.key==="Enter"&&(mode==="login"?handleLogin():handleSignup())}/>
              </div>

              <div className="fg">
                <label className={`lbl ${passFocus?"on":""}`}>{mode==="signup"?"New Password":"Password"}</label>
                <input className="inp" type="password"
                  placeholder={mode==="signup"?"Min. 6 characters":"••••••••"}
                  value={password} onChange={e=>setPassword(e.target.value)}
                  onFocus={()=>setPassFocus(true)} onBlur={()=>setPassFocus(false)}
                  onKeyDown={e=>e.key==="Enter"&&(mode==="login"?handleLogin():handleSignup())}/>
              </div>

              <button className="btn" onClick={mode==="login"?handleLogin:handleSignup} disabled={loading}>
                {loading
                  ? (mode==="login"?"Signing in…":"Creating account…")
                  : mode==="login"
                  ? `Sign in as ${role==="teacher"?"Teacher":"Student"} →`
                  : `Create ${role==="teacher"?"Teacher":"Student"} Account →`}
              </button>

              <div className="sw">
                {mode==="login"
                  ? <>No account?{" "}<button onClick={()=>setMode("signup")}>Register free</button></>
                  : <>Have an account?{" "}<button onClick={()=>setMode("login")}>Sign in</button></>}
              </div>

              <div className="divr"><div className="divl"/><div className="divt">Secure</div><div className="divl"/></div>
              <div className="secr"><span className="secb">✓ SSL</span><span>256-bit · Supabase Auth</span></div>
            </div>
          </div>
        </div>

        <div className={`toast ${greeting?"show":""}`}>
          <div className="td"/>Welcome to EduSahayak — let's teach smarter!
        </div>
      </div>
    </>
  );
}
