// helper กลางสำหรับ token / header / redirect ที่ใช้ร่วมกันหลายหน้า
// ใช้แหล่ง token เดียวกับ getAuthToken() ที่กระจายอยู่ในแต่ละหน้า:
// localStorage "token" ก่อน แล้วค่อย fallback ไป cookie token_public

export const getAuthToken = (): string => {
  if (typeof window === "undefined") return "";
  try {
    const fromStorage = localStorage.getItem("token");
    if (fromStorage) return fromStorage;
  } catch {
    // localStorage อาจถูกบล็อก (private mode) — ไปลอง cookie ต่อ
  }
  const match = document.cookie.match(/(?:^|; )token_public=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
};

// คืน header Authorization (ถ้ามี token) รวมกับ header อื่นที่ส่งมา
export const authHeaders = (
  extra: Record<string, string> = {},
): Record<string, string> => {
  const token = getAuthToken();
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

// S26: ยอมให้ redirect ได้เฉพาะ path ภายในเว็บเดียวกันเท่านั้น
// ต้องขึ้นต้นด้วย "/" แต่ห้าม "//" หรือ "/\" (protocol-relative ไปโดเมนอื่น)
// และห้ามมีอักขระควบคุม — อย่างอื่นทั้งหมด (http:, javascript:, ...) ตกไปที่ fallback
export const safeRedirectPath = (
  raw: string | null | undefined,
  fallback = "/dashboard",
): string => {
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  return raw;
};

// S27: sessionStorage key ที่ใช้เก็บ state ของ LINE OAuth
// ตั้งค่าใน /settings/notifications ก่อน redirect แล้ว /line-callback ต้องตรวจให้ตรง
export const LINE_OAUTH_STATE_KEY = "line_oauth_state";

// เปิด SSE (EventSource) แบบต่อใหม่อัตโนมัติ — แบบเดียวกับ connectSSE ใน dashboard/page.tsx
// - error ชั่วคราว (เน็ตหลุด) browser reconnect เองถ้าเราไม่ close()
// - ถ้า browser ยอมแพ้ (readyState = CLOSED เช่น backend ตอบ 401/5xx) เราต่อใหม่เองแบบ backoff 1s → สูงสุด 30s
// คืนฟังก์ชัน cleanup สำหรับใช้ตอน unmount
const SSE_RETRY_MIN_MS = 1000;
const SSE_RETRY_MAX_MS = 30000;

export const connectSSE = (
  url: string,
  handlers: {
    onMessage: (event: MessageEvent) => void;
    onOpen?: () => void;
    onError?: (event: Event) => void;
  },
): (() => void) => {
  let source: EventSource | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryDelay = SSE_RETRY_MIN_MS;
  let stopped = false;

  const open = () => {
    if (stopped) return;
    const es = new EventSource(url, { withCredentials: true });
    source = es;

    es.onopen = () => {
      retryDelay = SSE_RETRY_MIN_MS;
      handlers.onOpen?.();
    };
    es.onmessage = handlers.onMessage;
    es.onerror = (event) => {
      if (stopped) return;
      handlers.onError?.(event);
      if (es.readyState !== EventSource.CLOSED) return; // browser กำลัง reconnect เอง
      es.close();
      retryTimer = setTimeout(open, retryDelay);
      retryDelay = Math.min(retryDelay * 2, SSE_RETRY_MAX_MS);
    };
  };

  open();

  return () => {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    source?.close();
  };
};
