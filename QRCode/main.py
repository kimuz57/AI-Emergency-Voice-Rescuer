import os
import qrcode
from PIL import Image, ImageDraw, ImageFont

def generate_wifi_qr_with_text(ssid, password, original_mac, filename):
    # 1. จัดโครงสร้างข้อมูล Wi-Fi
    wifi_data = f"WIFI:S:{ssid};T:WPA;P:{password};H:false;;"
    
    # 2. สร้าง QR Code
    qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=10, border=4)
    qr.add_data(wifi_data)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white").convert('RGB')
    
    # 3. เตรียมข้อความ 2 บรรทัด (SSID และ MAC Address)
    text1 = f"SSID: {ssid}"
    text2 = f"MAC: {original_mac}"
    
    # 4. สร้างผืนผ้าใบใหม่ 
    qr_width, qr_height = qr_img.size
    text_padding = 120  # 🌟 เพิ่มพื้นที่สีขาวด้านล่างเป็น 120 เผื่อที่ให้ข้อความ
    new_height = qr_height + text_padding
    new_img = Image.new('RGB', (qr_width, new_height), 'white')
    new_img.paste(qr_img, (0, 0))
    
    # 5. วาดข้อความ
    draw = ImageDraw.Draw(new_img)
    try:
        font = ImageFont.truetype("arial.ttf", 24) 
    except IOError:
        font = ImageFont.load_default()
        print("⚠️ หาฟอนต์ arial.ttf ไม่เจอ ระบบจะใช้ฟอนต์พื้นฐานแทน")
        
    # คำนวณความกว้างข้อความ
    try:
        bbox1 = draw.textbbox((0, 0), text1, font=font)
        text1_width = bbox1[2] - bbox1[0]
        bbox2 = draw.textbbox((0, 0), text2, font=font)
        text2_width = bbox2[2] - bbox2[0]
    except AttributeError:
        text1_width, _ = draw.textsize(text1, font=font)
        text2_width, _ = draw.textsize(text2, font=font)
        
    # 🌟 ปรับระยะห่างระหว่าง 2 บรรทัดให้ห่างกันมากขึ้น
    draw.text(((qr_width - text1_width) / 2, qr_height + 15), text1, fill="black", font=font)
    
    # 🌟 ขยับบรรทัดที่ 2 ลงมาที่ตำแหน่ง +65 (ห่างจากบรรทัดแรก 50 พิกเซล)
    draw.text(((qr_width - text2_width) / 2, qr_height + 65), text2, fill="gray", font=font)
    
    # 6. บันทึกไฟล์
    new_img.save(filename)
def process_mac_file(input_file="mac_addresses.txt", output_folder="output_qr"):
    # ตรวจสอบว่ามีไฟล์หรือไม่
    if not os.path.exists(input_file):
        print(f"❌ ไม่พบไฟล์ {input_file} โปรดสร้างไฟล์และใส่ MAC Address ก่อน")
        return
        
    # สร้างโฟลเดอร์สำหรับเก็บ QR Code ถ้ายังไม่มี
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)
        
    # อ่านข้อมูลจากไฟล์
    with open(input_file, 'r', encoding='utf-8') as f:
        data = f.read()
        
    # แยกข้อมูลด้วยลูกน้ำ (,) และลบช่องว่าง
    mac_list = [mac.strip() for mac in data.split(',') if mac.strip()]
    
    print(f"🔍 พบ MAC Address ทั้งหมด {len(mac_list)} รายการ กำลังดำเนินการ...")
    
    success_count = 0
    for mac in mac_list:
        # ตัดเครื่องหมาย : ออกให้เหลือแค่ตัวอักษร 12 ตัว (ทำเป็นพิมพ์ใหญ่เพื่อความสวยงาม)
        clean_mac = mac.replace(":", "").replace("-", "").upper()
        
        if len(clean_mac) != 12:
            print(f"⚠️ ข้ามรายการ: '{mac}' (รูปแบบไม่ถูกต้อง)")
            continue
            
        # ดึง 6 ตัวหน้า และ 6 ตัวหลัง
        first_6 = clean_mac[:6]
        last_6 = clean_mac[-6:]
        
        # สร้างชื่อ SSID และ Password ตามที่กำหนด
        ssid = f"Smartvoice-{last_6}"
        password = f"SV_{first_6}"
        
        # ตั้งชื่อไฟล์รูปตาม MAC
        filename = os.path.join(output_folder, f"QR_{clean_mac}.png")
        
        # เรียกใช้ฟังก์ชันสร้างรููป
        generate_wifi_qr_with_text(ssid, password, mac, filename)
        print(f"✅ สร้างสำเร็จ: {filename} (SSID: {ssid}, PASS: {password})")
        success_count += 1
        
    print(f"🎉 เสร็จสมบูรณ์! สร้าง QR Code ทั้งหมด {success_count} รูป เก็บไว้ในโฟลเดอร์ '{output_folder}'")

# เริ่มการทำงาน
if __name__ == "__main__":
    process_mac_file()