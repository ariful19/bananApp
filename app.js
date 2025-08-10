// Simple kid-friendly Bengali spelling app with virtual keyboard and Gemini fetch

const VOWELS = [
  "অ","আ","ই","ঈ","উ","ঊ","ঋ","এ","ঐ","ও","ঔ"
];
const CONSONANTS = [
  "ক","খ","গ","ঘ","ঙ","চ","ছ","জ","ঝ","ঞ",
  "ট","ঠ","ড","ঢ","ণ","ত","থ","দ","ধ","ন",
  "প","ফ","ব","ভ","ম","য","র","ল","শ","ষ","স","হ","ড়","ঢ়","য়","ৎ","ক্ষ","জ্ঞ"
];
const VOWEL_SIGNS = [
  "া","ি","ী","ু","ূ","ৃ","ে","ৈ","ো","ৌ","ঁ","্"
];

const els = {
  word: document.getElementById("word"),
  keyboard: document.getElementById("keyboard"),
  go: document.getElementById("go"),
  speak: document.getElementById("speak"),
  img: document.getElementById("result-image"),
  status: document.getElementById("status"),
  settings: document.getElementById("settings-dialog"),
  openSettings: document.getElementById("open-settings"),
  colorPrimary: document.getElementById("color-primary"),
  colorBg: document.getElementById("color-bg"),
  glassBlur: document.getElementById("glass-blur"),
  apiKey: document.getElementById("api-key"),
  saveSettings: document.getElementById("save-settings"),
  clearKey: document.getElementById("clear-key"),
  imageDialog: document.getElementById("image-dialog"),
  fullImage: document.getElementById("full-image"),
};

// Persisted settings
const store = {
  get() {
    try { return JSON.parse(localStorage.getItem("bn_app_settings") || "{}"); } catch { return {}; }
  },
  set(v) { localStorage.setItem("bn_app_settings", JSON.stringify(v)); }
};

function applyTheme() {
  const s = store.get();
  if (s.primary) document.documentElement.style.setProperty("--primary", s.primary);
  if (s.bg) document.documentElement.style.setProperty("--bg", s.bg);
  if (typeof s.blur === "number") document.documentElement.style.setProperty("--glass-blur", `${s.blur}px`);
  els.colorPrimary.value = s.primary || getComputedStyle(document.documentElement).getPropertyValue("--primary");
  els.colorBg.value = s.bg || "#0f1020";
  els.glassBlur.value = s.blur ?? 10;
  els.apiKey.value = s.apiKey || "";
}

function saveSettings() {
  const s = store.get();
  const next = {
    ...s,
    primary: els.colorPrimary.value,
    bg: els.colorBg.value,
    blur: parseInt(els.glassBlur.value, 10) || 10,
    apiKey: els.apiKey.value.trim(),
  };
  store.set(next);
  applyTheme();
}

function buildKeyboard() {
  const frag = document.createDocumentFragment();

  const makeKey = (label, className = "", onClick) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `key ${className}`.trim();
    b.textContent = label;
    b.addEventListener("click", () => (onClick ? onClick() : insertChar(label)));
    return b;
  };

  const addRow = (keys) => {
    const row = document.createElement("div");
    row.className = "key-row";
    keys.forEach(k => {
      if (k === "⌫") row.appendChild(makeKey(k, "", backspace));
      else if (k === "স্পেস") row.appendChild(makeKey(k, "", () => insertChar(" ")));
      else row.appendChild(makeKey(k));
    });
    frag.appendChild(row);
  };

  addRow(VOWELS);
  addRow(CONSONANTS);
  addRow(VOWEL_SIGNS);
  addRow(["⌫", "স্পেস"]);

  els.keyboard.innerHTML = "";
  els.keyboard.appendChild(frag);
}

function backspace() {
  const v = els.word.value;
  els.word.value = v.slice(0, -1);
}

function insertChar(ch) {
  // If vowel sign typed first, keep as is; otherwise append to previous consonant naturally.
  const v = els.word.value;
  els.word.value = v + ch;
  keySound();
}

// Tiny synth click for feedback
function keySound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine"; o.frequency.value = 740;
    g.gain.setValueAtTime(0.08, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.06);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.07);
  } catch {}
}

