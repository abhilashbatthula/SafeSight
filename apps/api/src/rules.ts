export interface ConditionState {
  breachCount: number;
  recoveryCount: number;
  active: boolean;
}
export interface Limits {
  threshold: number;
  consecutive: number;
  hysteresis: number;
  recoveryReadings: number;
}
export function stepCondition(
  state: ConditionState,
  value: number,
  rule: Limits,
): ConditionState {
  if (!state.active) {
    const count = value >= rule.threshold ? state.breachCount + 1 : 0;
    return {
      breachCount: count,
      recoveryCount: 0,
      active: count >= rule.consecutive,
    };
  }
  const recovered =
    value < rule.threshold - rule.hysteresis ? state.recoveryCount + 1 : 0;
  return {
    breachCount: state.breachCount,
    recoveryCount: recovered,
    active: recovered < rule.recoveryReadings,
  };
}
export function nextReading(
  previous: { temperature: number; humidity: number; aqi: number },
  scenario: string,
  seed: number,
  tick: number,
) {
  let state = (seed ^ Math.imul(tick + 1, 0x9e3779b9)) >>> 0;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  const rand = (state >>> 0) / 4294967296;
  const drift = (rand - 0.5) * 0.6;
  const approach = (v: number, target: number, max: number) =>
    v + Math.max(-max, Math.min(max, target - v)) + drift;
  return {
    temperature:
      Math.round(
        Math.max(
          15,
          Math.min(
            48,
            approach(
              previous.temperature,
              scenario === 'temperature' ? 44 : 27 + (seed % 5) * 0.4,
              scenario === 'temperature' ? 2 : 1.5,
            ),
          ),
        ) * 10,
      ) / 10,
    humidity:
      Math.round(Math.max(30, Math.min(80, previous.humidity + drift)) * 10) /
      10,
    aqi: Math.round(
      Math.max(
        10,
        Math.min(
          250,
          approach(
            previous.aqi,
            scenario === 'aqi' ? 180 : 45 + (seed % 5) * 3,
            scenario === 'aqi' ? 12 : 10,
          ),
        ),
      ),
    ),
  };
}
