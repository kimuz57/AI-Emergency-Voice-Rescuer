// ฟังก์ชันสำหรับตัดรูปจากพิกัด (นำไปใช้งานได้เลย ไม่ต้องแก้ครับ)
export const getCroppedImg = async (imageSrc, pixelCrop) => {
  const image = new Image();
  image.src = imageSrc;
  
  // รอให้รูปโหลดเสร็จ
  await new Promise((resolve) => {
    image.onload = resolve;
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  // แปลง Canvas เป็นไฟล์ Blob เพื่อเตรียมอัปโหลด
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      // สร้างเป็น File object เพื่อให้เข้ากับระบบเดิมของคุณ
      const file = new File([blob], 'cropped_image.jpg', { type: 'image/jpeg' });
      resolve(file);
    }, 'image/jpeg');
  });
};