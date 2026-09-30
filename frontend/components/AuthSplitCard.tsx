import Link from "next/link";

// การ์ดสองฝั่งของหน้าลืมรหัสผ่าน / ตั้งรหัสผ่านใหม่ — ดีไซน์เดียวกับหน้า /login
// ซ้าย = ฟอร์ม, ขวา = แผงไล่สีพร้อมคำอธิบายขั้นตอนและปุ่มกลับไปเข้าสู่ระบบ
// จอเล็กซ่อนแผงขวา แล้วโชว์ลิงก์กลับหน้าเข้าสู่ระบบใต้ฟอร์มแทน
export default function AuthSplitCard({
  title,
  subtitle,
  panelTitle,
  panelText,
  steps,
  activeStep,
  children,
}: {
  title: string;
  subtitle: string;
  panelTitle: string;
  panelText: string;
  steps: string[];
  activeStep: number;
  children: React.ReactNode;
}) {
  return (
    <div className="neu-surface relative min-h-screen flex items-center justify-center p-4 md:p-8 overflow-hidden font-sans transition-colors duration-300">
      <div className="neu-card relative z-10 w-full max-w-[900px] md:min-h-[540px] overflow-hidden grid md:grid-cols-2">
        {/* ฟอร์ม */}
        <div className="flex flex-col justify-center px-8 md:px-12 py-10">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold neu-text mb-1">Emergency Voice Rescuer</h1>
            <h2 className="text-3xl font-extrabold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              {title}
            </h2>
            <p className="mt-3 text-sm neu-text-muted leading-relaxed">{subtitle}</p>
          </div>

          {children}

          <Link
            href="/login"
            className="md:hidden mt-8 inline-flex items-center justify-center gap-2 min-h-11 text-sm font-semibold text-[var(--tb-primary-text)] hover:underline"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            กลับไปหน้าเข้าสู่ระบบ
          </Link>
        </div>

        {/* แผงไล่สี */}
        <div className="hidden md:flex flex-col justify-center items-center px-12 py-10 text-center text-white bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600">
          <span className="inline-flex items-center justify-center w-16 h-16 mb-6 rounded-full bg-white/15 ring-1 ring-white/30">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="7.5" cy="15.5" r="5.5" />
              <path d="m21 2-9.6 9.6" />
              <path d="m15.5 7.5 3 3L22 7l-3-3" />
            </svg>
          </span>
          <h2 className="text-4xl font-extrabold mb-4 drop-shadow-md">{panelTitle}</h2>
          <p className="mb-8 text-indigo-100 leading-relaxed">{panelText}</p>

          {/* ขั้นตอนของระบบ — ขั้นที่อยู่ตอนนี้เป็นวงกลมสีขาวทึบ */}
          <ol className="w-full max-w-xs mb-10 space-y-3 text-left">
            {steps.map((step, i) => {
              const n = i + 1;
              const done = n < activeStep;
              const current = n === activeStep;
              return (
                <li key={step} className="flex items-center gap-3" aria-current={current ? "step" : undefined}>
                  <span
                    className={`inline-flex items-center justify-center w-8 h-8 shrink-0 rounded-full text-sm font-bold ${
                      current
                        ? "bg-white text-indigo-700"
                        : done
                          ? "bg-white/30 text-white"
                          : "ring-1 ring-white/50 text-white/80"
                    }`}
                  >
                    {done ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      n
                    )}
                  </span>
                  <span className={`text-sm ${current ? "font-bold text-white" : "text-indigo-100"}`}>{step}</span>
                </li>
              );
            })}
          </ol>

          <Link
            href="/login"
            className="px-10 py-3 rounded-full border-2 border-white/50 hover:bg-white hover:text-indigo-600 transition-all font-bold tracking-wide"
          >
            เข้าสู่ระบบ
          </Link>
        </div>
      </div>
    </div>
  );
}

// ขั้นตอนของระบบลืมรหัสผ่าน — หน้า /forgot-password อยู่ขั้น 1 (ส่งแล้วเป็นขั้น 2), /reset-password อยู่ขั้น 3
export const RESET_STEPS = ["กรอกอีเมลที่ใช้สมัคร", "เปิดลิงก์ที่ส่งไปทางอีเมล", "ตั้งรหัสผ่านใหม่"];

// ปุ่มหลักและกล่องข้อความ ใช้ร่วมกันทั้งสองหน้า ให้หน้าตาตรงกับหน้า /login
export const AUTH_SUBMIT_CLASS =
  "w-full py-3.5 mt-2 inline-flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-bold hover:shadow-lg hover:shadow-purple-500/30 transition-all hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none";

export const AUTH_LABEL_CLASS = "text-xs font-semibold neu-text-muted ml-1 mb-1 block";

export const AUTH_INPUT_CLASS =
  "neu-input w-full px-4 py-3 dark:placeholder-slate-400 outline-none transition-all text-sm";

export function AuthAlert({ tone, children }: { tone: "success" | "error"; children: React.ReactNode }) {
  const toneClass =
    tone === "success"
      ? "bg-green-50 text-green-700 border-green-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20"
      : "bg-red-50 text-red-600 border-red-100 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/20";
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`mb-4 p-3 text-sm rounded-lg border text-center font-medium ${toneClass}`}
    >
      {children}
    </div>
  );
}

export function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
