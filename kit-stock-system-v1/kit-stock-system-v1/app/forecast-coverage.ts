export function calculateForecastRoundCoverage(rows: Array<{ deliveryDate: string; deliveryTime: string; prodQty: number }>, stockQty: number, dispatchedAfterImport: number, nowKey: string) {
  // A Part can have several FAC/DO lines in one round. The whole round must
  // be covered before reporting that Stock supports it completely.
  const rounds = new Map<string, { deliveryDate: string; deliveryTime: string; prodQty: number }>();
  for (const row of rows) {
    const key = `${row.deliveryDate}T${row.deliveryTime}`;
    const round = rounds.get(key) || { deliveryDate: row.deliveryDate, deliveryTime: row.deliveryTime, prodQty: 0 };
    round.prodQty += Math.max(0, Number(row.prodQty || 0));
    rounds.set(key, round);
  }
  let dispatchToApply = dispatchedAfterImport;
  let stockToApply = stockQty;
  let projectedBalance = stockQty;
  const timeline: Array<{ deliveryDate: string; deliveryTime: string; demandQty: number; projectedBalance: number }> = [];
  let outstandingQty = 0, overdueQty = 0, totalShortage = 0, firstShortageQty = 0;
  let coveredThroughDate = "", coveredThroughTime = "", shortageDate = "", shortageTime = "";
  for (const [key, row] of [...rounds.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const dispatched = Math.min(row.prodQty, dispatchToApply);
    dispatchToApply -= dispatched;
    const remainingDemand = row.prodQty - dispatched;
    projectedBalance -= remainingDemand;
    timeline.push({ deliveryDate: row.deliveryDate, deliveryTime: row.deliveryTime, demandQty: remainingDemand, projectedBalance });
    outstandingQty += remainingDemand;
    if (key < nowKey) overdueQty += remainingDemand;
    const covered = Math.min(remainingDemand, stockToApply);
    stockToApply -= covered;
    const shortage = remainingDemand - covered;
    totalShortage += shortage;
    if (!shortageDate) {
      if (shortage > 0) {
        shortageDate = row.deliveryDate;
        shortageTime = row.deliveryTime;
        firstShortageQty = shortage;
      } else {
        coveredThroughDate = row.deliveryDate;
        coveredThroughTime = row.deliveryTime;
      }
    }
  }
  return { outstandingQty, overdueQty, totalShortage, firstShortageQty, coveredThroughDate, coveredThroughTime, shortageDate, shortageTime, remainingStockAfterForecast: stockToApply, timeline };
}
