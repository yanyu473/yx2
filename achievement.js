/* =====================================================================
 * achievement.js — 成就勋章系统
 *   - 26 个成就，存 localStorage（含获得时间 年月日时分）
 *   - 解锁实时弹窗提示
 *   - 勋章展馆：已得高亮 / 未得灰色锁定
 *   - 难度分级：简单 / 中等 / 较难
 * ===================================================================== */
(function (TG) {
  'use strict';

  // 成就定义：id / 名称 / 描述 / 图标符号 / 难度档
  const DEFS = [
    // ====== 原有成就（简单~中等） ======
    { id: 'first_battle', name: '初次上阵', desc: '开始你的第一场战斗', icon: '★', tier: '简单' },
    { id: 'first_kill', name: '首杀时刻', desc: '击杀第一个敌人', icon: '✦', tier: '简单' },
    { id: 'kill50', name: '屠戮者', desc: '单局击杀 50 个敌人', icon: '☠', tier: '中等' },
    { id: 'elite10', name: '精英猎手', desc: '单局击杀 10 个精英', icon: '◈', tier: '中等' },
    { id: 'boss', name: 'Boss 终结者', desc: '击败深渊执政官', icon: '♛', tier: '中等' },
    { id: 'nohurt_wave', name: '无伤之盾', desc: '一波内未受伤', icon: '⛨', tier: '简单' },
    { id: 'combo50', name: '连击大师', desc: '达到 50 连击', icon: '⚡', tier: '中等' },
    { id: 'score10k', name: '得分破万', desc: '单局得分超过 10000', icon: '◆', tier: '中等' },
    { id: 'clear_skill', name: '清屏艺术家', desc: '使用清屏技能', icon: '✺', tier: '简单' },
    { id: 'surrender', name: '投降的勇气', desc: '主动投降一次', icon: '🏳', tier: '简单' },
    { id: 'shield10', name: '护盾大师', desc: '累计使用护盾 10 次', icon: '◯', tier: '中等' },
    { id: 'pickup10', name: '拾荒者', desc: '累计拾取 10 个道具', icon: '✚', tier: '中等' },
    { id: 'maxfire', name: '满级火力', desc: '火力提升到最高等级', icon: '✸', tier: '中等' },
    { id: 'clear_all', name: '通关勇士', desc: '击败 Boss 完成最终防线', icon: '✯', tier: '中等' },
    { id: 'star_guardian', name: '星际守护者', desc: '单局得分超过 50000', icon: '✪', tier: '较难' },
    // ====== 新增成就（简单→较难） ======
    { id: 'coop_win', name: '同袍之义', desc: '双人合作模式通关', icon: '♔', tier: '简单' },
    { id: 'pk_win', name: '决斗之王', desc: '双人对决中获胜', icon: '⚔', tier: '简单' },
    { id: 'surrender3', name: '逃离主义者', desc: '累计投降 3 次', icon: '⚐', tier: '简单' },
    { id: 'kill200', name: '歼灭者', desc: '单局击杀 200 个敌人', icon: '☢', tier: '较难' },
    { id: 'combo100', name: '连击至尊', desc: '达到 100 连击', icon: '✴', tier: '较难' },
    { id: 'no_items', name: '苦修战士', desc: '整局未拾取任何道具并通关', icon: '⊘', tier: '中等' },
    { id: 'clear3_win', name: '三重净化', desc: '单局使用 3 次清屏并通关', icon: '✹', tier: '中等' },
    { id: 'inferno_win', name: '炼狱行者', desc: '炼狱难度通关', icon: '☄', tier: '较难' },
    { id: 'no_skill', name: '禁欲行者', desc: '全程不使用护盾与清屏通关', icon: '⊗', tier: '较难' },
    { id: 'low_hp_kill', name: '逆血反杀', desc: '血量低于 10% 时击杀 Boss', icon: '♡', tier: '较难' },
    { id: 'untouchable', name: '不坏金身', desc: '整局未受任何伤害通关', icon: '⛊', tier: '较难' },
  ];

  class Achievement {
    constructor() {
      this.defs = DEFS;
      this.unlocked = {};   // id -> 时间字符串
      this.queue = [];      // 待弹窗队列
      this._load();
      this._stats = {};     // 跨局累计（护盾使用/拾取）
    }
    _load() {
      this.unlocked = TG.store.get('tk_ach', {});
      this._stats = TG.store.get('tk_ach_stats', {});
    }
    _save() { TG.store.set('tk_ach', this.unlocked); TG.store.set('tk_ach_stats', this._stats); }

    all() { return this.defs; }
    isUnlocked(id) { return !!this.unlocked[id]; }
    count() { return this.defs.filter((d) => this.unlocked[d.id]).length; }

    // 返回已解锁成就按获得时间排序（从早到晚）
    unlockedSorted() {
      return this.defs
        .filter((d) => this.unlocked[d.id])
        .map((d) => ({ def: d, time: this.unlocked[d.id] }))
        .sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    }

    // 返回未解锁成就列表
    lockedList() {
      return this.defs.filter((d) => !this.unlocked[d.id]);
    }

    // 累计统计
    addStat(key, n) { this._stats[key] = (this._stats[key] || 0) + n; this._save(); }
    stat(key) { return this._stats[key] || 0; }

    // 触发检查（按事件类型）
    check(event, value) {
      switch (event) {
        case 'battle_start': this.unlock('first_battle'); break;
        case 'first_kill': this.unlock('first_kill'); break;
        case 'kills':
          if (value >= 50) this.unlock('kill50');
          if (value >= 200) this.unlock('kill200');         // 新增：歼灭者
          break;
        case 'elite': if ((value || 0) >= 10) this.unlock('elite10'); break;
        case 'boss':
          this.unlock('boss'); this.unlock('clear_all');
          break;
        case 'boss_lowhp': this.unlock('low_hp_kill'); break;  // 新增：逆血反杀
        case 'combo':
          if (value >= 50) this.unlock('combo50');
          if (value >= 100) this.unlock('combo100');         // 新增：连击至尊
          break;
        case 'score':
          if (value >= 10000) this.unlock('score10k');
          if (value >= 50000) this.unlock('star_guardian');
          break;
        case 'clear': this.unlock('clear_skill'); break;
        case 'surrender':
          this.unlock('surrender');
          this.addStat('surrender', 1);                       // 新增：逃离主义者
          if (this.stat('surrender') >= 3) this.unlock('surrender3');
          break;
        case 'shield':
          this.addStat('shield', 1);
          if (this.stat('shield') >= 10) this.unlock('shield10');
          break;
        case 'powerup':
          this.addStat('pickup', 1);
          if (this.stat('pickup') >= 10) this.unlock('pickup10');
          break;
        case 'maxfire': this.unlock('maxfire'); break;
        case 'nohurt': this.unlock('nohurt_wave'); break;
        // 新增：通关时综合检查（value 为条件对象）
        case 'win':
          if (value) {
            if (value.coop) this.unlock('coop_win');         // 同袍之义
            if (value.pk) this.unlock('pk_win');             // 决斗之王
            if (value.inferno) this.unlock('inferno_win');   // 炼狱行者
            if (value.noItems) this.unlock('no_items');     // 苦修战士
            if (value.clear3) this.unlock('clear3_win');    // 三重净化
            if (value.noSkill) this.unlock('no_skill');     // 禁欲行者
            if (value.noDamage) this.unlock('untouchable'); // 不坏金身
          }
          break;
      }
    }

    unlock(id) {
      if (this.unlocked[id]) return false;
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const time = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
      this.unlocked[id] = time;
      this._save();
      const def = this.defs.find((d) => d.id === id);
      if (def) {
        this.queue.push({ def, time });
        TG.audio && TG.audio.sfxAchievement();
      }
      return true;
    }

    // 取一个待弹窗
    pop() { return this.queue.shift() || null; }
    hasPop() { return this.queue.length > 0; }
  }

  TG.Achievement = Achievement;
})(window.TG = window.TG || {});
