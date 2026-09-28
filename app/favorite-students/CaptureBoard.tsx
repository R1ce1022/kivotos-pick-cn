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
   * live   → 屏幕上可见的那份，槽位可点、可拖、可键盘操作
   * export → 固定 1200px 宽的离屏节点，仅用于截图，不参与任何交互
   */
  variant: 'live' | 'export';
  // 以下仅在 variant === 'live' 时传入
  pendingActive?: boolean;
  dragOverAcademy?: string | null;
  onSlotClick?: (academyId: string) => void;
  onSlotClear?: (academyId: string) => void;
  onSlotDrop?: (e: React.DragEvent, academyId: string) => void;
  onSlotDragOver?: (e: React.DragEvent, academyId: string) => void;
  onSlotDragLeave?: (academyId: string) => void;
}

/**
 * 导出捕获区。
 *
 * 同一个组件渲染两份：
 *  - 屏幕上一份（variant="live"），跟随设备断点，手机上是 2 列；
 *  - 离屏一份（variant="export"），尺寸被 CSS 锁死为桌面版式。
 *
 * 这样同一份选择在手机与电脑上导出的图片完全一致，
 * 而屏幕上的观感仍按设备自适应。
 */
export default function CaptureBoard({
  academies,
  slots,
  ownerLabel,
  selectedCount,
  total,
  studentCount,
  variant,
  pendingActive = false,
  dragOverAcademy = null,
  onSlotClick,
  onSlotClear,
  onSlotDrop,
  onSlotDragOver,
  onSlotDragLeave,
}: Props) {
  const isLive = variant === 'live';

  return (
    <div className={isLive ? styles.captureArea : `${styles.captureArea} ${styles.captureExport}`}>
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

      <div className={isLive ? styles.board : `${styles.board} ${styles.boardExport}`}>
        {academies.map((a, i) => {
          const picked = slots[a.id];
          const isOver = dragOverAcademy === a.id;
          const slotClass = [
            styles.slot,
            !isLive ? styles.slotExport : '',
            picked ? styles.slotFilled : '',
            isOver ? styles.slotOver : '',
            isLive && pendingActive ? styles.slotArmed : '',
          ]
            .filter(Boolean)
            .join(' ');

          const inner = picked ? (
            <>
              <img className={styles.slotFace} src={picked.icon} alt={isLive ? picked.name : ''} draggable={false} />
              <div className={styles.slotName}>{picked.name}</div>
              <div className={styles.slotAcademy}>{a.short}</div>
            </>
          ) : (
            <>
              <img className={styles.slotEmblem} src={a.emblem} alt="" draggable={false} />
              <div className={styles.slotPlaceholder}>未选择</div>
              <div className={styles.slotAcademy}>{a.short}</div>
              <div className={styles.slotPlus}>+</div>
            </>
          );

          const index = <div className={styles.slotIndex}>{String(i + 1).padStart(2, '0')}</div>;

          // 导出节点用普通 div：不进入 tab 顺序，避免键盘聚焦到屏幕外元素
          if (!isLive) {
            return (
              <div key={a.id} className={styles.slotWrap}>
                <div className={slotClass} data-slot={a.id} data-export-slot={a.id}>
                  {index}
                  {inner}
                </div>
              </div>
            );
          }

          // 清除按钮与槽位是并列关系而非嵌套——避免「按钮里套按钮」的非法结构
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
                onDragOver={(e) => onSlotDragOver?.(e, a.id)}
                onDragLeave={() => onSlotDragLeave?.(a.id)}
                onDrop={(e) => onSlotDrop?.(e, a.id)}
              >
                {index}
                {inner}
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
