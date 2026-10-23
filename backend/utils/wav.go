package utils

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
)

var (
	ErrNotWAV   = errors.New("not a RIFF/WAVE file")
	ErrNotPCM16 = errors.New("WAV is not 16-bit PCM")
)

// maxWAVHeaderScan จำกัดจำนวน byte ที่อ่านเพื่อหา chunk "fmt " และ "data" (กันไฟล์ที่มี chunk แปลก ๆ ยาว ๆ)
const maxWAVHeaderScan = 64 << 10

// WAVInfo ข้อมูลจาก chunk "fmt " ของไฟล์ที่ผ่านการตรวจ
type WAVInfo struct {
	Channels   uint16
	SampleRate uint32
}

// ValidatePCM16WAV อ่านหัวไฟล์แล้วตรวจว่าเป็น RIFF/WAVE ที่เก็บเสียงแบบ PCM 16 บิต
// (format tag 1 หรือ WAVE_FORMAT_EXTENSIBLE ที่ sub-format เป็น PCM) และมี chunk "data" ตามหลัง "fmt "
// อ่านไม่เกิน maxWAVHeaderScan byte — ไม่ได้อ่านข้อมูลเสียงทั้งไฟล์
func ValidatePCM16WAV(r io.Reader) (WAVInfo, error) {
	var info WAVInfo
	lr := io.LimitReader(r, maxWAVHeaderScan)

	var riff [12]byte
	if _, err := io.ReadFull(lr, riff[:]); err != nil {
		return info, ErrNotWAV
	}
	if string(riff[0:4]) != "RIFF" || string(riff[8:12]) != "WAVE" {
		return info, ErrNotWAV
	}

	haveFmt := false
	for {
		var hdr [8]byte
		if _, err := io.ReadFull(lr, hdr[:]); err != nil {
			return info, fmt.Errorf("%w: missing fmt/data chunk", ErrNotWAV)
		}
		id := string(hdr[0:4])
		size := binary.LittleEndian.Uint32(hdr[4:8])

		switch id {
		case "fmt ":
			if size < 16 || size > 64 {
				return info, fmt.Errorf("%w: bad fmt chunk size %d", ErrNotWAV, size)
			}
			body := make([]byte, size+size%2) // chunk ขนาดคี่มี byte เติมท้าย 1 byte
			if _, err := io.ReadFull(lr, body); err != nil {
				return info, fmt.Errorf("%w: truncated fmt chunk", ErrNotWAV)
			}
			format := binary.LittleEndian.Uint16(body[0:2])
			info.Channels = binary.LittleEndian.Uint16(body[2:4])
			info.SampleRate = binary.LittleEndian.Uint32(body[4:8])
			bits := binary.LittleEndian.Uint16(body[14:16])
			if format == 0xFFFE && size >= 26 {
				format = binary.LittleEndian.Uint16(body[24:26]) // sub-format GUID ขึ้นต้นด้วย format tag
			}
			if format != 1 || bits != 16 {
				return info, ErrNotPCM16
			}
			if info.Channels == 0 || info.SampleRate == 0 {
				return info, fmt.Errorf("%w: zero channels or sample rate", ErrNotWAV)
			}
			haveFmt = true
		case "data":
			if !haveFmt {
				return info, fmt.Errorf("%w: data chunk before fmt", ErrNotWAV)
			}
			return info, nil
		default:
			if _, err := io.CopyN(io.Discard, lr, int64(size)+int64(size%2)); err != nil {
				return info, fmt.Errorf("%w: truncated %q chunk", ErrNotWAV, id)
			}
		}
	}
}
