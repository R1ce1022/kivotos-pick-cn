'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { studentsData, BASE_PATH } from '@/lib/students-data';
import type { Academy, Student } from '@/types/students';
import CaptureBoard, { type Slots } from './CaptureBoard';
import styles from './favorite-students.module.css';

const { academies, students, stats } = studentsData;

/** 学院 id → 该学院学生（已按 id 排序，保持与原站一致的稳定顺序） */
const studentsByAcademy = new Map<string, Student[]>();
for (const a of academies) studentsByAcademy.set(a.id, []);
for (const s of students) studentsByAcademy.get(s.academyId)?.push(s);

const emptySlots = (): Slots => Object.fromEntries(academies.map((a) => [a.id, null]));

/**
 * 归一化搜索：只支持中文，因此仅消除全/半角括号与星号差异，
 * 让「白子(恐怖)」也能匹配到「白子＊恐怖」。
 */
const norm = (v: string) => v.replace(/[()（）*＊]/g, '').trim();

/**
 * 是否具备悬停能力（桌面）。
 * 仅在导出流程内惰性求值——放到模块顶层会在 SSR 时得到 false、
 * 客户端得到 true，造成水合不一致。
 */
const hasHover = () =>
  typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/** 把一张图片转成自包含的 data URL（不依赖任何路径解析） */
const toDataUrl = (src: string): Promise<string> =>
  fetch(src, { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
    .then(
      (blob) =>
        new Promise<string>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result));
          fr.onerror = () => reject(new Error('read failed'));
          fr.readAsDataURL(blob);
        })
    );

/**
 * dataURL → Blob（供 Web Share API 使用）。
 *
 * 不要用 fetch(dataUrl)：Chrome 对 2MB 级的 base64 data URL 走网络栈会严重退化
 * （实测单次耗时 30 秒）。直接做 base64 解码是毫秒级的。
 */
