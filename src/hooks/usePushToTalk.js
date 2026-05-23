import { useCallback, useEffect, useRef, useState } from 'react';
import { PTT_WS_URL } from '../constants/ptt';

/* ==========================================================================
   usePushToTalk

   Hold-to-talk PCM-over-WebSocket pipeline. On `start()`:
     1. Open (or reuse) a WebSocket to PTT_WS_URL.
     2. Acquire the mic (48 kHz mono, with EC + NS).
     3. Send `{type:"ptt_start"}`.
     4. Stream Int16 PCM frames as ArrayBuffer chunks via an AudioWorklet.
   On `stop()`: tear the audio graph down, send `{type:"ptt_stop"}`.

   The WebSocket is held open between presses so subsequent holds skip the
   connect handshake. `stop()` and the unmount effect close the audio
   graph; the socket itself is closed on unmount.

   Status states:
     idle         — never pressed, no socket
     connecting   — socket opening on first press
     connected    — socket open, mic idle
     talking      — mic + stream live
     error        — last attempt failed (see `error` string)
     disconnected — socket closed by server / network
   ========================================================================== */

const WORKLET_CODE = `
class PcmProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const f32 = input[0];
    const i16 = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; i++) {
      const s = Math.max(-1, Math.min(1, f32[i]));
      i16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    this.port.postMessage(i16.buffer, [i16.buffer]);
    return true;
  }
}
registerProcessor('pcm-processor', PcmProcessor);
`;

export default function usePushToTalk(url = PTT_WS_URL) {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [level, setLevel] = useState(0);

  const wsRef = useRef(null);
  const audioCtxRef = useRef(null);
  const micStreamRef = useRef(null);
  const processorRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const talkingRef = useRef(false);

  const tearDownAudio = useCallback(() => {
    talkingRef.current = false;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (processorRef.current) {
      try { processorRef.current.disconnect(); } catch { /* noop */ }
      processorRef.current = null;
    }
    if (analyserRef.current) {
      try { analyserRef.current.disconnect(); } catch { /* noop */ }
      analyserRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => { /* noop */ });
      audioCtxRef.current = null;
    }
    setLevel(0);
  }, []);

  const stop = useCallback(() => {
    if (!talkingRef.current) return;
    tearDownAudio();
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type: 'ptt_stop' })); } catch { /* noop */ }
      setStatus('connected');
    } else {
      setStatus('disconnected');
    }
  }, [tearDownAudio]);

  const openSocket = useCallback(() => new Promise((resolve, reject) => {
    const existing = wsRef.current;
    if (existing && existing.readyState === WebSocket.OPEN) {
      resolve(existing);
      return;
    }
    setStatus('connecting');
    let ws;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      reject(e);
      return;
    }
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      wsRef.current = ws;
      setStatus('connected');
      resolve(ws);
    };
    ws.onerror = () => {
      reject(new Error('Cannot reach PTT server'));
    };
    ws.onclose = () => {
      wsRef.current = null;
      if (talkingRef.current) tearDownAudio();
      setStatus('disconnected');
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      try {
        const msg = JSON.parse(ev.data);
        if (msg && msg.type === 'error') setError(msg.message || 'Server error');
      } catch { /* noop */ }
    };
  }), [url, tearDownAudio]);

  const start = useCallback(async () => {
    if (talkingRef.current) return;
    setError(null);

    let ws;
    try {
      ws = await openSocket();
    } catch (e) {
      setStatus('error');
      setError(e.message || 'Connection failed');
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 48000,
          channelCount: 1,
        },
        video: false,
      });
    } catch (e) {
      setStatus('error');
      setError(`Mic error: ${e.message}`);
      return;
    }
    micStreamRef.current = stream;

    try { ws.send(JSON.stringify({ type: 'ptt_start' })); } catch { /* noop */ }

    const audioCtx = new AudioContext({ sampleRate: 48000 });
    audioCtxRef.current = audioCtx;

    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;
    source.connect(analyser);

    const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    try {
      await audioCtx.audioWorklet.addModule(blobUrl);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }

    const processor = new AudioWorkletNode(audioCtx, 'pcm-processor');
    processorRef.current = processor;
    processor.port.onmessage = (e) => {
      if (!talkingRef.current) return;
      const w = wsRef.current;
      if (!w || w.readyState !== WebSocket.OPEN) return;
      try { w.send(e.data); } catch { /* noop */ }
    };
    analyser.connect(processor);
    processor.connect(audioCtx.destination);

    talkingRef.current = true;
    setStatus('talking');

    const buf = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      const a = analyserRef.current;
      if (!a) return;
      a.getByteFrequencyData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i];
      setLevel(Math.min(100, (sum / buf.length) * 2));
      animFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, [openSocket]);

  useEffect(() => () => {
    tearDownAudio();
    const ws = wsRef.current;
    if (ws) {
      try { ws.close(); } catch { /* noop */ }
      wsRef.current = null;
    }
  }, [tearDownAudio]);

  return {
    status,
    error,
    level,
    start,
    stop,
    talking: status === 'talking',
  };
}
