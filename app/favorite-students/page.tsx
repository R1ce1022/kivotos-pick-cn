'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { studentsData, BASE_PATH } from '@/lib/students-data';
import { clearRoster, loadRoster, saveRoster } from '@/lib/roster-storage';
import type { Academy, Character, SlotEntry, StudentSkin } from '@/types/students';
import CaptureBoard, { type Slots } from './CaptureBoard';
import styles from './favorite-students.module.css';

const { academies, students, stats } = studentsData;

/** 学院 id → 该学院角色（已按 DefaultOrder 排序，保持与原站一致的稳定顺序） */
const charactersByAcademy = new Map<string, Character[]>();
for (const a of academies) charactersByAcademy.set(a.id, []);
for (const s of students) charactersByAcademy.get(s.academyId)?.push(s);

/** 皮肤 id → { 皮肤, 角色 }，用于把已保存的选择还原成槽位内容 */
const skinIndex = new Map<string, { skin: StudentSkin; character: Character }>();
for (const c of students) for (const k of c.skins) skinIndex.set(k.id, { skin: k, character: c });

const emptySlots = (): Slots => Object.fromEntries(academies.map((a) => [a.id, null]));

/**
 * 把一个角色 + 所选外观摊平成槽位内容。
 *
 * 槽位只需要「显示什么 + 属于哪个角色」，因此把皮肤 id 当作槽位条目的 id，
 * 同时带上 characterId 供去重（一人只占一格）与本地存储校验使用。
 */
