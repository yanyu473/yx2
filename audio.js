/* =====================================================================
 * audio.js — 程序化音频引擎（Web Audio API）
 *   - 多阶段 BGM：主菜单 / 轻松战斗 / 紧张战斗 / Boss战 / 胜利 / 失败
 *   - 音效 SFX：射击 / 命中 / 爆炸 / 拾取 / 受击 / 清屏 / 升级 / 点击 等
 *   - 全部用振荡器+包络+滤波器合成，零外部音频文件
 * ===================================================================== */
(function (TG) {
  'use strict';

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.musicGain = null;
      this.sfxGain = null;
      this.enabled = true;
      this.musicOn = true;
      this.sfxOn = true;
      this.curTrack = null;     // 当前曲目 id
      this.seqTimer = null;     // setTimeout 句柄
      this.step = 0;            // 序列步进
      this.bpm = 120;
      this.layer2 = false;      // 是否叠加紧张层
      this.volume = 0.7;
    }

    // 用户首次交互后才可创建 AudioContext（浏览器策略）
    init() {
      if (this.ctx) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.42;
        this.musicGain.connect(this.master);
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = 0.55;
        this.sfxGain.connect(this.master);
      } catch (e) { this.enabled = false; }
    }

    resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

    setVolume(v) {
      this.volume = TG.clamp(v, 0, 1);
      if (this.master) this.master.gain.value = this.volume;
    }

    // ---- 单音合成 ----
    // type: 振荡器类型；freq；dur；gain；attack/decay；可选 glide 目标频率
    tone({ freq = 440, type = 'sine', dur = 0.2, gain = 0.2, attack = 0.005,
           decay = null, glide = null, dest = null, when = 0, detune = 0 }) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + when;
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (glide != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, glide), t + dur);
      osc.detune.value = detune;
      const g = this.ctx.createGain();
      const d = decay != null ? decay : dur;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + d);
      osc.connect(g);
      g.connect(dest || this.sfxGain);
      osc.start(t);
      osc.stop(t + attack + d + 0.02);
    }

    // 噪声爆（爆炸/受击）
    noise({ dur = 0.3, gain = 0.3, type = 'highpass', freq = 800, q = 1, when = 0 }) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + when;
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filt = this.ctx.createBiquadFilter();
      filt.type = type; filt.frequency.value = freq; filt.Q.value = q;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filt); filt.connect(g); g.connect(this.sfxGain);
      src.start(t);
    }

    // ============== SFX 库 ==============
    sfxShoot() { this.tone({ freq: 720, type: 'square', dur: 0.08, gain: 0.12, glide: 240 }); this.noise({ dur: 0.05, gain: 0.05, freq: 1800 }); }
    sfxEnemyShoot() { this.tone({ freq: 300, type: 'sawtooth', dur: 0.1, gain: 0.06, glide: 160 }); }
    sfxHit() { this.tone({ freq: 420, type: 'triangle', dur: 0.07, gain: 0.12, glide: 620 }); this.noise({ dur: 0.06, gain: 0.08, freq: 2400 }); }
    sfxExplosion() { this.noise({ dur: 0.45, gain: 0.32, type: 'lowpass', freq: 900, q: 0.6 }); this.tone({ freq: 120, type: 'sine', dur: 0.35, gain: 0.18, glide: 40 }); }
    sfxBigExplosion() { this.noise({ dur: 0.9, gain: 0.42, type: 'lowpass', freq: 700, q: 0.5 }); this.tone({ freq: 90, type: 'sine', dur: 0.8, gain: 0.28, glide: 30 }); for (let i = 0; i < 3; i++) this.tone({ freq: 200 + i * 120, type: 'square', dur: 0.3, gain: 0.1, glide: 60, when: i * 0.08 }); }
    sfxPickup() { this.tone({ freq: 660, dur: 0.08, gain: 0.14, type: 'triangle' }); this.tone({ freq: 990, dur: 0.1, gain: 0.12, type: 'triangle', when: 0.08 }); }
    sfxHurt() { this.noise({ dur: 0.2, gain: 0.25, type: 'bandpass', freq: 500, q: 1.5 }); this.tone({ freq: 220, type: 'sawtooth', dur: 0.18, gain: 0.14, glide: 90 }); }
    sfxShield() { this.tone({ freq: 200, type: 'sine', dur: 0.4, gain: 0.16, glide: 900 }); this.tone({ freq: 600, type: 'triangle', dur: 0.4, gain: 0.1, glide: 1400 }); }
    sfxClear() { for (let i = 0; i < 6; i++) this.tone({ freq: 300 + i * 180, type: 'sawtooth', dur: 0.18, gain: 0.1, glide: 1200, when: i * 0.03 }); this.noise({ dur: 0.5, gain: 0.2, type: 'highpass', freq: 1000 }); }
    sfxUpgrade() { const n = [523, 659, 784, 1047]; n.forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.16, gain: 0.12, when: i * 0.07 })); }
    sfxClick() { this.tone({ freq: 880, type: 'square', dur: 0.04, gain: 0.08 }); }
    sfxHover() { this.tone({ freq: 1200, type: 'sine', dur: 0.03, gain: 0.04 }); }
    sfxAchievement() { const n = [784, 988, 1175, 1568]; n.forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.22, gain: 0.12, when: i * 0.09 })); }
    sfxBossRoar() { this.tone({ freq: 80, type: 'sawtooth', dur: 1.2, gain: 0.3, glide: 50 }); this.noise({ dur: 1.2, gain: 0.25, type: 'lowpass', freq: 400, q: 0.7 }); this.tone({ freq: 120, type: 'square', dur: 0.8, gain: 0.16, glide: 60, when: 0.1 }); }
    sfxWarning() { for (let i = 0; i < 4; i++) this.tone({ freq: 880, type: 'square', dur: 0.12, gain: 0.12, when: i * 0.18 }); }

    // ============== BGM 引擎 ==============
    // 每首曲目定义：根音、调式音阶、bass 线、和弦、旋律模板、bpm、音色
    static SCALES = {
      minor: [0, 2, 3, 5, 7, 8, 10],
      major: [0, 2, 4, 5, 7, 9, 11],
      phrygian: [0, 1, 3, 5, 7, 8, 10],
      pentMin: [0, 3, 5, 7, 10],
    };
    static TRACKS = {
      menu:    { root: 55,  scale: 'major',   bpm: 92,  bass: [0, 7, 5, 10], chords: [[0,4,7],[5,9,12],[7,11,14],[10,14,17]], mel: [0,4,7,9,7,4,2,0], wave: 'triangle', tense: false },
      calm:    { root: 49,  scale: 'pentMin',  bpm: 104, bass: [0, 7, 3, 10], chords: [[0,3,7],[7,10,14],[3,7,10],[10,14,17]], mel: [0,3,5,7,10,7,5,3], wave: 'sawtooth', tense: false },
      tense:   { root: 41,  scale: 'minor',    bpm: 138, bass: [0, 7, 3, 8],  chords: [[0,3,7],[8,11,15],[3,7,10],[10,13,17]], mel: [0,3,5,7,3,0,10,7], wave: 'square', tense: true },
      boss:    { root: 33,  scale: 'phrygian', bpm: 150, bass: [0, 1, 0, 1], chords: [[0,3,7],[1,4,8],[0,3,7],[1,4,8]], mel: [0,1,3,1,0,10,8,7], wave: 'sawtooth', tense: true },
      victory: { root: 60,  scale: 'major',    bpm: 120, bass: [0, 7, 9, 12], chords: [[0,4,7],[7,11,14],[9,12,16],[12,16,19]], mel: [0,4,7,12,11,9,7,4], wave: 'triangle', tense: false },
      defeat:  { root: 44,  scale: 'minor',    bpm: 70,  bass: [0, 0, 5, 4],   chords: [[0,3,7],[0,3,7],[5,8,12],[4,7,11]], mel: [0,3,7,3,0,10,8,7], wave: 'sine', tense: false },
    };

    playMusic(id, crossfade = 0.8) {
      if (!this.ctx || !this.enabled || !this.musicOn) return;
      if (this.curTrack === id) return;        // 同曲目不重复启动
      this._stopScheduler();
      if (this.musicGain && this.ctx) this.musicGain.gain.value = 0.42;
      this.curTrack = id;
      this.layer2 = false;
      const tr = AudioEngine.TRACKS[id];
      if (!tr) return;
      this.bpm = tr.bpm;
      this.step = 0;
      this._schedLoop(id, tr);
    }

    // 切换是否叠加紧张层（同一曲目叠加高音节奏层）
    setTenseLayer(on) {
      if (this.layer2 === on) return;
      this.layer2 = on;
    }

    _stopScheduler() {
      if (this.seqTimer) { clearTimeout(this.seqTimer); this.seqTimer = null; }
    }

    stopMusic(fade = 0.6) {
      this._stopScheduler();
      this.curTrack = null;
      if (this.musicGain && this.ctx) {
        const t = this.ctx.currentTime;
        this.musicGain.gain.cancelScheduledValues(t);
        this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, t);
        this.musicGain.gain.linearRampToValueAtTime(0.0001, t + fade);
      }
    }

    // 一个 16 步循环：bass + 和弦垫 + 旋律；trackId 用于校验是否仍在播放该曲
    _schedLoop(trackId, tr) {
      const beat = 60 / this.bpm / 2;          // 八分音符时长
      const scale = AudioEngine.SCALES[tr.scale];
      const noteFreq = (semi) => 440 * Math.pow(2, (tr.root + semi - 69) / 12);

      const tick = () => {
        if (this.curTrack !== trackId) return;  // 曲目已切换/停止则退出循环
        const s = this.step % 16;
        // 低音
        if (s % 4 === 0) {
          const bi = (s / 4) | 0;
          this.tone({ freq: noteFreq(tr.bass[bi % tr.bass.length]), type: 'sine', dur: beat * 3, gain: 0.16, attack: 0.01, dest: this.musicGain });
        }
        // 和弦垫（每 8 步换和弦）
        if (s % 8 === 0) {
          const ci = (s / 8) | 0;
          const ch = tr.chords[ci % tr.chords.length];
          ch.forEach((semi) => this.tone({ freq: noteFreq(semi + 12), type: 'sine', dur: beat * 7, gain: 0.05, attack: 0.06, dest: this.musicGain }));
        }
        // 旋律（偶数步）
        if (s % 2 === 0) {
          const mi = (s / 2) | 0;
          const semi = tr.mel[mi % tr.mel.length];
          const octave = tr.tense ? 12 : 0;
          this.tone({ freq: noteFreq(scale[semi % scale.length] + 24 + octave), type: tr.wave, dur: beat * 1.6, gain: 0.1, dest: this.musicGain });
          if (this.layer2) {
            // 紧张节奏层：短促高音脉冲
            this.tone({ freq: noteFreq(scale[semi % scale.length] + 36), type: 'square', dur: 0.06, gain: 0.06, dest: this.musicGain });
          }
        }
        // 紧张层打击（hi-hat 噪声）
        if (this.layer2 && s % 2 === 1) {
          this.noise({ dur: 0.03, gain: 0.04, type: 'highpass', freq: 6000 });
        }
        this.step++;
        this.seqTimer = setTimeout(tick, beat * 1000);
      };
      tick();
    }
  }

  TG.AudioEngine = AudioEngine;
  TG.audio = new AudioEngine();
})(window.TG = window.TG || {});