async function generateImage() {
  const text = els.word.value.trim();
  if (!text) return setStatus("শব্দ লিখুন, তারপর চলো বাটন চাপুন।");

  setStatus("ছবি তৈরি হচ্ছে… অনুগ্রহ করে অপেক্ষা করুন।");
  els.img.style.display = "none";

  const { apiKey } = store.get();
  if (!apiKey) {
    setStatus("Gemini API কী প্রয়োজন — সেটিংস থেকে যোগ করুন।");
    try { els.settings.showModal(); els.apiKey.focus(); } catch {}
    return;
  }

  try {
    const body = {
      contents: [
        { role: "user", parts: [{ text: `create image of a "${text}"` }] }
      ],
      generationConfig: { responseModalities: ["IMAGE","TEXT"] }
    };
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:streamGenerateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    
    // Prefer parsing a full JSON body (object or array) and extract image data
    try {
      const obj = await res.clone().json();
      const extracted = extractImageFromAny(obj);
      if (extracted) {
        showImage(extracted.url);
        setStatus("");
        return;
      }
      // Fall through to stream parsing when not found
    } catch { /* Not JSON or failed; try streaming parse */ }

    // Streaming JSON chunks; collect base64 image if present.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let imgBase64 = null;
    let imgMime = "image/png";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split(/\n+/);
      buf = lines.pop() || ""; // keep incomplete
      for (const line of lines) {
        const trimmed = line.replace(/^data:\s*/, "").trim();
        if (!trimmed) continue;
        try {
          const obj = JSON.parse(trimmed);
          // candidates-style parts
          const partsA = obj?.candidates?.[0]?.content?.parts || obj?.serverContent?.modelTurn?.parts || [];
          for (const p of partsA) {
            const d = p.inlineData?.data; const m = p.inlineData?.mimeType;
            if (d) { imgBase64 = d; if (m) imgMime = m; }
          }
          // example-style top-level contents
          if (!imgBase64 && Array.isArray(obj?.contents)) {
            for (const turn of obj.contents) {
              for (const part of (turn.parts || [])) {
                const d = part?.inlineData?.data; const m = part?.inlineData?.mimeType;
                if (d) { imgBase64 = d; if (m) imgMime = m; }
              }
            }
          }
        } catch { /* ignore parse errors on partial lines */ }
      }
    }

    // Process any remaining buffer as a final JSON chunk
    if (!imgBase64 && buf.trim()) {
      try {
        const obj = JSON.parse(buf.trim());
        const extracted = extractImageFromAny(obj);
        if (extracted) {
          imgBase64 = extracted.url.split(",")[1];
          imgMime = extracted.mime;
        }
      } catch {}
    }

    if (imgBase64) {
      showImage(`data:${imgMime};base64,${imgBase64}`);
      setStatus("");
    } else {
      throw new Error("No image data in response");
    }
  } catch (err) {
    console.error(err);
    const url = await renderPlaceholder(text);
    showImage(url);
    setStatus("ত্রুটি: আসল ছবি আনা যায়নি — প্লেসহোল্ডার দেখানো হলো।");
  }
}

function showImage(url) {
  els.img.src = url;
  els.img.style.display = "block";
  els.fullImage.src = url;
}

function setStatus(msg) {
  els.status.textContent = msg || "";
}

async function renderPlaceholder(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024; canvas.height = 768;
  const ctx = canvas.getContext("2d");
  // Ensure custom font is ready to render on canvas
  try { if (document.fonts && document.fonts.load) { await document.fonts.load("bold 120px 'Kalpurush'"); } } catch {}
  const grad = ctx.createLinearGradient(0,0,1024,768);
  grad.addColorStop(0, getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#7c4dff");
  grad.addColorStop(1, "#4a148c");
  ctx.fillStyle = grad; ctx.fillRect(0,0,1024,768);
  ctx.fillStyle = "rgba(255,255,255,.9)";
  ctx.font = "bold 120px 'Kalpurush', 'Noto Sans Bengali', 'Noto Sans', sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, 512, 384);
  return canvas.toDataURL("image/png");
}

// Event wiring
buildKeyboard();
applyTheme();

els.go.addEventListener("click", generateImage);
els.openSettings.addEventListener("click", () => els.settings.showModal());
els.saveSettings.addEventListener("click", (e) => { e.preventDefault(); saveSettings(); els.settings.close(); });
els.clearKey.addEventListener("click", () => { const s = store.get(); delete s.apiKey; store.set(s); els.apiKey.value = ""; });

// Allow Enter key to trigger generation
els.word.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); generateImage(); } });

