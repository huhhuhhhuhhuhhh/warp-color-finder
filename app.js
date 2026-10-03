/* Warp Color Finder - vanilla, no deps */
(function () {
  "use strict";

  var THEME_KEY = "warp-theme";

  var root = document.documentElement;
  var toggle = document.getElementById("themeToggle");
  var iconSun = document.getElementById("iconSun");
  var iconMoon = document.getElementById("iconMoon");

  function getSavedTheme() {
    try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; }
  }
  function applyTheme(t) {
    root.setAttribute("data-theme", t);
    var dark = t === "dark";
    iconSun.style.display = dark ? "none" : "";
    iconMoon.style.display = dark ? "" : "none";
  }
  function initTheme() {
    var saved = getSavedTheme();
    if (saved === "light" || saved === "dark") { applyTheme(saved); return; }
    var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(prefersDark ? "dark" : "light");
  }
  toggle.addEventListener("click", function () {
    var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  });
  initTheme();

  // ---- color utils (sRGB) ----
  function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }
  function toHex2(n) { var s = clamp(Math.round(n), 0, 255).toString(16); return s.length === 1 ? "0" + s : s; }
  function rgbToHex(r, g, b) { return ("#" + toHex2(r) + toHex2(g) + toHex2(b)).toUpperCase(); }
  function hexToRgb(hex) {
    var h = hex.replace("#", "").trim();
    if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
    var v = parseInt(h, 16);
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
  }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
  }
  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360; s = clamp(s, 0, 100) / 100; l = clamp(l, 0, 100) / 100;
    function f(n) {
      var k = (n + h / 30) % 12;
      var a = s * Math.min(l, 1 - l);
      return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    }
    return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
  }
  function mix(hexA, hexB, t) {
    var a = hexToRgb(hexA), b = hexToRgb(hexB);
    return rgbToHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
  }
  function fmtRgb(r, g, b) { return "rgb(" + r + ", " + g + ", " + b + ")"; }
  function fmtHsl(h, s, l) { return "hsl(" + h + ", " + s + "%, " + l + "%)"; }

  // ---- dom ----
  var dropzone = document.getElementById("dropzone");
  var fileInput = document.getElementById("fileInput");
  var editor = document.getElementById("editor");
  var canvas = document.getElementById("canvas");
  var ctx = canvas.getContext("2d", { willReadFrequently: true });
  var loupe = document.getElementById("loupe");
  var loupeCanvas = document.getElementById("loupeCanvas");
  var loupeCtx = loupeCanvas.getContext("2d");
  loupeCtx.imageSmoothingEnabled = false;

  var swatch = document.getElementById("swatch");
  var hexBig = document.getElementById("hexBig");
  var rgbSmall = document.getElementById("rgbSmall");
  var valHex = document.getElementById("valHex");
  var valRgb = document.getElementById("valRgb");
  var valHsl = document.getElementById("valHsl");
  var nearRow = document.getElementById("nearRow");
  var harmRow = document.getElementById("harmRow");
  var toast = document.getElementById("toast");

  var img = new Image();
  var imgLoaded = false;
  var current = { r: 0, g: 0, b: 0, hex: "#000000" };
  var pickArmed = false;

  var toastTimer = null;
  function say(msg) {
    toast.textContent = msg;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.textContent = ""; }, 1800);
  }

  function copyText(t, label) {
    function done() { say((label || "Code") + " copied: " + t); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(done, function () { fallback(); });
    } else fallback();
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = t; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) { say("Copy failed"); }
      document.body.removeChild(ta);
    }
  }

  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.getAttribute("data-copy");
      copyText(document.getElementById(id).textContent.trim(), id === "valHex" ? "HEX" : id === "valRgb" ? "RGB" : "HSL");
    });
  });

  function setCurrent(r, g, b) {
    r = clamp(Math.round(r), 0, 255); g = clamp(Math.round(g), 0, 255); b = clamp(Math.round(b), 0, 255);
    var hex = rgbToHex(r, g, b);
    var hsl = rgbToHsl(r, g, b);
    current = { r: r, g: g, b: b, hex: hex, hsl: hsl };
    swatch.style.background = hex;
    hexBig.textContent = hex;
    rgbSmall.textContent = fmtRgb(r, g, b);
    valHex.textContent = hex;
    valRgb.textContent = fmtRgb(r, g, b);
    valHsl.textContent = fmtHsl(hsl.h, hsl.s, hsl.l);
    renderPalettes();
  }

  function swButton(hex, active) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "sw" + (active ? " active" : "");
    b.title = hex;
    b.innerHTML = "<i></i><span></span>";
    b.querySelector("i").style.background = hex;
    b.querySelector("span").textContent = hex;
    b.addEventListener("click", function () {
      var c = hexToRgb(hex);
      setCurrent(c.r, c.g, c.b);
      copyText(hex, "HEX");
    });
    return b;
  }

  function renderPalettes() {
    nearRow.innerHTML = "";
    harmRow.innerHTML = "";
    var base = current.hex;
    var hsl = current.hsl;

    // Base + close tones: white and black mixes
    var near = [
      mix(base, "#FFFFFF", 0.6),
      mix(base, "#FFFFFF", 0.3),
      base,
      mix(base, "#000000", 0.3),
      mix(base, "#000000", 0.6)
    ];
    // 6th cell: muted neutral (reduced saturation)
    var muted = hslToRgb(hsl.h, Math.max(0, hsl.s - 35), hsl.l);
    near.push(rgbToHex(muted.r, muted.g, muted.b));

    near.forEach(function (h) {
      nearRow.appendChild(swButton(h, h === base));
    });

    // Harmonies: complementary + analogous + triadic
    var harm = [
      rgbToHex.apply(null, (function (c) { return [c.r, c.g, c.b]; })(hslToRgb(hsl.h + 180, hsl.s, hsl.l))),
      rgbToHex.apply(null, (function (c) { return [c.r, c.g, c.b]; })(hslToRgb(hsl.h - 30, hsl.s, hsl.l))),
      base,
      rgbToHex.apply(null, (function (c) { return [c.r, c.g, c.b]; })(hslToRgb(hsl.h + 30, hsl.s, hsl.l))),
      rgbToHex.apply(null, (function (c) { return [c.r, c.g, c.b]; })(hslToRgb(hsl.h + 120, hsl.s, hsl.l))),
      rgbToHex.apply(null, (function (c) { return [c.r, c.g, c.b]; })(hslToRgb(hsl.h + 240, hsl.s, hsl.l)))
    ];
    harm.forEach(function (h) {
      harmRow.appendChild(swButton(h, h === base));
    });
  }

  function allPalette() {
    var list = [];
    nearRow.querySelectorAll("span").forEach(function (s) { list.push(s.textContent.trim()); });
    harmRow.querySelectorAll("span").forEach(function (s) {
      var v = s.textContent.trim();
      if (list.indexOf(v) === -1) list.push(v);
    });
    return list;
  }

  // ---- image ----
  function loadFile(file) {
    if (!file || !file.type || file.type.indexOf("image/") !== 0) { say("Please choose an image."); return; }
    var url = URL.createObjectURL(file);
    img.onload = function () {
      URL.revokeObjectURL(url);
      imgLoaded = true;
      // Keep real pixels, scale with CSS
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      editor.hidden = false;
      var nameEl = document.getElementById("fileName");
      if (nameEl) nameEl.textContent = file.name || "Image";
      // Default: center pixel
      var cx = Math.floor(canvas.width / 2), cy = Math.floor(canvas.height / 2);
      var d = ctx.getImageData(cx, cy, 1, 1).data;
      setCurrent(d[0], d[1], d[2]);
      editor.scrollIntoView({ behavior: "smooth", block: "start" });
      say("Image loaded. Click to pick a color.");
    };
    img.src = url;
  }

  dropzone.addEventListener("click", function () { fileInput.click(); });
  dropzone.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener("change", function () { loadFile(fileInput.files[0]); fileInput.value = ""; });
  ["dragenter", "dragover"].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.add("over"); });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.remove("over"); });
  });
  dropzone.addEventListener("drop", function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    loadFile(f);
  });

  document.getElementById("resetBtn").addEventListener("click", function () {
    fileInput.click();
  });
  document.getElementById("pickBtn").addEventListener("click", function () {
    pickArmed = true;
    say("Loupe on: click the image.");
    canvas.focus && canvas.focus();
  });

  function canvasPos(evt) {
    var r = canvas.getBoundingClientRect();
    var x = (evt.clientX - r.left) * (canvas.width / r.width);
    var y = (evt.clientY - r.top) * (canvas.height / r.height);
    return { x: clamp(Math.floor(x), 0, canvas.width - 1), y: clamp(Math.floor(y), 0, canvas.height - 1) };
  }
  function updateLoupe(px, py) {
    var z = 8, size = 12; // 12x12 piksel -> 96px
    var sx = clamp(px - Math.floor(size / 2), 0, Math.max(0, canvas.width - size));
    var sy = clamp(py - Math.floor(size / 2), 0, Math.max(0, canvas.height - size));
    loupeCtx.clearRect(0, 0, 96, 96);
    loupeCtx.drawImage(canvas, sx, sy, size, size, 0, 0, 96, 96);
    // center crosshair
    loupeCtx.strokeStyle = "#000";
    loupeCtx.lineWidth = 1;
    loupeCtx.strokeRect(0.5, 0.5, 95, 95);
    loupeCtx.beginPath();
    loupeCtx.moveTo(48, 38); loupeCtx.lineTo(48, 58);
    loupeCtx.moveTo(38, 48); loupeCtx.lineTo(58, 48);
    loupeCtx.stroke();
    loupe.style.display = "block";
  }
  canvas.addEventListener("mousemove", function (e) {
    if (!imgLoaded) return;
    var p = canvasPos(e);
    updateLoupe(p.x, p.y);
    if (pickArmed) return;
    // Hover only shows loupe, no preview pick (prevents wrong picks)
  });
  canvas.addEventListener("mouseleave", function () { loupe.style.display = "none"; });
  canvas.addEventListener("click", function (e) {
    if (!imgLoaded) return;
    var p = canvasPos(e);
    var d = ctx.getImageData(p.x, p.y, 1, 1).data;
    setCurrent(d[0], d[1], d[2]);
    pickArmed = false;
  });

  // ---- downloads ----
  function download(name, content, type) {
    var blob = new Blob([content], { type: type });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  document.getElementById("dlCss").addEventListener("click", function () {
    var pal = allPalette();
    var out = ":root {\n  --warp-base: " + current.hex + ";\n";
    pal.forEach(function (h, i) { out += "  --warp-" + (i + 1) + ": " + h + ";\n"; });
    out += "}\n";
    download("warp-palette.css", out, "text/css");
    say("CSS downloaded.");
  });
  document.getElementById("dlTxt").addEventListener("click", function () {
    var pal = allPalette();
    var out = "WARP Color Finder\nBase: " + current.hex + " " + valRgb.textContent + " " + valHsl.textContent + "\n\nPalette:\n" + pal.join("\n") + "\n";
    download("warp-palette.txt", out, "text/plain");
    say("TXT downloaded.");
  });
  document.getElementById("dlPng").addEventListener("click", function () {
    var pal = allPalette();
    var c = document.createElement("canvas");
    c.width = 120 * pal.length; c.height = 120;
    var g = c.getContext("2d");
    pal.forEach(function (h, i) { g.fillStyle = h; g.fillRect(i * 120, 0, 120, 120); });
    c.toBlob(function (b) {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = "warp-palette.png";
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      say("PNG downloaded.");
    });
  });

  setCurrent(0, 0, 0);
})();
