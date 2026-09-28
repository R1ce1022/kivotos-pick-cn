'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { studentsData, BASE_PATH } from '@/lib/students-data';
import type { Academy, Student } from '@/types/students';
import styles from './favorite-students.module.css';

const { academies, students, stats } = studentsData;

/** 学院 id → 该学院学生（已按 id 排序，保持与原站一致的稳定顺序） */
const studentsByAcademy = new Map<string, Student[]>();
for (const a of academies) studentsByAcademy.set(a.id, []);
for (const s of students) studentsByAcademy.get(s.academyId)?.push(s);

type Slots = Record<string, Student | null>;

const emptySlots = (): Slots => Object.fromEntries(academies.map((a) => [a.id, null]));

/** 归一化搜索：忽略大小写、空白、中英文括号差异 */
const norm = (v: string) => v.toLowerCase().replace(/[\s()（）·・]/g, '');

export default function FavoriteStudentsPage() {
  const [slots, setSlots] = useState<Slots>(emptySlots);
  const [teacher, setTeacher] = useState('');
  const [tab, setTab] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [pickerAcademy, setPickerAcademy] = useState<Academy | null>(null);
  const [pendingStudent, setPendingStudent] = useState<Student | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverAcademy, setDragOverAcademy] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const captureRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

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

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2200);
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
    setPendingStudent(null);
    setPickerAcademy(null);
  }, []);

  const clearSlot = useCallback((academyId: string) => {
    setSlots((prev) => ({ ...prev, [academyId]: null }));
  }, []);

  const resetAll = useCallback(() => {
    setSlots(emptySlots());
    setTeacher('');
    setPendingStudent(null);
    showToast('已重置全部选择');
  }, [showToast]);

  // ---------- 拖拽（桌面） ----------
  // 说明：不完全依赖 dataTransfer（部分环境/自动化下取不到值），
  // 用 draggingId 作为兜底，两条路径都能完成投放。
  const onCardDragStart = (e: React.DragEvent, student: Student) => {
    e.dataTransfer.setData('text/plain', student.id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(student.id);
  };

  const onCardDragEnd = () => {
    setDraggingId(null);
    setDragOverAcademy(null);
  };

  const onSlotDrop = (e: React.DragEvent, academyId: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || draggingId || '';
    const student = students.find((s) => s.id === id);
    if (student) assign(academyId, student);
    setDraggingId(null);
    setDragOverAcademy(null);
  };

  // ---------- 移动端：先点学生、再点学院格 ----------
  const onCardClick = (student: Student) => {
    if (pendingStudent?.id === student.id) {
      setPendingStudent(null);
      return;
    }
    setPendingStudent(student);
    if (window.matchMedia('(hover: none)').matches) {
      showToast(`已选中「${student.name}」，再点学院格放入`);
    }
  };

  const onSlotClick = (academyId: string) => {
    if (pendingStudent) {
      assign(academyId, pendingStudent);
      return;
    }
    const academy = academies.find((a) => a.id === academyId);
    if (academy) openPicker(academy);
  };

  // ---------- 选择弹窗 ----------
  const openPicker = useCallback((academy: Academy) => {
    setPickerAcademy(academy);
    setQuery('');
    setTab(academy.id);
  }, []);

  useEffect(() => {
    if (!pickerAcademy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickerAcademy(null);
    };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => searchRef.current?.focus(), 60);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
  }, [pickerAcademy]);

  // 底部列表：有关键词时跨学院全局搜索；无关键词时按学院标签筛选。
  // （若两者叠加，用户在「三一」标签下搜「白子」会得到空结果，极易困惑）
  const listedStudents = useMemo(() => {
    const q = norm(query);
    return students.filter((s) => {
      if (q) {
        if (norm(s.name).includes(q)) return true;
        return s.aliases.some((a) => norm(a).includes(q));
      }
      return tab === 'all' || s.academyId === tab;
    });
  }, [tab, query]);

  // 弹窗列表：优先只显示本学院，搜索时跨学院
  const pickerStudents = useMemo(() => {
    const q = norm(query);
    if (q) {
      return students.filter((s) => norm(s.name).includes(q) || s.aliases.some((a) => norm(a).includes(q)));
    }
    if (tab === 'all') return students;
    return studentsByAcademy.get(tab) ?? [];
  }, [tab, query]);

  // ---------- 导出图片 ----------
  const exportImage = useCallback(async () => {
    const node = captureRef.current;
    if (!node) return;
    setExporting(true);
    showToast('正在生成图片…');

    // html-to-image 会读取克隆节点的 img.src，而克隆节点处于游离文档中，
    // 解析 /kivotos-pick-cn/assets/... 这类「根相对路径」时会丢掉部署前缀
    // （GitHub Pages 项目页部署在子路径下，会因此取图 404 而卡死）。
    // 这里导出前临时换成完全绝对 URL，导出后立即还原。
    const imgs = Array.from(node.querySelectorAll('img'));
    const originals = imgs.map((img) => img.getAttribute('src'));
    try {
      for (const img of imgs) {
        const abs = new URL(img.getAttribute('src') ?? img.src, window.location.href).href;
        img.setAttribute('src', abs);
      }
      if (imgs.length) {
        await Promise.all(
          imgs.map((img) =>
            img.complete
              ? Promise.resolve()
              : new Promise<void>((res) => {
                  img.onload = () => res();
                  img.onerror = () => res();
                })
          )
        );
      }

      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        cacheBust: false,
        backgroundColor: '#0b1220',
        width: node.offsetWidth,
        height: node.offsetHeight,
      });
      const link = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      const safeName = teacher.trim() ? `-${teacher.trim().replace(/[\\/:*?"<>|]/g, '')}` : '';
      link.download = `学院最爱学生-${stamp}${safeName}.png`;
      link.href = dataUrl;
      link.click();
      showToast('图片已保存');
    } catch {
      showToast('生成图片失败，请重试');
    } finally {
      // 无论成功失败都要还原，否则会破坏页面的相对路径与缓存
      imgs.forEach((img, i) => {
        if (originals[i] != null) img.setAttribute('src', originals[i] as string);
      });
      setExporting(false);
    }
  }, [showToast, teacher]);

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
        <button className={styles.saveBtn} onClick={exportImage} disabled={exporting}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {exporting ? '生成中…' : '保存图片'}
        </button>
      </header>

      {/* ============ 任务说明 + 进度 ============ */}
      <section className={styles.mission}>
        <div className={styles.missionLabel}>任务 01</div>
        <h1 className={styles.missionTitle}>
          每个学院挑出
          <br />
          你最爱的那一名
        </h1>
        <p className={styles.missionHint}>
          桌面端可以把学生卡直接拖到学院格里；手机上先点学生，再点想要放入的学院格即可。
        </p>

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
            <button className={styles.ghostBtn} onClick={resetAll} disabled={selectedCount === 0 && !teacher}>
              重置
            </button>
          </div>
        </div>
      </section>

      {/* ============ 导出捕获区 ============ */}
      <div ref={captureRef} className={styles.captureArea}>
        <div className={styles.captureHead}>
          <div className={styles.captureTitle}>
            <span className={styles.captureKicker}>KIVOTOS PICK</span>
            <h2>
              {ownerLabel}的
              <em>学院最爱学生</em>
            </h2>
          </div>
          <div className={styles.captureCount}>
            {selectedCount}/{total}
          </div>
        </div>

        <div className={styles.board}>
          {academies.map((a, i) => {
            const picked = slots[a.id];
            const isOver = dragOverAcademy === a.id;
            return (
              <div
                key={a.id}
                className={[
                  styles.slot,
                  picked ? styles.slotFilled : '',
                  isOver ? styles.slotOver : '',
                  pendingStudent ? styles.slotArmed : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                data-slot={a.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDragOverAcademy(a.id);
                }}
                onDragLeave={() => setDragOverAcademy((cur) => (cur === a.id ? null : cur))}
                onDrop={(e) => onSlotDrop(e, a.id)}
                onClick={() => onSlotClick(a.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSlotClick(a.id);
                  }
                }}
              >
                <div className={styles.slotIndex}>{String(i + 1).padStart(2, '0')}</div>

                {picked ? (
                  <>
                    <img className={styles.slotFace} src={picked.icon} alt={picked.name} draggable={false} />
                    <div className={styles.slotName}>{picked.name}</div>
                    <div className={styles.slotAcademy}>{a.short}</div>
                    <button
                      className={styles.slotClear}
                      aria-label={`清空${a.short}的选择`}
                      onClick={(e) => {
                        e.stopPropagation();
                        clearSlot(a.id);
                      }}
                    >
                      ×
                    </button>
                  </>
                ) : (
                  <>
                    <img className={styles.slotEmblem} src={a.emblem} alt="" draggable={false} />
                    <div className={styles.slotPlaceholder}>未选择</div>
                    <div className={styles.slotAcademy}>{a.short}</div>
                    <div className={styles.slotPlus}>+</div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className={styles.captureFoot}>
          共 {students.length} 名学生 · 非官方同人镜像 · 素材版权归 Nexon 所有
        </div>
      </div>

      {/* ============ 学生总列表 ============ */}
      <section className={styles.roster}>
        <div className={styles.rosterHead}>
          <div className={styles.stepBadge}>02</div>
          <h2 className={styles.rosterTitle}>学生名单</h2>
          <span className={styles.rosterCount}>{students.length} 名</span>
        </div>

        <div className={styles.rosterTools}>
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${tab === 'all' ? styles.tabActive : ''}`}
              onClick={() => setTab('all')}
            >
              全部
            </button>
            {academies.map((a) => (
              <button
                key={a.id}
                className={`${styles.tab} ${tab === a.id ? styles.tabActive : ''}`}
                onClick={() => setTab(a.id)}
              >
                {a.short}
                <i>{a.count}</i>
              </button>
            ))}
          </div>

          <div className={styles.searchBox}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索学生名 / 韩文名"
            />
            {query && (
              <button className={styles.clearQuery} onClick={() => setQuery('')} aria-label="清空搜索">
                ×
              </button>
            )}
          </div>
        </div>

        {pendingStudent && (
          <div className={styles.pendingBar}>
            <img src={pendingStudent.icon} alt="" />
            <span>
              已选中「<b>{pendingStudent.name}</b>」——点上方任意学院格放入
            </span>
            <button onClick={() => setPendingStudent(null)}>取消</button>
          </div>
        )}

        {query && (
          <p className={styles.resultHint}>
            搜索「<b>{query}</b>」· 已跨全部学院 · 命中 {listedStudents.length} 名
            <button onClick={() => setQuery('')}>清除搜索</button>
          </p>
        )}

        <div className={styles.grid}>
          {listedStudents.map((s) => {
            const isPending = pendingStudent?.id === s.id;
            const placedIn = Object.entries(slots).find(([, v]) => v?.id === s.id)?.[0];
            return (
              <div
                key={s.id}
                data-student-id={s.id}
                className={[
                  styles.card,
                  draggingId === s.id ? styles.cardDragging : '',
                  isPending ? styles.cardPending : '',
                  placedIn ? styles.cardPlaced : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                draggable
                onDragStart={(e) => onCardDragStart(e, s)}
                onDragEnd={onCardDragEnd}
                onClick={() => onCardClick(s)}
                title={`${s.name}${s.aliases.length ? `（${s.aliases[0]}）` : ''}`}
              >
                <span className={styles.cardImg}>
                  <img src={s.icon} alt="" loading="lazy" draggable={false} />
                </span>
                <span className={styles.cardInfo}>
                  <b>{s.name}</b>
                  <small>{academies.find((a) => a.id === s.academyId)?.short}</small>
                </span>
                {placedIn && <span className={styles.cardCheck}>✓</span>}
              </div>
            );
          })}
        </div>

        {listedStudents.length === 0 && (
          <p className={styles.empty}>没有匹配「{query}」的学生</p>
        )}
      </section>

      {/* ============ 学院选择弹窗 ============ */}
      {pickerAcademy && (
        <div className={styles.modalMask} onClick={() => setPickerAcademy(null)}>
          <div
            ref={pickerRef}
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
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="输入名字搜索（留空则按学院显示）"
              />
              {query && (
                <button className={styles.clearQuery} onClick={() => setQuery('')} aria-label="清空搜索">
                  ×
                </button>
              )}
            </div>

            {!query && (
              <div className={styles.modalTabs}>
                <button
                  className={`${styles.tab} ${tab === 'all' ? styles.tabActive : ''}`}
                  onClick={() => setTab('all')}
                >
                  全部
                </button>
                {academies.map((a) => (
                  <button
                    key={a.id}
                    className={`${styles.tab} ${tab === a.id ? styles.tabActive : ''}`}
                    onClick={() => setTab(a.id)}
                  >
                    {a.short}
                  </button>
                ))}
              </div>
            )}

            <div className={`${styles.grid} ${styles.gridModal}`}>
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
                    <small>{academies.find((a) => a.id === s.academyId)?.short}</small>
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

      <footer className={styles.siteFoot}>
        <p>
          非官方同人作品，与 Nexon /《蔚蓝档案》官方无关。学生资料取自{' '}
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
