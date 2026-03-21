import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import type { RendererBridge } from '../hooks/useRendererBridge';

export interface ExportOptions {
  format: 'png' | 'gif' | 'webm';
  fps: number;
  scale: number; // 1 = full, 0.5 = half, 0.25 = quarter
  duration: number; // seconds
  onProgress?: (progress: number) => void;
  abortSignal?: AbortSignal;
}

export async function exportPng(bridge: RendererBridge, drillName: string): Promise<void> {
  const data = bridge.exportScreenshot();
  if (!data) return;
  const parts = data.split(',');
  if (parts.length < 3) return;
  const w = parseInt(parts[0]);
  const h = parseInt(parts[1]);
  const b64 = parts.slice(2).join(',');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const imgData = new ImageData(new Uint8ClampedArray(bytes.buffer), w, h);
  ctx.putImageData(imgData, 0, 0);
  canvas.toBlob(blob => {
    if (!blob) return;
    downloadBlob(blob, `${drillName}.png`);
  });
}

export async function exportGif(
  bridge: RendererBridge,
  drillName: string,
  options: ExportOptions,
): Promise<void> {
  const webglCanvas = bridge.getCanvas();
  if (!webglCanvas) throw new Error('Canvas not found');

  const srcW = webglCanvas.width;
  const srcH = webglCanvas.height;
  const outW = Math.round(srcW * options.scale);
  const outH = Math.round(srcH * options.scale);

  const totalFrames = Math.ceil(options.duration * options.fps);
  const delay = Math.round(1000 / options.fps);

  const gif = GIFEncoder();

  // Off-screen canvas for reading pixels
  const offscreen = document.createElement('canvas');
  offscreen.width = outW;
  offscreen.height = outH;
  const ctx = offscreen.getContext('2d')!;

  for (let frame = 0; frame < totalFrames; frame++) {
    if (options.abortSignal?.aborted) return;

    const t = frame / (totalFrames - 1 || 1);
    bridge.setPlaybackTime(t);

    // Wait for the next render
    await new Promise(resolve => requestAnimationFrame(resolve));
    await new Promise(resolve => requestAnimationFrame(resolve));

    // Draw WebGL canvas to 2D canvas (handles scaling)
    ctx.drawImage(webglCanvas, 0, 0, outW, outH);
    const imageData = ctx.getImageData(0, 0, outW, outH);

    const palette = quantize(imageData.data, 256);
    const index = applyPalette(imageData.data, palette);
    gif.writeFrame(index, outW, outH, { palette, delay });

    options.onProgress?.(frame / totalFrames);
  }

  gif.finish();
  const bytes = gif.bytes();
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'image/gif' });
  downloadBlob(blob, `${drillName}.gif`);
  options.onProgress?.(1);
}

export async function exportWebM(
  bridge: RendererBridge,
  drillName: string,
  options: ExportOptions,
): Promise<void> {
  const webglCanvas = bridge.getCanvas();
  if (!webglCanvas) throw new Error('Canvas not found');

  // Check codec support
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : 'video/webm';

  const stream = webglCanvas.captureStream(0);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 5_000_000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const done = new Promise<void>((resolve) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      downloadBlob(blob, `${drillName}.webm`);
      resolve();
    };
  });

  recorder.start();

  const totalFrames = Math.ceil(options.duration * options.fps);
  const videoTrack = stream.getVideoTracks()[0];

  for (let frame = 0; frame < totalFrames; frame++) {
    if (options.abortSignal?.aborted) {
      recorder.stop();
      return;
    }

    const t = frame / (totalFrames - 1 || 1);
    bridge.setPlaybackTime(t);

    await new Promise(resolve => requestAnimationFrame(resolve));
    await new Promise(resolve => requestAnimationFrame(resolve));

    // Request a new frame from the capture stream
    if ('requestFrame' in videoTrack) {
      (videoTrack as any).requestFrame();
    }

    // Wait for the frame interval
    await new Promise(resolve => setTimeout(resolve, 1000 / options.fps));

    options.onProgress?.(frame / totalFrames);
  }

  recorder.stop();
  await done;
  options.onProgress?.(1);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.replace(/\s+/g, '_');
  a.click();
  URL.revokeObjectURL(url);
}
