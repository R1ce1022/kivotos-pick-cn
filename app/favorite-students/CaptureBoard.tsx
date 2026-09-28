'use client';

import type { Academy, Student } from '@/types/students';
import styles from './favorite-students.module.css';

export type Slots = Record<string, Student | null>;

interface Props {
  academies: Academy[];
  /** 各学院当前选中（live 与 export 传同一份数据，保证出图一致） */
  slots: Slots;
  /** 标题署名，如「小春 老师」 */
  ownerLabel: string;
  selectedCount: number;
  total: number;
  studentCount: number;
  /**
   * live   → 屏幕上可见的那份，槽位可点、可键盘操作
   * export → 固定尺寸的离屏节点，仅用于截图，不参与任何交互
   */
  variant: 'live' | 'export';
  // 以下仅在 variant === 'live' 时传入
  onSlotClick?: (academyId: string) => void;
  onSlotClear?: (academyId: string) => void;
}

/**
 * 选择板。
 *
 * 同一个组件渲染两份：
 *  - 屏幕上一份（variant="live"），跟随设备断点，手机上是 2 列；
 *  - 离屏一份（variant="export"），尺寸被 CSS 锁死，专供截图。
 *
 * 导出那份的版式对齐原站：顶部标题区 → 5 列网格（校徽 + 头像 + 姓名 + 学院）→ 页脚。
 * 每个槽位顶部有一条该学院的强调色横条。
 */
export default function CaptureBoard({
  academies,
  slots,
  ownerLabel,
  selectedCount,
  total,
  studentCount,
  variant,
  onSlotClick,
  onSlotClear,
}: Props) {
  const isLive = variant === 'live';

  /** 单个槽位的内部内容 */
  const renderSlotInner = (a: Academy, picked: Student | null | undefined) =>
    picked ? (
      <>
        <img className={styles.slotFace} src={picked.icon} alt={isLive ? picked.name : ''} draggable={false} />
        <i className={styles.slotAccent} style={{ backgroundColor: a.accent }} aria-hidden="true" />
      </>
    ) : (
      <>
        <img className={styles.slotEmblem} src={a.emblem} alt="" draggable={false} />
        <span className={styles.slotPlaceholder}>未选择</span>
        <div className={styles.slotAcademy}>{a.short}</div>
        <div className={styles.slotPlus}>+</div>
        <i className={styles.slotAccent} style={{ backgroundColor: a.accent }} aria-hidden="true" />
      </>
    );

  // ---------------- 导出模板 ----------------
  if (!isLive) {
    return (
      <div className={`${styles.captureArea} ${styles.captureExport}`}>
        <div className={styles.exportTitle}>
          <span>KIVOTOS PICK</span>
          <h2>
            {ownerLabel}的
            <br />
            学院最爱学生
          </h2>
          <p>只属于你的选择存档</p>
        </div>

        <div className={styles.exportGrid}>
          {academies.map((a) => {
            const picked = slots[a.id];
            return (
              <div key={a.id} className={styles.exportItem} data-export-slot={a.id}>
                <div className={styles.exportLogo}>
                  <img src={a.emblem} alt="" draggable={false} />
                </div>
                <div className={styles.exportSlot} data-slot={a.id}>
                  {picked ? (
                    <>
                      <img src={picked.icon} alt="" draggable={false} />
                      <i className={styles.slotAccent} style={{ backgroundColor: a.accent }} aria-hidden="true" />
                    </>
                  ) : (
                    <>
                      <span>未选择</span>
                      <i className={styles.slotAccent} style={{ backgroundColor: a.accent }} aria-hidden="true" />
                    </>
                  )}
                </div>
                <b className={styles.exportStudentName}>{picked ? picked.name : '未选择'}</b>
                <small>{a.short}</small>
              </div>
            );
          })}
        </div>

        <div className={styles.exportFooter}>
          <span>KIVOTOS PICK</span>
          <span>我的基辅托斯选择表</span>
        </div>
      </div>
    );
  }

  // ---------------- 屏幕版 ----------------
  return (
    <div className={styles.captureArea}>
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
          const slotClass = [styles.slot, picked ? styles.slotFilled : styles.slotEmpty]
            .filter(Boolean)
            .join(' ');

          return (
            <div key={a.id} className={styles.slotWrap}>
              <button
                type="button"
                className={slotClass}
                data-slot={a.id}
                data-live-slot={a.id}
                aria-pressed={!!picked}
                aria-label={picked ? `${a.name}，已选${picked.name}` : `${a.name}，未选择`}
                onClick={() => onSlotClick?.(a.id)}
              >
                <div className={styles.slotIndex}>{String(i + 1).padStart(2, '0')}</div>
                {renderSlotInner(a, picked)}
              </button>
              {picked && (
                <button
                  type="button"
                  className={styles.slotClear}
                  aria-label={`清空${a.short}的选择`}
                  onClick={() => onSlotClear?.(a.id)}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.captureFoot}>
        共 {studentCount} 名学生 · 非官方同人镜像 · 素材版权归 Nexon 所有
      </div>
    </div>
  );
}
