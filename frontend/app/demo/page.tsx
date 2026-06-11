'use client';

import React, { useState, useCallback } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  useNodesState, 
  useEdgesState, 
  Node, 
  Edge 
} from 'reactflow';
import 'reactflow/dist/style.css';
import { 
  Mic, 
  Share2, 
  BrainCircuit, 
  Zap, 
  Database, 
  MonitorPlay, 
  FolderTree, 
  ShieldCheck,
  ArrowRight,
  Info,
  HelpCircle,
  FileCode,
  LayoutDashboard,
  Bug,
  Globe,
  Settings
} from 'lucide-react';

// --- Diagrams Data ---
const initialNodes: Node[] = [
  { id: 'esp32', data: { label: 'ESP32 (Hardware)' }, position: { x: 0, y: 150 }, style: { background: '#ef4444', color: '#fff', padding: '10px', borderRadius: '8px' } },
  { id: 'mqtt', data: { label: 'MQTT (Messenger)' }, position: { x: 200, y: 150 }, style: { background: '#3b82f6', color: '#fff', padding: '10px', borderRadius: '8px' } },
  { id: 'ai', data: { label: 'Python AI (Brain)' }, position: { x: 400, y: 50 }, style: { background: '#10b981', color: '#fff', padding: '10px', borderRadius: '8px' } },
  { id: 'go', data: { label: 'Go Backend (Manager)' }, position: { x: 600, y: 150 }, style: { background: '#8b5cf6', color: '#fff', padding: '10px', borderRadius: '8px' } },
  { id: 'web', data: { label: 'Frontend (Display)' }, position: { x: 800, y: 150 }, style: { background: '#f59e0b', color: '#fff', padding: '10px', borderRadius: '8px' } },
];

const initialEdges: Edge[] = [
  { id: 'e1', source: 'esp32', target: 'mqtt', animated: true, label: 'Send Voice' },
  { id: 'e2', source: 'mqtt', target: 'ai', animated: true, label: 'Analyze' },
  { id: 'e3', source: 'ai', target: 'go', animated: true, label: 'Report Result' },
  { id: 'e4', source: 'go', target: 'web', animated: true, label: 'Show Alert' },
];

// --- Use Case Data ---
const useCaseNodes: Node[] = [
    { id: 'elderly', data: { label: 'ผู้สูงอายุ / ผู้ป่วย' }, position: { x: 0, y: 100 }, style: { background: '#475569', color: '#fff', borderRadius: '50px', width: 150, textAlign: 'center' } },
    { id: 'uc1', data: { label: 'ร้องขอความช่วยเหลือ (Voice Shout)' }, position: { x: 250, y: 0 }, style: { borderRadius: '20px', border: '2px solid #ef4444', width: 220, textAlign: 'center', padding: '10px' } },
    { id: 'uc2', data: { label: 'เกิดอุบัติเหตุเสียงดัง (Fall Sound)' }, position: { x: 250, y: 100 }, style: { borderRadius: '20px', border: '2px solid #ef4444', width: 220, textAlign: 'center', padding: '10px' } },
    { id: 'uc3', data: { label: 'รับการแจ้งเตือนแบบ Real-time' }, position: { x: 550, y: 0 }, style: { borderRadius: '20px', border: '2px solid #3b82f6', width: 220, textAlign: 'center', padding: '10px' } },
    { id: 'uc4', data: { label: 'ดูประวัติเหตุการณ์ย้อนหลัง' }, position: { x: 550, y: 100 }, style: { borderRadius: '20px', border: '2px solid #3b82f6', width: 220, textAlign: 'center', padding: '10px' } },
    { id: 'uc5', data: { label: 'จัดการอุปกรณ์และโปรไฟล์' }, position: { x: 550, y: 200 }, style: { borderRadius: '20px', border: '2px solid #3b82f6', width: 220, textAlign: 'center', padding: '10px' } },
    { id: 'admin', data: { label: 'ผู้ดูแล / Admin' }, position: { x: 850, y: 100 }, style: { background: '#475569', color: '#fff', borderRadius: '50px', width: 150, textAlign: 'center' } },
];

const useCaseEdges: Edge[] = [
    { id: 'ue1', source: 'elderly', target: 'uc1' },
    { id: 'ue2', source: 'elderly', target: 'uc2' },
    { id: 'ua1', source: 'uc3', target: 'admin' },
    { id: 'ua2', source: 'uc4', target: 'admin' },
    { id: 'ua3', source: 'uc5', target: 'admin' },
];

