import Link from 'next/link';
import { studentsData } from '@/lib/students-data';
import styles from './page.module.css';

const MODES = [
  {
    href: '/favorite-students/',
    label: 'FAVORITE STUDENT',
    title: '按学院选最爱学生',
    desc: '从 15 个学院里各挑一名最喜欢的学生，填满选择板后一键保存成图片。',
    available: true,
  },
  {
    href: '/top-nine/',
    label: 'TOP NINE',
    title: '我的最爱 TOP 9',
    desc: '从全部学生中选出前九名，生成一张九宫格排名图。',
    available: false,
  },
  {
    href: '/bingo/',
    label: 'BINGO',
    title: '学生宾果',
    desc: '随机抽选学生组成宾果卡，看看你能连成几条线。',
    available: false,
  },
];

export default function HomePage() {
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <span className={styles.kicker}>KIVOTOS PICK</span>
        <h1>
          基辅托斯
          <em>选择器</em>
        </h1>
        <p>
          简体中文镜像版 · 收录 {studentsData.stats.total} 名学生 · 纯静态、无需登录
        </p>
      </header>

      <section className={styles.grid}>
        {MODES.map((m) =>
          m.available ? (
            <Link key={m.href} href={m.href} className={styles.card}>
              <span className={styles.cardLabel}>{m.label}</span>
              <h2>{m.title}</h2>
              <p>{m.desc}</p>
              <span className={styles.go}>开始 →</span>
            </Link>
          ) : (
            <div key={m.href} className={`${styles.card} ${styles.cardSoon}`}>
              <span className={styles.cardLabel}>{m.label}</span>
              <h2>{m.title}</h2>
              <p>{m.desc}</p>
              <span className={styles.soon}>待开发</span>
            </div>
          )
        )}
      </section>

      <footer className={styles.foot}>
        非官方同人作品，与 Nexon /《蔚蓝档案》官方无关。学生资料取自{' '}
        <a href="https://schaledb.com" target="_blank" rel="noreferrer">
          SchaleDB
        </a>
        ，角色版权归 Nexon 所有。
      </footer>
    </main>
  );
}
