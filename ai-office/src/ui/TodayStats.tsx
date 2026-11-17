type TodayStatsProps = {
  done: number;
  blocked: number;
  tokens: number;
  cost: number;
  overtime: boolean;
};

export function TodayStats({ done, blocked, tokens, cost, overtime }: TodayStatsProps) {
  return (
    <div className="today-stats" aria-label="Thống kê hôm nay">
      <span className="stats-kicker">TODAY / OFFICE TELEMETRY</span>
      <span>Hôm nay: <strong>{done}</strong> task done · <strong>{blocked}</strong> lỗi QA · <strong>{tokens.toLocaleString('vi-VN')}</strong> tokens · <strong>${cost.toFixed(3)}</strong></span>
      {overtime && <span className="overtime-pill">OVERTIME ACTIVE</span>}
    </div>
  );
}