// --- Helper Components ---

const StepCard = ({ number, title, desc, tech, icon: Icon, colorClass }: any) => (
    <div className="relative p-6 bg-slate-800/40 rounded-2xl border border-slate-700 hover:border-slate-500 transition-all group">
        <div className={`absolute -top-4 -left-4 w-10 h-10 ${colorClass} rounded-full flex items-center justify-center font-bold text-white shadow-lg`}>
            {number}
        </div>
        <div className="flex items-start gap-4">
            <div className={`p-3 rounded-xl bg-slate-900 ${colorClass.replace('bg-', 'text-')}`}>
                <Icon size={24} />
            </div>
            <div className="space-y-2">
                <h3 className="text-xl font-bold text-white">{title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
                <div className="flex flex-wrap gap-2 pt-2">
                    {tech.map((t: string) => (
                        <span key={t} className="text-[10px] font-mono bg-slate-900 px-2 py-1 rounded border border-slate-700 text-slate-300">
                            {t}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    </div>
);

const SectionTitle = ({ title, sub, icon: Icon }: any) => (
    <div className="space-y-2 mb-10">
        <div className="flex items-center gap-3 text-blue-400">
            {Icon && <Icon size={28} />}
            <h2 className="text-3xl font-black uppercase tracking-tight">{title}</h2>
        </div>
        <p className="text-slate-500 font-medium">{sub}</p>
    </div>
);

export default function DemoPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [logs, setLogs] = useState<{time: string, msg: string, type: string}[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);

  const addLog = (msg: string, type: string = 'info') => {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    setLogs(prev => [{time, msg, type}, ...prev].slice(0, 8));
  };

  const startSimulation = () => {
    if (isSimulating) return;
    setIsSimulating(true);
    setLogs([]);
    
    addLog("1. [Hardware] ESP32 ตรวจพบเสียงดังผิดปกติ...", 'info');
    setTimeout(() => {
        addLog("2. [Network] ส่งไฟล์เสียง PCM 16kHz ไปยัง MQTT Broker", 'info');
        setTimeout(() => {
            addLog("3. [AI] Python กำลังทำ Speech Classification (BCResNet)", 'warning');
            setTimeout(() => {
                addLog("4. [AI] ผลวิเคราะห์: พบเสียงขอความช่วยเหลือ (98%)!", 'success');
                setTimeout(() => {
                    addLog("5. [Backend] Go บันทึกเหตุการณ์และส่ง WebSocket", 'info');
                    setTimeout(() => {
                        addLog("6. [Frontend] เด้งหน้าจอแจ้งเตือนสีแดงทันที!", 'error');
                        setIsSimulating(false);
                    }, 800);
                }, 800);
            }, 1000);
        }, 800);
    }, 800);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 font-sans selection:bg-blue-500/30">
      
      {/* --- HERO SECTION --- */}
      <header className="relative py-24 px-6 overflow-hidden border-b border-slate-900">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-blue-500/5 blur-[120px] -z-10"></div>
        <div className="max-w-6xl mx-auto text-center space-y-6">
            <h1 className="text-5xl md:text-7xl font-black text-white leading-tight">
                AI Emergency <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">Voice Rescuer</span>
            </h1>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
                เรียนรู้การทำงานของระบบตรวจจับเสียงฉุกเฉิน ตั้งแต่ฮาร์ดแวร์ไปจนถึงคลาวด์ 
                แบบ Step-by-Step สำหรับนักพัฒนาเริ่มต้น
            </p>
            <div className="flex flex-wrap justify-center gap-4 pt-8">
                <button onClick={startSimulation} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-2xl font-bold transition-all shadow-xl shadow-blue-500/20 flex items-center gap-2">
                    <Zap size={20} /> เริ่มการสาธิตการทำงาน
                </button>
                <a href="/dashboard" className="bg-slate-800 hover:bg-slate-700 text-white px-8 py-4 rounded-2xl font-bold transition-all flex items-center gap-2">
                    <LayoutDashboard size={20} /> เข้าสู่หน้า Dashboard จริง
                </a>
            </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-20 space-y-32">

        {/* --- PART 1: THE PROBLEM --- */}
        <section>
            <SectionTitle 
                title="1. ปัญหาที่เราต้องการแก้" 
                sub="ทำไมโปรเจกต์นี้ถึงสำคัญต่อผู้สูงอายุ?" 
                icon={HelpCircle} 
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="bg-red-500/5 border border-red-500/20 p-8 rounded-3xl space-y-4">
                    <h3 className="text-xl font-bold text-red-400 flex items-center gap-2">
                        <Bug size={20} /> ปัญหาเดิมๆ (The Pain)
                    </h3>
                    <ul className="space-y-4 text-slate-400">
                        <li className="flex gap-3">
                            <span className="text-red-500 font-bold">•</span>
                            <span>เมื่อผู้สูงอายุล้ม มักจะเอื้อมไม่ถึงปุ่มกดฉุกเฉิน</span>
                        </li>
                        <li className="flex gap-3">
                            <span className="text-red-500 font-bold">•</span>
                            <span>การรอให้มีคนมาเห็นอาจใช้เวลานานหลายชั่วโมง ซึ่งอันตรายมาก</span>
                        </li>
                        <li className="flex gap-3">
                            <span className="text-red-500 font-bold">•</span>
                            <span>กล้องวงจรปิดต้องการคนมาคอยนั่งดูตลอดเวลา ซึ่งทำได้ยาก</span>
                        </li>
                    </ul>
                </div>
                <div className="bg-emerald-500/5 border border-emerald-500/20 p-8 rounded-3xl space-y-4">
                    <h3 className="text-xl font-bold text-emerald-400 flex items-center gap-2">
                        <ShieldCheck size={20} /> ทางแก้ของเรา (The Solution)
                    </h3>
                    <p className="text-slate-400 leading-relaxed">
                        เราเปลี่ยน <strong>&quot;เสียงร้อง&quot;</strong> ให้เป็นการ <strong>&quot;แจ้งเตือน&quot;</strong> ทันที 
                        โดยใช้ AI คอยเฝ้าฟังเสียงขอความช่วยเหลือตลอด 24 ชม. ไม่ต้องใช้ปุ่มกด 
                        ไม่ต้องใช้คนเฝ้าหน้าจอ ระบบจะทำงานโดยอัตโนมัติ 100%
                    </p>
                </div>
            </div>
        </section>

        {/* --- PART 2: THE JOURNEY OF VOICE --- */}
        <section>
            <SectionTitle 
                title="2. การเดินทางของเสียง" 
                sub="เมื่อเกิดเหตุฉุกเฉิน ข้อมูลวิ่งไปที่ไหนบ้าง?" 
                icon={Share2} 
            />
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 relative">
                {/* Step 1 */}
                <StepCard 
                    number="1"
                    title="บันทึกเสียง (Hardware)"
                    desc="ESP32 ใช้ไมโครโฟน I2S บันทึกเสียงรอบข้าง 16,000 ครั้งต่อวินาที (16kHz) และส่งเป็นข้อมูลดิจิทัล"
                    tech={['C++', 'ESP32', 'I2S Mic', 'WiFi']}
                    icon={Mic}
                    colorClass="bg-red-500"
                />
                {/* Step 2 */}
                <StepCard 
                    number="2"
                    title="ส่งข้อมูล (Network)"
                    desc="ข้อมูลเสียงจะถูกส่งผ่านโปรโตคอล MQTT ซึ่งรวดเร็วและใช้พลังงานต่ำมาก เหมาะกับอุปกรณ์ขนาดเล็ก"
                    tech={['MQTT', 'Mosquitto', 'Binary Data']}
                    icon={Share2}
                    colorClass="bg-blue-500"
                />
                {/* Step 3 */}
                <StepCard 
                    number="3"
                    title="วิเคราะห์ด้วย AI (Brain)"
                    desc="Python Server รับเสียงมาแปลงเป็นภาพสเปกตรัม และใช้ Deep Learning ตัดสินว่าเป็นเสียงขอความช่วยเหลือจริงไหม"
                    tech={['Python', 'FastAPI', 'PyTorch', 'BCResNet']}
                    icon={BrainCircuit}
                    colorClass="bg-emerald-500"
                />
                {/* Step 4 */}
                <StepCard 
                    number="4"
                    title="จัดการข้อมูล (API)"
                    desc="Go Backend รับผลวิเคราะห์มาบันทึกลงฐานข้อมูล และเตรียมส่งแจ้งเตือนไปยังผู้ใช้"
                    tech={['Go', 'Fiber', 'PostgreSQL', 'JWT']}
                    icon={Database}
                    colorClass="bg-purple-500"
                />
                {/* Step 5 */}
                <StepCard 
                    number="5"
                    title="แจ้งเตือน (Display)"
                    desc="Next.js รับข้อมูลผ่าน WebSocket ทำให้หน้าเว็บเด้งเตือนทันทีโดยไม่ต้อง Refresh"
                    tech={['Next.js', 'React', 'WebSocket', 'Tailwind']}
                    icon={MonitorPlay}
                    colorClass="bg-amber-500"
                />
                
                {/* Simulation Log Overlay */}
                <div className="bg-black/80 rounded-3xl border border-slate-700 p-6 font-mono text-sm overflow-hidden flex flex-col h-[280px]">
                    <div className="text-blue-400 font-bold mb-4 flex items-center gap-2 border-b border-slate-800 pb-2">
                        <Zap size={16} /> LIVE SIMULATION LOGS
                    </div>
                    <div className="flex-1 space-y-2 overflow-y-auto">
                        {logs.map((log, i) => (
                            <div key={i} className={`flex gap-3 ${
                                log.type === 'success' ? 'text-emerald-400' : 
                                log.type === 'warning' ? 'text-amber-400' : 
                                log.type === 'error' ? 'text-red-400' : 'text-slate-400'
                            }`}>
                                <span className="opacity-40">[{log.time}]</span>
                                <span>{log.msg}</span>
                            </div>
                        ))}
                        {logs.length === 0 && <div className="text-slate-600 italic">กดปุ่ม &quot;เริ่มการสาธิต&quot; ด้านบนเพื่อดู Flow...</div>}
                    </div>
                </div>
            </div>
        </section>

        {/* --- PART 3: ARCHITECTURE DIAGRAM --- */}
        <section className="space-y-10">
            <SectionTitle 
                title="3. แผนผังระบบ (System Architecture)" 
                sub="คุณสามารถลากสลับตำแหน่งบล็อกได้อิสระเพื่อความเข้าใจ" 
                icon={Globe} 
            />
            <div className="h-[500px] bg-slate-900/50 rounded-3xl border border-slate-800 overflow-hidden shadow-inner">
                <ReactFlow 
                  nodes={nodes} 
                  edges={edges} 
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  fitView
                >
                    <Background color="#1e293b" gap={20} />
                    <Controls />
                </ReactFlow>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-5 bg-slate-800/30 rounded-2xl border border-slate-800">
                    <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                        <Settings size={16} className="text-blue-400" /> ทำไมต้องแยกส่วน?
                    </h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                        การแยก Service (Microservices) ช่วยให้เราเลือกภาษาที่เก่งเฉพาะด้านได้ เช่น Python เก่ง AI, Go เก่งระบบหลังบ้านที่รวดเร็ว
                    </p>
                </div>
                <div className="p-5 bg-slate-800/30 rounded-2xl border border-slate-800">
                    <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                        <Zap size={16} className="text-amber-400" /> ทำไมต้อง WebSocket?
                    </h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                        เพื่อให้หน้าเว็บได้รับการอัปเดตแบบ Real-time ทันทีที่ AI พบเหตุร้าย โดยไม่ต้องกด F5 หรือ Refresh หน้าจอ
                    </p>
                </div>
                <div className="p-5 bg-slate-800/30 rounded-2xl border border-slate-800">
                    <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                        <ShieldCheck size={16} className="text-emerald-400" /> ความปลอดภัย
                    </h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                        เราใช้ JWT (JSON Web Token) ในการยืนยันตัวตน เพื่อให้มั่นใจว่ามีเฉพาะผู้ดูแลที่ได้รับอนุญาตเท่านั้นที่เข้าถึงข้อมูลได้
                    </p>
                </div>
            </div>
        </section>

        {/* --- PART 4: USE CASE DIAGRAM --- */}
        <section className="space-y-10">
            <SectionTitle 
                title="4. ใครทำอะไรได้บ้าง? (Use Case)" 
                sub="ทำความเข้าใจบทบาทของผู้ใช้งานและระบบ" 
                icon={ShieldCheck} 
            />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div className="lg:col-span-2 h-[400px] bg-slate-900/50 rounded-3xl border border-slate-800 overflow-hidden shadow-inner">
                    <ReactFlow 
                      nodes={useCaseNodes} 
                      edges={useCaseEdges} 
                      fitView
                    >
                        <Background color="#1e293b" variant={'dots' as any} gap={20} />
                    </ReactFlow>
                </div>
                <div className="space-y-6">
                    <div className="p-6 bg-slate-800/30 rounded-2xl border border-slate-800">
                        <h4 className="font-bold text-red-400 mb-3 uppercase text-xs tracking-widest">Elderly Side</h4>
                        <p className="text-sm text-slate-400 leading-relaxed">
                            <strong>ร้องขอความช่วยเหลือ:</strong> ผู้สูงอายุเพียงแค่ส่งเสียง ระบบจะตรวจจับคำสำคัญหรือระดับเสียงที่ผิดปกติโดยอัตโนมัติ
                        </p>
                    </div>
                    <div className="p-6 bg-slate-800/30 rounded-2xl border border-slate-800">
                        <h4 className="font-bold text-blue-400 mb-3 uppercase text-xs tracking-widest">Caregiver Side</h4>
                        <p className="text-sm text-slate-400 leading-relaxed">
                            <strong>เฝ้าระวัง 24 ชม:</strong> ผู้ดูแลจะได้รับ Alert ทันทีที่มีเหตุร้าย และสามารถตรวจสอบประวัติย้อนหลังเพื่อวิเคราะห์อาการป่วยได้
                        </p>
                    </div>
                </div>
            </div>
        </section>

        {/* --- PART 5: FOLDER STRUCTURE --- */}
        <section>
            <SectionTitle 
                title="5. โครงสร้างโปรเจกต์ (Folder Structure)" 
                sub="สำหรับมือใหม่: โค้ดแต่ละส่วนอยู่ที่ไหน?" 
                icon={FolderTree} 
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
                <div className="bg-black/40 p-8 rounded-3xl border border-slate-800 font-mono text-sm space-y-2">
                    <div className="text-blue-400">/ai-emergency-voice-rescuer</div>
                    <div className="pl-4">├── <span className="text-red-400">esp32/</span> <span className="text-slate-600"># โค้ดภาษา C++ สำหรับตัวเครื่อง</span></div>
                    <div className="pl-4">├── <span className="text-emerald-400">backend_ai/</span> <span className="text-slate-600"># โค้ด Python สำหรับวิเคราะห์เสียง</span></div>
                    <div className="pl-4">├── <span className="text-purple-400">go_backend/</span> <span className="text-slate-600"># โค้ดภาษา Go สำหรับระบบจัดการ</span></div>
                    <div className="pl-4">├── <span className="text-amber-400">frontend/</span> <span className="text-slate-600"># โค้ด Next.js สำหรับหน้าจอเว็บ</span></div>
                    <div className="pl-4">└── <span className="text-blue-400">mosquitto/</span> <span className="text-slate-600"># การตั้งค่า MQTT Broker</span></div>
                </div>
                <div className="space-y-6">
                    <div className="flex gap-4">
                        <div className="p-3 h-fit rounded-xl bg-blue-500/10 text-blue-400"><FileCode size={20} /></div>
                        <div>
                            <h4 className="font-bold text-white mb-1">Mono-repo Strategy</h4>
                            <p className="text-sm text-slate-500">เราเก็บทุกอย่างไว้ในที่เดียวเพื่อให้ง่ายต่อการพัฒนาและเชื่อมต่อระหว่าง Service ต่างๆ</p>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <div className="p-3 h-fit rounded-xl bg-emerald-500/10 text-emerald-400"><BrainCircuit size={20} /></div>
                        <div>
                            <h4 className="font-bold text-white mb-1">Model Location</h4>
                            <p className="text-sm text-slate-500">ไฟล์สมองกล AI (.pth) จะถูกเก็บไว้ใน `backend_ai/models/` เพื่อรอให้ Python เรียกใช้งาน</p>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        {/* --- FOOTER --- */}
        <footer className="text-center py-20 border-t border-slate-900 space-y-6">
            <p className="text-slate-500 text-sm">
                สร้างขึ้นด้วยความตั้งใจเพื่อยกระดับความปลอดภัยให้กับสังคม <br />
                © 2026 AI Emergency Voice Rescuer Project
            </p>
            <div className="flex justify-center gap-4 opacity-50">
                <span className="text-[10px] border border-slate-800 px-2 py-1 rounded">DOCKER READY</span>
                <span className="text-[10px] border border-slate-800 px-2 py-1 rounded">IOT CONNECTED</span>
                <span className="text-[10px] border border-slate-800 px-2 py-1 rounded">AI POWERED</span>
            </div>
        </footer>

      </main>
    </div>
  );
}
