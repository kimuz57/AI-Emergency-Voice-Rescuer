"""unit test ของ dsp.py ด้วยสัญญาณสังเคราะห์ (ไซน์ + noise, 2 ช่องที่หน่วงกัน)

รัน:  cd api && uv run --group dev pytest
"""

import numpy as np
import pytest

import dsp

FS = 8000
N = 2 * FS  # 1 หน้าต่าง = 2 วินาที


def delayed(x: np.ndarray, d: int) -> np.ndarray:
    """y[n] = x[n - d] (d > 0 = หน่วง, d < 0 = นำ) เติมศูนย์ส่วนที่เลื่อนออก"""
    y = np.zeros_like(x)
    if d >= 0:
        y[d:] = x[:len(x) - d]
    else:
        y[:d] = x[-d:]
    return y


def sine_plus_noise(rng, n=N, freq=440.0, amp=0.3, noise=0.1):
    t = np.arange(n) / FS
    return amp * np.sin(2 * np.pi * freq * t) + noise * rng.standard_normal(n)


def snr_db(estimate: np.ndarray, clean: np.ndarray) -> float:
    """SNR หลังหา scale ที่ดีที่สุด (ผลของ beamformer อาจต่างจาก clean ด้วยค่าคงที่)"""
    scale = np.dot(estimate, clean) / np.dot(clean, clean)
    residual = estimate - scale * clean
    return 10 * np.log10(np.sum((scale * clean) ** 2) / np.sum(residual ** 2))


@pytest.fixture
def rng():
    return np.random.default_rng(2569)


# ---------------------------------------------------------------------------
# config / input
# ---------------------------------------------------------------------------

def test_config_reads_env():
    cfg = dsp.DSPConfig.from_env(
        sample_rate=8000,
        env={"DSP_MODE": "MVDR", "DSP_HPF_CUTOFF_HZ": "120", "DSP_GCC_MAX_LAG": "4", "DSP_PF_GMIN": ""},
    )
    assert cfg.mode == "mvdr"
    assert cfg.hpf_cutoff_hz == 120.0
    assert cfg.gcc_max_lag == 4
    assert cfg.pf_gmin == 0.1  # ค่าว่าง = default


def test_config_defaults_match_spec():
    cfg = dsp.DSPConfig()
    assert (cfg.hpf_order, cfg.hpf_cutoff_hz, cfg.agc_max_gain) == (2, 100.0, 4.0)
    assert (cfg.vad_threshold_db, cfg.vad_min_speech_ratio, cfg.gcc_max_lag) == (6.0, 0.10, 3)
    assert (cfg.stft_nfft, cfg.stft_hop, cfg.pf_gmin, cfg.pf_lambda) == (256, 128, 0.1, 0.95)


@pytest.mark.parametrize("env", [{"DSP_MODE": "beamform"}, {"DSP_AGC_MAX_GAIN": "four"}])
def test_config_rejects_bad_values(env):
    with pytest.raises(ValueError):
        dsp.DSPConfig.from_env(env=env)


def test_split_stereo_pcm():
    frames = np.array([[100, -200], [300, -400], [-32768, 32767]], dtype="<i2")
    left, right = dsp.split_stereo_pcm(frames.tobytes())
    np.testing.assert_allclose(left * 32768, [100, 300, -32768])
    np.testing.assert_allclose(right * 32768, [-200, -400, 32767])


@pytest.mark.parametrize("length", [2, 6, 4098])
def test_split_stereo_pcm_rejects_partial_frames(length):
    with pytest.raises(ValueError):
        dsp.split_stereo_pcm(b"\x00" * length)


def test_pcm16_round_trip_clips():
    pcm = dsp.to_pcm16(np.array([0.5, -0.5, 2.0, -2.0]))
    np.testing.assert_array_equal(np.frombuffer(pcm, "<i2"), [16384, -16384, 32767, -32768])


def test_stft_istft_reconstructs(rng):
    x = rng.standard_normal(N)
    y = dsp.istft(dsp.stft(x, 256, 128), 256, 128, N)
    np.testing.assert_allclose(y, x, atol=1e-9)


# ---------------------------------------------------------------------------
# HPF / AGC / VAD
# ---------------------------------------------------------------------------

