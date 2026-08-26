/* =====================================================================
 * powerup.js — 道具系统
 *   - 敌人被击杀按概率掉落
 *   - 低速下落，玩家碰撞拾取
 *   - 类型：火力/速度/护盾/生命/分数加倍
 * ===================================================================== */
(function (TG) {
  'use strict';

  const TYPES = ['fire', 'speed', 'shield', 'heal', 'score'];
  const COLORS = { fire: '#ffb13a', speed: '#7cff8a', shield: '#3ad1ff', heal: '#ff5a8a', score: '#ffd24a' };
  const ICONS = { fire: 'F', speed: 'S', shield: 'D', heal: '+', score: 'x2' };

  class PowerUp {
    constructor() { this.alive = false; }
    spawn(x, y) {
      this.alive = true;
      this.x = x; this.y = y; this.vx = TG.rand(-30, 30); this.vy = 60;
      this.r = 11;
      this.type = TG.pick(TYPES);
      this.color = COLORS[this.type];
      this.t = 0;
    }
    update(dt, game) {
      if (!this.alive) return;
      this.t += dt;
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.vx *= 0.98;
      if (this.y > game.H + 30) this.alive = false;
    }
    render(ctx) {
      if (!this.alive) return;
      const pulse = 1 + Math.sin(this.t * 5) * 0.12;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(pulse, pulse);
      ctx.shadowColor = this.color; ctx.shadowBlur = 16;
      ctx.fillStyle = this.color;
      ctx.beginPath(); ctx.arc(0, 0, this.r, 0, TG.TAU); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#0a0f1a';
      ctx.beginPath(); ctx.arc(0, 0, this.r - 3, 0, TG.TAU); ctx.fill();
      ctx.fillStyle = this.color;
      ctx.font = 'bold 10px "Segoe UI", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(ICONS[this.type], 0, 1);
      ctx.restore();
    }
    hitCircle() { return { x: this.x, y: this.y, r: this.r + 4 }; }
  }

  class PowerUpSystem {
    constructor() { this.pool = new TG.Pool(() => new PowerUp(), (p) => { p.alive = false; }, 20); }
    clear() { this.pool.clear(); }
    spawn(x, y) { const p = this.pool.acquire(); p.spawn(x, y); return p; }
    update(dt, game) { this.pool.forEach((p) => p.update(dt, game)); this.pool.sweep((p) => !p.alive); }
    render(ctx) { this.pool.forEach((p) => p.render(ctx)); }
    forEach(fn) { this.pool.forEach(fn); }
  }

  TG.PowerUp = PowerUp;
  TG.powerups = new PowerUpSystem();
  TG.POWERUP_COLORS = COLORS;
})(window.TG = window.TG || {});
