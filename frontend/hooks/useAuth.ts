// frontend/hooks/useAuth.ts
"use client"
import { useEffect, useState } from 'react';

export function useAuth() {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch('http://localhost:8080/profile', { credentials: 'include' })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setUser(data);
        }
        // 📍 ต่อให้ Error หรือ Unauthorized เราก็สั่งให้หยุดโหลด 
        // และไม่ต้อง router.push('/') เพื่อไม่ให้มันเด้งกลับ
        setIsLoading(false); 
      })
      .catch(() => {
        setIsLoading(false);
      });
  }, []);

  return { user, isLoading };
}