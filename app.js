const state = {
  sourceFile: null,
  sourceUrl: "",
  outputUrl: "",
  image: null,
};

const elements = {
  imageInput: document.querySelector("#imageInput"),
  dropZone: document.querySelector(".drop-zone"),
  uploadStart: document.querySelector("#uploadStart"),
  previewPanel: document.querySelector(".preview-panel"),
  sourcePreview: document.querySelector("#sourcePreview"),
  outputPreview: document.querySelector("#outputPreview"),
  sourceStage: document.querySelector("#sourceStage"),
  outputStage: document.querySelector("#outputStage"),
  sourceMeta: document.querySelector("#sourceMeta"),
  outputMeta: document.querySelector("#outputMeta"),
  quality: document.querySelector("#quality"),
  qualityOutput: document.querySelector("#qualityOutput"),
  maxWidth: document.querySelector("#maxWidth"),
  format: document.querySelector("#format"),
  dropShadow: document.querySelector("#dropShadow"),
  downloadButton: document.querySelector("#downloadButton"),
  resetButton: document.querySelector("#resetButton"),
  canvas: document.querySelector("#workCanvas"),
  radii: {
    topLeft: document.querySelector("#radiusTopLeft"),
    topRight: document.querySelector("#radiusTopRight"),
    bottomLeft: document.querySelector("#radiusBottomLeft"),
    bottomRight: document.querySelector("#radiusBottomRight"),
  },
};

const formatter = new Intl.NumberFormat("en", {
  maximumFractionDigits: 1,
});