const toSlotEntry = (character: Character, skin: StudentSkin): SlotEntry => ({
  id: skin.id,
  icon: skin.icon,
  name: character.name,
  academyId: character.academyId,
  characterId: character.id,
  skins: character.skins,
});

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
  /**
   * 已点选、正在挑外观的角色。
   * 只有多套外观的角色会停留在这里——单套外观的角色点一下直接入格。
   */
  const [pendingCharacter, setPendingCharacter] = useState<Character | null>(null);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [saveHint, setSaveHint] = useState<string | null>(null);

  /** 是否已从本地存储恢复过（首帧必须是 false，否则 SSR 与水合不一致） */
  const [restored, setRestored] = useState(false);

  const exportRef = useRef<HTMLDivElement>(null);
  const pickerSearchRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number | null>(null);
  /** 本次会话是否已有真实改动；没有就不要往存储里写，以免无谓擦写 */
  const modified = useRef(false);

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

  // ---------- 本地存储：恢复上次的选择 ----------
  // 必须放在 useEffect 里：首帧若直接渲染存储内容，SSR 的空白选择板
  // 与客户端的已选状态不一致，会触发水合报错。
  useEffect(() => {
    const saved = loadRoster(academies, students);
    if (saved) {
      setSlots(saved.slots);
      setTeacher(saved.teacher);
      const count = Object.values(saved.slots).filter(Boolean).length;
      // 记录里的学生若已不在当前数据中会被丢弃，此时提示一下避免用户困惑
      if (count > 0) {
        showToast(
          saved.droppedCount > 0
            ? `已恢复 ${count} 个学院（${saved.droppedCount} 项已失效）`
            : `已恢复上次的选择（${count} 个学院）`
        );
      }
    }
    setRestored(true);
  }, [showToast]);

  // ---------- 本地存储：保存选择 ----------
  useEffect(() => {
    if (!restored) return;
    // 恢复动作本身不应触发写入；只有用户真的改动过才落盘
    if (!modified.current) return;
    saveRoster(teacher, slots);
  }, [restored, teacher, slots]);

  // 关闭/切走页面前补写一次，避免刚选完就关掉时来不及
  useEffect(() => {
    const flush = () => {
      if (modified.current) saveRoster(teacher, slots);
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [teacher, slots]);

  // ---------- 选择逻辑 ----------
  const assign = useCallback((academyId: string, entry: SlotEntry) => {
    modified.current = true;
    setSlots((prev) => {
      // 同一名角色若已在别的学院，先把它从原位置移除（一人只能占一个学院）。
      // 按 characterId 而不是皮肤 id 比较：换皮肤仍算同一名角色。
      const next: Slots = { ...prev };
      for (const key of Object.keys(next)) {
        if (next[key]?.characterId === entry.characterId) next[key] = null;
      }
      next[academyId] = entry;
      return next;
    });
    setPickerAcademy(null);
    setPendingCharacter(null);
  }, []);

  /** 点网格里的角色卡：单套外观直接入格，多套则展开外观条等用户挑 */
  const onCharacterClick = useCallback(
    (academy: Academy, character: Character) => {
      if (character.skins.length <= 1) {
        assign(academy.id, toSlotEntry(character, character.skins[0]));
        return;
      }
      // 再点一次同一张卡 = 收起外观条
      setPendingCharacter((prev) => (prev?.id === character.id ? null : character));
    },
    [assign]
  );

  const clearSlot = useCallback((academyId: string) => {
    modified.current = true;
    setSlots((prev) => ({ ...prev, [academyId]: null }));
  }, []);

  const resetAll = useCallback(() => {
    modified.current = false;
    clearRoster();
    setSlots(emptySlots());
    setTeacher('');
    setQuery('');
    setPendingCharacter(null);
    showToast('已重置全部选择');
  }, [showToast]);

  // ---------- 选择弹窗 ----------
  const openPicker = useCallback((academy: Academy) => {
    setPickerAcademy(academy);
    setQuery('');
    // 打开别的学院时清掉上一轮待挑外观的角色，避免跨学院残留
    setPendingCharacter(null);
  }, []);

  const closePicker = useCallback(() => {
    setPickerAcademy(null);
    setPendingCharacter(null);
  }, []);

  // ---------- 点学院格 → 打开该学院的选人弹窗 ----------
  const onSlotClick = (academyId: string) => {
    const academy = academies.find((a) => a.id === academyId);
    if (academy) openPicker(academy);
  };

  useEffect(() => {
    if (!pickerAcademy) return;
    const onKey = (e: KeyboardEvent) => {
      // 先收起外观条，再关弹窗：符合「一层层退出」的预期
      if (e.key === 'Escape') {
        setPendingCharacter((prev) => {
          if (prev) return null;
          setPickerAcademy(null);
          return null;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    // 刻意不自动聚焦搜索框：多数情况用不到，自动聚焦会唤起移动端键盘挡住列表
    return () => window.removeEventListener('keydown', onKey);
  }, [pickerAcademy]);

  // 弹窗列表：只看本学院，搜索也仅在本学院内进行
  const pickerCharacters = useMemo(() => {
    if (!pickerAcademy) return [];
    const all = charactersByAcademy.get(pickerAcademy.id) ?? [];
    const q = norm(query);
    if (!q) return all;
    return all.filter((s) => norm(s.name).includes(q));
  }, [pickerAcademy, query]);

  /** 当前格子里已选的外观 id（用于高亮） */
  const selectedSkinId = pickerAcademy ? (slots[pickerAcademy.id]?.id ?? null) : null;

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
              onChange={(e) => {
                modified.current = true;
                setTeacher(e.target.value);
              }}
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
                <p>
                  {pendingCharacter
                    ? `选择「${pendingCharacter.name}」要展示的外观`
                    : '选择一名学生放入此格'}
                </p>
              </div>
              <button className={styles.modalClose} onClick={closePicker} aria-label="关闭">
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
                onChange={(e) => {
                  setQuery(e.target.value);
                  // 换搜索词后网格内容变了，收起外观条避免指向已被筛掉的角色
                  setPendingCharacter(null);
                }}
                placeholder="在本学院内搜索名字"
              />
              {query && (
                <button className={styles.clearQuery} onClick={() => setQuery('')} aria-label="清空搜索">
                  ×
                </button>
              )}
            </div>

            <div className={styles.gridModal}>
              {pickerCharacters.map((c) => {
                const isPending = pendingCharacter?.id === c.id;
                const isPlaced = selectedSkinId !== null && c.skins.some((k) => k.id === selectedSkinId);
                return (
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isPending}
                    className={[styles.card, isPending ? styles.cardPending : '', isPlaced ? styles.cardPlaced : '']
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => onCharacterClick(pickerAcademy, c)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onCharacterClick(pickerAcademy, c);
                      }
                    }}
                  >
                    <span className={styles.cardImg}>
                      <img src={c.skins[0].icon} alt="" loading="lazy" draggable={false} />
                    </span>
                    <span className={styles.cardInfo}>
                      <b>{c.name}</b>
                    </span>
                    {c.skins.length > 1 && (
                      <span className={styles.cardSkinBadge} title={`${c.skins.length} 套外观`}>
                        {c.skins.length}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {pendingCharacter && (
              <div className={styles.skinBar} data-skin-bar={pendingCharacter.id}>
                <div className={styles.skinBarHead}>
                  <b>{pendingCharacter.name}</b>
                  <span>{pendingCharacter.skins.length} 套外观 · 点一下放入此格</span>
                </div>
                <div className={styles.skinList}>
                  {pendingCharacter.skins.map((k, i) => (
                    <button
                      key={k.id}
                      type="button"
                      className={`${styles.skinItem} ${k.id === selectedSkinId ? styles.skinItemActive : ''}`}
                      data-skin-id={k.id}
                      aria-label={`外观 ${i + 1}：${k.name}`}
                      onClick={() => assign(pickerAcademy.id, toSlotEntry(pendingCharacter, k))}
                    >
                      <img src={k.icon} alt="" draggable={false} />
                      <span className={styles.skinLabel}>{k.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {pickerCharacters.length === 0 && <p className={styles.empty}>没有匹配的学生</p>}

            <div className={styles.modalFoot}>
              <button
                className={styles.ghostBtn}
                onClick={() => {
                  clearSlot(pickerAcademy.id);
                  closePicker();
                }}
              >
                清空此格
              </button>
              <button className={styles.primaryBtn} onClick={closePicker}>
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
          收录 {stats.total} 名学生（{stats.base} 名可获取学生 + {stats.npc} 名剧情 NPC），可选{' '}
          {stats.skinTotal} 套外观 · 数据生成于 {studentsData.generatedDate}
        </p>
      </footer>
    </main>
  );
}
