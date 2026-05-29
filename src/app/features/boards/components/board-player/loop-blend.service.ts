import { Injectable } from '@angular/core';

export type LoopBlendKind = 'switch' | 'loop';

export interface LoopBlendCurveOptions {
  kind: LoopBlendKind;
  steps?: number;
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

        // Looped windows usually overlap two highly related copies of the same
        // audio. A mostly constant-amplitude blend avoids the mid-fade loudness
        // bump that pure equal-power curves can create on correlated material.
        // A small equal-power component keeps the blend from dipping too much
        // when the selected end/start are not perfectly correlated.
        const equalPowerAmount = 0.18;
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
    const x = Math.max(0, Math.min(t, 1));
    return x * x * x * (x * (x * 6 - 15) + 10);
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }
}
