/* =====================================================================
 * bullet.js — 子弹系统（弹道 / 阵营 / 对象池）
 *   - team: 'player' | 'enemy'
 *   - 高速子弹用分步移动避免穿透
 *   - 拖尾由粒子系统生成
 * ===================================================================== */
(function (TG) {
  'use strict';

  class Bullet {
    constructor() { this.alive = false; }
    spawn(x, y, vx, vy, team, dmg, opts) {
      this.alive = true;
      this.x = x; this.y = y;
      this.px = x; this.py = y;          // 上一帧位置（用于拖尾/穿透）
      this.vx = vx; this.vy = vy;
      this.team = team;                  // 阵营
      this.dmg = dmg;
      this.r = (opts && opts.r) || 4;    // 半径（用于碰撞）
      this.life = (opts && opts.life) || 2.5;
      this.color = (opts && opts.color) || (team === 'player' ? '#9bf6ff' : '#ff6bd6');
      this.pierce = (opts && opts.pierce) || 0;   // 穿透剩余次数（0=命中即销毁）
      this.homing = (opts && opts.homing) || 0;   // 追踪强度
      this.target = (opts && opts.target) || null;
      this.shape = (opts && opts.shape) || 'round';
      this.spin = 0;
      this.trailT = 0;
    }
    update(dt, game) {
      if (!this.alive) return;
      this.px = this.x; this.py = this.y;
      // 追踪
      if (this.homing && this.target && this.target.alive) {
        const want = Math.atan2(this.target.cy - this.y, this.target.cx - this.x);
        const cur = Math.atan2(this.vy, this.vx);
        const na = TG.turnToward(cur, want, this.homing * dt);
        const sp = Math.hypot(this.vx, this.vy);
        this.vx = Math.cos(na) * sp; this.vy = Math.sin(na) * sp;
      }
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.spin += dt * 8;
      this.life -= dt;
      // 出界销毁
      const W = game.W, H = game.H, m = 60;
      if (this.x < -m || this.x > W + m || this.y < -m || this.y > H + m || this.life <= 0) {
        this.alive = false; return;
      }
      // 拖尾（节流：每 0.02s）
      this.trailT -= dt;
      if (this.trailT <= 0) {
        TG.particles.trail(this.x, this.y, this.vx, this.vy, this.color, this.r * 0.7);
        this.trailT = 0.02;
      }
    }
    render(ctx) {
      if (!this.alive) return;
      const a = Math.atan2(this.vy, this.vx);
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(a);
      const c = this.color;
      // 外发光
      ctx.shadowColor = c; ctx.shadowBlur = 12;
      if (this.shape === 'round') {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(0, 0, this.r, 0, TG.TAU); ctx.fill();
        ctx.fillStyle = c;
        ctx.globalAlpha = 0.6;
        ctx.beginPath(); ctx.arc(0, 0, this.r * 1.7, 0, TG.TAU); ctx.fill();
        ctx.globalAlpha = 1;
      } else { // 'bolt' 闪电长条
        ctx.fillStyle = c;
        ctx.fillRect(-this.r * 2.2, -this.r * 0.5, this.r * 4.4, this.r);
        ctx.fillStyle = '#fff';
        ctx.fillRect(-this.r * 1.6, -this.r * 0.25, this.r * 3.2, this.r * 0.5);
      }
      ctx.shadowBlur = 0;
      ctx.restore();
    }
    // 碰撞盒（圆）
    hitCircle() { return { x: this.x, y: this.y, r: this.r }; }
  }

  class BulletSystem {
    constructor() {
      this.pool = new TG.Pool(() => new Bullet(), (b) => { b.alive = false; }, 120);
    }
    clear() { this.pool.clear(); }
    count() { return this.pool.active.length; }

    fire(x, y, ang, speed, team, dmg, opts) {
      const b = this.pool.acquire();
      b.spawn(x, y, Math.cos(ang) * speed, Math.sin(ang) * speed, team, dmg, opts);
      return b;
    }

    update(dt, game) {
      this.pool.forEach((b) => b.update(dt, game));
      this.pool.sweep((b) => !b.alive);
    }
    render(ctx) { this.pool.forEach((b) => b.render(ctx)); }
    forEach(fn) { this.pool.forEach(fn); }
  }

  TG.Bullet = Bullet;
  TG.bullets = new BulletSystem();
})(window.TG = window.TG || {});
