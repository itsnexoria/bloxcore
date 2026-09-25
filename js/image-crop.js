// BloxCore — shared image crop modal (js/image-crop.js)
//
// Usage: const blob = await openImageCropper({ file, aspect: 1, outputW: 512, outputH: 512,
//   circle: true, title: 'Crop Avatar', mimeType: 'image/png' });
// Resolves with a Blob to upload, or null if the user cancelled.

(function () {
  let resolveFn = null;
  let naturalW = 0, naturalH = 0;
  let stageW = 0, stageH = 0;
  let scale = 1, baseScale = 1, offsetX = 0, offsetY = 0;
  let dragging = false, dragStartX = 0, dragStartY = 0, dragOffsetX = 0, dragOffsetY = 0;
  let opts = null;

  function els() {
    return {
      overlay: document.getElementById('crop-modal'),
      title: document.getElementById('crop-modal-title'),
      stage: document.getElementById('crop-stage'),
      img: document.getElementById('crop-stage-img'),
      slider: document.getElementById('crop-zoom-slider'),
      save: document.getElementById('crop-modal-save'),
      cancel: document.getElementById('crop-modal-cancel'),
      close: document.getElementById('crop-modal-close'),
    };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function scaleForSlider(sliderValue) {
    // 0 -> just covers the box (no dead space), 100 -> 3x that
    return baseScale * (1 + (sliderValue / 100) * 2);
  }

  function applyTransform() {
    const { img } = els();
    img.style.width = `${naturalW * scale}px`;
    img.style.height = `${naturalH * scale}px`;
    img.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
  }

  function clampOffsets() {
    const minX = Math.min(0, stageW - naturalW * scale);
    const minY = Math.min(0, stageH - naturalH * scale);
    offsetX = clamp(offsetX, minX, 0);
    offsetY = clamp(offsetY, minY, 0);
  }

  function onPointerDown(e) {
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragOffsetX = offsetX;
    dragOffsetY = offsetY;
    els().stage.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (!dragging) return;
    offsetX = dragOffsetX + (e.clientX - dragStartX);
    offsetY = dragOffsetY + (e.clientY - dragStartY);
    clampOffsets();
    applyTransform();
  }

  function onPointerUp() {
    dragging = false;
  }

  function onSliderInput() {
    scale = scaleForSlider(Number(els().slider.value));
    clampOffsets();
    applyTransform();
  }

  function finish(result) {
    els().overlay.classList.remove('open');
    if (resolveFn) {
      const r = resolveFn;
      resolveFn = null;
      r(result);
    }
  }

  function handleSave() {
    const outputW = opts.outputW;
    const outputH = opts.outputH;
    const canvas = document.createElement('canvas');
    canvas.width = outputW;
    canvas.height = outputH;
    const ctx = canvas.getContext('2d');
    const sx = -offsetX / scale;
    const sy = -offsetY / scale;
    const sw = stageW / scale;
    const sh = stageH / scale;
    ctx.drawImage(els().img, sx, sy, sw, sh, 0, 0, outputW, outputH);
    canvas.toBlob((blob) => finish(blob), opts.mimeType || 'image/jpeg', opts.quality ?? 0.92);
  }

  function wireOnce() {
    const { overlay, stage, slider, save, cancel, close } = els();
    stage.addEventListener('pointerdown', onPointerDown);
    stage.addEventListener('pointermove', onPointerMove);
    stage.addEventListener('pointerup', onPointerUp);
    stage.addEventListener('pointercancel', onPointerUp);
    slider.addEventListener('input', onSliderInput);
    save.addEventListener('click', handleSave);
    cancel.addEventListener('click', () => finish(null));
    close.addEventListener('click', () => finish(null));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) finish(null);
    });
  }

  let wired = false;

  window.openImageCropper = function (options) {
    opts = options;
    if (!wired) {
      wired = true;
      wireOnce();
    }
    const { overlay, title, stage, img, slider } = els();
    title.textContent = options.title || 'Crop Image';
    stage.classList.toggle('is-circle', !!options.circle);
    stage.style.aspectRatio = String(options.aspect || 1);

    return new Promise((resolve) => {
      resolveFn = resolve;
      const reader = new FileReader();
      reader.onload = () => {
        img.src = reader.result;
        img.onload = () => {
          naturalW = img.naturalWidth;
          naturalH = img.naturalHeight;
          overlay.classList.add('open');
          // Measure the stage after it's actually visible/laid out.
          requestAnimationFrame(() => {
            stageW = stage.clientWidth;
            stageH = stage.clientHeight;
            baseScale = Math.max(stageW / naturalW, stageH / naturalH);
            scale = baseScale;
            offsetX = (stageW - naturalW * scale) / 2;
            offsetY = (stageH - naturalH * scale) / 2;
            slider.value = 0;
            applyTransform();
          });
        };
      };
      reader.readAsDataURL(options.file);
    });
  };
})();
