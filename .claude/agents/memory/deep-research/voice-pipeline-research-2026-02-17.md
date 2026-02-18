## Voice Pipeline Research — STT + TTS for Jarvis (2026-02-17)

**Research Scope**: Full voice pipeline evaluation for Mac Studio M4 Max (128GB) — local, no cloud. Covers STT, TTS, VAD, wake word, architecture, latency, and M4 Max performance budgets.

**Key Findings**:

### STT
1. **Whisper Large V3 Turbo via mlx-whisper**: Top recommendation for M4 Max. 1.02s avg transcription on Apple Silicon benchmark. Multilingual (99 langs), minor WER trade-off vs. Large V3.
2. **Distil-Large-v3.5**: 1.5x faster than Turbo; best for English-only short-form.
3. **Moonshine Base (61M)**: 5x faster than Whisper Tiny, ultra-lightweight. Ideal for always-on streaming.
4. **NVIDIA Parakeet TDT 0.6B**: RTFx of 3,386 but CUDA-native — does NOT run on Apple Silicon natively.
5. **WhisperX**: Adds diarization + word timestamps on top of faster-whisper. Latency 380-520ms optimized.
6. **VoiceMode MCP**: Existing open-source project (mbailey/voicemode) integrates Whisper + Kokoro with Claude Code via MCP. Drop-in solution.

### TTS
1. **Kokoro-82M via MLX-Audio**: Clear leader. <0.3s per chunk, 54 voice presets, sub-200ms latency on Apple Silicon, top of HF TTS Arena. Best for real-time.
2. **F5-TTS**: Best voice cloning model. Non-autoregressive, supports M4 natively. Requires reference audio (~10s). Higher quality than Kokoro but slower.
3. **Sesame CSM-1B**: Conversational speech model, MLX port available, 8.1GB VRAM on MLX. Best for natural conversation with context awareness. Voice cloning supported.
4. **StyleTTS2**: Human-level quality, only 2GB VRAM, reference audio voice matching. Slightly slower.
5. **Piper (en_GB-jarvis-high.onnx)**: Pre-trained JARVIS voice model exists on HuggingFace (jgkawell/jarvis). Fast, lightweight, ONNX-based. Best "plug-in Jarvis voice" option.
6. **Bark (Suno)**: Most expressive/emotive but slowest. MIT licensed. Not recommended for real-time.

### VAD
- **Silero VAD**: MIT, 1.8MB model, 1ms per 30ms chunk on CPU. Zero telemetry. Standard choice.

### Wake Word
- **openWakeWord**: Open source, trains on synthetic data, good accuracy. Python/ONNX-native.
- **Porcupine (Picovoice)**: Commercial (free tier), no-code custom wake words, native Mac support. Better for production.

### Architecture
- Pipeline: Mic → Silero VAD → Moonshine/Whisper (streaming) → Claude LLM (streaming tokens) → Kokoro (sentence chunks) → Speaker
- Streaming TTS starts on first sentence boundary (~200-400ms after LLM begins)
- VoiceMode MCP is a production-ready implementation of this pattern
- End-to-end latency target: <800ms achievable, <500ms possible with optimization

### M4 Max Performance Budget (128GB)
- STT model: 1-3GB (Whisper Large V3 Turbo quantized)
- Primary LLM: 40-80GB (e.g. Llama 3.3 70B at Q4)
- TTS model: 0.5-8GB (Kokoro 82M to CSM-1B)
- Silero VAD: <5MB
- Total for full concurrent pipeline: ~50-90GB — fits within 128GB with headroom

**Jarvis Applications**:
- Use VoiceMode MCP as the integration layer (already Jarvis-compatible)
- Primary TTS: Kokoro-82M via mlx-audio for speed; use Piper JARVIS model for branding
- Voice cloning: F5-TTS for custom "Jarvis voice" creation from reference audio
- STT: mlx-whisper with Whisper Large V3 Turbo for accuracy; Moonshine Base as fallback for speed
- VAD: Silero VAD to gate STT and reduce compute waste
- Wake word: openWakeWord (open source) with custom "Hey Jarvis" model

**Reports**: Full report delivered in conversation (2026-02-17).

**Sources**: 25+ web sources including GitHub repos, Hugging Face leaderboards, ArXiv papers, benchmark sites.
