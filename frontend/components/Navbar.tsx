import Link from 'next/link';

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 lucid-glass border-b border-white/20">
      <div className="max-w-7xl mx-auto px-10 py-5 flex items-center justify-between">
        {/* Logo & Title */}
        <div className="flex items-center gap-4">
          <div className="size-10 bg-primary flex items-center justify-center rounded-xl text-white shadow-lg shadow-primary/20">
            <span className="material-symbols-outlined text-2xl">shield_with_heart</span>
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-semibold tracking-tight">Guardian AI</h2>
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          <Link href="/dashboard" className="text-sm font-semibold text-primary border-b-2 border-primary pb-1">
            แผงควบคุม
          </Link>
          <Link href="/history" className="text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
            ประวัติ
          </Link>
          <Link href="/devices" className="text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
            อุปกรณ์
          </Link>
          <Link href="/settings" className="text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
            การตั้งค่า
          </Link>
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/30 border border-white/40">
            <span className="size-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></span>
            <span className="text-xs text-gray-700 uppercase tracking-wider font-semibold">ระบบปลอดภัย</span>
          </div>
          <button className="p-2.5 rounded-full hover:bg-white/40 transition-colors">
            <span className="material-symbols-outlined text-2xl opacity-70">notifications</span>
          </button>
          <Link href="/settings" className="p-2.5 rounded-full hover:bg-white/40 transition-colors">
            <span className="material-symbols-outlined text-2xl opacity-70">settings</span>
          </Link>
          {/* Profile Picture */}
          <div 
            className="size-9 rounded-full bg-cover bg-center ml-2 border-2 border-white/50 shadow-sm"
            style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuD9PXJ7SVhlwFAS3H_ri9Sjb45-2so862RjxIQrYZk9QN0BnM-KlbpSyP_8ZmEs8hUXJYpHPYyAq0rClLJJwqg--XzIAeAMDr7LOQarZMYkk5_Abs8-rHxFf70wfCmBVkxIQDjvfL5pJhheVJRtOeLjxQXNRLQCSx58BzQikS_SuVS_YWA-gbcYNc06zDl78tnZ6I0hzHbBOwsqFTTUhijZRAcYcgbgeeMVwh49Je2wVO15dYrku9lsydytelEP7LfTTVtuOSlV-xM")' }}
          />
        </div>
      </div>
    </header>
  );
}