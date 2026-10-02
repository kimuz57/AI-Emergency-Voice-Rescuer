package utils

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const testSecret = "test-secret-for-unit-tests-only"

func TestParseJWT_AcceptsHS256(t *testing.T) {
	t.Setenv("JWT_SECRET", testSecret)

	tok, err := GenerateToken(42, "a@example.com")
	if err != nil {
		t.Fatalf("GenerateToken: %v", err)
	}
	data, err := ParseToken(tok)
	if err != nil {
		t.Fatalf("ParseToken: %v", err)
	}
	if data.UserID != 42 || data.Email != "a@example.com" {
		t.Fatalf("unexpected claims: %+v", data)
	}
}

func TestParseJWT_RejectsOtherAlgorithms(t *testing.T) {
	t.Setenv("JWT_SECRET", testSecret)
	claims := jwt.MapClaims{"user_id": 1, "exp": time.Now().Add(time.Hour).Unix()}

	hs512, err := jwt.NewWithClaims(jwt.SigningMethodHS512, claims).SignedString([]byte(testSecret))
	if err != nil {
		t.Fatalf("sign HS512: %v", err)
	}
	if _, err := ParseJWT(hs512); err == nil {
		t.Fatal("expected HS512 token to be rejected")
	}

	none, err := jwt.NewWithClaims(jwt.SigningMethodNone, claims).SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatalf("sign none: %v", err)
	}
	if _, err := ParseJWT(none); err == nil {
		t.Fatal("expected alg=none token to be rejected")
	}
}

func TestParseJWT_RejectsWrongSecretExpiredAndMissingExp(t *testing.T) {
	t.Setenv("JWT_SECRET", testSecret)

	wrong, _ := jwt.NewWithClaims(jwt.SigningMethodHS256,
		jwt.MapClaims{"user_id": 1, "exp": time.Now().Add(time.Hour).Unix()}).SignedString([]byte("other"))
	if _, err := ParseJWT(wrong); err == nil {
		t.Fatal("expected token signed with another secret to be rejected")
	}

	expired, _ := jwt.NewWithClaims(jwt.SigningMethodHS256,
		jwt.MapClaims{"user_id": 1, "exp": time.Now().Add(-time.Hour).Unix()}).SignedString([]byte(testSecret))
	if _, err := ParseJWT(expired); err == nil {
		t.Fatal("expected expired token to be rejected")
	}

	noExp, _ := jwt.NewWithClaims(jwt.SigningMethodHS256,
		jwt.MapClaims{"user_id": 1}).SignedString([]byte(testSecret))
	if _, err := ParseJWT(noExp); err == nil {
		t.Fatal("expected token without exp to be rejected")
	}
}

func TestParseJWT_NoSecretFailsClosed(t *testing.T) {
	t.Setenv("JWT_SECRET", testSecret)
	tok, _ := GenerateToken(1, "a@example.com")

	t.Setenv("JWT_SECRET", "")
	if _, err := ParseJWT(tok); err == nil {
		t.Fatal("expected failure when JWT_SECRET is empty")
	}
}
