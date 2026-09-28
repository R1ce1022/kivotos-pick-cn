/** 查看推送结果与 Actions 工作流运行状态 */
import { netFetch } from '../scripts/net.mjs';

const repo = 'R1ce1022/kivotos-pick-cn';
const headers = { 'User-Agent': 'dsh-agent', Accept: 'application/vnd.github+json' };

const api = async (p) => {
  const res = await netFetch(`https://api.github.com${p}`, { headers });
  return { status: res.status, data: res.ok ? await res.json() : await res.text() };
};

// 仓库信息
const r = await api(`/repos/${repo}`);
if (r.status === 200) {
  console.log('=== 仓库 ===');
  console.log('  名称:', r.data.full_name);
  console.log('  可见性:', r.data.private ? '私有' : '公开');
  console.log('  默认分支:', r.data.default_branch);
  console.log('  体积:', r.data.size, 'KB');
  console.log('  Pages 地址:', r.data.has_pages ? '已启用' : '未启用');
  console.log('  主页:', r.data.homepage || '(未设置)');
} else {
  console.log('仓库查询失败:', r.status, r.data);
}

// 分支与最新提交
const b = await api(`/repos/${repo}/branches/main`);
if (b.status === 200) {
  console.log('\n=== main 分支最新提交 ===');
  console.log('  SHA:', b.data.commit.sha.slice(0, 7));
  console.log('  说明:', b.data.commit.commit.message.split('\n')[0]);
  console.log('  作者:', b.data.commit.commit.author.name);
}

// 文件数（通过 git tree）
const t = await api(`/repos/${repo}/git/trees/main?recursive=1`);
if (t.status === 200) {
  console.log('\n=== 已推送文件 ===');
  console.log('  总数:', t.data.tree.filter((x) => x.type === 'blob').length);
  const assets = t.data.tree.filter((x) => x.path.startsWith('public/assets/students/'));
  console.log('  学生头像:', assets.length, '张');
  console.log('  是否含 data/students.json:', t.data.tree.some((x) => x.path === 'data/students.json'));
  console.log('  是否含工作流:', t.data.tree.some((x) => x.path === '.github/workflows/deploy.yml'));
  console.log('  是否误传 node_modules:', t.data.tree.some((x) => x.path.startsWith('node_modules/')));
  console.log('  是否误传 out:', t.data.tree.some((x) => x.path.startsWith('out/')));
}

// Actions 运行
const runs = await api(`/repos/${repo}/actions/runs?per_page=5`);
console.log('\n=== Actions 运行 ===');
if (runs.status === 200) {
  if (!runs.data.workflow_runs.length) {
    console.log('  暂无运行记录');
    console.log('  （若从未出现记录，通常是仓库 Settings → Pages 未把 Source 设为 GitHub Actions）');
  } else {
    for (const w of runs.data.workflow_runs) {
      console.log(`  [${w.status}] ${w.name} #${w.run_number}  结论=${w.conclusion ?? '进行中'}  ${w.html_url}`);
    }
  }
} else {
  console.log('  查询失败:', runs.status, String(runs.data).slice(0, 200));
}

// Pages 配置
const p = await api(`/repos/${repo}/pages`);
console.log('\n=== Pages 配置 ===');
if (p.status === 200) {
  console.log('  状态:', p.data.status);
  console.log('  地址:', p.data.html_url);
  console.log('  构建方式:', p.data.build_type);
} else {
  console.log('  未启用（HTTP ' + p.status + '）');
  console.log('  需要你手动开启：Settings → Pages → Source 选 "GitHub Actions"');
}
