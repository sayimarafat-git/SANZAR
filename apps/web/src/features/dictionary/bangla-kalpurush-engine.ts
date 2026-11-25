import { BANGLA_DEFAULT_FONT } from './bangla-pen-paths';
import { splitIntoGraphemeClusters } from './stroke-guides';

export interface KalpurushStroke {
  id: string;
  cluster: string;
  clusterIdx: number;
  points: { x: number; y: number }[];
  d: string;
  totalLen: number;
}

export interface KalpurushModel {
  width: number;
  height: number;
  dpr: number;
  matraY: number;
  baseY: number;
  crownY: number;
  subY: number;
  strokes: KalpurushStroke[];
  // Compact Retina (width*dpr x height*dpr) non-zero ink pixel table for 0.15ms 60fps rendering
  pixelCount: number;
  pixelIndex: Uint32Array; // pixel index (p = hy * hiW + hx)
  pixelAlpha: Uint8Array;  // authentic Kalpurush anti-aliased alpha (1..255)
  pixelStroke: Uint16Array; // owning stroke index (0..strokes.length-1)
  pixelProg: Uint8Array;   // progress along owning stroke (0..255)
}

function polylineLength(pts: { x: number; y: number }[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return Math.max(1, len);
}

function pointsToSvgPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} L ${(pts[0].x + 0.5).toFixed(1)} ${pts[0].y.toFixed(1)}`;
  const parts = [`M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`];
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    parts.push(`Q ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`);
  }
  const last = pts[pts.length - 1];
  parts.push(`L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`);
  return parts.join(' ');
}

export function pointAlongKalpurushStroke(
  stroke: KalpurushStroke,
  progress: number
): { x: number; y: number } {
  const pts = stroke.points;
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1 || progress <= 0) return pts[0];
  if (progress >= 1) return pts[pts.length - 1];

  const target = stroke.totalLen * progress;
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (acc + seg >= target) {
      const t = seg > 0.001 ? (target - acc) / seg : 0;
      return {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t,
      };
    }
    acc += seg;
  }
  return pts[pts.length - 1];
}

/** Projects point (px, py) onto polyline and returns normalized arc-length progress [0..1]. */
function projectProgressOnPolyline(
  pts: { x: number; y: number }[],
  totalLen: number,
  px: number,
  py: number
): number {
  if (pts.length < 2 || totalLen <= 1) return 0.5;
  let bestDistSq = Infinity;
  let bestArc = 0;
  let acc = 0;

  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1].x;
    const ay = pts[i - 1].y;
    const bx = pts[i].x;
    const by = pts[i].y;
    const dx = bx - ax;
    const dy = by - ay;
    const segLenSq = dx * dx + dy * dy;
    const segLen = Math.sqrt(segLenSq);
    let t = segLenSq > 0.0001 ? ((px - ax) * dx + (py - ay) * dy) / segLenSq : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const qx = ax + dx * t;
    const qy = ay + dy * t;
    const dSq = (px - qx) * (px - qx) + (py - qy) * (py - qy);
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestArc = acc + segLen * t;
    }
    acc += segLen;
  }
  return Math.max(0, Math.min(1, bestArc / totalLen));
}

/** Traces a smooth medial-ridge directional centerline through a 1x connected ink component. */
function traceCurvedComponent(
  pixels: number[],
  W: number,
  H: number,
  zone: 'pre' | 'body' | 'crown' | 'sub'
): { x: number; y: number }[] {
  if (pixels.length === 0) return [{ x: W / 2, y: H / 2 }];

  let minX = W, maxX = 0, minY = H, maxY = 0;
  let sumX = 0, sumY = 0;
  for (const p of pixels) {
    const x = p % W;
    const y = (p / W) | 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    sumX += x;
    sumY += y;
  }

  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;

  // Small dot / bindu
  if (pixels.length <= 36 && bw <= 11 && bh <= 11) {
    const cx = sumX / pixels.length;
    const cy = sumY / pixels.length;
    return [
      { x: cx, y: cy - 1.5 },
      { x: cx, y: cy + 1.5 },
    ];
  }

  // Local mask & Chamfer distance-to-boundary for ridge preference
  const lw = bw + 2;
  const lh = bh + 2;
  const mask = new Uint8Array(lw * lh);
  const dist = new Uint16Array(lw * lh);
  for (const p of pixels) {
    const lx = (p % W) - minX + 1;
    const ly = ((p / W) | 0) - minY + 1;
    mask[ly * lw + lx] = 1;
    dist[ly * lw + lx] = 999;
  }

  // 2-pass Chamfer distance transform
  for (let y = 1; y < lh - 1; y++) {
    for (let x = 1; x < lw - 1; x++) {
      const idx = y * lw + x;
      if (!mask[idx]) continue;
      const d = Math.min(dist[idx - 1], dist[idx - lw]) + 1;
      if (d < dist[idx]) dist[idx] = d;
    }
  }
  for (let y = lh - 2; y >= 1; y--) {
    for (let x = lw - 2; x >= 1; x--) {
      const idx = y * lw + x;
      if (!mask[idx]) continue;
      const d = Math.min(dist[idx], dist[idx + 1] + 1, dist[idx + lw] + 1);
      dist[idx] = d;
    }
  }

  // Pick natural Bangla entry point according to anatomical zone
  let startIdx = -1;
  let bestScore = Infinity;
  for (let y = 1; y < lh - 1; y++) {
    for (let x = 1; x < lw - 1; x++) {
      const idx = y * lw + x;
      if (!mask[idx]) continue;
      let score = 0;
      if (zone === 'pre') {
        // এ-কার / ঐ-কার starts at top-right near Matra and sweeps left-down
        score = y * 1.4 - x * 0.9 - dist[idx] * 0.4;
      } else if (zone === 'crown') {
        // ই-কার / ঈ-কার arch starts left and arches across
        score = x * 1.3 + y * 0.35 - dist[idx] * 0.4;
      } else if (zone === 'sub') {
        // উ/ঊ/ঋ-কার starts at upper attachment point under consonant
        score = y * 1.5 + x * 0.25 - dist[idx] * 0.4;
      } else {
        // Main consonant body starts near upper-left/top attachment
        score = y * 1.35 + x * 0.35 - dist[idx] * 0.5;
      }
      if (score < bestScore) {
        bestScore = score;
        startIdx = idx;
      }
    }
  }

  if (startIdx < 0) {
    const cx = sumX / pixels.length;
    const cy = sumY / pixels.length;
    return [{ x: cx, y: minY }, { x: cx, y: maxY }];
  }

  // Disk-stepping geodesic walk along medial ridge
  const visited = new Uint8Array(lw * lh);
  const waypoints: { x: number; y: number }[] = [];
  const stepRadius = 4.6;
  const bfsDist = new Int16Array(lw * lh);
  const queue = new Int32Array(lw * lh);

  const markDisk = (cIdx: number, r: number) => {
    const cx = cIdx % lw;
    const cy = (cIdx / lw) | 0;
    const rSq = r * r;
    const rCeil = Math.ceil(r);
    for (let dy = -rCeil; dy <= rCeil; dy++) {
      const ny = cy + dy;
      if (ny < 1 || ny >= lh - 1) continue;
      for (let dx = -rCeil; dx <= rCeil; dx++) {
        const nx = cx + dx;
        if (nx < 1 || nx >= lw - 1) continue;
        if (dx * dx + dy * dy <= rSq) {
          visited[ny * lw + nx] = 1;
        }
      }
    }
  };

  let cur = startIdx;
  let prevDx = 0;
  let prevDy = 1;

  for (let iter = 0; iter < 48; iter++) {
    const cx = cur % lw;
    const cy = (cur / lw) | 0;
    waypoints.push({ x: cx - 1 + minX, y: cy - 1 + minY });
    markDisk(cur, stepRadius);

    // Local BFS inside ink tube up to geodesic distance 9 to find next unvisited ridge point
    bfsDist.fill(-1);
    let qHead = 0;
    let qTail = 0;
    bfsDist[cur] = 0;
    queue[qTail++] = cur;

    let bestNext = -1;
    let bestNextVal = -Infinity;

    while (qHead < qTail) {
      const u = queue[qHead++];
      const d = bfsDist[u];
      if (d >= 9) continue;
      const ux = u % lw;
      const uy = (u / lw) | 0;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const v = (uy + dy) * lw + (ux + dx);
          if (!mask[v] || bfsDist[v] !== -1) continue;
          const nd = d + 1;
          bfsDist[v] = nd;
          queue[qTail++] = v;

          if (!visited[v] && nd >= 4 && nd <= 8) {
            const vx = ux + dx - cx;
            const vy = uy + dy - cy;
            const vLen = Math.hypot(vx, vy) || 1;
            const dot = (vx / vLen) * prevDx + (vy / vLen) * prevDy;
            const val = dist[v] * 2.2 + dot * 1.8 - Math.abs(nd - 6) * 0.4;
            if (val > bestNextVal) {
              bestNextVal = val;
              bestNext = v;
            }
          }
        }
      }
    }

    if (bestNext !== -1) {
      const nx = bestNext % lw;
      const ny = (bestNext / lw) | 0;
      const stepLen = Math.hypot(nx - cx, ny - cy) || 1;
      prevDx = (nx - cx) / stepLen;
      prevDy = (ny - cy) / stepLen;
      cur = bestNext;
      continue;
    }

    // Check if there is a significant unvisited branch nearby; if so, jump to nearest unvisited ridge pixel
    let nearestUnvisited = -1;
    let nearestD = Infinity;
    let unvisitedCount = 0;
    for (let y = 1; y < lh - 1; y++) {
      for (let x = 1; x < lw - 1; x++) {
        const idx = y * lw + x;
        if (mask[idx] && !visited[idx]) {
          unvisitedCount++;
          const d = Math.hypot(x - cx, y - cy) - dist[idx] * 0.5;
          if (d < nearestD) {
            nearestD = d;
            nearestUnvisited = idx;
          }
        }
      }
    }
    if (unvisitedCount >= 8 && nearestUnvisited !== -1) {
      cur = nearestUnvisited;
    } else {
      break;
    }
  }

  if (waypoints.length === 1) {
    waypoints.push({ x: waypoints[0].x + 1, y: waypoints[0].y + 1 });
  }

  // Smooth interior points while preserving start & end anchors
  let smoothed = waypoints;
  for (let pass = 0; pass < 2; pass++) {
    if (smoothed.length <= 2) break;
    const next = [smoothed[0]];
    for (let i = 1; i < smoothed.length - 1; i++) {
      next.push({
        x: smoothed[i - 1].x * 0.25 + smoothed[i].x * 0.5 + smoothed[i + 1].x * 0.25,
        y: smoothed[i - 1].y * 0.25 + smoothed[i].y * 0.5 + smoothed[i + 1].y * 0.25,
      });
    }
    next.push(smoothed[smoothed.length - 1]);
    smoothed = next;
  }

  return smoothed;
}

/**
 * Rasterizes any Bangla word or cluster in real self-hosted Kalpurush and extracts
 * ordered anatomical strokes + a 2x Retina pixel-ownership table so 100% of the
 * authentic Kalpurush glyph animates stroke-by-stroke with a pen nib and supports
 * English-grade Snap-to-Stroke interactive practice.
 */
export function buildKalpurushModel(text: string): KalpurushModel | null {
  if (typeof document === 'undefined' || !text.trim()) return null;

  const clean = text.trim().normalize('NFC');
  const clusters = splitIntoGraphemeClusters(clean, 'bn');
  const activeClusters = clusters.length > 0 ? clusters : [clean];

  const H = 144;
  const baseY = 96;
  const fontSize = 68;
  const fontSpec = `600 ${fontSize}px ${BANGLA_DEFAULT_FONT}`;

  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d');
  if (!mctx) return null;
  mctx.font = fontSpec;

  const wordW = Math.max(40, mctx.measureText(clean).width);
  const W = Math.max(420, Math.ceil(wordW + 84));
  const startX = (W - wordW) / 2;

  // Measure cluster X boundaries in the shaped word
  const cutX: number[] = [Math.round(startX)];
  for (let i = 1; i < activeClusters.length; i++) {
    const prefix = activeClusters.slice(0, i).join('');
    cutX.push(Math.round(startX + mctx.measureText(prefix).width));
  }
  cutX.push(Math.round(startX + wordW));

  // 1x structural canvas
  const loCanvas = document.createElement('canvas');
  loCanvas.width = W;
  loCanvas.height = H;
  const loCtx = loCanvas.getContext('2d');
  if (!loCtx) return null;
  loCtx.font = fontSpec;
  loCtx.textBaseline = 'alphabetic';
  loCtx.fillStyle = '#000';
  loCtx.fillText(clean, startX, baseY);
  const loData = loCtx.getImageData(0, 0, W, H).data;

  const ink1x = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) {
    if (loData[p * 4 + 3] >= 42) ink1x[p] = 1;
  }

  // Auto-detect Kalpurush Matra row (peak horizontal density in y = 34..58)
  let matraY = 47;
  let maxRowInk = -1;
  for (let y = 34; y <= 58; y++) {
    let cnt = 0;
    for (let x = 0; x < W; x++) {
      if (ink1x[y * W + x]) cnt++;
    }
    if (cnt > maxRowInk) {
      maxRowInk = cnt;
      matraY = y;
    }
  }

  const strokeOwner1x = new Int16Array(W * H).fill(-1);

  interface RawPart {
    clusterIdx: number;
    orderKey: number;
    points: { x: number; y: number }[];
    pixels: number[];
  }
  const rawParts: RawPart[] = [];

  const clusterForX = (cx: number): number => {
    for (let c = 0; c < activeClusters.length; c++) {
      if (cx < cutX[c + 1]) return c;
    }
    return activeClusters.length - 1;
  };

  // 1. Detect horizontal Matra runs around matraY (+/- 4px)
  const matraBandTop = matraY - 4;
  const matraBandBot = matraY + 4;
  const isMatraCol = new Uint8Array(W);
  let runStart = -1;
  for (let x = 0; x <= W; x++) {
    const hasMatraInk =
      x < W &&
      (ink1x[matraY * W + x] ||
        ink1x[(matraY - 1) * W + x] ||
        ink1x[(matraY + 1) * W + x]);
    if (hasMatraInk) {
      if (runStart === -1) runStart = x;
    } else if (runStart !== -1) {
      if (x - runStart >= 11) {
        for (let k = runStart; k < x; k++) isMatraCol[k] = 1;
      }
      runStart = -1;
    }
  }

  // Slice Matra runs per cluster so each cluster gets its own left-to-right Matra stroke
  for (let c = 0; c < activeClusters.length; c++) {
    const x0 = Math.max(0, c === 0 ? 0 : cutX[c]);
    const x1 = Math.min(W - 1, c === activeClusters.length - 1 ? W - 1 : cutX[c + 1] - 1);
    let subStart = -1;
    for (let x = x0; x <= x1 + 1; x++) {
      if (x <= x1 && isMatraCol[x]) {
        if (subStart === -1) subStart = x;
      } else if (subStart !== -1) {
        const subEnd = x - 1;
        if (subEnd - subStart >= 6) {
          const mPixels: number[] = [];
          for (let py = matraBandTop; py <= matraBandBot; py++) {
            for (let px = subStart; px <= subEnd; px++) {
              const p = py * W + px;
              if (ink1x[p]) {
                strokeOwner1x[p] = -2; // reserved
                mPixels.push(p);
              }
            }
          }
          if (mPixels.length > 0) {
            rawParts.push({
              clusterIdx: c,
              // Matra comes right after any far-left pre-kar (orderKey ~ 100)
              orderKey: 100 + subStart * 0.01,
              points: [
                { x: subStart, y: matraY },
                { x: (subStart + subEnd) / 2, y: matraY },
                { x: subEnd, y: matraY },
              ],
              pixels: mPixels,
            });
          }
        }
        subStart = -1;
      }
    }
  }

  // 2. Detect full-height vertical stems (দাঁড়ি: া, ি, ী, ক/ব/ম/র/ল/ন stems)
  const stemTop = matraBandBot + 1;
  const stemBot = baseY - 2;
  const stemSpan = Math.max(12, stemBot - stemTop + 1);
  const isStemCol = new Uint8Array(W);

  for (let x = 2; x < W - 2; x++) {
    let colHits = 0;
    let thinRows = 0;
    for (let y = stemTop; y <= stemBot; y++) {
      if (ink1x[y * W + x] || ink1x[y * W + x - 1] || ink1x[y * W + x + 1]) {
        colHits++;
      }
      // Check horizontal run width around x at row y
      if (ink1x[y * W + x]) {
        let lx = x;
        while (lx > x - 12 && lx > 0 && ink1x[y * W + lx - 1]) lx--;
        let rx = x;
        while (rx < x + 12 && rx < W - 1 && ink1x[y * W + rx + 1]) rx++;
        if (rx - lx + 1 <= 10) thinRows++;
      }
    }
    if (colHits >= stemSpan * 0.84 && thinRows >= stemSpan * 0.55) {
      isStemCol[x] = 1;
    }
  }

  let sx0 = -1;
  for (let x = 0; x <= W; x++) {
    if (x < W && isStemCol[x]) {
      if (sx0 === -1) sx0 = x;
    } else if (sx0 !== -1) {
      const sx1 = x - 1;
      if (sx1 - sx0 <= 11) {
        const padL = Math.max(0, sx0 - 2);
        const padR = Math.min(W - 1, sx1 + 2);
        const sPixels: number[] = [];
        let minY = H, maxY = 0, sumX = 0;
        for (let py = matraY - 2; py <= baseY + 3; py++) {
          for (let px = padL; px <= padR; px++) {
            const p = py * W + px;
            if (ink1x[p] && strokeOwner1x[p] === -1) {
              strokeOwner1x[p] = -2;
              sPixels.push(p);
              if (py < minY) minY = py;
              if (py > maxY) maxY = py;
              sumX += px;
            }
          }
        }
        if (sPixels.length >= 12) {
          const avgX = sumX / sPixels.length;
          const cIdx = clusterForX(avgX);
          const clLeft = cutX[cIdx];
          const clWidth = Math.max(16, cutX[cIdx + 1] - clLeft);
          // Far-left stem in cluster (like ি stem) comes before Matra (orderKey 40); consonant/া stems come in body order (200 + x)
          const isPreKarStem =
            activeClusters[cIdx].includes('ি') && avgX - clLeft < clWidth * 0.36;
          rawParts.push({
            clusterIdx: cIdx,
            orderKey: isPreKarStem ? 40 + avgX * 0.01 : 220 + avgX * 0.1,
            points: [
              { x: avgX, y: Math.min(matraY, minY) },
              { x: avgX, y: (Math.min(matraY, minY) + maxY) / 2 },
              { x: avgX, y: maxY },
            ],
            pixels: sPixels,
          });
        }
      }
      sx0 = -1;
    }
  }

  // 3. Connected-component flood fill on remaining curved ink (body loops, ে, ি/ী arches, ু/ূ/ৃ subscripts, dots)
  const ccQueue = new Int32Array(W * H);
  for (let p = 0; p < W * H; p++) {
    if (!ink1x[p] || strokeOwner1x[p] !== -1) continue;

    const comp: number[] = [];
    let qH = 0, qT = 0;
    strokeOwner1x[p] = -3;
    ccQueue[qT++] = p;

    let minX = W, maxX = 0, minY = H, maxY = 0, sumX = 0, sumY = 0;

    while (qH < qT) {
      const u = ccQueue[qH++];
      comp.push(u);
      const ux = u % W;
      const uy = (u / W) | 0;
      if (ux < minX) minX = ux;
      if (ux > maxX) maxX = ux;
      if (uy < minY) minY = uy;
      if (uy > maxY) maxY = uy;
      sumX += ux;
      sumY += uy;

      for (let dy = -1; dy <= 1; dy++) {
        const ny = uy + dy;
        if (ny < 0 || ny >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = ux + dx;
          if (nx < 0 || nx >= W) continue;
          const v = ny * W + nx;
          if (ink1x[v] && strokeOwner1x[v] === -1) {
            strokeOwner1x[v] = -3;
            ccQueue[qT++] = v;
          }
        }
      }
    }

    // Tiny anti-alias speck (< 5px): let dilation merge it into adjacent stroke
    if (comp.length < 5) {
      for (const cp of comp) strokeOwner1x[cp] = -1;
      continue;
    }

    const cx = sumX / comp.length;
    const cy = sumY / comp.length;
    const cIdx = clusterForX(cx);
    const clLeft = cutX[cIdx];
    const clWidth = Math.max(16, cutX[cIdx + 1] - clLeft);

    let zone: 'pre' | 'body' | 'crown' | 'sub' = 'body';
    let orderKey = 200 + minX * 0.1;

    if (maxY <= matraY + 3) {
      // Above-Matra arch (ি, ী, ৈ, ঁ, রেফ)
      zone = 'crown';
      // If ি arch, draw right after left ি stem (orderKey 60); otherwise after body (orderKey 320)
      const hasIKar = activeClusters[cIdx].includes('ি');
      orderKey = hasIKar ? 60 + minX * 0.01 : 320 + minX * 0.01;
    } else if (minY >= baseY - 6 && cy > baseY - 1) {
      // Below-baseline Kar / Hasanta / Bindu (ু, ূ, ৃ, ্, ড়/র dot)
      zone = 'sub';
      orderKey = 400 + minX * 0.1;
    } else if (
      (activeClusters[cIdx].includes('ে') ||
        activeClusters[cIdx].includes('ৈ') ||
        activeClusters[cIdx].includes('ো') ||
        activeClusters[cIdx].includes('ৌ')) &&
      cx - clLeft < clWidth * 0.42
    ) {
      zone = 'pre';
      orderKey = 30 + minX * 0.01;
    }

    const pts = traceCurvedComponent(comp, W, H, zone);
    rawParts.push({
      clusterIdx: cIdx,
      orderKey,
      points: pts,
      pixels: comp,
    });
  }

  // Sort strokes naturally: cluster-by-cluster left-to-right, then anatomical order within cluster
  rawParts.sort((a, b) =>
    a.clusterIdx !== b.clusterIdx ? a.clusterIdx - b.clusterIdx : a.orderKey - b.orderKey
  );

  // Fallback if word had no detectable ink above threshold
  if (rawParts.length === 0) {
    rawParts.push({
      clusterIdx: 0,
      orderKey: 0,
      points: [
        { x: startX, y: baseY - 24 },
        { x: startX + wordW, y: baseY - 24 },
      ],
      pixels: [],
    });
  }

  // Finalize strokes & assign 1x stroke indices + multi-source BFS dilation for anti-aliased fringes
  strokeOwner1x.fill(-1);
  const dilQueue = new Int32Array(W * H);
  let dqH = 0, dqT = 0;

  const strokes: KalpurushStroke[] = rawParts.map((part, sIdx) => {
    for (const p of part.pixels) {
      strokeOwner1x[p] = sIdx;
      dilQueue[dqT++] = p;
    }
    const totalLen = polylineLength(part.points);
    return {
      id: `${part.clusterIdx}-${sIdx}`,
      cluster: activeClusters[part.clusterIdx] || clean,
      clusterIdx: part.clusterIdx,
      points: part.points,
      d: pointsToSvgPath(part.points),
      totalLen,
    };
  });

  // Multi-source BFS dilation across entire 1x canvas so every anti-aliased edge pixel has a valid owner
  while (dqH < dqT) {
    const u = dilQueue[dqH++];
    const owner = strokeOwner1x[u];
    const ux = u % W;
    const uy = (u / W) | 0;
    if (ux > 0 && strokeOwner1x[u - 1] === -1) {
      strokeOwner1x[u - 1] = owner;
      dilQueue[dqT++] = u - 1;
    }
    if (ux < W - 1 && strokeOwner1x[u + 1] === -1) {
      strokeOwner1x[u + 1] = owner;
      dilQueue[dqT++] = u + 1;
    }
    if (uy > 0 && strokeOwner1x[u - W] === -1) {
      strokeOwner1x[u - W] = owner;
      dilQueue[dqT++] = u - W;
    }
    if (uy < H - 1 && strokeOwner1x[u + W] === -1) {
      strokeOwner1x[u + W] = owner;
      dilQueue[dqT++] = u + W;
    }
  }

  // 4. Render 2x Retina ground-truth Kalpurush glyph and build compact pixel table
  const dpr = 2;
  const hiW = W * dpr;
  const hiH = H * dpr;
  const hiCanvas = document.createElement('canvas');
  hiCanvas.width = hiW;
  hiCanvas.height = hiH;
  const hiCtx = hiCanvas.getContext('2d');
  if (!hiCtx) return null;
  hiCtx.scale(dpr, dpr);
  hiCtx.font = fontSpec;
  hiCtx.textBaseline = 'alphabetic';
  hiCtx.fillStyle = '#000';
  hiCtx.fillText(clean, startX, baseY);

  const hiData = hiCtx.getImageData(0, 0, hiW, hiH).data;
  let nzCount = 0;
  for (let i = 3; i < hiData.length; i += 4) {
    if (hiData[i] > 2) nzCount++;
  }

  const pixelIndex = new Uint32Array(nzCount);
  const pixelAlpha = new Uint8Array(nzCount);
  const pixelStroke = new Uint16Array(nzCount);
  const pixelProg = new Uint8Array(nzCount);

  let k = 0;
  for (let hy = 0; hy < hiH; hy++) {
    const ly = Math.min(H - 1, hy >> 1);
    const rowOff = hy * hiW;
    const loRowOff = ly * W;
    for (let hx = 0; hx < hiW; hx++) {
      const p = rowOff + hx;
      const a = hiData[p * 4 + 3];
      if (a <= 2) continue;
      const lx = Math.min(W - 1, hx >> 1);
      const owner = Math.max(0, strokeOwner1x[loRowOff + lx]);
      const st = strokes[owner];
      const t = projectProgressOnPolyline(st.points, st.totalLen, (hx + 0.5) / dpr, (hy + 0.5) / dpr);

      pixelIndex[k] = p;
      pixelAlpha[k] = a;
      pixelStroke[k] = owner;
      pixelProg[k] = Math.round(t * 255);
      k++;
    }
  }

  return {
    width: W,
    height: H,
    dpr,
    matraY,
    baseY,
    crownY: Math.max(12, matraY - 26),
    subY: Math.min(H - 10, baseY + 28),
    strokes,
    pixelCount: nzCount,
    pixelIndex,
    pixelAlpha,
    pixelStroke,
    pixelProg,
  };
}

/**
 * Ultra-fast (~0.15ms) 60fps Retina frame renderer for KalpurushModel.
 */
export function renderKalpurushFrame(
  ctx: CanvasRenderingContext2D,
  imgData: ImageData,
  model: KalpurushModel,
  opts: {
    mode: 'idle' | 'anim' | 'practice';
    activeStrokeIdx: number; // for 'anim': current stroke; for 'practice': completedCount
    activeProgress: number;  // 0..1 for 'anim'
    showOutline: boolean;
    isDark: boolean;
  }
): void {
  const buf32 = new Uint32Array(imgData.data.buffer);
  buf32.fill(0);

  const data = imgData.data;
  const { pixelCount, pixelIndex, pixelAlpha, pixelStroke, pixelProg } = model;
  const { mode, activeStrokeIdx, activeProgress, showOutline, isDark } = opts;

  // Colors matching EnglishWordStudio
  // Main ink: #15251B (light) / #F1F5F9 (dark)
  const inkR = isDark ? 241 : 21;
  const inkG = isDark ? 245 : 37;
  const inkB = isDark ? 249 : 27;

  // Active / completed emerald ink: #19B46B
  const emR = 25;
  const emG = 180;
  const emB = 107;

  // Ghost outline color: subtle slate/emerald
  const ghR = isDark ? 255 : 15;
  const ghG = isDark ? 255 : 42;
  const ghB = isDark ? 255 : 28;
  const ghostMul = showOutline ? (isDark ? 0.16 : 0.14) : 0;

  const progThreshold = activeProgress * 255;

  for (let i = 0; i < pixelCount; i++) {
    const off = pixelIndex[i] * 4;
    const baseA = pixelAlpha[i];

    if (mode === 'idle') {
      data[off] = inkR;
      data[off + 1] = inkG;
      data[off + 2] = inkB;
      data[off + 3] = baseA;
      continue;
    }

    const s = pixelStroke[i];

    if (mode === 'practice') {
      if (s < activeStrokeIdx) {
        data[off] = emR;
        data[off + 1] = emG;
        data[off + 2] = emB;
        data[off + 3] = baseA;
      } else if (ghostMul > 0) {
        data[off] = ghR;
        data[off + 1] = ghG;
        data[off + 2] = ghB;
        data[off + 3] = Math.round(baseA * ghostMul);
      }
      continue;
    }

    // mode === 'anim'
    if (s < activeStrokeIdx) {
      data[off] = inkR;
      data[off + 1] = inkG;
      data[off + 2] = inkB;
      data[off + 3] = baseA;
    } else if (s === activeStrokeIdx) {
      const pVal = pixelProg[i];
      if (pVal <= progThreshold) {
        // Soft 8-unit feather at the moving pen tip
        const edgeFade = progThreshold < 252 ? Math.min(1, (progThreshold - pVal + 6) / 6) : 1;
        const fgA = edgeFade;
        data[off] = emR;
        data[off + 1] = emG;
        data[off + 2] = emB;
        data[off + 3] = Math.round(baseA * Math.max(ghostMul, fgA));
      } else if (ghostMul > 0) {
        data[off] = ghR;
        data[off + 1] = ghG;
        data[off + 2] = ghB;
        data[off + 3] = Math.round(baseA * ghostMul);
      }
    } else if (ghostMul > 0) {
      data[off] = ghR;
      data[off + 1] = ghG;
      data[off + 2] = ghB;
      data[off + 3] = Math.round(baseA * ghostMul);
    }
  }

  ctx.putImageData(imgData, 0, 0);
}
