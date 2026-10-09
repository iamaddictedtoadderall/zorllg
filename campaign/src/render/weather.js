// render/weather.js (P1) — P0 STUB: stores the current WeatherParams; draws nothing.
export function install(ctx) {
  const api = {
    current: { type: 'clear', intensity: 0, wind: [0, 0], lightning: 0, fogBoost: 1 },
    set(p = {}, blendSeconds = 0) {
      api.current = { ...api.current, ...p };
      if (Array.isArray(p.wind)) api.current.wind = [p.wind[0] || 0, p.wind[1] || 0];
    },
    update(dt) { /* stub */ },
  };
  ctx.addSystem({ name: 'weather', phase: 'fx', when: 'always', update: (dt) => api.update(dt) });
  ctx.weather = api;
  return api;
}
