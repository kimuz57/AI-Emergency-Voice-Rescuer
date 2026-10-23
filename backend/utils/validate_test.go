package utils

import (
	"bytes"
	"encoding/binary"
	"errors"
	"testing"
)

func TestParseMAC(t *testing.T) {
	valid := map[string]string{
		"1C:C3:AB:B3:B9:18":     "1C:C3:AB:B3:B9:18",
		"1c:c3:ab:b3:b9:18":     "1C:C3:AB:B3:B9:18",
		"  02:5e:ed:00:00:01\n": "02:5E:ED:00:00:01",
	}
	for raw, want := range valid {
		got, ok := ParseMAC(raw)
		if !ok || got != want {
			t.Errorf("ParseMAC(%q) = %q, %v; want %q, true", raw, got, ok, want)
		}
	}

	invalid := []string{
		"",
		"not-a-mac",
		"1CC3ABB3B918",            // ไม่มีตัวคั่น
		"1C-C3-AB-B3-B9-18",       // ตัวคั่นผิด
		"1C:C3:AB:B3:B9",          // 5 คู่
		"1C:C3:AB:B3:B9:18:00",    // 7 คู่
		"1C:C3:AB:B3:B9:1G",       // ไม่ใช่เลขฐาน 16
		"1C:C3:AB:B3:B9:180",      // คู่สุดท้าย 3 หลัก
		"1C:C3:AB:B3:B9:18; DROP", // ต่อท้าย
		"1C:C3:AB:B3:B9:18:",
	}
	for _, raw := range invalid {
		if got, ok := ParseMAC(raw); ok {
			t.Errorf("ParseMAC(%q) = %q, true; want rejected", raw, got)
		}
	}
}

// wav สร้างหัวไฟล์ WAV สำหรับ test: format tag, จำนวนบิต และ chunk เสริมก่อน fmt ได้
func wav(format, bits uint16, extra ...[]byte) []byte {
	var b bytes.Buffer
	b.WriteString("RIFF")
	binary.Write(&b, binary.LittleEndian, uint32(0)) // ขนาดรวม ไม่ได้ใช้ตรวจ
	b.WriteString("WAVE")
	for _, chunk := range extra {
		b.Write(chunk)
	}
	b.WriteString("fmt ")
	binary.Write(&b, binary.LittleEndian, uint32(16))
	binary.Write(&b, binary.LittleEndian, format)
	binary.Write(&b, binary.LittleEndian, uint16(1))    // channels
	binary.Write(&b, binary.LittleEndian, uint32(8000)) // sample rate
	binary.Write(&b, binary.LittleEndian, uint32(16000))
	binary.Write(&b, binary.LittleEndian, uint16(2))
	binary.Write(&b, binary.LittleEndian, bits)
	b.WriteString("data")
	binary.Write(&b, binary.LittleEndian, uint32(4))
	b.Write([]byte{0, 0, 1, 0})
	return b.Bytes()
}

func TestValidatePCM16WAV(t *testing.T) {
	info, err := ValidatePCM16WAV(bytes.NewReader(wav(1, 16)))
	if err != nil {
		t.Fatalf("valid 16-bit PCM WAV rejected: %v", err)
	}
	if info.Channels != 1 || info.SampleRate != 8000 {
		t.Errorf("info = %+v, want 1 channel at 8000 Hz", info)
	}

	// chunk เสริม (เช่น LIST) ก่อน fmt ต้องข้ามได้ รวมถึงขนาดคี่ที่มี byte เติม
	list := append([]byte("LIST\x03\x00\x00\x00abc"), 0)
	if _, err := ValidatePCM16WAV(bytes.NewReader(wav(1, 16, list))); err != nil {
		t.Errorf("WAV with a LIST chunk rejected: %v", err)
	}

	cases := []struct {
		name string
		data []byte
		want error
	}{
		{"empty", nil, ErrNotWAV},
		{"html", []byte("<html><body>not audio</body></html>"), ErrNotWAV},
		{"riff but not wave", append([]byte("RIFF\x00\x00\x00\x00AVI "), wav(1, 16)[12:]...), ErrNotWAV},
		{"header only", wav(1, 16)[:20], ErrNotWAV},
		{"8-bit pcm", wav(1, 8), ErrNotPCM16},
		{"float32", wav(3, 32), ErrNotPCM16},
		{"24-bit pcm", wav(1, 24), ErrNotPCM16},
	}
	for _, tc := range cases {
		if _, err := ValidatePCM16WAV(bytes.NewReader(tc.data)); !errors.Is(err, tc.want) {
			t.Errorf("%s: err = %v, want %v", tc.name, err, tc.want)
		}
	}
}
