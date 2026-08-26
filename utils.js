/* =====================================================================
 * utils.js — 工具函数：数学运算、随机数、AABB碰撞、向量、对象池
 * 全部挂载到全局命名空间 TG，供其它模块复用
 * ===================================================================== */
(function (TG) {
  'use strict';

  // ----- 数学工具 -----
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const dist2 = (ax, ay, bx, by) => {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  };
  const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
  // 角度差归一到 -PI..PI
  const angleDiff = (a, b) => {
    let d = (a - b) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  };
  // 朝目标角度平滑转向
  const turnToward = (cur, target, maxStep) => {
    const d = angleDiff(target, cur);
    if (Math.abs(d) <= maxStep) return target;
    return cur + Math.sign(d) * maxStep;
  };

  // ----- AABB 碰撞 -----
  // 两矩形 {x,y,w,h}（左上角+宽高）
  const aabb = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  // 圆与矩形碰撞（用于子弹圆形 vs 实体矩形）
  const circleRect = (cx, cy, cr, r) => {
    const nx = clamp(cx, r.x, r.x + r.w);
    const ny = clamp(cy, r.y, r.y + r.h);
    const dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy <= cr * cr;
  };

  // ----- 对象池 -----
  // 预分配 + 复用，避免高频 GC 抖动（子弹/粒子/敌人）
  class Pool {
    constructor(factory, reset, pre = 0) {
      this.factory = factory;
      this.reset = reset;
      this.free = [];
      this.active = [];
      for (let i = 0; i < pre; i++) this.free.push(factory());
    }
    acquire() {
      const o = this.free.pop() || this.factory();
      this.active.push(o);
      return o;
    }
    release(o) {
      const i = this.active.indexOf(o);
      if (i >= 0) {
        this.active.splice(i, 1);
        if (this.reset) this.reset(o);
        this.free.push(o);
      }
    }
    // 每帧回收标记为 dead 的对象
    sweep(getDead) {
      for (let i = this.active.length - 1; i >= 0; i--) {
        const o = this.active[i];
        if (getDead(o)) this.release(o);
      }
    }
    forEach(fn) {
      for (let i = 0; i < this.active.length; i++) fn(this.active[i], i);
    }
    clear() {
      while (this.active.length) this.release(this.active[0]);
    }
  }

  // ----- localStorage 封装（容错） -----
  const store = {
    get(key, def) {
      try {
        const v = localStorage.getItem(key);
        return v == null ? def : JSON.parse(v);
      } catch (e) { return def; }
    },
    set(key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
    },
  };

  // ----- 简易事件计时器：到时回调一次 -----
  class Timer {
    constructor() { this.t = 0; this.cb = null; this.active = false; }
    set(sec, cb) { this.t = sec; this.cb = cb; this.active = true; }
    update(dt) {
      if (!this.active) return;
      this.t -= dt;
      if (this.t <= 0) { this.active = false; const c = this.cb; this.cb = null; if (c) c(); }
    }
    clear() { this.active = false; this.cb = null; }
  }

  // 导出
  Object.assign(TG, {
    TAU, clamp, lerp, rand, randInt, pick, dist, dist2, angleDiff, turnToward,
    aabb, circleRect, Pool, store, Timer,
  });
})(window.TG = window.TG || {});
