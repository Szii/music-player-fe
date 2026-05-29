import { Injectable } from '@angular/core';

export interface LoopSeamAnalysisRequest {
  url: string;
  windowStartS: number;
  windowEndS: number;
  fallbackOverlapMs: number;
}

export interface LoopSeamAnalysisResult {
  overlapMs: number;
  /**
   * Relative offset, in seconds, from windowStartS where the next loop copy
   * should restart for the best matched seam. Existing consumers can ignore
   * this and only use overlapMs.
   */
  restartOffsetS: number;
  /**
   * Relative offset, in seconds, before windowEndS where the outgoing seam was
   * matched. This is diagnostic unless the player explicitly supports shifting
   * the outgoing loop point.
   */
  endOffsetS: number;
  score: number;
  correlation: number;
  rmsDifference: number;
  normalizedDifference: number;
  edgeDifference: number;
}

interface OverlapScore {
  score: number;
  correlation: number;
  rmsDifference: number;
  normalizedDifference: number;
  edgeDifference: number;
}

@Injectable({ providedIn: 'root' })
export class LoopSeamAnalyzerService {
  private static readonly MIN_OVERLAP_MS = 50;
  private static readonly MAX_OVERLAP_MS = 280;
  private static readonly OVERLAP_STEP_MS = 10;
  private static readonly MAX_WINDOW_PORTION = 0.16;

  private static readonly MAX_START_OFFSET_MS = 180;
  private static readonly MAX_END_OFFSET_MS = 180;
  private static readonly OFFSET_STEP_MS = 10;
  private static readonly MAX_OFFSET_WINDOW_PORTION = 0.08;

  private static readonly MIN_SCORE = 0.28;
  private static readonly MIN_CORRELATION = 0.18;

  private static readonly NORMALIZED_DIFFERENCE_WEIGHT = 0.78;
  private static readonly RMS_DIFFERENCE_WEIGHT = 0.18;
  private static readonly EDGE_DIFFERENCE_WEIGHT = 0.14;
  private static readonly PREFERRED_OVERLAP_WEIGHT = 0.035;
  private static readonly LONG_OVERLAP_WEIGHT = 0.045;
  private static readonly OFFSET_WEIGHT = 0.09;

  private static readonly RESULT_CACHE_LIMIT = 80;
  private static readonly AUDIO_BUFFER_CACHE_LIMIT = 3;

  private readonly resultCache = new Map<string, LoopSeamAnalysisResult | null>();
  private readonly pendingResults = new Map<string, Promise<LoopSeamAnalysisResult | null>>();
  private readonly audioBufferCache = new Map<string, Promise<AudioBuffer | null>>();

  getCacheKey(request: LoopSeamAnalysisRequest): string {
    return [
      request.url,
      request.windowStartS.toFixed(3),
      request.windowEndS.toFixed(3),
      Math.round(request.fallbackOverlapMs),
    ].join('|');
  }

  getCachedLoopOverlap(
    request: LoopSeamAnalysisRequest,
  ): LoopSeamAnalysisResult | null | undefined {
    return this.resultCache.get(this.getCacheKey(request));
  }

  prewarmLoopOverlap(request: LoopSeamAnalysisRequest): void {
    void this.findBestLoopOverlap(request).catch(() => null);
  }

  findBestLoopOverlap(
    request: LoopSeamAnalysisRequest,
  ): Promise<LoopSeamAnalysisResult | null> {
    const key = this.getCacheKey(request);

    if (this.resultCache.has(key)) {
      return Promise.resolve(this.resultCache.get(key) ?? null);
    }

    const pending = this.pendingResults.get(key);
    if (pending) return pending;

    const next = this.analyze(request)
      .then(result => {
        this.pendingResults.delete(key);
        this.rememberResult(key, result);
        return result;
      })
      .catch(err => {
        console.warn('Loop seam analysis failed', err);
        this.pendingResults.delete(key);
        this.rememberResult(key, null);
        return null;
      });

    this.pendingResults.set(key, next);
    return next;
  }

