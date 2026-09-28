/** 拉取失败工作流的各个步骤与日志 */
import { netFetch } from '../scripts/net.mjs';

const repo = 'R1ce1022/kivotos-pick-cn';
const headers = { 'User-Agent': 'dsh-agent', Accept: 'application/vnd.github+json' };

const api = async (p, raw = false) => {
  const res = await netFetch(`https://api.github.com${p}`, { headers });
  if (!res.ok) return { status: res.status, data: await res.text() };
  return { status: res.status, data: raw ? await res.text() : await res.json() };
};

const runs = await api(`/repos/${repo}/actions/runs?per_page=3`);
const run = runs.data.workflow_runs?.[0];
if (!run) {
  console.log('无运行记录');
  process.exit(0);
}

console.log(`=== 运行 #${run.run_number} ===`);
console.log('  状态:', run.status, '| 结论:', run.conclusion);
console.log('  事件:', run.event, '| 分支:', run.head_branch);
console.log('  地址:', run.html_url);

const jobs = await api(`/repos/${repo}/actions/runs/${run.id}/jobs`);
console.log('\n=== 各步骤结果 ===');
for (const job of jobs.data.jobs ?? []) {
  console.log(`\n[任务] ${job.name}  结论=${job.conclusion}`);
  for (const s of job.steps ?? []) {
    const mark = s.conclusion === 'success' ? '✓' : s.conclusion === 'skipped' ? '-' : '✗';
    console.log(`  ${mark} ${s.name}  (${s.conclusion ?? s.status})`);
  }
}

// 找到失败任务，拉日志
const failed = (jobs.data.jobs ?? []).find((j) => j.conclusion === 'failure');
if (failed) {
  console.log(`\n=== 失败任务日志（${failed.name}）===`);
  const logs = await netFetch(`https://api.github.com/repos/${repo}/actions/jobs/${failed.id}/logs`, {
    headers,
    redirect: 'follow',
  });
  const text = await logs.text();
  // 只打印错误上下文
  const lines = text.split('\n');
  const hits = [];
  lines.forEach((l, i) => {
    if (/error|Error|failed|##\[error\]|not found|404|403/i.test(l)) {
      hits.push(`  ${i}: ${l.replace(/\u001b\[[0-9;]*m/g, '').slice(0, 220)}`);
    }
  });
  console.log(hits.slice(0, 40).join('\n') || '  （未匹配到错误行，输出末尾如下）');
  if (!hits.length) console.log(lines.slice(-40).join('\n').replace(/\u001b\[[0-9;]*m/g, '').slice(0, 3000));
}