// Open full image dialog on click/keyboard
els.img.addEventListener("click", () => { if (els.img.src) els.imageDialog.showModal(); });
els.img.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && els.img.src) {
    e.preventDefault(); els.imageDialog.showModal();
  }
});
// Close dialog on clicking frame close or ESC (handled by dialog)
els.imageDialog.addEventListener("click", (e) => {
  // close if click outside the framed image area
  const rect = e.currentTarget.querySelector('.frame').getBoundingClientRect();
  if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
    els.imageDialog.close();
  }
});

// ---------- Text-to-Speech (Bangla) ----------
let bnVoice = null;
function pickBnVoice() {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  const byLang = voices.filter(v => /\b(bn|Bengali|Bangla)\b/i.test(v.lang) || /Bengali|Bangla/i.test(v.name));
  bnVoice = byLang[0] || voices.find(v => v.lang && v.lang.toLowerCase().startsWith('bn')) || null;
  return bnVoice;
}
if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => pickBnVoice();
  pickBnVoice();
}

let currentAudio = null;
function base64ToUint8Array(b64) {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function speakText() {
  const text = (els.word.value || '').trim();
  if (!text) { setStatus('প্রথমে শব্দ লিখুন।'); return; }

  const { apiKey } = store.get();
  // Prefer Gemini TTS per instruction.md; fall back to Web Speech if no key
  if (apiKey) {
    els.speak?.setAttribute('disabled', '');
    setStatus('শব্দকে বক্তব্যে রূপান্তর হচ্ছে…');
    try {
      const audioUrl = await generateSpeechWithGemini(text, apiKey);
      await playAudioUrl(audioUrl);
      setStatus('');
    } catch (e) {
      console.error('TTS error', e);
      setStatus('ত্রুটি: বক্তব্য তৈরি করা যায়নি।');
    } finally {
      els.speak?.removeAttribute('disabled');
    }
    return;
  }

  // Fallback: Web Speech API
  if (!('speechSynthesis' in window)) { setStatus('আপনার ব্রাউজারে বক্তব্য সমর্থিত নয়।'); return; }
  try { window.speechSynthesis.cancel(); } catch {}
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'bn-BD';
  if (bnVoice) u.voice = bnVoice;
  u.rate = 0.95;
  u.pitch = 1.0;
  u.onstart = () => els.speak?.setAttribute('disabled', '');
  u.onend = () => { els.speak?.removeAttribute('disabled'); setStatus(''); };
  u.onerror = () => { els.speak?.removeAttribute('disabled'); setStatus('বক্তব্য চালু করা যায়নি।'); };
  setStatus('পাঠ করা হচ্ছে…');
  window.speechSynthesis.speak(u);
}

async function generateSpeechWithGemini(text, apiKey) {
  // Build prompt as in instruction.md
  const userText = `তুমি যা লিখেছ তা হলো, \"${text}\"`;
  const body = {
    contents: [ { role: 'user', parts: [ { text: userText } ] } ],
    generationConfig: {
      responseModalities: [ 'audio' ],
      temperature: 1,
      speech_config: {
        voice_config: { prebuilt_voice_config: { voice_name: 'Zephyr' } }
      }
    }
  };
  // Use user-provided API key from settings (passed in) rather than any hardcoded value
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:streamGenerateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

  // Try full JSON first
  try {
    const obj = await res.clone().json();
    const audio = extractAudioFromAny(obj);
    if (audio) {
      const url = buildAudioUrl(audio);
      return url;
    }
  } catch {}

  // Stream parse NDJSON chunks for inlineData audio
  let audioBase64 = null, mime = 'audio/mpeg';
  if (res.body && res.body.getReader) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split(/\n+/);
      buf = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.replace(/^data:\s*/, '').trim();
        if (!trimmed) continue;
        try {
          const obj = JSON.parse(trimmed);
          const partsA = obj?.candidates?.[0]?.content?.parts || obj?.serverContent?.modelTurn?.parts || [];
          for (const p of partsA) {
            const d = p.inlineData?.data; const m = p.inlineData?.mimeType;
            if (d) { audioBase64 = d; if (m) mime = m; }
          }
          if (!audioBase64 && Array.isArray(obj?.contents)) {
            for (const turn of obj.contents) {
              for (const part of (turn.parts || [])) {
                const d = part?.inlineData?.data; const m = part?.inlineData?.mimeType;
                if (d) { audioBase64 = d; if (m) mime = m; }
              }
            }
          }
        } catch {}
      }
    }
    if (!audioBase64 && buf.trim()) {
      try {
        const obj = JSON.parse(buf.trim());
        const audio = extractAudioFromAny(obj);
        if (audio) return buildAudioUrl(audio);
      } catch {}
    }
  }

  if (!audioBase64) throw new Error('No audio data in response');
  return buildAudioUrl({ data: audioBase64, mime });
}