  private async analyze(
    request: LoopSeamAnalysisRequest,
  ): Promise<LoopSeamAnalysisResult | null> {
    const windowDurationS = request.windowEndS - request.windowStartS;
    if (!Number.isFinite(windowDurationS) || windowDurationS <= 0.25) {
      return null;
    }

    const audioBuffer = await this.loadAudioBuffer(request.url);
    if (!audioBuffer) return null;

    const sampleRate = audioBuffer.sampleRate;
    const windowStartFrame = this.secondsToFrame(request.windowStartS, sampleRate);
    const windowEndFrame = this.secondsToFrame(request.windowEndS, sampleRate);
    const windowFrames = windowEndFrame - windowStartFrame;

    if (windowFrames <= sampleRate * 0.25) return null;

    const windowDurationMs = windowDurationS * 1000;
    const maxOverlapMs = Math.min(
      LoopSeamAnalyzerService.MAX_OVERLAP_MS,
      Math.floor(windowDurationMs * LoopSeamAnalyzerService.MAX_WINDOW_PORTION),
      Math.floor(windowDurationMs * 0.5),
    );

    const minOverlapMs = Math.min(
      LoopSeamAnalyzerService.MIN_OVERLAP_MS,
      maxOverlapMs,
    );

    if (maxOverlapMs < minOverlapMs) return null;

    const preferredMs = Math.max(
      minOverlapMs,
      Math.min(
        maxOverlapMs,
        Math.round(request.fallbackOverlapMs || 160),
      ),
    );

    const maxStartOffsetMs = this.getMaxOffsetMs(
      windowDurationMs,
      LoopSeamAnalyzerService.MAX_START_OFFSET_MS,
    );
    const maxEndOffsetMs = this.getMaxOffsetMs(
      windowDurationMs,
      LoopSeamAnalyzerService.MAX_END_OFFSET_MS,
    );

    let best: LoopSeamAnalysisResult | null = null;

    for (
      let overlapMs = minOverlapMs;
      overlapMs <= maxOverlapMs;
      overlapMs += LoopSeamAnalyzerService.OVERLAP_STEP_MS
    ) {
      const overlapFrames = this.millisecondsToFrame(overlapMs, sampleRate);
      if (overlapFrames <= 0 || overlapFrames >= windowFrames) continue;

      for (
        let startOffsetMs = 0;
        startOffsetMs <= maxStartOffsetMs;
        startOffsetMs += LoopSeamAnalyzerService.OFFSET_STEP_MS
      ) {
        const startOffsetFrames = this.millisecondsToFrame(startOffsetMs, sampleRate);
        const headFrame = windowStartFrame + startOffsetFrames;

        if (headFrame + overlapFrames >= windowEndFrame) continue;

        const head = this.copyMonoSegment(audioBuffer, headFrame, overlapFrames);

        for (
          let endOffsetMs = 0;
          endOffsetMs <= maxEndOffsetMs;
          endOffsetMs += LoopSeamAnalyzerService.OFFSET_STEP_MS
        ) {
          const endOffsetFrames = this.millisecondsToFrame(endOffsetMs, sampleRate);
          const tailFrame = windowEndFrame - endOffsetFrames - overlapFrames;

          if (tailFrame <= windowStartFrame) continue;
          if (tailFrame + overlapFrames > windowEndFrame) continue;
          if (tailFrame <= headFrame) continue;

          const tail = this.copyMonoSegment(audioBuffer, tailFrame, overlapFrames);
          const score = this.scoreOverlap(
            head,
            tail,
            overlapMs,
            preferredMs,
            startOffsetMs,
            endOffsetMs,
          );

          if (!best || score.score > best.score) {
            best = {
              overlapMs,
              restartOffsetS: startOffsetMs / 1000,
              endOffsetS: endOffsetMs / 1000,
              score: score.score,
              correlation: score.correlation,
              rmsDifference: score.rmsDifference,
              normalizedDifference: score.normalizedDifference,
              edgeDifference: score.edgeDifference,
            };
          }
        }
      }
    }

    if (
      !best ||
      best.score < LoopSeamAnalyzerService.MIN_SCORE ||
      best.correlation < LoopSeamAnalyzerService.MIN_CORRELATION
    ) {
      return null;
    }

    return best;
  }

  private async loadAudioBuffer(url: string): Promise<AudioBuffer | null> {
    const cached = this.audioBufferCache.get(url);
    if (cached) return cached;

    const promise = this.decodeUrl(url);
    this.audioBufferCache.set(url, promise);
    this.trimAudioBufferCache();
    return promise;
  }

  private async decodeUrl(url: string): Promise<AudioBuffer | null> {
    if (typeof window === 'undefined') return null;

    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    const AudioContextCtor: typeof AudioContext | undefined =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextCtor) return null;