const dataUrlToBlob = (dataUrl: string): Blob => {
  const comma = dataUrl.indexOf(',');
  const meta = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  const mime = /:(.*?)[;,]/.exec(meta)?.[1] ?? 'application/octet-stream';
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

export default function FavoriteStudentsPage() {
  const [slots, setSlots] = useState<Slots>(emptySlots);
  const [teacher, setTeacher] = useState('');
  const [query, setQuery] = useState('');
  const [pickerAcademy, setPickerAcademy] = useState<Academy | null>(null);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [saveHint, setSaveHint] = useState<string | null>(null);

  const exportRef = useRef<HTMLDivElement>(null);
  const pickerSearchRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number | null>(null);

  const selectedCount = useMemo(() => Object.values(slots).filter(Boolean).length, [slots]);
  const total = academies.length;

  // 导出标题的署名：已填名字 →「XX 老师」，未填 →「老师」。
  // 若名字本身已以「老师」结尾（如用户填「王老师」），不再重复追加。
  const trimmedName = teacher.trim();
  const ownerLabel = !trimmedName
    ? '老师'
    : /老师$/.test(trimmedName)
      ? trimmedName
      : `${trimmedName} 老师`;

  /** 必须填了名字才允许导出（纯空白不算） */
  const hasName = trimmedName.length > 0;

  // 卸载时清掉未触发的提示定时器，避免对已卸载组件 setState
  useEffect(
    () => () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    },
    []
  );

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = window.setTimeout(() => {
      setToast((t) => (t === msg ? null : t));
      toastTimer.current = null;
    }, 2200);
  }, []);

  // ---------- 选择逻辑 ----------
  const assign = useCallback((academyId: string, student: Student) => {
    setSlots((prev) => {
      // 同一名学生若已在别的学院，先把它从原位置移除（一人只能占一个学院）
      const next: Slots = { ...prev };
      for (const key of Object.keys(next)) {
        if (next[key]?.id === student.id) next[key] = null;
      }
      next[academyId] = student;
      return next;
    });
    setPickerAcademy(null);
  }, []);

  const clearSlot = useCallback((academyId: string) => {
    setSlots((prev) => ({ ...prev, [academyId]: null }));
  }, []);

  const resetAll = useCallback(() => {
    setSlots(emptySlots());
    setTeacher('');
    setQuery('');
    showToast('已重置全部选择');
  }, [showToast]);

  // ---------- 选择弹窗 ----------
  const openPicker = useCallback((academy: Academy) => {
    setPickerAcademy(academy);
    setQuery('');
  }, []);

  // ---------- 点学院格 → 打开该学院的选人弹窗 ----------
  const onSlotClick = (academyId: string) => {
    const academy = academies.find((a) => a.id === academyId);
    if (academy) openPicker(academy);
  };

  useEffect(() => {
    if (!pickerAcademy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickerAcademy(null);
    };
    window.addEventListener('keydown', onKey);
    // 刻意不自动聚焦搜索框：多数情况用不到，自动聚焦会唤起移动端键盘挡住列表
    return () => window.removeEventListener('keydown', onKey);
  }, [pickerAcademy]);

  // 弹窗列表：只看本学院，搜索也仅在本学院内进行
  const pickerStudents = useMemo(() => {
    if (!pickerAcademy) return [];
    const all = studentsByAcademy.get(pickerAcademy.id) ?? [];
    const q = norm(query);
    if (!q) return all;
    return all.filter((s) => norm(s.name).includes(q));
  }, [pickerAcademy, query]);

  // ---------- 导出图片 ----------
  /**
   * 生成图片并尽力触发保存。
   *
   * 截图目标是**离屏的固定尺寸节点**（exportRef），不是屏幕上那份，
   * 因此同一份选择在手机与电脑上导出的图片完全一致。
   */
  const exportImage = useCallback(async () => {
    const node = exportRef.current;
    if (!node) return;
    setExporting(true);
    setSaveHint(null);
    showToast('正在生成图片…');

    // 导出会踩两个坑，这里一并规避：
    //
    // 1) html-to-image 读的是克隆节点的 img.src，而克隆节点处于游离文档中。
    //    部署在 GitHub Pages 子路径（/kivotos-pick-cn/）时，解析这类路径会丢掉
    //    前缀，于是去请求 https://<用户>.github.io/assets/... 拿到 404 而卡死。
    //    → 导出前把图片内联成 data URL，自包含、不涉及任何路径解析。
    //
    // 2) 直接把绝对 URL 写回 DOM 会与 React 的渲染相互覆盖。
    //    → 因此只替换 html-to-image 内部发起请求的地址，不改动节点 src。
    const imgs = Array.from(node.querySelectorAll('img'));
    const originals = imgs.map((img) => img.getAttribute('src'));
    const nativeFetch = window.fetch;

    // 兜底：凡是指向本站 /assets/ 的相对地址，一律补全为绝对地址
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      try {
        const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (typeof raw === 'string' && raw.startsWith('/')) {
          return nativeFetch(new URL(raw, window.location.origin).href, init);
        }
      } catch {
        /* 落回原始行为 */
      }
      return nativeFetch(input as RequestInfo, init);
    }) as typeof fetch;

    try {
      // 内联图片（原图已加载，通常直接命中缓存）
      const dataUrls = await Promise.all(
        originals.map((src) => (src ? toDataUrl(src).catch(() => null) : Promise.resolve(null)))
      );
      imgs.forEach((img, i) => {
        if (dataUrls[i]) img.setAttribute('src', dataUrls[i] as string);
      });

      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        cacheBust: false,
        // 与原站导出一致：浅色底（节点本身已有背景，这里作为兜底）
        backgroundColor: '#f7fbfd',
        width: node.offsetWidth,
        height: node.offsetHeight,
      });

      const stamp = new Date().toISOString().slice(0, 10);
      const safeName = trimmedName ? `-${trimmedName.replace(/[\\/:*?"<>|]/g, '')}` : '';
      const filename = `学院最爱学生-${stamp}${safeName}.png`;

      // 保存链路：先试系统分享（移动端体验最好），否则走下载。
      // link.click() 是「发出即忘」，无法回传是否被拦截，因此下载不再往下兜底；
      // 若用户反馈没保存成功，saveHint 会提示可用新标签打开。
      // 保存链路：优先系统分享（移动端体验最好），否则走下载。
      //
      // 分享必须限时：部分桌面浏览器 canShare 返回 true，但 share() 会静默挂起
      // （实测 Chrome/Windows 挂满 30 秒才落回），用户会以为卡死。
      // 因此超时就放弃分享、直接下载；同时把可能仍在挂起的 promise 吞掉，
      // 避免它稍后 reject 变成未处理拒绝。
      if (hasHover()) {
        setSaveHint('若未自动保存，可右键图片另存为。');
      }
      let sharePending: Promise<void> | null = null;
      try {
        const blob = dataUrlToBlob(dataUrl);
        const file = new File([blob], filename, { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) {
          const sharePromise = navigator
            .share({ files: [file], title: '学院最爱学生' })
            .then(() => undefined);
          sharePromise.catch(() => undefined);
          const raced = await Promise.race([
            sharePromise,
            new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), 1200)),
          ]);
          if (raced !== 'timeout') {
            showToast('已调起分享');
            return;
          }
          sharePending = sharePromise;
        }
      } catch {
        // 不支持或用户取消：落到下载
      }

      const link = document.createElement('a');
      link.download = filename;
      link.href = dataUrl;
      link.rel = 'noopener';
      link.click();

      // 触屏浏览器可能忽略 download 属性，补一个可在新标签打开的入口
      if (!hasHover()) {
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(
            `<title>${filename}</title><body style="margin:0;background:#f7fbfd;display:grid;place-items:center;min-height:100vh"><img src="${dataUrl}" style="max-width:100%" alt="学院最爱学生"></body>`
          );
          win.document.close();
          setSaveHint('若未自动保存，可在此新标签内长按图片保存。');
        }
      }

      showToast('图片已保存');
      if (sharePending) sharePending.catch(() => undefined);
    } catch {
      showToast('生成图片失败，请重试');
    } finally {
      imgs.forEach((img, i) => {
        if (originals[i] != null) img.setAttribute('src', originals[i] as string);
      });
      window.fetch = nativeFetch;
      setExporting(false);
    }
  }, [showToast, trimmedName]);

  const boardProps = {
    academies,
    slots,
    ownerLabel,
    selectedCount,
    total,
    studentCount: students.length,
  };

  return (
    <main className={styles.page}>
      {/* ============ 顶栏 ============ */}
      <header className={styles.topbar}>
        <a className={styles.back} href={`${BASE_PATH}/`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          返回首页
        </a>
        <div className={styles.brand}>
          <span className={styles.brandMark}>基辅托斯</span>
          <span className={styles.brandText}>选择器</span>
        </div>
        {/* 必须填了名字才允许保存；未填时用一个小气泡说明原因 */}
        <span className={styles.saveWrap} data-busy={exporting ? '' : undefined}>
          <button
            className={styles.saveBtn}
            onClick={exportImage}
            disabled={exporting || !hasName}
            aria-describedby={!hasName ? 'save-name-hint' : undefined}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {exporting ? '生成中…' : '保存图片'}
          </button>
          {!hasName && (
            <span id="save-name-hint" role="tooltip" className={styles.saveTip}>
              先填写老师名字
            </span>
          )}
        </span>
      </header>

      {/* ============ 说明 + 进度 ============ */}
      <section className={styles.mission}>
        <h1 className={styles.missionTitle}>
          每个学院挑出
          <br />
          你最爱的那一名
        </h1>
        <p className={styles.missionHint}>点击学院格，从该学院里挑一名你最喜欢的学生。</p>

        <div className={styles.missionBar}>
          <label className={styles.teacherField}>
            <span>老师名字</span>
            <input
              value={teacher}
              onChange={(e) => setTeacher(e.target.value)}
              placeholder="写下你的名字"
              maxLength={24}
            />
          </label>
          <div className={styles.progress}>
            <b>{selectedCount}</b>
            <span>/{total} 已选择</span>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${(selectedCount / total) * 100}%` }} />
            </div>
          </div>
          <div className={styles.missionActions}>
            <button className={styles.ghostBtn} onClick={resetAll} disabled={selectedCount === 0 && !trimmedName}>
              重置
            </button>
          </div>
        </div>
      </section>

      {/* ============ 屏幕上的选择板（跟随设备自适应） ============ */}
      <CaptureBoard
        {...boardProps}
        variant="live"
        onSlotClick={onSlotClick}
        onSlotClear={clearSlot}
      />

      {/* ============ 离屏导出节点（固定版式，仅用于截图） ============ */}
      <div className={styles.exportStage} data-export-stage aria-hidden="true">
        <div ref={exportRef}>
          <CaptureBoard {...boardProps} variant="export" />
        </div>
      </div>

      {/* ============ 学院选择弹窗 ============ */}
      {pickerAcademy && (
        <div className={styles.modalMask} onClick={() => setPickerAcademy(null)}>
          <div
            className={styles.modal}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`选择${pickerAcademy.name}的学生`}
          >
            <div className={styles.modalHead}>
              <img src={pickerAcademy.emblem} alt="" />
              <div>
                <h3>{pickerAcademy.name}</h3>
                <p>选择一名学生放入此格</p>
              </div>
              <button className={styles.modalClose} onClick={() => setPickerAcademy(null)} aria-label="关闭">
                ×
              </button>
            </div>

            <div className={styles.searchBox}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                ref={pickerSearchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="在本学院内搜索名字"
              />
              {query && (
                <button className={styles.clearQuery} onClick={() => setQuery('')} aria-label="清空搜索">
                  ×
                </button>
              )}
            </div>

            <div className={styles.gridModal}>
              {pickerStudents.map((s) => (
                <div
                  key={s.id}
                  className={`${styles.card} ${slots[pickerAcademy.id]?.id === s.id ? styles.cardPending : ''}`}
                  onClick={() => assign(pickerAcademy.id, s)}
                >
                  <span className={styles.cardImg}>
                    <img src={s.icon} alt="" loading="lazy" draggable={false} />
                  </span>
                  <span className={styles.cardInfo}>
                    <b>{s.name}</b>
                  </span>
                </div>
              ))}
            </div>

            {pickerStudents.length === 0 && <p className={styles.empty}>没有匹配的学生</p>}

            <div className={styles.modalFoot}>
              <button
                className={styles.ghostBtn}
                onClick={() => {
                  clearSlot(pickerAcademy.id);
                  setPickerAcademy(null);
                }}
              >
                清空此格
              </button>
              <button className={styles.primaryBtn} onClick={() => setPickerAcademy(null)}>
                完成
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
      {saveHint && <div className={styles.saveHint}>{saveHint}</div>}

      <footer className={styles.siteFoot}>
        <p>
          本页是
          <a href="https://blue-archive-pick.vercel.app/favorite-students" target="_blank" rel="noreferrer">
            blue-archive-pick.vercel.app
          </a>
          的简体中文复刻（非官方同人作品），与原站及 Nexon /《蔚蓝档案》官方均无关。
        </p>
        <p>
          学生资料取自
          <a href="https://schaledb.com" target="_blank" rel="noreferrer">
            SchaleDB
          </a>
          ，头像与角色版权归 Nexon 所有。
        </p>
        <p className={styles.statLine}>
          收录 {stats.total} 名学生（{stats.base} 名可获取学生 + {stats.npc} 名剧情 NPC）· 数据生成于{' '}
          {new Date(studentsData.generatedAt).toLocaleDateString('zh-CN')}
        </p>
      </footer>
    </main>
  );
}
