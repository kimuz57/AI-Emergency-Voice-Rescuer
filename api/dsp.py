"""DSP สำหรับไมค์ 2 ตัว (firmwareV2 ส่ง PCM 16-bit สลับช่อง L,R ที่ 8 kHz)

ลำดับต่อ 1 หน้าต่าง (2 วินาที = 16000 ค่าตัวอย่างต่อช่อง):

    HPF -> AGC -> VAD -> GCC-PHAT -> beamformer -> สัญญาณช่องเดียว 8 kHz

beamformer เลือกด้วย DSP_MODE:
    mono    ไมค์ซ้ายตัวเดียว (ฐานเปรียบเทียบ ไม่ทำ GCC-PHAT / beamforming)
    das_pf  วิธีที่ 1: Delay-and-Sum + Coherence-based Post-filter (Zelinski)
    mvdr    วิธีที่ 2: MVDR, steering [1, 1] หลังจัดเวลาให้ตรงกัน

ทุกค่าตั้งได้จาก env (ดู DSPConfig.from_env) โมดูลนี้ไม่อ่าน env ตอน import
และไม่ขึ้นกับ MQTT จึง test แยกได้ (api/tests/test_dsp.py)
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass, field
from typing import Mapping

import numpy as np
from scipy.signal import butter, sosfilt

MODES = ("mono", "das_pf", "mvdr")

_EPS = 1e-12


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class DSPConfig:
    mode: str = "das_pf"
    sample_rate: int = 8000

    # HPF Butterworth
    hpf_cutoff_hz: float = 100.0
    hpf_order: int = 2

    # AGC: gain เดียวทั้งหน้าต่างและใช้กับทั้ง 2 ช่อง (ไม่ทำลายความต่างระหว่างไมค์ และไม่บีบ dynamic ที่ VAD ใช้)
    agc_max_gain: float = 4.0
    agc_target_dbfs: float = -20.0      # RMS ของเฟรมดัง (เปอร์เซ็นไทล์ 90) หลังขยาย

    # VAD แบบพลังงาน (เฟรมเดียวกับ STFT)
    vad_threshold_db: float = 6.0       # ต้องดังกว่าระดับพื้นหลังอย่างน้อยเท่านี้
    vad_min_speech_ratio: float = 0.10  # สัดส่วนเฟรมที่มีเสียงพูดขั้นต่ำของหน้าต่าง
    vad_floor_percentile: float = 10.0  # ระดับพื้นหลังของหน้าต่าง = เปอร์เซ็นไทล์นี้ของพลังงานเฟรม
    vad_floor_rise_db: float = 1.0      # ระดับพื้นหลังที่จำข้ามหน้าต่างขึ้นได้ไม่เกินเท่านี้ต่อเสียงใหม่ 1 หน้าต่าง (ลงได้ทันที)

    # GCC-PHAT
    gcc_max_lag: int = 3                # ไมค์ห่าง 10 ซม. ที่ 8 kHz -> ความหน่วงจริงไม่เกิน 2.33 ค่าตัวอย่าง
    gcc_interp: int = 16                # ความละเอียด 1/16 ค่าตัวอย่าง

    # STFT
    stft_nfft: int = 256
    stft_hop: int = 128

    # DAS + post-filter
    pf_gmin: float = 0.1
    pf_lambda: float = 0.95

    # MVDR
    mvdr_diag_load: float = 1e-2        # diagonal loading สัมพัทธ์กับ trace(Rn)/2
    mvdr_min_noise_frames: int = 8      # เฟรมไม่มีเสียงพูดขั้นต่ำที่จะประมาณ Rn จากหน้าต่างนี้
    mvdr_noise_memory: float = 0.9      # น้ำหนักของ Rn เดิม (จากหน้าต่างก่อน) ตอนรวมกับ Rn ใหม่

    def __post_init__(self) -> None:
        if self.mode not in MODES:
            raise ValueError(f"DSP_MODE must be one of {', '.join(MODES)} (got {self.mode!r})")
        if self.stft_hop <= 0 or self.stft_nfft < 2 * self.stft_hop or self.stft_nfft % 2:
            raise ValueError("DSP_STFT_NFFT must be even and at least 2 * DSP_STFT_HOP")
        if not 0 < self.hpf_cutoff_hz < self.sample_rate / 2:
            raise ValueError("DSP_HPF_CUTOFF_HZ must be between 0 and sample_rate / 2")
        if self.hpf_order < 1 or self.agc_max_gain < 1 or self.gcc_max_lag < 1 or self.gcc_interp < 1:
            raise ValueError("DSP_HPF_ORDER, DSP_GCC_MAX_LAG, DSP_GCC_INTERP must be >= 1 and DSP_AGC_MAX_GAIN >= 1")
        if not (0 <= self.pf_gmin <= 1 and 0 <= self.pf_lambda < 1 and 0 <= self.mvdr_noise_memory < 1):
            raise ValueError("DSP_PF_GMIN must be in [0, 1], DSP_PF_LAMBDA and DSP_MVDR_NOISE_MEMORY in [0, 1)")
        if not 0 < self.vad_min_speech_ratio <= 1:
            raise ValueError("DSP_VAD_MIN_SPEECH_RATIO must be in (0, 1]")

    @classmethod
    def from_env(cls, sample_rate: int | None = None, env: Mapping[str, str] | None = None) -> "DSPConfig":
        """อ่านค่า DSP_* จาก env (ค่าว่าง = default)"""
        env = os.environ if env is None else env
        defaults = cls()
        kwargs = {}
        for f in cls.__dataclass_fields__.values():
            if f.name == "sample_rate":
                continue
            raw = env.get(f"DSP_{f.name.upper()}", "").strip()
            if raw == "":
                continue
            default = getattr(defaults, f.name)
            try:
                kwargs[f.name] = raw.lower() if isinstance(default, str) else type(default)(raw)
            except ValueError as exc:
                raise ValueError(f"DSP_{f.name.upper()}={raw!r} is not a valid {type(default).__name__}") from exc
        if sample_rate is not None:
            kwargs["sample_rate"] = sample_rate
        return cls(**kwargs)


# ---------------------------------------------------------------------------
# Input
# ---------------------------------------------------------------------------

def split_stereo_pcm(payload: bytes) -> tuple[np.ndarray, np.ndarray]:
    """PCM int16 LE สลับช่อง L,R,L,R,... -> (left, right) float32 ช่วง [-1, 1)"""
    if len(payload) % 4:
        raise ValueError(f"stereo int16 payload must be a multiple of 4 bytes (got {len(payload)})")
    frames = np.frombuffer(payload, dtype="<i2").reshape(-1, 2).astype(np.float32) / 32768.0
    return frames[:, 0].copy(), frames[:, 1].copy()


def to_pcm16(audio: np.ndarray) -> bytes:
    """float [-1, 1] -> PCM int16 LE (ตัดส่วนที่เกิน)"""
    return (np.clip(audio, -1.0, 32767 / 32768) * 32768.0).astype("<i2").tobytes()


# ---------------------------------------------------------------------------
# Framing / STFT (เฟรมเดียวกันทั้ง VAD และ STFT: center + reflect padding)
# ---------------------------------------------------------------------------

def hann(n: int) -> np.ndarray:
    """Hann แบบ periodic (ใช้กับ STFT ที่ hop = n/2)"""
    return (0.5 - 0.5 * np.cos(2 * np.pi * np.arange(n) / n)).astype(np.float64)


def _pad_amounts(n_samples: int, nfft: int, hop: int) -> tuple[int, int]:
    left = nfft // 2
    total = n_samples + 2 * left
    extra = (-(total - nfft)) % hop
    return left, left + extra


def frame_signal(x: np.ndarray, nfft: int, hop: int) -> np.ndarray:
    """(..., N) -> (..., T, nfft) เฟรมที่ศูนย์กลางอยู่ที่ t * hop"""
    left, right = _pad_amounts(x.shape[-1], nfft, hop)
    mode = "reflect" if x.shape[-1] > max(left, right) else "constant"
    pad = [(0, 0)] * (x.ndim - 1) + [(left, right)]
    xp = np.pad(x, pad, mode=mode)
    return np.lib.stride_tricks.sliding_window_view(xp, nfft, axis=-1)[..., ::hop, :]


def stft(x: np.ndarray, nfft: int, hop: int) -> np.ndarray:
    """(..., N) -> (..., T, nfft/2+1)"""
    return np.fft.rfft(frame_signal(x, nfft, hop) * hann(nfft), axis=-1)


def istft(spec: np.ndarray, nfft: int, hop: int, length: int) -> np.ndarray:
    """(T, F) -> (length,) ด้วย weighted overlap-add (หารด้วยผลรวม window^2)"""
    win = hann(nfft)
    frames = np.fft.irfft(spec, n=nfft, axis=-1) * win
    left, right = _pad_amounts(length, nfft, hop)
    out = np.zeros(length + left + right)
    norm = np.zeros_like(out)
    for t in range(frames.shape[0]):
        start = t * hop
        out[start:start + nfft] += frames[t]
        norm[start:start + nfft] += win ** 2
    out /= np.maximum(norm, 1e-8)
    return out[left:left + length]


def frame_power(x: np.ndarray, cfg: DSPConfig) -> np.ndarray:
    """พลังงานเฉลี่ยต่อเฟรม (window สี่เหลี่ยม) ของสัญญาณ (N,) หรือเฉลี่ยทุกช่องของ (C, N)"""
    p = np.mean(frame_signal(x, cfg.stft_nfft, cfg.stft_hop) ** 2, axis=-1)
    return p if p.ndim == 1 else p.mean(axis=0)


# ---------------------------------------------------------------------------
# 1. HPF
# ---------------------------------------------------------------------------

def design_hpf(cfg: DSPConfig) -> np.ndarray:
    return butter(cfg.hpf_order, cfg.hpf_cutoff_hz, btype="highpass", fs=cfg.sample_rate, output="sos")


def highpass(x: np.ndarray, sos: np.ndarray, zi: np.ndarray | None = None) -> tuple[np.ndarray, np.ndarray]:
    """กรอง (C, N) หรือ (N,) ตามแกนสุดท้าย คืน (y, zi ใหม่) — ส่ง zi กลับมาเพื่อให้ต่อเนื่องข้ามหน้าต่าง"""
    if zi is None:
        zi = np.zeros((sos.shape[0],) + x.shape[:-1] + (2,))
    return sosfilt(sos, x, axis=-1, zi=zi)


# ---------------------------------------------------------------------------
# 2. AGC
# ---------------------------------------------------------------------------

def agc_gain(power: np.ndarray, peak: float, cfg: DSPConfig) -> float:
    """gain เดียวทั้งหน้าต่าง: ให้ RMS ของเฟรมดัง (P90) ไปอยู่ที่ agc_target_dbfs
    ขยายไม่เกิน agc_max_gain และไม่ให้ peak เกิน full scale"""
    level = float(np.sqrt(np.percentile(power, 90))) if power.size else 0.0
    if level <= 1e-9:
        return 1.0  # เงียบสนิท (digital silence) ไม่ขยาย
    gain = min(10 ** (cfg.agc_target_dbfs / 20) / level, cfg.agc_max_gain)
    if peak > 0:
        gain = min(gain, 0.99 / peak)
    return gain


# ---------------------------------------------------------------------------
# 3. VAD
# ---------------------------------------------------------------------------

@dataclass
class VADResult:
    mask: np.ndarray          # bool (T,) เฟรมที่มีเสียงพูด
    speech_ratio: float
    has_speech: bool
    window_floor_db: float    # ระดับพื้นหลังของหน้าต่างนี้ (dBFS)
    floor_db: float           # ระดับพื้นหลังที่ใช้ตัดสิน


def energy_vad(power: np.ndarray, cfg: DSPConfig, noise_floor_db: float | None = None) -> VADResult:
    """เฟรมที่ดังกว่าระดับพื้นหลังอย่างน้อย vad_threshold_db ถือว่ามีเสียงพูด
    หน้าต่างมีเสียงพูดเมื่อเฟรมแบบนั้นมีอย่างน้อย vad_min_speech_ratio ของทั้งหมด
    noise_floor_db = ระดับพื้นหลังที่จำจากหน้าต่างก่อน (ใช้ค่าที่ต่ำกว่า กันกรณีพูดเต็มหน้าต่าง)"""
    p_db = 10 * np.log10(power + _EPS)
    window_floor = float(np.percentile(p_db, cfg.vad_floor_percentile))
    floor = window_floor if noise_floor_db is None else min(window_floor, noise_floor_db)
    mask = p_db >= floor + cfg.vad_threshold_db
    ratio = float(mask.mean()) if mask.size else 0.0
    return VADResult(mask, ratio, ratio >= cfg.vad_min_speech_ratio, window_floor, floor)


# ---------------------------------------------------------------------------
# 4. GCC-PHAT
# ---------------------------------------------------------------------------

def gcc_phat(spec_l: np.ndarray, spec_r: np.ndarray, cfg: DSPConfig,
             frame_mask: np.ndarray | None = None) -> tuple[float, float]:
    """ความหน่วงของไมค์ขวาเทียบไมค์ซ้าย (ค่าตัวอย่าง) ค้นในช่วง ±gcc_max_lag
    ค่าบวก = เสียงถึงไมค์ซ้ายก่อน (right[n] ≈ left[n - delay])
    เฉลี่ย cross-spectrum ที่ถ่วงแบบ PHAT เฉพาะเฟรมที่มีเสียงพูด คืน (delay, ความสูงพีค 0..1)"""
    cross = spec_r * np.conj(spec_l)
    cross = cross / (np.abs(cross) + _EPS)
    weights = np.ones(cross.shape[0]) if frame_mask is None or not frame_mask.any() else frame_mask.astype(float)
    avg = (weights[:, None] * cross).sum(axis=0) / weights.sum()

    # ตัดย่านต่ำกว่า HPF (ไม่มีสัญญาณ แต่ PHAT จะให้น้ำหนักเท่าย่านอื่น)
    nfft = cfg.stft_nfft
    avg[: int(np.ceil(cfg.hpf_cutoff_hz * nfft / cfg.sample_rate))] = 0

    n = nfft * cfg.gcc_interp
    cc = np.fft.irfft(avg, n=n) * cfg.gcc_interp  # zero-padding ในโดเมนความถี่ = interpolate
    span = cfg.gcc_max_lag * cfg.gcc_interp
    lags = np.arange(-span, span + 1)
    values = cc[lags % n]
    best = int(np.argmax(values))
    return float(lags[best] / cfg.gcc_interp), float(values[best])


def _align_vector(delay: float, cfg: DSPConfig) -> np.ndarray:
    """(F, 2): ตัวคูณที่เลื่อนไมค์ขวาให้ตรงเวลากับไมค์ซ้าย"""
    k = np.arange(cfg.stft_nfft // 2 + 1)
    shift = np.exp(2j * np.pi * k * delay / cfg.stft_nfft)
    return np.stack([np.ones_like(shift), shift], axis=-1)


# ---------------------------------------------------------------------------
# 5a. Delay-and-Sum + Coherence-based Post-filter
# ---------------------------------------------------------------------------

def das_postfilter(spec_l: np.ndarray, spec_r: np.ndarray, delay: float, cfg: DSPConfig) -> np.ndarray:
    """คืน spectrum (T, F) ของ DAS ที่คูณด้วย post-filter แบบ Zelinski
    H = Re{Φ12} / ((Φ11 + Φ22) / 2) ตัดไว้ใน [Gmin, 1], Φ ปรับเรียบแบบ recursive ด้วย λ"""
    aligned_r = spec_r * _align_vector(delay, cfg)[:, 1]
    das = 0.5 * (spec_l + aligned_r)

    lam = cfg.pf_lambda
    phi11 = np.abs(spec_l[0]) ** 2
    phi22 = np.abs(aligned_r[0]) ** 2
    phi12 = spec_l[0] * np.conj(aligned_r[0])
    out = np.empty_like(das)
    for t in range(das.shape[0]):
        if t:
            phi11 = lam * phi11 + (1 - lam) * np.abs(spec_l[t]) ** 2
            phi22 = lam * phi22 + (1 - lam) * np.abs(aligned_r[t]) ** 2
            phi12 = lam * phi12 + (1 - lam) * spec_l[t] * np.conj(aligned_r[t])
        h = np.clip(phi12.real / (0.5 * (phi11 + phi22) + _EPS), cfg.pf_gmin, 1.0)
        out[t] = h * das[t]
    return out


# ---------------------------------------------------------------------------
# 5b. MVDR
# ---------------------------------------------------------------------------

def noise_covariance(spec: np.ndarray, frames: np.ndarray) -> np.ndarray:
    """spec (T, F, 2), frames bool (T,) -> Rn (F, 2, 2) ในพิกัดไมค์เดิม (ยังไม่จัดเวลา)"""
    x = spec[frames]
    return np.einsum("tfi,tfj->fij", x, np.conj(x)) / max(len(x), 1)


def mvdr(spec: np.ndarray, noise_cov: np.ndarray, delay: float, cfg: DSPConfig) -> np.ndarray:
    """spec (T, F, 2) ไมค์เดิม -> (T, F)
    จัดเวลาไมค์ขวาด้วย delay แล้วใช้ steering d = [1, 1]: w = Rn⁻¹d / (dᴴRn⁻¹d)"""
    v = _align_vector(delay, cfg)                                   # (F, 2)
    aligned = spec * v[None]
    rn = v[:, :, None] * noise_cov * np.conj(v[:, None, :])          # V Rn Vᴴ
    load = cfg.mvdr_diag_load * np.real(np.trace(rn, axis1=1, axis2=2)) / 2 + _EPS
    rn = rn + load[:, None, None] * np.eye(2)
    d = np.ones((rn.shape[0], 2, 1), dtype=complex)
    rinv_d = np.linalg.solve(rn, d)[..., 0]                          # (F, 2)
    w = rinv_d / np.sum(rinv_d, axis=-1, keepdims=True)              # dᴴ Rn⁻¹ d = ผลรวม เพราะ d = [1, 1]
    return np.einsum("fi,tfi->tf", np.conj(w), aligned)


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

@dataclass
class DSPState:
    """สถานะต่ออุปกรณ์ที่ต้องจำข้ามหน้าต่าง"""
    hpf_zi: np.ndarray | None = None
    noise_floor_db: float | None = None     # อ้างอิงก่อน AGC
    noise_cov: np.ndarray | None = None     # MVDR Rn (F, 2, 2)


@dataclass
class DSPResult:
    audio: np.ndarray | None                # float32 ช่องเดียว หรือ None ถ้าไม่มีเสียงพูด
    has_speech: bool
    speech_ratio: float
    gain: float
    delay_samples: float | None = None
    gcc_peak: float | None = None
    noise_cov_source: str | None = None     # mvdr: window / memory / all_frames
    timings_ms: dict[str, float] = field(default_factory=dict)


class DSPProcessor:
    def __init__(self, cfg: DSPConfig):
        self.cfg = cfg
        self.sos = design_hpf(cfg)

    def process(self, left: np.ndarray, right: np.ndarray, state: DSPState, advance: int | None = None) -> DSPResult:
        """advance = จำนวนค่าตัวอย่างที่หน้าต่างถัดไปเลื่อนไป (หน้าต่างซ้อนกัน) None = ไม่ซ้อน (หน้าต่างถัดไปต่อท้ายพอดี)
        ใช้เก็บ state ของ HPF ณ จุดเริ่มของหน้าต่างถัดไป และปรับอัตราที่ระดับพื้นหลังของ VAD ขึ้นได้ตามเวลาจริง"""
        cfg = self.cfg
        timings: dict[str, float] = {}
        t_all = t = time.perf_counter()

        def lap(name: str) -> None:
            nonlocal t
            now = time.perf_counter()
            timings[name] = (now - t) * 1000
            t = now

        n = len(left)
        # mono ใช้ไมค์ซ้ายตัวเดียวตั้งแต่ต้น (ฐานเปรียบเทียบ: HPF/AGC/VAD เหมือนกัน ต่างแค่ไม่มี beamforming)
        x = left[None, :] if cfg.mode == "mono" else np.stack([left, right])
        x = x.astype(np.float64)

        step = n if advance is None or not 0 < advance < n else advance
        zi = state.hpf_zi if self._zi_fits(state, x) else None
        if step == n:
            x, state.hpf_zi = highpass(x, self.sos, zi)
        else:
            # หน้าต่างซ้อนกัน: state ที่ค่าตัวอย่าง `step` คือ state ตอนเริ่มหน้าต่างถัดไปพอดี
            head, state.hpf_zi = highpass(x[:, :step], self.sos, zi)
            tail, _ = highpass(x[:, step:], self.sos, state.hpf_zi)
            x = np.concatenate([head, tail], axis=1)
        lap("hpf")

        power = frame_power(x, cfg)
        gain = agc_gain(power, float(np.max(np.abs(x))) if x.size else 0.0, cfg)
        x *= gain
        lap("agc")

        gain_db = 20 * np.log10(gain)
        remembered = None if state.noise_floor_db is None else state.noise_floor_db + gain_db
        vad = energy_vad(power * gain ** 2, cfg, remembered)
        # จำระดับพื้นหลังแบบอ้างอิงก่อน AGC: ลงได้ทันที ขึ้นได้ไม่เกิน vad_floor_rise_db ต่อเสียงใหม่ 1 หน้าต่าง
        # (หน้าต่างซ้อนกันได้เสียงใหม่แค่ step ค่าตัวอย่าง จึงขึ้นได้ตามสัดส่วน)
        window_floor_in = vad.window_floor_db - gain_db
        rise = cfg.vad_floor_rise_db * step / n
        state.noise_floor_db = (window_floor_in if state.noise_floor_db is None
                                else min(window_floor_in, state.noise_floor_db + rise))
        lap("vad")

        result = DSPResult(None, vad.has_speech, vad.speech_ratio, gain, timings_ms=timings)
        if not vad.has_speech:
            timings["dsp_total"] = (time.perf_counter() - t_all) * 1000
            return result

        if cfg.mode == "mono":
            out = x[0]
        else:
            spec = stft(x, cfg.stft_nfft, cfg.stft_hop)               # (2, T, F)
            delay, peak = gcc_phat(spec[0], spec[1], cfg, vad.mask)
            result.delay_samples, result.gcc_peak = delay, peak
            lap("gcc_phat")

            if cfg.mode == "das_pf":
                out_spec = das_postfilter(spec[0], spec[1], delay, cfg)
            else:
                stacked = np.moveaxis(spec, 0, -1)                      # (T, F, 2)
                rn, result.noise_cov_source = self._noise_cov(stacked, ~vad.mask, state)
                out_spec = mvdr(stacked, rn, delay, cfg)
            out = istft(out_spec, cfg.stft_nfft, cfg.stft_hop, n)
            lap("beamform")

        result.audio = np.clip(out, -1.0, 1.0).astype(np.float32)
        timings["dsp_total"] = (time.perf_counter() - t_all) * 1000
        return result

    @staticmethod
    def _zi_fits(state: DSPState, x: np.ndarray) -> bool:
        return state.hpf_zi is not None and state.hpf_zi.shape[1] == x.shape[0]

    def _noise_cov(self, spec: np.ndarray, noise_frames: np.ndarray, state: DSPState) -> tuple[np.ndarray, str]:
        """Rn จากเฟรมที่ VAD บอกว่าไม่มีเสียงพูด และจำไว้ใช้กับหน้าต่างที่พูดเกือบเต็ม"""
        cfg = self.cfg
        if int(noise_frames.sum()) >= cfg.mvdr_min_noise_frames:
            current = noise_covariance(spec, noise_frames)
            if state.noise_cov is None or state.noise_cov.shape != current.shape:
                state.noise_cov = current
            else:
                state.noise_cov = cfg.mvdr_noise_memory * state.noise_cov + (1 - cfg.mvdr_noise_memory) * current
            return state.noise_cov, "window"
        if state.noise_cov is not None and state.noise_cov.shape[0] == spec.shape[1]:
            return state.noise_cov, "memory"
        # ยังไม่เคยเห็นช่วงเงียบเลย: ใช้ทุกเฟรม (กลายเป็น MPDR ชั่วคราว)
        return noise_covariance(spec, np.ones(spec.shape[0], dtype=bool)), "all_frames"