function extractAudioFromAny(obj) {
  let data = null, mime = 'audio/mpeg';
  const scanObject = (o) => {
    if (Array.isArray(o?.contents)) {
      for (const turn of o.contents) {
        for (const part of (turn.parts || [])) {
          const d = part?.inlineData?.data; const m = part?.inlineData?.mimeType;
          if (d) { data = d; if (m) mime = m; }
        }
      }
    }
    const parts = o?.candidates?.[0]?.content?.parts || o?.serverContent?.modelTurn?.parts || [];
    for (const p of parts) {
      const d = p?.inlineData?.data; const m = p?.inlineData?.mimeType;
      if (d) { data = d; if (m) mime = m; }
    }
  };
  if (Array.isArray(obj)) { for (const it of obj) scanObject(it); }
  else if (obj && typeof obj === 'object') scanObject(obj);
  return data ? { data, mime } : null;
}

async function playAudioUrl(url) {
  if (currentAudio) { try { currentAudio.pause(); } catch {} }
  currentAudio = new Audio(url);
  await currentAudio.play();
  currentAudio.onended = () => { try { URL.revokeObjectURL(url); } catch {} };
}

function buildAudioUrl(audio) {
  const { data, mime } = audio;
  const bytes = base64ToUint8Array(data);
  // If PCM/L16, wrap into a WAV container for browser playback
  if (/audio\/(L16|pcm)/i.test(mime)) {
    const rateMatch = /rate=(\d{3,6})/i.exec(mime);
    const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;
    const wav = wavBlobFromPCM(bytes, sampleRate, 1, true);
    return URL.createObjectURL(wav);
  }
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

function wavBlobFromPCM(pcmBytes, sampleRate = 24000, channels = 1, littleEndian = true) {
  const blockAlign = channels * 2; // 16-bit
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmBytes.byteLength;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  let offset = 0;

  // RIFF chunk descriptor
  writeString(view, offset, 'RIFF'); offset += 4;
  view.setUint32(offset, 36 + dataSize, true); offset += 4; // ChunkSize
  writeString(view, offset, 'WAVE'); offset += 4;

  // fmt subchunk
  writeString(view, offset, 'fmt '); offset += 4;
  view.setUint32(offset, 16, true); offset += 4; // Subchunk1Size
  view.setUint16(offset, 1, true); offset += 2; // AudioFormat = PCM
  view.setUint16(offset, channels, true); offset += 2; // NumChannels
  view.setUint32(offset, sampleRate, true); offset += 4; // SampleRate
  view.setUint32(offset, byteRate, true); offset += 4; // ByteRate
  view.setUint16(offset, blockAlign, true); offset += 2; // BlockAlign
  view.setUint16(offset, 16, true); offset += 2; // BitsPerSample

  // data subchunk
  writeString(view, offset, 'data'); offset += 4;
  view.setUint32(offset, dataSize, true); offset += 4;

  // Copy PCM data (assume already little-endian 16-bit signed)
  new Uint8Array(buffer, 44).set(new Uint8Array(pcmBytes.buffer, pcmBytes.byteOffset, dataSize));

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

els.speak.addEventListener('click', speakText);

// Helper to extract inlineData from various JSON shapes (object, array, streaming chunk)
function extractImageFromAny(obj) {
  let data = null, mime = "image/png";

  const extractFromObject = (o) => {
    // Top-level contents format
    if (Array.isArray(o?.contents)) {
      for (const turn of o.contents) {
        for (const part of (turn.parts || [])) {
          const d = part?.inlineData?.data; const m = part?.inlineData?.mimeType;
          if (d) { data = d; if (m) mime = m; }
        }
      }
    }
    // Candidates/content format
    const parts = o?.candidates?.[0]?.content?.parts || o?.serverContent?.modelTurn?.parts || [];
    for (const p of parts) {
      const d = p?.inlineData?.data; const m = p?.inlineData?.mimeType;
      if (d) { data = d; if (m) mime = m; }
    }
  };

  if (Array.isArray(obj)) {
    for (const item of obj) extractFromObject(item);
  } else if (obj && typeof obj === "object") {
    extractFromObject(obj);
  }

  return data ? { url: `data:${mime};base64,${data}`, mime } : null;
}
