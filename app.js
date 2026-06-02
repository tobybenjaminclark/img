const state = {
  sourceFile: null,
  sourceUrl: "",
  outputUrl: "",
  image: null,
};

const elements = {
  imageInput: document.querySelector("#imageInput"),
  dropZone: document.querySelector(".drop-zone"),
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
  const value = Number.parseInt(input.value, 10);
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function extensionForFormat(format) {
  if (format === "image/jpeg") return "jpg";
  if (format === "image/png") return "png";
  return "webp";
}

function getSettings() {
  return {
    quality: Number(elements.quality.value) / 100,
    maxWidth: Math.max(160, readNumber(elements.maxWidth, 1600)),
    format: elements.format.value,
    radii: {
      topLeft: readNumber(elements.radii.topLeft, 80),
      topRight: readNumber(elements.radii.topRight, 20),
      bottomLeft: readNumber(elements.radii.bottomLeft, 20),
      bottomRight: readNumber(elements.radii.bottomRight, 80),
    },
  };
}

function makeRoundedPath(context, width, height, radii) {
  const topLeft = Math.min(radii.topLeft, width / 2, height / 2);
  const topRight = Math.min(radii.topRight, width / 2, height / 2);
  const bottomLeft = Math.min(radii.bottomLeft, width / 2, height / 2);
  const bottomRight = Math.min(radii.bottomRight, width / 2, height / 2);

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

function drawStyledImage() {
  if (!state.image) return;

  const settings = getSettings();
  const sourceWidth = state.image.naturalWidth;
  const sourceHeight = state.image.naturalHeight;
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

function loadFile(file) {
  if (!file || !file.type.startsWith("image/")) return;

  URL.revokeObjectURL(state.sourceUrl);
  URL.revokeObjectURL(state.outputUrl);
  state.sourceFile = file;
  state.sourceUrl = URL.createObjectURL(file);
  state.outputUrl = "";

  const image = new Image();
  image.onload = () => {
    state.image = image;
    elements.sourcePreview.src = state.sourceUrl;
    elements.sourceStage.classList.remove("empty");
    elements.outputStage.classList.add("empty");
    elements.sourceMeta.textContent = `${image.naturalWidth} x ${image.naturalHeight} · ${formatBytes(file.size)}`;
    elements.outputMeta.textContent = "Generating";
    drawStyledImage();
  };
  image.onerror = () => {
    elements.sourceMeta.textContent = "Could not load image";
    elements.outputMeta.textContent = "Waiting";
  };
  image.src = state.sourceUrl;
}

function resetControls() {
  elements.radii.topLeft.value = 80;
  elements.radii.topRight.value = 20;
  elements.radii.bottomLeft.value = 20;
  elements.radii.bottomRight.value = 80;
  elements.quality.value = 82;
  elements.maxWidth.value = 1600;
  elements.format.value = "image/webp";
  elements.qualityOutput.textContent = "82%";
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
].forEach((control) => {
  control.addEventListener("input", () => {
    elements.qualityOutput.textContent = `${elements.quality.value}%`;
    drawStyledImage();
  });
});

elements.resetButton.addEventListener("click", resetControls);