def test_hpf_removes_low_frequency_and_keeps_speech_band():
    cfg = dsp.DSPConfig()
    sos = dsp.design_hpf(cfg)
    t = np.arange(N) / FS
    hum, voice = np.sin(2 * np.pi * 30 * t), np.sin(2 * np.pi * 1000 * t)
    y_hum, _ = dsp.highpass(hum, sos)
    y_voice, _ = dsp.highpass(voice, sos)
    steady = slice(FS // 2, None)  # ข้ามช่วง transient ต้นหน้าต่าง
    assert np.std(y_hum[steady]) / np.std(hum[steady]) < 0.1     # 30 Hz ลดลง > 20 dB
    assert np.std(y_voice[steady]) / np.std(voice[steady]) > 0.98


def test_hpf_state_makes_windows_continuous(rng):
    sos = dsp.design_hpf(dsp.DSPConfig())
    x = rng.standard_normal(N)
    whole, _ = dsp.highpass(x, sos)
    first, zi = dsp.highpass(x[: N // 2], sos)
    second, _ = dsp.highpass(x[N // 2:], sos, zi)
    np.testing.assert_allclose(np.concatenate([first, second]), whole, atol=1e-12)


def test_agc_limits_gain_to_max(rng):
    cfg = dsp.DSPConfig()
    quiet = 0.001 * sine_plus_noise(rng)
    gain = dsp.agc_gain(dsp.frame_power(quiet, cfg), float(np.max(np.abs(quiet))), cfg)
    assert gain == pytest.approx(cfg.agc_max_gain)


def test_agc_never_clips(rng):
    cfg = dsp.DSPConfig(agc_target_dbfs=0.0)
    x = sine_plus_noise(rng, amp=0.05, noise=0.0)
    x[100] = 0.9  # peak เดียวสูง
    gain = dsp.agc_gain(dsp.frame_power(x, cfg), float(np.max(np.abs(x))), cfg)
    assert np.max(np.abs(x * gain)) <= 0.99 + 1e-9


def test_vad_rejects_noise_only(rng):
    cfg = dsp.DSPConfig()
    vad = dsp.energy_vad(dsp.frame_power(0.01 * rng.standard_normal(N), cfg), cfg)
    assert not vad.has_speech


def test_vad_detects_sine_burst_in_noise(rng):
    cfg = dsp.DSPConfig()
    x = 0.01 * rng.standard_normal(N)
    x[4000:8800] += sine_plus_noise(rng, n=4800, noise=0.0)  # 30% ของหน้าต่าง ดังกว่าพื้น ~27 dB
    vad = dsp.energy_vad(dsp.frame_power(x, cfg), cfg)
    assert vad.has_speech
    assert 0.25 < vad.speech_ratio < 0.4


def test_vad_needs_ten_percent_of_window(rng):
    cfg = dsp.DSPConfig()
    x = 0.01 * rng.standard_normal(N)
    x[4000:4800] += sine_plus_noise(rng, n=800, noise=0.0)  # 5% ของหน้าต่าง
    assert not dsp.energy_vad(dsp.frame_power(x, cfg), cfg).has_speech


def test_vad_uses_remembered_floor_when_window_is_all_speech(rng):
    cfg = dsp.DSPConfig()
    loud = sine_plus_noise(rng)  # ดังเต็มหน้าต่าง: เปอร์เซ็นไทล์ 10 ของหน้าต่างเองก็เป็นเสียงพูด
    power = dsp.frame_power(loud, cfg)
    assert not dsp.energy_vad(power, cfg).has_speech
    assert dsp.energy_vad(power, cfg, noise_floor_db=-40.0).has_speech


# ---------------------------------------------------------------------------
# GCC-PHAT
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("delay", [2, -2, 0, 1, 3])
def test_gcc_phat_finds_delay_of_sine_plus_noise(rng, delay):
    cfg = dsp.DSPConfig()
    source = sine_plus_noise(rng)  # ไซน์ + noise จากแหล่งเดียวกัน (ถึงไมค์ทั้งสองตัว)
    left = source + 0.01 * rng.standard_normal(N)
    right = delayed(source, delay) + 0.01 * rng.standard_normal(N)
    spec = dsp.stft(np.stack([left, right]), cfg.stft_nfft, cfg.stft_hop)
    found, peak = dsp.gcc_phat(spec[0], spec[1], cfg)
    assert found == pytest.approx(delay, abs=0.125)
    assert peak > 0.5


def test_gcc_phat_finds_two_sample_delay_with_speech_mask(rng):
    """เสียงอยู่แค่กลางหน้าต่าง ส่วนที่เหลือเป็น noise อิสระของแต่ละไมค์ -> ใช้เฉพาะเฟรมที่ VAD บอกว่ามีเสียง"""
    cfg = dsp.DSPConfig()
    source = np.zeros(N)
    source[5000:11000] = sine_plus_noise(rng, n=6000)
    left = source + 0.02 * rng.standard_normal(N)
    right = delayed(source, 2) + 0.02 * rng.standard_normal(N)
    x = np.stack([left, right])
    vad = dsp.energy_vad(dsp.frame_power(x, cfg), cfg)
    spec = dsp.stft(x, cfg.stft_nfft, cfg.stft_hop)
    found, _ = dsp.gcc_phat(spec[0], spec[1], cfg, vad.mask)
    assert found == pytest.approx(2.0, abs=0.125)


def test_gcc_phat_stays_within_search_range(rng):
    cfg = dsp.DSPConfig()
    source = rng.standard_normal(N)
    spec = dsp.stft(np.stack([source, delayed(source, 6)]), cfg.stft_nfft, cfg.stft_hop)
    found, _ = dsp.gcc_phat(spec[0], spec[1], cfg)
    assert -cfg.gcc_max_lag <= found <= cfg.gcc_max_lag


# ---------------------------------------------------------------------------
# Beamformers
# ---------------------------------------------------------------------------

def _two_mic_scene(rng, delay=2):
    """แหล่งเสียงสังเคราะห์ (ไซน์ 2 ความถี่ + noise ย่านกว้างจากแหล่งเดียวกัน) กลางหน้าต่าง
    หน่วง `delay` ที่ไมค์ขวา + noise อิสระของแต่ละไมค์
    (ไซน์ล้วนเป็นสัญญาณแถบแคบ GCC-PHAT ถ่วงทุกความถี่เท่ากันจึงหาความหน่วงจากไซน์ล้วนได้ไม่แม่น)"""
    t = np.arange(N) / FS
    clean = np.zeros(N)
    burst = slice(4000, 12000)
    clean[burst] = (0.3 * np.sin(2 * np.pi * 440 * t[burst]) + 0.2 * np.sin(2 * np.pi * 1250 * t[burst])
                    + 0.1 * rng.standard_normal(8000))
    noise = 0.05 * rng.standard_normal((2, N))
    return clean, clean + noise[0], delayed(clean, delay) + noise[1]


def test_das_postfilter_beats_single_mic(rng):
    cfg = dsp.DSPConfig()
    clean, left, right = _two_mic_scene(rng)
    spec = dsp.stft(np.stack([left, right]), cfg.stft_nfft, cfg.stft_hop)
    out = dsp.istft(dsp.das_postfilter(spec[0], spec[1], 2.0, cfg), cfg.stft_nfft, cfg.stft_hop, N)
    assert snr_db(out, clean) > snr_db(left, clean) + 3


def test_mvdr_suppresses_directional_interferer(rng):
    """Rn ประมาณจากเฟรมเงียบของสัญญาณผสม แล้ววัดผลของ weight เดียวกันกับ interferer อย่างเดียว (MVDR เป็น linear เมื่อรู้ Rn)"""
    cfg = dsp.DSPConfig()
    stft = lambda a, b: np.moveaxis(dsp.stft(np.stack([a, b]), cfg.stft_nfft, cfg.stft_hop), 0, -1)
    istft = lambda s: dsp.istft(s, cfg.stft_nfft, cfg.stft_hop, N)
    power_db = lambda x: 10 * np.log10(np.mean(x[1000:-1000] ** 2))

    clean, left, right = _two_mic_scene(rng)
    interferer = 0.1 * rng.standard_normal(N)  # มาจากอีกทิศ (หน่วย -2 เทียบกับเสียงพูดที่หน่วย +2) ตลอดหน้าต่าง
    mixture = stft(left + interferer, right + delayed(interferer, -2))
    noise_frames = np.zeros(mixture.shape[0], dtype=bool)
    noise_frames[:25] = noise_frames[-25:] = True  # ต้นและท้ายหน้าต่างไม่มีเสียงพูด
    rn = dsp.noise_covariance(mixture, noise_frames)

    only_interferer = stft(interferer, delayed(interferer, -2))
    mvdr_out = istft(dsp.mvdr(only_interferer, rn, 2.0, cfg))
    das_out = istft(0.5 * (only_interferer[..., 0] + only_interferer[..., 1] * dsp._align_vector(2.0, cfg)[:, 1]))
    assert power_db(mvdr_out) < power_db(interferer) - 6
    assert power_db(mvdr_out) < power_db(das_out) - 3

    # เสียงพูดจากทิศที่หันไปต้องผ่านครบ
    target_out = istft(dsp.mvdr(stft(clean, delayed(clean, 2)), rn, 2.0, cfg))
    np.testing.assert_allclose(target_out[1000:-1000], clean[1000:-1000], atol=0.02)


def test_mvdr_is_distortionless_for_aligned_target(rng):
    cfg = dsp.DSPConfig()
    target = rng.standard_normal(N)
    spec = np.moveaxis(dsp.stft(np.stack([target, delayed(target, 2)]), cfg.stft_nfft, cfg.stft_hop), 0, -1)
    noise = np.moveaxis(dsp.stft(0.1 * rng.standard_normal((2, N)), cfg.stft_nfft, cfg.stft_hop), 0, -1)
    rn = dsp.noise_covariance(noise, np.ones(noise.shape[0], dtype=bool))
    out = dsp.istft(dsp.mvdr(spec, rn, 2.0, cfg), cfg.stft_nfft, cfg.stft_hop, N)
    middle = slice(1000, N - 1000)
    np.testing.assert_allclose(out[middle], target[middle], atol=0.05)


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("mode", dsp.MODES)
def test_process_returns_mono_window_with_timings(rng, mode):
    cfg = dsp.DSPConfig(mode=mode)
    _, left, right = _two_mic_scene(rng)
    result = dsp.DSPProcessor(cfg).process(left.astype(np.float32), right.astype(np.float32), dsp.DSPState())
    assert result.has_speech
    assert result.audio.shape == (N,) and result.audio.dtype == np.float32
    assert np.max(np.abs(result.audio)) <= 1.0
    assert 0 < result.gain <= cfg.agc_max_gain  # ฉากนี้ดังกว่าเป้าหมาย AGC จึงลดลง (< 1)
    expected = {"hpf", "agc", "vad", "dsp_total"} | ({"gcc_phat", "beamform"} if mode != "mono" else set())
    assert set(result.timings_ms) == expected
    if mode == "mono":
        assert result.delay_samples is None
    else:
        assert result.delay_samples == pytest.approx(2.0, abs=0.125)


def test_process_skips_model_when_no_speech(rng):
    processor = dsp.DSPProcessor(dsp.DSPConfig(mode="das_pf"))
    noise = (0.01 * rng.standard_normal((2, N))).astype(np.float32)
    result = processor.process(noise[0], noise[1], dsp.DSPState())
    assert not result.has_speech and result.audio is None
    assert "beamform" not in result.timings_ms


def test_mvdr_remembers_noise_covariance_for_all_speech_window(rng):
    processor = dsp.DSPProcessor(dsp.DSPConfig(mode="mvdr"))
    state = dsp.DSPState()
    _, left, right = _two_mic_scene(rng)
    first = processor.process(left, right, state)
    assert first.noise_cov_source == "window" and state.noise_cov is not None

    t = np.arange(N) / FS
    speech = 0.3 * np.sin(2 * np.pi * 440 * t) * (1 + 0.5 * np.sin(2 * np.pi * 3 * t))  # พูดเต็มหน้าต่าง
    second = processor.process(speech + 0.05 * rng.standard_normal(N), delayed(speech, 2), state)
    assert second.has_speech  # ระดับพื้นหลังที่จำไว้ทำให้ยังรู้ว่าเป็นเสียงพูด
    assert second.noise_cov_source in ("window", "memory")
