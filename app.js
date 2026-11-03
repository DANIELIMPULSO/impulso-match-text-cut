(() => {
  const $ = (id) => document.getElementById(id);
  const cv = $("cv");
  const pctx = cv.getContext("2d");
  const mctx = document.createElement("canvas").getContext("2d"); // só para medir texto
  const EXPORT_SCALE = 2; // quadro de design 1920x1080 -> 3840x2160
  const LABEL_FONT = "Inter";

  const FONTS = [
    { name: "Libre Baskerville", on: true },
    { name: "Tinos", on: true },
    { name: "Playfair Display", on: true },
    { name: "PT Serif", on: true },
    { name: "Source Serif 4", on: true },
    { name: "EB Garamond", on: false },
    { name: "Merriweather", on: false },
    { name: "Lora", on: false },
    { name: "Old Standard TT", on: false },
    { name: "Crimson Text", on: false },
  ];

  // ---------- Estado ----------
  let DW = 1920, DH = 1080; // tamanho de design (preview em 1x, exportação em 2x)
  let pool = window.bancoOffline($("context").value);
  let poolFromAI = false;
  let current = null;

  // ---------- UI ----------
  const fontsBox = $("fonts");
  FONTS.forEach((f, i) => {
    const l = document.createElement("label");
    l.innerHTML = `<input type="checkbox" data-i="${i}" ${f.on ? "checked" : ""}> <span style="font-family:'${f.name}'">${f.name}</span>`;
    fontsBox.appendChild(l);
  });
  fontsBox.addEventListener("change", (e) => {
    FONTS[e.target.dataset.i].on = e.target.checked;
    if (!FONTS.some((f) => f.on)) { FONTS[0].on = true; fontsBox.querySelector("input").checked = true; }
    regenerate();
  });

  const fmt = {
    speed: (v) => v + "/s", hold: (v) => v + " s", size: (v) => v,
    depth: (v) => Math.round(v * 100) + "%", vignette: (v) => Math.round(v * 100) + "%",
    grain: (v) => Math.round(v * 100) + "%", zoomPct: (v) => v + "%", volume: (v) => Math.round(v * 100) + "%",
  };
  Object.keys(fmt).forEach((k) => {
    const upd = () => ($(k + "Val").textContent = fmt[k]($(k).value));
    $(k).addEventListener("input", upd); upd();
  });

  function updateResHint() {
    $("resHint").textContent = `Saída: ${DW * EXPORT_SCALE} × ${DH * EXPORT_SCALE} px, H.264 + AAC`;
  }
  $("ratio").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    [...$("ratio").children].forEach((x) => x.classList.toggle("on", x === b));
    DW = +b.dataset.w; DH = +b.dataset.h; cv.width = DW; cv.height = DH;
    updateResHint(); regenerate();
  });
  $("themes").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const [bg, t, hi, ht] = b.dataset.t.split(",");
    $("cBg").value = bg; $("cText").value = t; $("cHi").value = hi; $("cHiText").value = ht;
    drawCurrent();
  });
  document.querySelectorAll(".layout").forEach((el) => el.addEventListener("change", () => {
    if (!layouts().length) el.checked = true;
    regenerate();
  }));
  $("keyword").addEventListener("input", debounce(regenerate, 150));
  $("size").addEventListener("input", debounce(regenerate, 60));
  $("context").addEventListener("input", debounce(() => {
    if (!poolFromAI) { pool = window.bancoOffline($("context").value); regenerate(); }
  }, 300));
  $("soundTest").addEventListener("click", () => {
    const a = liveAudio(); a.resume();
    playSound(a, a.destination, a.currentTime + 0.02, +$("volume").value, $("sound").value);
  });
  $("sound").addEventListener("change", () => $("soundTest").click());
  $("zoomOn").addEventListener("change", () => { $("zoomOpts").hidden = !$("zoomOn").checked; drawCurrent(); });
  ["zoomDir", "zoomMode", "zoomPct"].forEach((id) => $(id).addEventListener("input", drawCurrent));
  ["cBg", "cText", "cHi", "cHiText", "depth", "vignette", "grain"].forEach((id) => $(id).addEventListener("input", drawCurrent));

  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
  const layouts = () => [...document.querySelectorAll(".layout:checked")].map((e) => e.value);
  const enabledFonts = () => FONTS.filter((f) => f.on).map((f) => f.name);

  // ---------- IA ----------
  // A chave nunca é salva: fica só na memória desta aba e some ao recarregar.
  // Também apaga a chave que versões anteriores do site guardavam no navegador.
  try { localStorage.removeItem("tmc-chave-api"); } catch {}
  // Se o navegador ainda tentar preencher o campo sozinho, apaga até a pessoa digitar ou colar.
  let keyTouched = false;
  ["keydown", "paste"].forEach((ev) => $("apiKey").addEventListener(ev, () => (keyTouched = true)));
  const clearAutofill = () => { if (!keyTouched && $("apiKey").value) { $("apiKey").value = ""; updateAiStatus(); } };
  $("apiKey").value = "";
  [300, 1000, 2500].forEach((ms) => setTimeout(clearAutofill, ms));
  const getKey = () => $("apiKey").value.trim();
  function updateAiStatus() {
    $("aiStatus").textContent = getKey()
      ? "IA ativada: as frases serão escritas sobre o contexto."
      : "Sem chave: usando o banco de frases embutido com os termos do contexto.";
  }
  $("apiKey").addEventListener("input", updateAiStatus);
  $("forgetKey").addEventListener("click", () => { $("apiKey").value = ""; updateAiStatus(); });
  updateAiStatus();

  $("aiBtn").addEventListener("click", async () => {
    const contexto = $("context").value.trim();
    if (!getKey()) {
      pool = window.bancoOffline(contexto); poolFromAI = false; regenerate();
      $("aiStatus").textContent = "Banco embutido atualizado com os termos do contexto (cole uma chave da API para frases escritas por IA).";
      return;
    }
    $("aiBtn").disabled = true;
    $("aiStatus").textContent = "Escrevendo frases… (pode levar alguns segundos)";
    try {
      if (!window.gerarFrasesIA) throw new Error("O módulo da IA não carregou. Verifique a conexão e recarregue a página.");
      const d = await window.gerarFrasesIA(getKey(), contexto, $("keyword").value.trim());
      const base = window.bancoOffline(contexto);
      const valid = (arr, min) => { const ok = (arr || []).filter((t) => t.split("{k}").length === 2); return ok.length >= min ? ok : null; };
      pool = {
        frases: d.frases.length >= 10 ? d.frases : base.frases,
        manchetes: d.manchetes.length ? d.manchetes : base.manchetes,
        citacoes: d.citacoes.length ? d.citacoes : base.citacoes,
        comPalavra: valid(d.frases_com_palavra, 8) || base.comPalavra,
        citacoesPalavra: valid(d.citacoes_com_palavra, 4) || base.citacoesPalavra,
        jornais: d.jornais.length ? d.jornais : base.jornais,
        assinaturas: d.assinaturas.length ? d.assinaturas : base.assinaturas,
      };
      poolFromAI = true;
      $("aiStatus").textContent = `${pool.frases.length} frases geradas sobre “${contexto || "cotidiano"}”.`;
      regenerate();
    } catch (err) {
      $("aiStatus").textContent = "Falhou: " + err.message;
    } finally {
      $("aiBtn").disabled = false;
    }
  });

  // ---------- Utilidades de texto ----------
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const rand = (a, b) => a + Math.random() * (b - a);
  const fontStr = (w, px, fam, italic) => `${italic ? "italic " : ""}${w} ${px}px "${fam}"`;
  function measure(text, font) { mctx.font = font; return mctx.measureText(text).width; }
  function wrap(text, maxW, font) {
    mctx.font = font;
    const words = text.split(/\s+/).filter(Boolean);
    const lines = []; let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (line && mctx.measureText(test).width > maxW) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }
  const paragraph = (n) => Array.from({ length: n }, () => pick(pool.frases)).join(" ");
  // divide a frase em volta de {k}; se a palavra abre a frase, ela já começa maiúscula
  function fillKeyword(tpl, keyword) {
    const [a, b = ""] = tpl.split("{k}");
    return [a.trim(), b.trim()];
  }
  const upperFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // ---------- Geração do quadro (independente de resolução) ----------
  function makeFrame() {
    const keyword = $("keyword").value.trim() || "Palavra";
    const fonts = enabledFonts();
    const f = {
      layout: pick(layouts()),
      keyword,
      body: pick(fonts),
      head: pick(fonts),
      fs: +$("size").value,
      W: DW, H: DH,
    };
    if (f.layout === "corpo") {
      const font = fontStr(400, f.fs, f.body);
      // a palavra entra no lugar reservado {k} de uma frase escrita para ela
      const [antes, depois] = fillKeyword(pick(pool.comPalavra), keyword);
      let left = (paragraph(3) + " " + antes).trim();
      let right = (depois + " " + paragraph(3)).trim();
      while (measure(left, font) < DW) left = pick(pool.frases) + " " + left;
      while (measure(right, font) < DW) right += " " + pick(pool.frases);
      f.left = left; f.right = right;
      const lineH = f.fs * 1.6;
      const n = Math.ceil(DH / 2 / lineH) + 1;
      f.lines = [];
      for (let i = -n; i <= n; i++) {
        if (i === 0) continue;
        let t = pick(pool.frases);
        while (measure(t, font) < DW * 2) t += " " + pick(pool.frases);
        f.lines.push({ i, t, r: Math.random() });
      }
    } else if (f.layout === "manchete") {
      f.headline = keyword + " " + pick(pool.manchetes);
      f.paper = pick(pool.jornais);
      f.byline = pick(pool.assinaturas);
      f.above = paragraph(40); f.below = paragraph(40);
    } else {
      const [antes, depois] = fillKeyword(pick(pool.citacoesPalavra.filter((t) => !/^\s*[“"]?\s*\{k\}/.test(t)).concat(window.BANCO_PT.citacoesPalavra.slice(0, 1))).replace(/^[“"]|[”"]$/g, ""), keyword);
      f.before = "“" + upperFirst(antes);
      f.after = depois.replace(/[.!?]*$/, "") + "”";
      f.paper = pick(pool.jornais);
      f.above = paragraph(40); f.below = paragraph(40);
    }
    return f;
  }

  // ---------- Desenho ----------
  let grainPattern = null;
  function grain(ctx) {
    if (!grainPattern) {
      const c = document.createElement("canvas"); c.width = c.height = 256;
      const g = c.getContext("2d"); const img = g.createImageData(256, 256);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0); grainPattern = c;
    }
    return ctx.createPattern(grainPattern, "repeat");
  }

  function drawFrame(ctx, f, scale, overlays = true) {
    const W = f.W, H = f.H, cy = H / 2;
    const col = { bg: $("cBg").value, text: $("cText").value, hi: $("cHi").value, hiText: $("cHiText").value };
    const depth = +$("depth").value;
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = col.bg; ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";

    // desfoque e opacidade pela distância até a linha central
    const dist = (y) => Math.min(1.2, Math.abs(y - cy) / (H / 2));
    const blurAt = (y, k = 1) => depth * k * 7 * Math.pow(dist(y), 1.35);
    const alphaAt = (y) => 1 - 0.4 * dist(y);
    function txt(t, x, y, font, { alpha = 1, blur = 0, color = col.text, align = "left", spacing = "0px" } = {}) {
      ctx.save();
      ctx.font = font; ctx.fillStyle = color; ctx.globalAlpha = alpha; ctx.textAlign = align;
      if ("letterSpacing" in ctx) ctx.letterSpacing = spacing;
      if (blur > 0.12) ctx.filter = `blur(${(blur * scale).toFixed(2)}px)`;
      ctx.fillText(t, x, y);
      ctx.restore();
    }
    function highlight(x, y, w, size, font) {
      ctx.fillStyle = col.hi;
      ctx.fillRect(x - size * 0.1, y - size * 0.62, w + size * 0.2, size * 1.2);
      txt(f.keyword, x, y, font, { color: col.hiText });
    }
    function rule(x, y, w, alpha = 0.35) {
      ctx.save(); ctx.globalAlpha = alpha * alphaAt(y); ctx.fillStyle = col.text;
      ctx.fillRect(x, y, w, 1.5); ctx.restore();
    }
    // bloco de texto pequeno acima/abaixo
    function column(text, x, maxW, size, fromY, dir) {
      const font = fontStr(400, size, f.body);
      const lines = wrap(text, maxW, font);
      const lh = size * 1.6;
      if (dir < 0) {
        for (let j = 0; j < lines.length; j++) {
          const y = fromY - j * lh; if (y < -lh) break;
          txt(lines[lines.length - 1 - j], x, y, font, { alpha: 0.72 * alphaAt(y), blur: blurAt(y) });
        }
      } else {
        for (let j = 0; j < lines.length; j++) {
          const y = fromY + j * lh; if (y > H + lh) break;
          txt(lines[j], x, y, font, { alpha: 0.72 * alphaAt(y), blur: blurAt(y) });
        }
      }
    }

    if (f.layout === "corpo") {
      const font = fontStr(400, f.fs, f.body);
      const kwW = measure(f.keyword, font);
      const kwX = W / 2 - kwW / 2;
      const sp = measure(" ", font);
      const lineH = f.fs * 1.6;
      for (const l of f.lines) {
        const y = cy + l.i * lineH;
        const x = -l.r * Math.max(0, measure(l.t, font) - W);
        txt(l.t, x, y, font, { alpha: 0.85 * alphaAt(y), blur: blurAt(y) });
      }
      txt(f.left, kwX - sp, cy, font, { align: "right", alpha: 0.92 });
      txt(f.right, kwX + kwW + (/^[,.;:!?…”)]/.test(f.right) ? 0 : sp), cy, font, { alpha: 0.92 });
      highlight(kwX, cy, kwW, f.fs, font);
    } else if (f.layout === "manchete") {
      const hs = f.fs * 1.25;
      const hFont = fontStr(700, hs, f.head);
      const kwW = measure(f.keyword, hFont);
      const x = W / 2 - kwW / 2;
      const colW = Math.max(Math.min(W, H) * 0.9, kwW * 2);
      const lines = wrap(f.headline, colW, hFont);
      const lh = hs * 1.12;
      lines.forEach((t, j) => {
        const y = cy + j * lh;
        const rest = j === 0 ? t.slice(f.keyword.length) : t;
        if (j === 0) txt(rest, x + kwW, y, hFont, { blur: blurAt(y, 0.4) });
        else txt(rest, x, y, hFont, { blur: blurAt(y, 0.4) });
      });
      highlight(x, cy, kwW, hs, hFont);
      const small = f.fs * 0.42;
      const topY = cy - hs * 1.45;
      txt(f.paper, x, topY, fontStr(600, f.fs * 0.2, LABEL_FONT), { alpha: 0.6, spacing: `${f.fs * 0.02}px`, blur: blurAt(topY, 0.5) });
      rule(x, topY - f.fs * 0.55, colW);
      column(f.above, x, colW * 0.85, small, topY - f.fs * 1.05, -1);
      const endY = cy + (lines.length - 1) * lh + hs * 1.15;
      txt(f.byline, x, endY, fontStr(400, f.fs * 0.2, f.body, true), { alpha: 0.6, blur: blurAt(endY, 0.5) });
      rule(x, endY + f.fs * 0.45, colW);
      column(f.below, x, colW * 0.85, small, endY + f.fs * 1.05, 1);
    } else {
      const qs = f.fs * 1.05;
      const qFont = fontStr(700, qs, f.head);
      const kwW = measure(f.keyword, qFont);
      const x = W / 2 - kwW / 2;
      const colW = Math.max(Math.min(W, H) * 0.6, kwW * 1.6);
      const lh = qs * 1.22;
      const pre = wrap(f.before, colW, qFont);
      const post = wrap(f.keyword + (/^[,.;:!?…”)]/.test(f.after) ? "" : " ") + f.after, colW, qFont);
      pre.forEach((t, j) => {
        const y = cy - (pre.length - j) * lh;
        txt(t, j === 0 ? x - measure("“", qFont) * 0.15 : x, y, qFont, { blur: blurAt(y, 0.45) });
      });
      post.forEach((t, j) => {
        const y = cy + j * lh;
        if (j === 0) txt(t.slice(f.keyword.length), x + kwW, y, qFont);
        else txt(t, x, y, qFont, { blur: blurAt(y, 0.45) });
      });
      highlight(x, cy, kwW, qs, qFont);
      const topY = cy - (pre.length + 0.85) * lh;
      txt(f.paper, x, topY, fontStr(700, f.fs * 0.12, LABEL_FONT), { alpha: 0.7, spacing: `${f.fs * 0.01}px`, blur: blurAt(topY, 0.6) });
      rule(x, topY + f.fs * 0.2, colW * 1.05, 0.5);
      const small = f.fs * 0.38;
      column(f.above, x, colW, small, topY - f.fs * 0.6, -1);
      const endY = cy + post.length * lh + f.fs * 0.5;
      column(f.below, x, colW, small, endY, 1);
    }

    ctx.restore();
    if (overlays) drawOverlays(ctx, W, H, scale);
  }

  // textura do papel e vinheta (ficam fixas na tela, fora do zoom)
  function drawOverlays(ctx, W, H, scale) {
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const gr = +$("grain").value;
    if (gr > 0) {
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = gr * 0.08; ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = grain(ctx); ctx.fillRect(0, 0, W * scale, H * scale);
      ctx.restore();
    }
    // vinheta
    const v = +$("vignette").value;
    if (v > 0) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) / 2);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, `rgba(0,0,0,${0.55 * v})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const b = ctx.createLinearGradient(0, H * 0.82, 0, H);
      b.addColorStop(0, "rgba(0,0,0,0)"); b.addColorStop(1, `rgba(0,0,0,${0.4 * v})`);
      ctx.fillStyle = b; ctx.fillRect(0, H * 0.82, W, H * 0.18);
    }
    ctx.restore();
  }

  // ---------- Zoom ----------
  // Cada corte é desenhado uma vez num quadro maior (zMax) e depois reduzido
  // quadro a quadro, então o zoom fica nítido mesmo em 4K.
  const zoomCfg = () => {
    const on = $("zoomOn").checked, p = on ? +$("zoomPct").value / 100 : 0;
    return { on, p, zMax: 1 + p, dir: $("zoomDir").value, mode: $("zoomMode").value };
  };
  function zoomAt(z, t, total, cutStart, cutEnd) {
    if (!z.on) return 1;
    const prog = z.mode === "cut"
      ? Math.min(1, Math.max(0, (t - cutStart) / Math.max(1e-6, cutEnd - cutStart)))
      : Math.min(1, t / total);
    return 1 + z.p * (z.dir === "in" ? prog : 1 - prog);
  }
  function makeLayer(w, h) {
    if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
    const c = document.createElement("canvas"); c.width = w; c.height = h; return c;
  }
  // desenha o corte f na camada (uma vez por corte)
  function renderCut(layer, f, scale, zMax) {
    const w = Math.round(f.W * scale * zMax), h = Math.round(f.H * scale * zMax);
    if (layer.width !== w || layer.height !== h) { layer.width = w; layer.height = h; }
    drawFrame(layer.getContext("2d"), f, scale * zMax, false);
  }
  // monta o quadro final com o zoom z
  function compose(ctx, layer, outW, outH, z, scale) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    const zMax = layer.width / outW;
    const sw = layer.width * (z / zMax), sh = layer.height * (z / zMax);
    ctx.drawImage(layer, (outW - sw) / 2, (outH - sh) / 2, sw, sh);
    ctx.restore();
    drawOverlays(ctx, outW / scale, outH / scale, scale);
  }
  const prevLayer = makeLayer(DW, DH);
  function showStill(f) {
    const z = zoomCfg();
    renderCut(prevLayer, f, 1, z.zMax);
    compose(pctx, prevLayer, cv.width, cv.height, zoomAt(z, 0, 1, 0, 1), 1);
  }
  function regenerate() { current = makeFrame(); showStill(current); }
  function drawCurrent() { if (current) showStill(current); }

  // ---------- Linha do tempo ----------
  function schedule() {
    const dur = Math.max(0.5, +$("duration").value);
    const base = 1 / +$("speed").value;
    const times = []; let t = 0;
    while (t < dur - 1e-6) {
      times.push(t);
      let step = base;
      if ($("accel").checked && t > dur * 0.6) step = base * (1 + ((t - dur * 0.6) / (dur * 0.4)) * 3);
      t += step;
    }
    return { times, total: dur + +$("hold").value };
  }
  const cutIndexAt = (times, t) => { let i = 0; while (i + 1 < times.length && times[i + 1] <= t + 1e-9) i++; return i; };

  // ---------- Áudio ----------
  // Sons sintetizados (sem arquivos externos). Cada um é agendado no instante "when".
  function noise(a, dur, env) {
    const len = Math.max(1, Math.floor(a.sampleRate * dur));
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * env(i / len);
    const src = a.createBufferSource(); src.buffer = buf; return src;
  }
  function filt(a, type, freq, q = 0.7) { const f = a.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; }
  function tone(a, out, when, f0, f1, dur, gain, type = "sine") {
    const o = a.createOscillator(); const g = a.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, when); o.frequency.exponentialRampToValueAtTime(f1, when + dur);
    g.gain.setValueAtTime(gain, when); g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g).connect(out); o.start(when); o.stop(when + dur + 0.01);
  }
  function burst(a, out, when, dur, freq, gain, q = 0.8, type = "highpass", shape = 5) {
    const g = a.createGain(); g.gain.value = gain;
    const n = noise(a, dur, (x) => Math.pow(1 - x, shape));
    n.connect(filt(a, type, freq, q)).connect(g).connect(out); n.start(when);
  }
  const SOUNDS = {
    // folha de papel virando: ruído granulado em banda média-alta
    papel(a, out, t) {
      const n = noise(a, 0.13, (x) => Math.pow(Math.sin(Math.PI * Math.min(1, x * 1.6)), 0.6) * (0.55 + 0.45 * Math.random()) * (1 - x));
      const g = a.createGain(); g.gain.value = 0.9;
      n.connect(filt(a, "bandpass", 3200, 0.6)).connect(g).connect(out); n.start(t);
      burst(a, out, t + 0.005, 0.03, 6000, 0.35);
    },
    // obturador: dois estalos mecânicos (abre e fecha)
    obturador(a, out, t) {
      burst(a, out, t, 0.018, 2500, 1.0);
      tone(a, out, t, 180, 70, 0.03, 0.5);
      burst(a, out, t + 0.055, 0.025, 1800, 0.8);
      tone(a, out, t + 0.055, 140, 60, 0.04, 0.45);
    },
    // avanço de filme: catraca com cliques rápidos
    filme(a, out, t) {
      for (let k = 0; k < 5; k++) burst(a, out, t + k * 0.022, 0.012, 1600 + k * 120, 0.75 - k * 0.1, 2.5, "bandpass");
      const n = noise(a, 0.12, (x) => (1 - x) * 0.5);
      const g = a.createGain(); g.gain.value = 0.25;
      n.connect(filt(a, "lowpass", 700)).connect(g).connect(out); n.start(t);
    },
    // polaroid: estalo + motor ejetando a foto
    polaroid(a, out, t) {
      burst(a, out, t, 0.02, 2200, 0.9);
      const o = a.createOscillator(); o.type = "sawtooth";
      o.frequency.setValueAtTime(95, t + 0.02); o.frequency.linearRampToValueAtTime(120, t + 0.24);
      const g = a.createGain();
      g.gain.setValueAtTime(0.0001, t + 0.02); g.gain.exponentialRampToValueAtTime(0.25, t + 0.05);
      g.gain.setValueAtTime(0.25, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
      o.connect(filt(a, "lowpass", 900)).connect(g).connect(out); o.start(t + 0.02); o.stop(t + 0.27);
    },
    // flash: estouro curto e brilhante
    flash(a, out, t) {
      burst(a, out, t, 0.06, 800, 1.0, 0.7, "highpass", 8);
      tone(a, out, t, 1400, 180, 0.05, 0.4, "triangle");
      tone(a, out, t, 90, 40, 0.08, 0.6);
    },
  };
  // ajuste para que todos os sons tenham volume parecido
  const SOUND_GAIN = { papel: 2.0, obturador: 0.75, filme: 6.5, polaroid: 0.9, flash: 0.6 };
  function playSound(a, dest, when, vol, type) {
    const fn = SOUNDS[type]; if (!fn) return;
    const out = a.createGain(); out.gain.value = vol * (SOUND_GAIN[type] || 1); out.connect(dest);
    fn(a, out, when);
  }
  let actx = null;
  const liveAudio = () => (actx ||= new (window.AudioContext || window.webkitAudioContext)());

  // ---------- Pré-visualização ----------
  let playing = false, raf = 0;
  function play() {
    const { times, total } = schedule();
    const frames = times.map(makeFrame);
    const z = zoomCfg();
    let last = -1; const start = performance.now();
    const tick = () => {
      const t = ((performance.now() - start) / 1000) % total;
      const i = cutIndexAt(times, t);
      if (i !== last) {
        current = frames[i]; renderCut(prevLayer, current, 1, z.zMax); last = i;
        playSound(liveAudio(), liveAudio().destination, liveAudio().currentTime, +$("volume").value, $("sound").value);
      }
      const cutEnd = i + 1 < times.length ? times[i + 1] : total;
      compose(pctx, prevLayer, cv.width, cv.height, zoomAt(z, t, total, times[i], cutEnd), 1);
      raf = requestAnimationFrame(tick);
    };
    tick();
  }
  function stop() { cancelAnimationFrame(raf); playing = false; $("playBtn").textContent = "▶ Pré-visualizar"; }
  $("playBtn").addEventListener("click", async () => {
    if (playing) return stop();
    await fontsReady; liveAudio().resume();
    playing = true; $("playBtn").textContent = "■ Parar"; play();
  });
  $("shuffleBtn").addEventListener("click", () => { stop(); regenerate(); });

  // ---------- Exportação MP4 4K (WebCodecs, quadro a quadro) ----------
  async function pickVideoConfig(width, height, fps) {
    for (const codec of ["avc1.640034", "avc1.640033", "avc1.4d0034", "avc1.4d0033", "avc1.42003e"]) {
      const cfg = { codec, width, height, bitrate: 50_000_000, framerate: fps, avc: { format: "avc" } };
      try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg; } catch {}
    }
    return null;
  }
  async function pickAudioConfig() {
    for (const [codec, mux] of [["mp4a.40.2", "aac"], ["opus", "opus"]]) {
      const cfg = { codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 };
      try { if ((await AudioEncoder.isConfigSupported(cfg)).supported) return { cfg, mux }; } catch {}
    }
    return null;
  }
  async function renderAudio(times, total) {
    const sr = 48000;
    const oac = new OfflineAudioContext(2, Math.ceil(total * sr), sr);
    const vol = +$("volume").value;
    const type = $("sound").value;
    times.forEach((t) => playSound(oac, oac.destination, t, vol, type));
    return oac.startRendering();
  }

  $("renderBtn").addEventListener("click", async () => {
    if (!("VideoEncoder" in window)) { $("status").textContent = "Este navegador não suporta exportação em MP4. Use Chrome ou Edge atualizados."; return; }
    stop(); await fontsReady;
    const fps = +$("fps").value;
    const W = DW * EXPORT_SCALE, H = DH * EXPORT_SCALE;
    const vcfg = await pickVideoConfig(W, H, fps);
    if (!vcfg) { $("status").textContent = `Seu navegador não consegue codificar H.264 em ${W}×${H}.`; return; }
    const wantAudio = $("sound").value !== "none";
    const acfg = wantAudio ? await pickAudioConfig() : null;

    setBusy(true);
    $("result").style.display = "none";
    $("progress").style.display = "block";
    const bar = $("progress").firstElementChild;
    const { times, total } = schedule();
    const frames = times.map(makeFrame);

    const muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: { codec: "avc", width: W, height: H, frameRate: fps },
      ...(acfg ? { audio: { codec: acfg.mux, numberOfChannels: 2, sampleRate: 48000 } } : {}),
      fastStart: "in-memory",
      firstTimestampBehavior: "offset",
    });
    let encErr = null;
    const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => (encErr = e) });
    venc.configure(vcfg);

    const off = new OffscreenCanvas(W, H);
    const octx = off.getContext("2d");
    const z = zoomCfg();
    const layer = new OffscreenCanvas(1, 1);
    const nFrames = Math.round(total * fps);
    let last = -1;
    try {
      for (let n = 0; n < nFrames; n++) {
        if (encErr) throw encErr;
        const t = n / fps;
        const i = cutIndexAt(times, t);
        const isCut = i !== last;
        if (isCut) { renderCut(layer, frames[i], EXPORT_SCALE, z.zMax); last = i; }
        const cutEnd = i + 1 < times.length ? times[i + 1] : total;
        if (isCut || z.on) compose(octx, layer, W, H, zoomAt(z, t, total, times[i], cutEnd), EXPORT_SCALE);
        const vf = new VideoFrame(off, { timestamp: Math.round((n * 1e6) / fps), duration: Math.round(1e6 / fps) });
        venc.encode(vf, { keyFrame: isCut || n % fps === 0 });
        vf.close();
        while (venc.encodeQueueSize > 3) await new Promise((r) => setTimeout(r, 4));
        if (n % 3 === 0) {
          bar.style.width = (n / nFrames) * 90 + "%";
          $("status").textContent = `Renderizando quadro ${n + 1} de ${nFrames}…`;
          if (isCut) { pctx.drawImage(off, 0, 0, cv.width, cv.height); }
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      await venc.flush(); venc.close();

      if (acfg) {
        $("status").textContent = "Gerando áudio…";
        const buf = await renderAudio(times, total);
        const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => (encErr = e) });
        aenc.configure(acfg.cfg);
        const L = buf.getChannelData(0), R = buf.getChannelData(1);
        const CH = 1024;
        for (let s = 0; s < buf.length; s += CH) {
          const len = Math.min(CH, buf.length - s);
          const data = new Float32Array(len * 2);
          data.set(L.subarray(s, s + len), 0); data.set(R.subarray(s, s + len), len);
          const ad = new AudioData({ format: "f32-planar", sampleRate: 48000, numberOfFrames: len, numberOfChannels: 2, timestamp: Math.round((s / 48000) * 1e6), data });
          aenc.encode(ad); ad.close();
        }
        await aenc.flush(); aenc.close();
        if (encErr) throw encErr;
      }

      muxer.finalize();
      const blob = new Blob([muxer.target.buffer], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      $("outVideo").src = url;
      const name = ($("keyword").value.trim() || "matchcut").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
      $("download").href = url;
      $("download").download = `${name}-${W}x${H}.mp4`;
      $("download").textContent = `Baixar MP4 ${W}×${H} (${(blob.size / 1e6).toFixed(1)} MB)`;
      $("result").style.display = "flex";
      bar.style.width = "100%";
      $("status").textContent = acfg || !wantAudio ? "Pronto!" : "Pronto! (sem áudio: o navegador não codifica AAC)";
    } catch (e) {
      console.error(e);
      $("status").textContent = "Erro na exportação: " + (e.message || e);
    } finally {
      $("progress").style.display = "none";
      setBusy(false);
      drawCurrent();
    }
  });
  function setBusy(b) { ["renderBtn", "playBtn", "shuffleBtn", "aiBtn"].forEach((id) => ($(id).disabled = b)); }

  // ---------- Início ----------
  const fontsReady = Promise.all([
    ...FONTS.flatMap((f) => [
      document.fonts.load(fontStr(400, 40, f.name), "aÁ"),
      document.fonts.load(fontStr(700, 40, f.name), "aÁ"),
      document.fonts.load(fontStr(400, 40, f.name, true), "aÁ"),
    ]),
    document.fonts.load(fontStr(600, 40, LABEL_FONT), "A"),
    document.fonts.load(fontStr(700, 40, LABEL_FONT), "A"),
  ]).catch(() => {});
  updateResHint();
  regenerate();
  fontsReady.then(regenerate);
})();
