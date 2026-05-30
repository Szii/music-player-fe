import { Injectable } from '@angular/core';

export type LoopBlendKind = 'switch' | 'loop';

export interface LoopBlendCurveOptions {
  kind: LoopBlendKind;
  steps?: number;

  /**
   * Optional similarity from LoopSeamAnalyzerService.
   *
   * High correlation means the two sides are related, so a mostly-linear
   * constant-amplitude blend is better.
   *
   * Lower correlation means the two sides are less related, so we add more
   * equal-power behavior to avoid a perceived volume dip.
   */
  correlation?: number;
}

export interface LoopBlendCurves {
  fromCurve: Float32Array;
  toCurve: Float32Array;
}

@Injectable({ providedIn: 'root' })
export class LoopBlendService {
  buildGainCurves(options: LoopBlendCurveOptions): LoopBlendCurves {
    const steps = Math.max(2, Math.floor(options.steps ?? 96));
    const fromCurve = new Float32Array(steps);
    const toCurve = new Float32Array(steps);

    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);

      if (options.kind === 'loop') {
        const eased = this.smootherStep(t);
        const linearFrom = 1 - eased;
        const linearTo = eased;

        const equalPowerFrom = Math.cos((eased * Math.PI) / 2);
        const equalPowerTo = Math.sin((eased * Math.PI) / 2);

        const correlation = this.clamp(options.correlation ?? 0.72, 0, 1);

        // Highly correlated loop seams should stay close to linear, because
        // equal-power can create a loudness bump when both copies contain
        // nearly the same waveform. Weak-but-accepted seams get more
        // equal-power behavior to avoid a volume hole during the blend.
        const equalPowerAmount = this.lerp(0.08, 0.42, 1 - correlation);

        fromCurve[i] = this.lerp(linearFrom, equalPowerFrom, equalPowerAmount);
        toCurve[i] = this.lerp(linearTo, equalPowerTo, equalPowerAmount);
      } else {
        // Track/window switches are usually less correlated. Use classic
        // equal-power with a linear time base so the incoming track becomes
        // audible immediately. Smoother-step is intentionally not used here,
        // because it can feel like fade-out first and fade-in afterwards.
        fromCurve[i] = Math.cos((t * Math.PI) / 2);
        toCurve[i] = Math.sin((t * Math.PI) / 2);
      }
    }

    fromCurve[0] = 1;
    toCurve[0] = 0;
    fromCurve[steps - 1] = 0;
    toCurve[steps - 1] = 1;

    return { fromCurve, toCurve };
  }

  private smootherStep(t: number): number {
    const x = this.clamp(t, 0, 1);
    return x * x * x * (x * (x * 6 - 15) + 10);
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(value, max));
  }
}
