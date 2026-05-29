import { useEffect } from 'react';
import Swal from 'sweetalert2';
import { useRouter } from 'next/router';

// กำหนด Type สำหรับ Props
interface UnderConstructionProps {
  pageName?: string; // ใส่ ? เพื่อให้เป็น optional (ใส่หรือไม่ใส่ก็ได้)
}

export default function UnderConstruction({ pageName = "หน้านี้" }: UnderConstructionProps) {
  const router = useRouter();

  useEffect(() => {
    Swal.fire({
      title: '🚧 อยู่ระหว่างการพัฒนา',
      text: `${pageName} กำลังปรับปรุงเพื่อประสบการณ์ที่ดีขึ้นครับ`,
      icon: 'info',
      confirmButtonText: 'กลับไปหน้าหลัก',
      allowOutsideClick: false,
    }).then((result) => {
      if (result.isConfirmed) {
        router.push('/');
      }
    });
  }, [router, pageName]);

  return (
    <div style={{ textAlign: 'center', marginTop: '100px' }}>
      <h1>ขออภัยครับ</h1>
      <p>{pageName} กำลังปรับปรุงเพื่อประสบการณ์ที่ดีขึ้นครับ</p>
    </div>
  );
}