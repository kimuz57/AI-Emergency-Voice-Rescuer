package controllers

import (
	"reflect"
	"testing"
)

func TestParseMicLevels(t *testing.T) {
	cases := []struct {
		raw  string
		want []float64
	}{
		{"", nil},
		{"   ", nil},
		{"[0.82, 0.64]", []float64{0.82, 0.64}},
		{"[1.7, -0.2]", []float64{1, 0}}, // หลุดช่วง -> บีบให้อยู่ใน 0-1
		{"[]", nil},
		{"not json", nil},
		{`["a", "b"]`, nil},
		{"[0,0,0,0,0,0,0,0,0]", nil}, // เกิน maxMicLevels
	}
	for _, tc := range cases {
		if got := parseMicLevels(tc.raw); !reflect.DeepEqual(got, tc.want) {
			t.Errorf("parseMicLevels(%q) = %v, want %v", tc.raw, got, tc.want)
		}
	}
}
