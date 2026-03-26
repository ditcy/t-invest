import type { ApiBacktestReport } from "../api";

const reportMetricHelp = {
  Return: "Portfolio return for the full backtest period: (end equity - start equity) / start equity.",
  "Max DD": "Maximum drawdown: the largest drop in equity from a previous peak during the test.",
  Trades: "Total trade log entries. In the current implementation this counts both BUY and SELL rows.",
  "Win Rate": "Share of profitable SELL trades among all SELL trades.",
  "End Equity": "Final portfolio value after all trades, fees, slippage, and forced close of any open position."
} satisfies Record<string, string>;

const tradeColumnHelp = {
  Side: "Trade direction: BUY opens a position, SELL closes it.",
  Time: "Timestamp of the candle where the moving-average signal triggered the trade.",
  Price: "Execution price after slippage is applied.",
  Qty: "Quantity bought or sold. Rounded down to fit available cash.",
  Fee: "Commission charged for this trade.",
  PnL: "Realized profit or loss on SELL. BUY rows do not have realized PnL yet."
} satisfies Record<string, string>;

type BacktestReportViewProps = {
  report: ApiBacktestReport;
  tradeLimit?: number;
};

export function BacktestReportView({
  report,
  tradeLimit = 30
}: BacktestReportViewProps) {
  const visibleTrades = report.trades.slice(0, tradeLimit);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Metric
          label="Return"
          value={`${report.metrics.returnPct.toFixed(2)}%`}
          hint={reportMetricHelp.Return}
        />
        <Metric
          label="Max DD"
          value={`${report.metrics.maxDrawdownPct.toFixed(2)}%`}
          hint={reportMetricHelp["Max DD"]}
        />
        <Metric
          label="Trades"
          value={String(report.metrics.tradesCount)}
          hint={reportMetricHelp.Trades}
        />
        <Metric
          label="Win Rate"
          value={`${report.metrics.winRatePct.toFixed(2)}%`}
          hint={reportMetricHelp["Win Rate"]}
        />
        <Metric
          label="End Equity"
          value={report.metrics.endEquity.toFixed(2)}
          hint={reportMetricHelp["End Equity"]}
        />
      </div>

      <div className="overflow-auto rounded border border-neutral-800">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-surface-800 text-neutral-300">
            <tr>
              <th className="px-3 py-2">
                <HeaderWithHint label="Side" hint={tradeColumnHelp.Side} />
              </th>
              <th className="px-3 py-2">
                <HeaderWithHint label="Time" hint={tradeColumnHelp.Time} />
              </th>
              <th className="px-3 py-2">
                <HeaderWithHint label="Price" hint={tradeColumnHelp.Price} />
              </th>
              <th className="px-3 py-2">
                <HeaderWithHint label="Qty" hint={tradeColumnHelp.Qty} />
              </th>
              <th className="px-3 py-2">
                <HeaderWithHint label="Fee" hint={tradeColumnHelp.Fee} />
              </th>
              <th className="px-3 py-2">
                <HeaderWithHint label="PnL" hint={tradeColumnHelp.PnL} />
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleTrades.map((trade, index) => (
              <tr key={`${trade.ts}-${index}`} className="border-t border-neutral-800">
                <td
                  className={`px-3 py-2 ${
                    trade.side === "BUY" ? "text-emerald-300" : "text-amber-300"
                  }`}
                >
                  {trade.side}
                </td>
                <td className="px-3 py-2 text-neutral-300">
                  {new Date(trade.ts).toLocaleString()}
                </td>
                <td className="px-3 py-2">{trade.price.toFixed(4)}</td>
                <td className="px-3 py-2">{trade.qty}</td>
                <td className="px-3 py-2">{trade.fee.toFixed(4)}</td>
                <td className="px-3 py-2">
                  {typeof trade.pnl === "number" ? trade.pnl.toFixed(4) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {report.trades.length > visibleTrades.length ? (
        <p className="text-xs text-neutral-500">
          Showing {visibleTrades.length} of {report.trades.length} trades.
        </p>
      ) : null}
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded border border-neutral-800 bg-surface-800 px-3 py-2">
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-neutral-500">
        <span>{label}</span>
        {hint ? <InfoHint text={hint} /> : null}
      </div>
      <div className="mt-1 text-sm font-semibold text-neutral-100">{value}</div>
    </div>
  );
}

function HeaderWithHint({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex items-center gap-1">
      <span>{label}</span>
      <InfoHint text={hint} />
    </div>
  );
}

function InfoHint({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex items-center">
      <span
        className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-neutral-600 text-[10px] leading-none text-neutral-400 transition-colors group-hover:border-neutral-400 group-hover:text-neutral-200"
        tabIndex={0}
        aria-label={text}
        title={text}
      >
        ?
      </span>
      <span className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-20 hidden w-56 -translate-x-1/2 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-[11px] normal-case tracking-normal text-neutral-200 shadow-lg group-hover:block group-focus-within:block">
        {text}
      </span>
    </span>
  );
}
