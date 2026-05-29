import Swal from 'sweetalert2';

export const useAlert = () => {
  const showEmergencyAlert = (patientName, roomNumber) => {
    return Swal.fire({
      title: '🚨 เหตุฉุกเฉิน!',
      html: `พบเสียงผิดปกติจากผู้ป่วย: <strong>${patientName}</strong><br>ห้อง: <strong>${roomNumber}</strong>`,
      icon: 'warning',
      confirmButtonText: 'รับทราบ',
      confirmButtonColor: '#d33',
      allowOutsideClick: false, // บังคับให้กดรับทราบเท่านั้น
      didOpen: () => {
        // แอบใส่เสียงเตือนตรงนี้ได้เลยถ้ามีไฟล์เสียง
        const audio = new Audio('/alert-sound.mp3');
        audio.play();
      }
    });
  };

  return { showEmergencyAlert };
};