    const ctx = new AudioContextCtor();
    try {
      return await ctx.decodeAudioData(arrayBuffer.slice(0));
    } finally {
      void ctx.close().catch(() => {});
    }
  }

  private copyMonoSegment(
    buffer: AudioBuffer,
    startFrame: number,
    frameCount: number,
  ): Float32Array {
    const safeStart = Math.max(0, Math.min(startFrame, buffer.length - 1));
    const safeCount = Math.max(
      0,
      Math.min(frameCount, buffer.length - safeStart),
    );
    const mono = new Float32Array(safeCount);
    const channel = new Float32Array(safeCount);

    for (let c = 0; c < buffer.numberOfChannels; c++) {
      channel.fill(0);
      buffer.copyFromChannel(channel, c, safeStart);
      for (let i = 0; i < safeCount; i++) {
        mono[i] += channel[i] / buffer.numberOfChannels;
      }
    }

    return mono;
  }

  private scoreOverlap(
    head: Float32Array,
    tail: Float32Array,
    overlapMs: number,
    preferredMs: number,
    startOffsetMs: number,
    endOffsetMs: number,
  ): OverlapScore {
    const n = Math.min(head.length, tail.length);
    if (n <= 0) {
      return {
        score: Number.NEGATIVE_INFINITY,
        correlation: -1,
        rmsDifference: 1,
        normalizedDifference: 1,
        edgeDifference: 1,
      };
    }

    let meanHead = 0;
    let meanTail = 0;

    for (let i = 0; i < n; i++) {
      meanHead += head[i];
      meanTail += tail[i];
    }

    meanHead /= n;
    meanTail /= n;

    let dot = 0;
    let energyHead = 0;
    let energyTail = 0;
    let diffEnergy = 0;

    for (let i = 0; i < n; i++) {
      const h = head[i] - meanHead;
      const t = tail[i] - meanTail;
      const d = h - t;

      dot += h * t;
      energyHead += h * h;
      energyTail += t * t;
      diffEnergy += d * d;
    }

    const epsilon = 1e-9;
    const rmsHead = Math.sqrt(energyHead / n);
    const rmsTail = Math.sqrt(energyTail / n);
    const rmsDifference = Math.abs(rmsHead - rmsTail);
    const correlation = dot / Math.sqrt((energyHead + epsilon) * (energyTail + epsilon));
    const normalizedDifference = Math.sqrt(diffEnergy / n) / (rmsHead + rmsTail + epsilon);
    const edgeDifference = this.getEdgeDifference(head, tail, rmsHead, rmsTail);
    const preferredPenalty = Math.abs(overlapMs - preferredMs) / 1000;
    const longOverlapPenalty = overlapMs / 1000;
    const offsetPenalty = (startOffsetMs + endOffsetMs) / 1000;

    const score =
      correlation -
      normalizedDifference * LoopSeamAnalyzerService.NORMALIZED_DIFFERENCE_WEIGHT -
      rmsDifference * LoopSeamAnalyzerService.RMS_DIFFERENCE_WEIGHT -
      edgeDifference * LoopSeamAnalyzerService.EDGE_DIFFERENCE_WEIGHT -
      preferredPenalty * LoopSeamAnalyzerService.PREFERRED_OVERLAP_WEIGHT -
      longOverlapPenalty * LoopSeamAnalyzerService.LONG_OVERLAP_WEIGHT -
      offsetPenalty * LoopSeamAnalyzerService.OFFSET_WEIGHT;

    return {
      score,
      correlation,
      rmsDifference,
      normalizedDifference,
      edgeDifference,
    };
  }

  private getEdgeDifference(
    head: Float32Array,
    tail: Float32Array,
    rmsHead: number,
    rmsTail: number,
  ): number {
    if (head.length === 0 || tail.length === 0) return 1;

    const epsilon = 1e-9;
    const valueDifference = Math.abs(tail[tail.length - 1] - head[0]);
    const tailSlope = tail.length > 1 ? tail[tail.length - 1] - tail[tail.length - 2] : 0;
    const headSlope = head.length > 1 ? head[1] - head[0] : 0;
    const slopeDifference = Math.abs(tailSlope - headSlope);
    const scale = rmsHead + rmsTail + epsilon;

    return (valueDifference + slopeDifference * 0.5) / scale;
  }

  private getMaxOffsetMs(windowDurationMs: number, absoluteMaxMs: number): number {
    const byWindow = Math.floor(
      windowDurationMs * LoopSeamAnalyzerService.MAX_OFFSET_WINDOW_PORTION,
    );

    return Math.max(
      0,
      Math.min(
        absoluteMaxMs,
        byWindow,
        Math.max(0, Math.floor(windowDurationMs * 0.5) - LoopSeamAnalyzerService.MIN_OVERLAP_MS),
      ),
    );
  }

  private rememberResult(key: string, result: LoopSeamAnalysisResult | null): void {
    this.resultCache.set(key, result);
    while (this.resultCache.size > LoopSeamAnalyzerService.RESULT_CACHE_LIMIT) {
      const oldestKey = this.resultCache.keys().next().value;
      if (oldestKey == null) break;
      this.resultCache.delete(oldestKey);
    }
  }

  private trimAudioBufferCache(): void {
    while (this.audioBufferCache.size > LoopSeamAnalyzerService.AUDIO_BUFFER_CACHE_LIMIT) {
      const oldestKey = this.audioBufferCache.keys().next().value;
      if (oldestKey == null) break;
      this.audioBufferCache.delete(oldestKey);
    }
  }

  private secondsToFrame(seconds: number, sampleRate: number): number {
    return Math.max(0, Math.floor(seconds * sampleRate));
  }

  private millisecondsToFrame(milliseconds: number, sampleRate: number): number {
    return Math.max(0, Math.floor((milliseconds / 1000) * sampleRate));
  }
}
