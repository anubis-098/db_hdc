import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

interface SummaryData {
  wh: string;
  bu: string;
  total_po: number;
  gr_complete: number;
  gr_in_progress: number;
  not_started: number;
  expected_qty: number;
  received_qty: number;
  pending_qty: number;
  remark: string;
  is_total?: boolean;
}

interface InboundProgressData {
  summary_list?: SummaryData[];
  total?: SummaryData;
  last_update?: string;
  pages?: InboundPage[];
}

interface PutawayData {
  wh: string;
  bu: string;
  backlog: number;
  new_receipt: number;
  workload: number;
  putaway: number;
  balance: number;
  progress: number;
  is_total?: boolean;
}

interface InboundPage {
  key: string;
  title: string;
  type: 'receive' | 'putaway';
  summary_list?: SummaryData[];
  rows?: PutawayData[];
  total?: SummaryData | PutawayData | null;
  last_update?: string;
}

const SLIDE_INTERVAL_SECONDS = 30;

const InboundProgress = ({ isDarkMode, inboundData }: { isDarkMode?: boolean; inboundData?: InboundProgressData }) => {
  const [detailPageIndex, setDetailPageIndex] = useState(0);
  const [detailSlideCountdown, setDetailSlideCountdown] = useState(SLIDE_INTERVAL_SECONDS);
  const fallbackReceivePage: InboundPage = {
    key: 'receive',
    title: 'Receive',
    type: 'receive',
    summary_list: inboundData?.summary_list || [],
    total: inboundData?.total || null,
    last_update: inboundData?.last_update || '',
  };
  const inboundPages = inboundData?.pages?.length ? inboundData.pages : [fallbackReceivePage];
  const receivePage = inboundPages.find((page) => page.type === 'receive') || fallbackReceivePage;
  const putawayPage = inboundPages.find((page) => page.type === 'putaway');
  const detailPages = inboundPages.length ? inboundPages : [fallbackReceivePage];
  const currentPage = detailPages[detailPageIndex % detailPages.length] || fallbackReceivePage;
  const isPutawayPage = currentPage.type === 'putaway';
  const detailSlideProgress = detailPages.length > 1
    ? ((SLIDE_INTERVAL_SECONDS - detailSlideCountdown) / SLIDE_INTERVAL_SECONDS) * 100
    : 0;

  useEffect(() => {
    const pageCount = detailPages.length || 1;
    if (pageCount <= 1) {
      setDetailPageIndex(0);
      setDetailSlideCountdown(SLIDE_INTERVAL_SECONDS);
      return;
    }

    setDetailSlideCountdown(SLIDE_INTERVAL_SECONDS);
    const timer = window.setInterval(() => {
      setDetailSlideCountdown((prev) => {
        if (prev <= 1) {
          setDetailPageIndex((current) => (current + 1) % pageCount);
          return SLIDE_INTERVAL_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [detailPages.length]);

  const fallbackSummaryList: SummaryData[] = [];
  const summaryList = receivePage.summary_list?.length ? receivePage.summary_list : fallbackSummaryList;
  const putawayRows = putawayPage?.rows?.length ? putawayPage.rows : [];

  // --- Logic ---
  const totalPO = summaryList.reduce((acc, curr) => acc + curr.total_po, 0);
  const totalGRComplete = summaryList.reduce((acc, curr) => acc + curr.gr_complete, 0);
  const totalGRInProgress = summaryList.reduce((acc, curr) => acc + curr.gr_in_progress, 0);
  const totalNotStarted = summaryList.reduce((acc, curr) => acc + curr.not_started, 0);
  const totalExpectedQty = summaryList.reduce((acc, curr) => acc + curr.expected_qty, 0);
  const totalReceivedQty = summaryList.reduce((acc, curr) => acc + curr.received_qty, 0);
  const totalPendingQty = summaryList.reduce((acc, curr) => acc + curr.pending_qty, 0);
  const overallGRPercent = totalPO > 0 ? Math.round((totalGRComplete / totalPO) * 100) : 0;
  const receiveTotal = receivePage.total as SummaryData | null | undefined;
  const totalRow: SummaryData = receiveTotal || {
    wh: "TOTAL",
    bu: "",
    total_po: totalPO,
    gr_complete: totalGRComplete,
    gr_in_progress: totalGRInProgress,
    not_started: totalNotStarted,
    expected_qty: totalExpectedQty,
    received_qty: totalReceivedQty,
    pending_qty: totalPendingQty,
    remark: "",
    is_total: true,
  };

  const inboundDetailRows = [...summaryList, totalRow];
  const putawayTotal = putawayPage?.total as PutawayData | null | undefined;
  const putawayDetailRows = [...putawayRows, ...(putawayTotal ? [putawayTotal] : [])];
  const totalWorkload = putawayTotal?.workload || putawayRows.reduce((sum, row) => sum + row.workload, 0);
  const totalPutaway = putawayTotal?.putaway || putawayRows.reduce((sum, row) => sum + row.putaway, 0);
  const totalBalance = putawayTotal?.balance || putawayRows.reduce((sum, row) => sum + row.balance, 0);
  const putawayProgress = totalWorkload > 0 ? Math.round((totalPutaway / totalWorkload) * 100) : 0;
  const putawayCompletedValue = Math.max(totalPutaway, 0);
  const putawayRemainValue = Math.max(totalBalance - totalPutaway, 0);
  const putawayInProgressValue = Math.max(totalWorkload - putawayCompletedValue - putawayRemainValue, 0);
  const inboundLegendItems = [
    { name: 'Completed', color: '#10b981' },
    { name: 'Pending', color: '#0ea5e9' },
    { name: 'Plan', color: '#f59e0b' },
  ];

  const receiveStackSegments = [
    { name: 'Completed', value: totalGRComplete, color: '#10b981' },
    { name: 'Pending', value: totalGRInProgress, color: '#0ea5e9' },
    { name: 'Plan', value: totalNotStarted, color: '#f59e0b' },
  ];
  const putawayStackSegments = [
    { name: 'Completed', value: putawayCompletedValue, color: '#10b981' },
    { name: 'Pending', value: putawayInProgressValue, color: '#0ea5e9' },
    { name: 'Plan', value: putawayRemainValue, color: '#f59e0b' },
  ];
  const getStackPercent = (value: number, total: number) => total > 0 ? (value / total) * 100 : 0;

  const renderStackBar = (
    title: string,
    total: number,
    segments: { name: string; value: number; color: string }[]
  ) => {
    const stackTotal = segments.reduce((sum, segment) => sum + segment.value, 0);

    return (
      <div className="px-2 py-0">
        <div className="grid grid-cols-[108px_minmax(0,1fr)] gap-3 items-center">
          <div className="flex flex-col justify-center text-left">
            <span className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</span>
            <span className="mt-0.5 text-[11px] font-black text-blue-600 dark:text-blue-300 tabular-nums">
              {total.toLocaleString()} total
            </span>
          </div>

          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex h-10 w-full overflow-hidden rounded-lg bg-slate-200 dark:bg-slate-700 ring-1 ring-slate-200 dark:ring-slate-600">
              {segments.map((segment) => {
                const percent = getStackPercent(segment.value, stackTotal);
                return (
                  <div
                    key={`${title}-${segment.name}`}
                    className="flex h-full min-w-0 items-center justify-center overflow-hidden transition-[width] duration-[1500ms] ease-in-out"
                    style={{ width: `${percent}%`, backgroundColor: segment.color }}
                    title={`${segment.name}: ${segment.value.toLocaleString()} (${percent.toFixed(1)}%)`}
                  >
                    {percent >= 9 && (
                      <span className="truncate px-1 text-[14px] font-black text-white drop-shadow">
                        {percent.toFixed(0)}%
                      </span>
                    )}
                  </div>
                );
              })}
              {stackTotal === 0 && (
                <div className="flex h-full w-full items-center justify-center text-[13px] font-black text-slate-400 dark:text-slate-500">
                  0%
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 justify-items-center text-center text-[9px] font-black leading-none text-slate-500 dark:text-slate-400">
              {segments.map((segment) => (
                <div key={`${title}-${segment.name}-value`} className="w-full truncate tabular-nums">
                  {segment.value.toLocaleString()}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden h-full transition-colors duration-300">
      
      {/* 1. SECTION HEADER */}
      <div className="relative p-4 border-b border-slate-100 dark:border-slate-700/50 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
        {detailPages.length > 1 && (
          <div className="absolute left-0 right-0 top-0 h-1 bg-slate-200/70 dark:bg-slate-700/70">
            <div
              className="h-full bg-blue-500 transition-[width] duration-1000 ease-linear"
              style={{ width: `${detailSlideProgress}%` }}
            ></div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-md">
            <span role="img" aria-label="box" className="text-sm leading-none">📦</span>
          </div>
          <h3 className="font-extrabold text-sidebar dark:text-white text-sm uppercase tracking-wide">1. Inbound</h3>
        </div>
        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1">
          {detailPages.map((page, idx) => (
            <span
              key={`${page.key}-dot`}
              className={`h-1.5 rounded-full transition-all duration-500 ${idx === detailPageIndex % detailPages.length ? 'w-5 bg-blue-500' : 'w-1.5 bg-slate-300 dark:bg-slate-600'}`}
            ></span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-2 py-1 rounded-full">
            {currentPage.title}
          </span>
        </div>
      </div>

      <div className="flex-1 flex flex-col p-3 gap-3 overflow-hidden min-h-0">
        
        {/* 2. MINI KPI SUMMARY CARDS */}
        <div className="grid grid-cols-2 gap-2 shrink-0">
          <div className="bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col justify-center items-center text-center">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle size={14} className="text-red-500" />
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Pending Qty</p>
            </div>
            <p className="text-xl font-black text-red-600 leading-none mt-1">{totalPendingQty.toLocaleString()} <span className="text-[11px] font-bold text-slate-400">Items</span></p>
          </div>
          
          <div className="bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col justify-center items-center text-center">
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle2 size={14} className="text-green-500" />
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Putaway Progress</p>
            </div>
            <p className="text-xl font-black text-green-600 leading-none mt-1">{putawayProgress}%</p>
          </div>
        </div>

        {/* 3. STATUS BREAKDOWN (100% STACKED BAR) */}
        <div className="shrink-0 flex flex-col gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 px-3 py-1.5">
          <div className="grid grid-rows-2 gap-4">
            {renderStackBar('Receive Table', totalPO, receiveStackSegments)}
            {renderStackBar('Putaway Table', totalWorkload, putawayStackSegments)}
          </div>
          <div className="flex items-center justify-center gap-5 border-t border-slate-100 dark:border-slate-700 pt-1 text-[11px] font-black text-slate-600 dark:text-slate-300">
            {inboundLegendItems.map((item) => (
              <div key={`${item.name}-shared-legend`} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }}></span>
                <span>{item.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 4. INBOUND DETAIL (MINI TABLE) */}
        <div key={currentPage.key} className="flex-1 min-h-0 flex flex-col border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden relative bg-slate-50 dark:bg-slate-800 mt-2 mb-1 animate-outbound-page">
          <div className="bg-red-50 dark:bg-red-900/20 px-3 py-1.5 border-b border-red-100 dark:border-red-900/30 z-20 sticky left-0 shadow-sm shrink-0">
            <h4 className="text-[13px] font-black text-red-600 dark:text-red-400 uppercase tracking-widest">{isPutawayPage ? 'Putaway Detail' : 'Inbound Detail'}</h4>
          </div>
          
          <div className="overflow-hidden w-full flex-1 min-h-0">
            <div className="h-full w-full">
              <table className="h-full w-full table-fixed text-left border-collapse">
                <thead className="bg-[#1F4E79] text-white">
                  <tr className="text-[10px] uppercase font-extrabold tracking-wide border-b border-slate-100 dark:border-slate-700/50 text-center leading-tight">
                    <th className="py-1.5 px-1.5 border-r border-blue-200/30">BU</th>
                    <th className="py-1.5 px-1.5 border-r border-blue-200/30">Project</th>
                    {isPutawayPage ? (
                      <>
                        <th className="py-1.5 px-1.5 border-r border-blue-200/30">Backlog</th>
                        <th className="py-1.5 px-1.5 border-r border-blue-200/30">New Receipt</th>
                        <th className="py-1.5 px-1.5 border-r border-blue-200/30">Workload</th>
                        <th className="py-1.5 px-1.5 border-r border-blue-200/30">Putaway</th>
                        <th className="py-1.5 px-1.5 border-r border-blue-200/30">Balance</th>
                        <th className="py-1.5 px-1.5 text-right">Progress %</th>
                      </>
                    ) : (
                      <>
                        <th className="py-1.5 px-1.5 border-r border-blue-200/30">Total PO</th>
                        <th className="py-1.5 px-1.5 border-r border-blue-200/30">GR Complete</th>
                        <th className="py-1.5 px-1.5 border-r border-blue-200/30">GR In progress</th>
                        <th className="py-1.5 px-1.5 border-r border-blue-200/30">Not Started</th>
                        <th className="py-1.5 px-1.5 border-r border-blue-200/30 text-right">Expected Qty</th>
                        <th className="py-1.5 px-1.5 border-r border-blue-200/30 text-right">Received Qty</th>
                        <th className="py-1.5 px-1.5 border-r border-blue-200/30 text-right">Pending Qty</th>
                        <th className="py-1.5 px-1.5 text-left">Remark</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(isPutawayPage ? putawayDetailRows : inboundDetailRows).length > 0 ? (
                    (isPutawayPage ? putawayDetailRows : inboundDetailRows).map((row: any, idx) => {
                      let bgClass = "bg-white dark:bg-slate-800";
                      if (row.is_total) bgClass = "bg-yellow-300 dark:bg-yellow-500";
                      else if (row.wh === "894") bgClass = "bg-[#E6F2FF] dark:bg-blue-900/20";
                      else if (row.wh === "895") bgClass = "bg-[#FCE4D6] dark:bg-orange-900/20";

                      return (
                        <tr key={idx} className={`border-b border-slate-200 dark:border-slate-700/50 last:border-0 text-[11px] leading-tight ${row.is_total ? 'font-black text-sidebar' : 'font-bold text-sidebar dark:text-slate-200'} text-center hover:brightness-95 transition-colors ${bgClass}`}>
                          <td className="py-1.5 px-1.5 border-r border-slate-200/60 dark:border-slate-700/50 truncate">{row.wh}</td>
                          <td className="py-1.5 px-1.5 border-r border-slate-200/60 dark:border-slate-700/50 truncate">{row.bu}</td>
                          {isPutawayPage ? (
                            <>
                              <td className="py-1.5 px-1.5 border-r border-slate-200/60 dark:border-slate-700/50 font-mono truncate">{row.backlog.toLocaleString()}</td>
                              <td className="py-1.5 px-1.5 border-r border-slate-200/60 dark:border-slate-700/50 font-mono text-blue-700 dark:text-blue-300 truncate">{row.new_receipt.toLocaleString()}</td>
                              <td className="py-1.5 px-1.5 border-r border-slate-200/60 dark:border-slate-700/50 font-mono truncate">{row.workload.toLocaleString()}</td>
                              <td className="py-1.5 px-1.5 border-r border-slate-200/60 dark:border-slate-700/50 font-mono text-green-600 dark:text-green-400 truncate">{row.putaway.toLocaleString()}</td>
                              <td className="py-1.5 px-1.5 border-r border-slate-200/60 dark:border-slate-700/50 font-mono font-black text-red-600 dark:text-red-400 truncate">{row.balance.toLocaleString()}</td>
                              <td className="py-1.5 px-1.5 text-right font-mono text-blue-700 dark:text-blue-300 truncate">{`${(Number(row.progress || 0) * 100).toFixed(0)}%`}</td>
                            </>
                          ) : (
                            <>
                              <td className="py-1.5 px-1.5 border-r border-slate-200/60 dark:border-slate-700/50 truncate">{row.total_po}</td>
                              <td className="py-1.5 px-1.5 border-r border-slate-200/60 dark:border-slate-700/50 text-green-600 dark:text-green-400 truncate">{row.gr_complete}</td>
                              <td className="py-1.5 px-1.5 border-r border-slate-200/60 dark:border-slate-700/50 text-blue-600 dark:text-blue-400 truncate">{row.gr_in_progress}</td>
                              <td className="py-1.5 px-1.5 border-r border-slate-200/60 dark:border-slate-700/50 text-slate-500 dark:text-slate-400 truncate">{row.not_started}</td>
                              <td className="py-1.5 px-1.5 border-r border-slate-200/60 dark:border-slate-700/50 text-right font-mono truncate">{row.expected_qty.toLocaleString()}</td>
                              <td className="py-1.5 px-1.5 border-r border-slate-200/60 dark:border-slate-700/50 text-right font-mono text-blue-700 dark:text-blue-300 truncate">{row.received_qty.toLocaleString()}</td>
                              <td className="py-1.5 px-1.5 border-r border-slate-200/60 dark:border-slate-700/50 text-right font-mono font-black text-red-600 dark:text-red-400 text-[12px] truncate">{row.pending_qty.toLocaleString()}</td>
                              <td className="py-1.5 px-1.5 text-left text-[10px] font-medium text-slate-600 dark:text-slate-400 truncate">{row.remark}</td>
                            </>
                          )}
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={isPutawayPage ? 8 : 10} className="py-4 text-center text-sm text-slate-400 italic">No pending actions</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default InboundProgress;