function formatBytes(bytes) {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${formatter.format(size)} ${units[unitIndex]}`;
}

function readNumber(input, fallback) {
  const value = Number.parseFloat(input.value);
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function extensionForFormat(format) {
  if (format === "image/jpeg") return "jpg";
  if (format === "image/png") return "png";
  return "webp";
}

function getSourceWidth(source) {
  return source.naturalWidth || source.width;
}

function getSourceHeight(source) {
  return source.naturalHeight || source.height;
}

function getSettings() {
  return {
    quality: Number(elements.quality.value) / 100,
    maxWidth: Math.max(160, readNumber(elements.maxWidth, 1600)),
    format: elements.format.value,
    dropShadow: elements.dropShadow.checked,
    radii: {
      topLeft: readNumber(elements.radii.topLeft, 30),
      topRight: readNumber(elements.radii.topRight, 10),
      bottomLeft: readNumber(elements.radii.bottomLeft, 10),
      bottomRight: readNumber(elements.radii.bottomRight, 30),
    },
  };
}

function makeRoundedPath(context, width, height, radii) {
  const radiusBasis = Math.min(width, height);
  const percentageToPixels = (percentage) => radiusBasis * Math.min(percentage, 50) / 100;
  const topLeft = percentageToPixels(radii.topLeft);
  const topRight = percentageToPixels(radii.topRight);
  const bottomLeft = percentageToPixels(radii.bottomLeft);
  const bottomRight = percentageToPixels(radii.bottomRight);

  context.beginPath();
  context.moveTo(topLeft, 0);
  context.lineTo(width - topRight, 0);
  context.quadraticCurveTo(width, 0, width, topRight);
  context.lineTo(width, height - bottomRight);
  context.quadraticCurveTo(width, height, width - bottomRight, height);
  context.lineTo(bottomLeft, height);
  context.quadraticCurveTo(0, height, 0, height - bottomLeft);
  context.lineTo(0, topLeft);
  context.quadraticCurveTo(0, 0, topLeft, 0);
  context.closePath();
}

function syncDropShadow() {
  elements.outputStage.classList.toggle("has-drop-shadow", elements.dropShadow.checked);
}

function showPreviews() {
  elements.uploadStart.classList.add("is-hidden");
  elements.previewPanel.classList.remove("is-hidden");
}

function drawStyledImage() {
  if (!state.image) return;

  const settings = getSettings();
  syncDropShadow();
  const sourceWidth = getSourceWidth(state.image);
  const sourceHeight = getSourceHeight(state.image);
  const scale = Math.min(1, settings.maxWidth / sourceWidth);
  const outputWidth = Math.round(sourceWidth * scale);
  const outputHeight = Math.round(sourceHeight * scale);
  const canvas = elements.canvas;
  const context = canvas.getContext("2d");

  canvas.width = outputWidth;
  canvas.height = outputHeight;
  context.clearRect(0, 0, outputWidth, outputHeight);
  context.save();
  makeRoundedPath(context, outputWidth, outputHeight, settings.radii);
  context.clip();

  if (settings.format === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, outputWidth, outputHeight);
  }

  context.drawImage(state.image, 0, 0, outputWidth, outputHeight);
  context.restore();

  canvas.toBlob(
    (blob) => {
      if (!blob) {
        elements.outputMeta.textContent = "Could not generate";
        return;
      }

      URL.revokeObjectURL(state.outputUrl);
      state.outputUrl = URL.createObjectURL(blob);
      elements.outputPreview.src = state.outputUrl;
      elements.outputStage.classList.remove("empty");
      elements.outputMeta.textContent = `${outputWidth} x ${outputHeight} · ${formatBytes(blob.size)}`;
      elements.downloadButton.href = state.outputUrl;
      elements.downloadButton.download = `bng-image-styler.${extensionForFormat(settings.format)}`;
      elements.downloadButton.classList.remove("is-disabled");
      elements.downloadButton.removeAttribute("aria-disabled");
    },
    settings.format,
    settings.quality
  );
}

function isTiffBuffer(buffer) {
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 4));
  const littleEndianTiff = bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00;
  const bigEndianTiff = bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a;
  return littleEndianTiff || bigEndianTiff;
}

function decodeTiffToCanvas(buffer) {
  if (!window.UTIF) {
    throw new Error("TIFF decoder is unavailable");
  }

  const ifds = UTIF.decode(buffer);
  const imageDirectory = ifds[0];

  if (!imageDirectory) {
    throw new Error("No TIFF image data found");
  }

  UTIF.decodeImage(buffer, imageDirectory);
  const rgba = UTIF.toRGBA8(imageDirectory);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = imageDirectory.width;
  canvas.height = imageDirectory.height;
  context.putImageData(new ImageData(new Uint8ClampedArray(rgba), canvas.width, canvas.height), 0, 0);

  return canvas;
}

async function createPreviewUrl(source, maxWidth = 2400) {
  const width = getSourceWidth(source);
  const height = getSourceHeight(source);
  const scale = Math.min(1, maxWidth / width);
  const previewCanvas = document.createElement("canvas");
  const context = previewCanvas.getContext("2d");

  previewCanvas.width = Math.round(width * scale);
  previewCanvas.height = Math.round(height * scale);
  context.drawImage(source, 0, 0, previewCanvas.width, previewCanvas.height);

  return new Promise((resolve, reject) => {
    previewCanvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not create TIFF preview"));
        return;
      }

      resolve(URL.createObjectURL(blob));
    }, "image/jpeg", 0.88);
  });
}

async function loadDecodedTiff(file, buffer) {
  const canvas = decodeTiffToCanvas(buffer);
  URL.revokeObjectURL(state.sourceUrl);
  state.sourceUrl = await createPreviewUrl(canvas);
  state.image = canvas;
  showPreviews();
  elements.sourcePreview.src = state.sourceUrl;
  elements.sourceStage.classList.remove("empty");
  elements.outputStage.classList.add("empty");
  elements.sourceMeta.textContent = `${canvas.width} x ${canvas.height} · ${formatBytes(file.size)} · TIFF`;
  elements.outputMeta.textContent = "Generating";
  drawStyledImage();
}

function resetDownload() {
  elements.downloadButton.removeAttribute("href");
  elements.downloadButton.classList.add("is-disabled");
  elements.downloadButton.setAttribute("aria-disabled", "true");
}

function setLoadError(message) {
  elements.sourceMeta.textContent = message;
  elements.outputMeta.textContent = "Waiting";
  resetDownload();
}

function loadFile(file) {
  if (!file || (!file.type.startsWith("image/") && !/\.(tif|tiff)$/i.test(file.name))) return;

  URL.revokeObjectURL(state.sourceUrl);
  URL.revokeObjectURL(state.outputUrl);
  state.sourceFile = file;
  state.sourceUrl = URL.createObjectURL(file);
  state.outputUrl = "";
  resetDownload();

  const image = new Image();
  image.onload = () => {
    state.image = image;
    showPreviews();
    elements.sourcePreview.src = state.sourceUrl;
    elements.sourceStage.classList.remove("empty");
    elements.outputStage.classList.add("empty");
    elements.sourceMeta.textContent = `${image.naturalWidth} x ${image.naturalHeight} · ${formatBytes(file.size)}`;
    elements.outputMeta.textContent = "Generating";
    drawStyledImage();
  };
  image.onerror = async () => {
    try {
      const buffer = await file.arrayBuffer();
      if (!isTiffBuffer(buffer)) {
        setLoadError("Could not load image");
        return;
      }

      await loadDecodedTiff(file, buffer);
    } catch (error) {
      console.error(error);
      setLoadError("Could not decode TIFF image");
    }
  };
  image.src = state.sourceUrl;
}

function resetControls() {
  elements.radii.topLeft.value = 30;
  elements.radii.topRight.value = 10;
  elements.radii.bottomLeft.value = 10;
  elements.radii.bottomRight.value = 30;
  elements.quality.value = 82;
  elements.maxWidth.value = 1600;
  elements.format.value = "image/webp";
  elements.dropShadow.checked = true;
  elements.qualityOutput.textContent = "82%";
  syncDropShadow();
  drawStyledImage();
}

elements.imageInput.addEventListener("change", (event) => {
  loadFile(event.target.files?.[0]);
});

elements.dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  elements.dropZone.classList.add("is-dragging");
});

elements.dropZone.addEventListener("dragleave", () => {
  elements.dropZone.classList.remove("is-dragging");
});

elements.dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  elements.dropZone.classList.remove("is-dragging");
  loadFile(event.dataTransfer.files?.[0]);
});

[
  elements.quality,
  elements.maxWidth,
  elements.format,
  elements.radii.topLeft,
  elements.radii.topRight,
  elements.radii.bottomLeft,
  elements.radii.bottomRight,
  elements.dropShadow,
].forEach((control) => {
  control.addEventListener("input", () => {
    elements.qualityOutput.textContent = `${elements.quality.value}%`;
    drawStyledImage();
  });
});

elements.resetButton.addEventListener("click", resetControls);
