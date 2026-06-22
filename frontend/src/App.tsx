import { Fragment, useState, useEffect, useRef } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import axios from 'axios';
import { 
  RefreshCcw, Database, Package, Clock, Settings, LayoutDashboard,
  TrendingUp, ArrowUpFromLine
} from 'lucide-react';

import InboundProgress from './components/InboundProgress';

import Chart from 'react-apexcharts';

interface DashboardData {
  inbound: {
    chart: { name: string; value: number }[];
    table: { date: string; po_no: string; supplier: string; status: string }[];
    summary_list?: {
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
    }[];
    total?: {
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
    };
    last_update?: string;
    pages?: {
      key: string;
      title: string;
      type: 'receive' | 'putaway';
      summary_list?: {
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
      }[];
      rows?: {
        wh: string;
        bu: string;
        backlog: number;
        new_receipt: number;
        workload: number;
        putaway: number;
        balance: number;
        progress: number;
        is_total?: boolean;
      }[];
      total?: any;
      last_update?: string;
    }[];
  };
  pick: {
    chart: { completed: number; pending: number; plan?: number };
    table: { group: string; loading_date: string; group_hdc: string; status: string; sum_total_mu: number; size?: 'S' | 'M' | 'L'; product_size_hle?: 'S' | 'M' | 'L' }[];
    size_summary?: { size: 'S' | 'M' | 'L'; picked: string; totalMu: number; percent?: number }[];
  };
  outbound: {
    chart: { route: string; progress: number; total: number }[];
    table: { order_id: string; dest: string; courier: string; status: string }[];
    plan_rows?: {
      site: string;
      planLoad: string;
      planLoadDo: number;
      pendingDo: number;
      pendingMu: number;
      completedDo: number;
      completedMu: number;
    }[];
    summary?: {
      label: string;
      total: number;
      pending: number;
      completed: number;
    }[];
    pages?: {
      key: string;
      title: string;
      plan_rows: {
        site: string;
        planLoad: string;
        planLoadDo: number;
        pendingDo: number;
        pendingMu: number;
        completedDo: number;
        completedMu: number;
      }[];
      summary: {
        label: string;
        total: number;
        pending: number;
        completed: number;
      }[];
    }[];
  };
  summary: { total_records: number; total_value: number; active_sources: number };
  system_id: string;
}

const SYNC_INTERVAL_STORAGE_KEY = 'db-hdc-sync-interval';
const DARK_MODE_STORAGE_KEY = 'db-hdc-dark-mode';
const DATA_SOURCES_STORAGE_KEY = 'db-hdc-data-sources';
const DEFAULT_SYNC_INTERVAL = 1800;
const VALID_SYNC_INTERVALS = [900, 1800, 3600, 7200, 10800];
const SLIDE_INTERVAL_SECONDS = 30;

type DataSourceKey = 'inbound' | 'pick' | 'outbound';

type UploadFileInfo = {
  exists: boolean;
  size?: number;
  modified_at?: string;
};

type UploadClient = {
  client_id: string;
  files: Record<DataSourceKey, UploadFileInfo>;
};

interface DataSourceSettings {
  inbound: string;
  pick: string;
  outbound: string;
}

type SyncStatus = {
  tone: 'idle' | 'syncing' | 'ok' | 'warn' | 'error';
  message: string;
};

const DEFAULT_DATA_SOURCES: DataSourceSettings = {
  inbound: '/onedrive-dashboard/Inbound.xlsx',
  pick: '/onedrive-dashboard/Pick.xlsx',
  outbound: '/onedrive-dashboard/Outbound.xlsx',
};
const DATA_SOURCE_ITEMS: { key: DataSourceKey; label: string; placeholder: string; fileName: string }[] = [
  { key: 'inbound', label: '1. Inbound', placeholder: 'Folder path or OneDrive .xlsx link', fileName: 'Inbound.xlsx' },
  { key: 'pick', label: '2. Pick', placeholder: 'Folder path or OneDrive .xlsx link', fileName: 'Pick.xlsx' },
  { key: 'outbound', label: '3. Outbound', placeholder: 'Folder path or OneDrive .xlsx link', fileName: 'Outbound.xlsx' },
];
const CHART_ANIMATION = {
  enabled: true,
  easing: 'easeinout',
  speed: 1500,
  animateGradually: {
    enabled: true,
    delay: 180,
  },
  dynamicAnimation: {
    enabled: true,
    speed: 1300,
  },
};

const getInitialSyncInterval = () => {
  if (typeof window === 'undefined') return DEFAULT_SYNC_INTERVAL;

  const storedValue = Number(window.localStorage.getItem(SYNC_INTERVAL_STORAGE_KEY));
  return VALID_SYNC_INTERVALS.includes(storedValue) ? storedValue : DEFAULT_SYNC_INTERVAL;
};

const getInitialDarkMode = () => {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(DARK_MODE_STORAGE_KEY) === 'true';
};

const getInitialDataSources = (): DataSourceSettings => {
  if (typeof window === 'undefined') return DEFAULT_DATA_SOURCES;

  try {
    const storedValue = window.localStorage.getItem(DATA_SOURCES_STORAGE_KEY);
    if (!storedValue) return DEFAULT_DATA_SOURCES;
    return { ...DEFAULT_DATA_SOURCES, ...JSON.parse(storedValue) };
  } catch {
    return DEFAULT_DATA_SOURCES;
  }
};

function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [syncInterval, setSyncInterval] = useState(getInitialSyncInterval);
  const [countdown, setCountdown] = useState(getInitialSyncInterval);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [backendId, setBackendId] = useState<string | null>(null);
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ tone: 'idle', message: 'Ready' });
  const [outboundPageIndex, setOutboundPageIndex] = useState(0);
  const [outboundSlideCountdown, setOutboundSlideCountdown] = useState(SLIDE_INTERVAL_SECONDS);
  
  // Settings & Theme State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(getInitialDarkMode);
  const [dataSources, setDataSources] = useState<DataSourceSettings>(getInitialDataSources);
  const [uploadClientId, setUploadClientId] = useState('hdc-main');
  const [uploadClients, setUploadClients] = useState<UploadClient[]>([]);
  const [uploadStatus, setUploadStatus] = useState<SyncStatus>({ tone: 'idle', message: 'Ready' });
  const [uploadingSource, setUploadingSource] = useState<DataSourceKey | null>(null);
  const [isResettingUploadClient, setIsResettingUploadClient] = useState(false);
  const hasLoadedBackendDataSourcesRef = useRef(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const lastSourceModifiedAtRef = useRef('');
  const syncRetryTimeoutRef = useRef<number | null>(null);

  const fetchData = async (options: { manual?: boolean; retryCount?: number } = {}) => {
    const retryCount = options.retryCount || 0;
    try {
      setLoading(true);
      setSyncStatus({
        tone: 'syncing',
        message: retryCount > 0 ? `Waiting OneDrive... ${retryCount}/5` : 'Reading backend files...',
      });
      const response = await axios.get('/api/data', {
        params: { _ts: Date.now() },
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      });
      
      if (response.data.status === 'success' || response.data.status === 'partial_success') {
        const newBackendId = response.data.system_id;
        if (backendId && newBackendId !== backendId) {
          window.location.reload();
          return;
        }
        setBackendId(newBackendId);
        setData(response.data.data);
        
        const backendUpdatedAt = response.data.updated_at || '';
        if (backendUpdatedAt) {
          setLastUpdate(backendUpdatedAt);
        } else {
          const now = new Date();
          const day = now.getDate().toString().padStart(2, '0');
          const month = (now.getMonth() + 1).toString().padStart(2, '0');
          const year = now.getFullYear();
          const timeString = now.toLocaleTimeString('en-GB');
          setLastUpdate(`${day}-${month}-${year} ${timeString}`);
        }

        const sourceErrors = response.data.source_errors || {};
        const failedSources = Object.keys(sourceErrors);
        const sourceStatus = response.data.source_status || {};
        const sourceModifiedEntries = Object.entries(sourceStatus)
          .map(([key, status]: [string, any]) => `${key}:${status?.source_info?.modified_at || ''}`)
          .sort();
        const sourceModifiedSignature = sourceModifiedEntries.join('|');
        const sourceModifiedTimes = sourceModifiedEntries
          .map((entry) => entry.split(':').slice(1).join(':'))
          .filter(Boolean)
          .sort();
        const latestSourceModifiedAt = sourceModifiedTimes[sourceModifiedTimes.length - 1] || '';
        if (failedSources.length > 0 || response.data.status === 'partial_success') {
          setSyncStatus({ tone: 'warn', message: `Partial: ${failedSources.join(', ') || 'check sources'}` });
        } else {
          const previousSourceModifiedAt = lastSourceModifiedAtRef.current;
          const isSameSourceFile = Boolean(options.manual && previousSourceModifiedAt && sourceModifiedSignature === previousSourceModifiedAt);

          if (isSameSourceFile && retryCount < 5) {
            setSyncStatus({ tone: 'warn', message: 'File unchanged' });
            syncRetryTimeoutRef.current = window.setTimeout(() => {
              fetchData({ manual: true, retryCount: retryCount + 1 });
            }, 3000);
          } else {
            setSyncStatus({
              tone: isSameSourceFile ? 'warn' : 'ok',
              message: isSameSourceFile ? 'No new file' : 'Backend OK',
            });
          }

          if (sourceModifiedSignature) {
            lastSourceModifiedAtRef.current = sourceModifiedSignature;
          }
        }
        
        setCountdown(syncInterval);
      } else {
        setSyncStatus({ tone: 'error', message: response.data.message || 'Backend sync failed' });
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      setSyncStatus({ tone: 'error', message: 'Backend unreachable' });
    } finally {
      setLoading(false);
      setIsAutoSyncing(false);
    }
  };

  const handleManualSync = () => {
    if (syncRetryTimeoutRef.current) {
      window.clearTimeout(syncRetryTimeoutRef.current);
      syncRetryTimeoutRef.current = null;
    }
    setCountdown(syncInterval);
    fetchData({ manual: true });
  };

  useEffect(() => {
    fetchData();
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setIsAutoSyncing(true);
          fetchData();
          return syncInterval;
        }
        return prev - 1;
      });
      setCurrentTime(new Date());
    }, 1000);
    return () => {
      clearInterval(timer);
      if (syncRetryTimeoutRef.current) {
        window.clearTimeout(syncRetryTimeoutRef.current);
      }
    };
  }, [syncInterval]);

  useEffect(() => {
    window.localStorage.setItem(SYNC_INTERVAL_STORAGE_KEY, String(syncInterval));
  }, [syncInterval]);

  useEffect(() => {
    window.localStorage.setItem(DARK_MODE_STORAGE_KEY, String(isDarkMode));
  }, [isDarkMode]);

  useEffect(() => {
    window.localStorage.setItem(DATA_SOURCES_STORAGE_KEY, JSON.stringify(dataSources));
  }, [dataSources]);

  useEffect(() => {
    const outboundPageCount = data?.outbound.pages?.length || 1;
    if (outboundPageCount <= 1) {
      setOutboundPageIndex(0);
      setOutboundSlideCountdown(SLIDE_INTERVAL_SECONDS);
      return;
    }

    setOutboundSlideCountdown(SLIDE_INTERVAL_SECONDS);
    const slideTimer = window.setInterval(() => {
      setOutboundSlideCountdown((prev) => {
        if (prev <= 1) {
          setOutboundPageIndex((current) => (current + 1) % outboundPageCount);
          return SLIDE_INTERVAL_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(slideTimer);
  }, [data?.outbound.pages?.length]);

  useEffect(() => {
    axios.get('/api/settings/data-sources')
      .then((response) => {
        if (response.data?.status === 'success') {
          setDataSources({ ...DEFAULT_DATA_SOURCES, ...response.data.data });
        }
      })
      .catch((error) => {
        console.error('Error loading data sources:', error);
      })
      .finally(() => {
        hasLoadedBackendDataSourcesRef.current = true;
      });
    loadUploadClients();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleIntervalChange = (seconds: number) => {
    setSyncInterval(seconds);
    setCountdown(seconds);
    setIsSettingsOpen(false);
  };

  const loadUploadClients = async () => {
    try {
      const response = await axios.get('/api/settings/upload-clients');
      if (response.data?.status === 'success') {
        setUploadClients(response.data.clients || []);
        if (response.data.active_client) {
          setUploadClientId(response.data.active_client);
        }
      }
    } catch (error) {
      console.error('Error loading upload clients:', error);
    }
  };

  const handleSelectUploadClient = async (clientId: string) => {
    try {
      setUploadStatus({ tone: 'syncing', message: 'Selecting client...' });
      const response = await axios.post('/api/settings/upload-client', { client_id: clientId });
      if (response.data?.status === 'success') {
        setUploadClientId(response.data.client_id);
        setDataSources({ ...DEFAULT_DATA_SOURCES, ...response.data.data_sources });
        setUploadClients(response.data.clients || []);
        setUploadStatus({ tone: 'ok', message: `Active: ${response.data.client_id}` });
        await fetchData({ manual: true });
      }
    } catch (error) {
      console.error('Error selecting upload client:', error);
      setUploadStatus({ tone: 'error', message: 'Client select failed' });
    }
  };

  const handleUploadFile = async (sourceKey: DataSourceKey, file: File | null) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setUploadStatus({ tone: 'error', message: 'Only .xlsx files' });
      return;
    }

    const normalizedClientId = uploadClientId.trim();
    if (!normalizedClientId) {
      setUploadStatus({ tone: 'error', message: 'Client required' });
      return;
    }

    const formData = new FormData();
    formData.append('client_id', normalizedClientId);
    formData.append('file', file);

    try {
      setUploadingSource(sourceKey);
      setUploadStatus({ tone: 'syncing', message: `Uploading ${sourceKey}...` });
      const response = await axios.post(`/api/upload/${sourceKey}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (response.data?.status === 'success') {
        setUploadClientId(response.data.client_id);
        setDataSources({ ...DEFAULT_DATA_SOURCES, ...response.data.data_sources });
        setUploadClients(response.data.clients || []);
        setUploadStatus({ tone: 'ok', message: `${sourceKey} uploaded` });
        await fetchData({ manual: true });
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      setUploadStatus({ tone: 'error', message: `${sourceKey} upload failed` });
    } finally {
      setUploadingSource(null);
    }
  };

  const handleResetUploadClient = async () => {
    const normalizedClientId = uploadClientId.trim();
    if (!normalizedClientId) {
      setUploadStatus({ tone: 'error', message: 'Client required' });
      return;
    }

    const confirmed = window.confirm(`Reset uploaded files for "${normalizedClientId}"?`);
    if (!confirmed) return;

    try {
      setIsResettingUploadClient(true);
      setUploadStatus({ tone: 'syncing', message: 'Resetting files...' });
      const response = await axios.delete(`/api/upload-client/${encodeURIComponent(normalizedClientId)}`);
      if (response.data?.status === 'success') {
        setUploadClientId(response.data.client_id);
        setDataSources({ ...DEFAULT_DATA_SOURCES, ...response.data.data_sources });
        setUploadClients(response.data.clients || []);
        setUploadStatus({ tone: 'ok', message: `${response.data.client_id} reset` });
        await fetchData({ manual: true });
      }
    } catch (error) {
      console.error('Error resetting upload client:', error);
      setUploadStatus({ tone: 'error', message: 'Reset failed' });
    } finally {
      setIsResettingUploadClient(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  const syncStatusClassName = {
    idle: 'text-slate-400 dark:text-slate-500',
    syncing: 'text-blue-500 dark:text-blue-300',
    ok: 'text-emerald-600 dark:text-emerald-300',
    warn: 'text-amber-600 dark:text-amber-300',
    error: 'text-rose-600 dark:text-rose-300',
  }[syncStatus.tone];
  const uploadStatusClassName = {
    idle: 'text-slate-400 dark:text-slate-500',
    syncing: 'text-blue-500 dark:text-blue-300',
    ok: 'text-emerald-600 dark:text-emerald-300',
    warn: 'text-amber-600 dark:text-amber-300',
    error: 'text-rose-600 dark:text-rose-300',
  }[uploadStatus.tone];

  const hours = currentTime.getHours().toString().padStart(2, '0');
  const minutes = currentTime.getMinutes().toString().padStart(2, '0');
  const day = currentTime.getDate().toString().padStart(2, '0');
  const weekday = currentTime.toLocaleDateString('en-GB', { weekday: 'long' });
  const month = currentTime.toLocaleDateString('en-GB', { month: 'long' });
  const year = currentTime.getFullYear();
  const pickProgressTheme = isDarkMode
    ? {
        completed: '#FFCFF4',
        pending: '#A8F6FF',
        plan: '#f59e0b',
        dataLabel: '#0f172a',
        dataLabelShadow: '#ffffff',
      }
    : {
        completed: '#FFCFF4',
        pending: 'rgb(146, 219, 255)',
        plan: '#f59e0b',
        dataLabel: '#ffffff',
        dataLabelShadow: '#000000',
      };
  const pickChartPlan = data?.pick.chart.plan ?? ((data?.pick.chart.completed || 0) + (data?.pick.chart.pending || 0));
  const pickChartSegments = data
    ? [
        { name: 'Plan', value: pickChartPlan, color: pickProgressTheme.plan, radius: 'rounded-l-lg' },
        { name: 'Completed', value: data.pick.chart.completed, color: pickProgressTheme.completed, radius: '' },
        { name: 'Pending', value: data.pick.chart.pending, color: pickProgressTheme.pending, radius: 'rounded-r-lg' },
      ]
    : [];
  const pickChartStackTotal = pickChartSegments.reduce((sum, segment) => sum + segment.value, 0);
  const getPickChartPercent = (value: number) => pickChartStackTotal > 0 ? (value / pickChartStackTotal) * 100 : 0;
  const pickSizes = ['L', 'M', 'S'] as const;
  const pickSecondTableRows = data?.pick.size_summary?.length
    ? data.pick.size_summary
    : data
      ? Object.values(
        data.pick.table.reduce<Record<string, { size: 'S' | 'M' | 'L'; picked: string; totalMu: number }>>((acc, row, idx) => {
          const size = row.product_size_hle || row.size || pickSizes[idx % pickSizes.length];
          const key = `${size}-${row.status}`;
          if (!acc[key]) {
            acc[key] = { size, picked: row.status, totalMu: 0 };
          }
          acc[key].totalMu += row.sum_total_mu;
          return acc;
        }, {})
      )
      : [];
  const pickSecondTableRowsBySize = pickSizes.map((size) => ({
    size,
    rows: pickSecondTableRows.filter((row) => row.size === size),
  }));
  const pickSecondTableTotal = pickSecondTableRows.reduce((sum, row) => sum + row.totalMu, 0);
  const getPickSecondPercentValue = (value: number) =>
    pickSecondTableTotal > 0 ? (value / pickSecondTableTotal) * 100 : 0;
  const formatPickSecondPercent = (value: number) =>
    `${getPickSecondPercentValue(value).toFixed(2)}%`;
  const buildOutboundSummary = (rows: {
    planLoadDo: number;
    pendingDo: number;
    pendingMu: number;
    completedDo: number;
    completedMu: number;
  }[]) => [
    {
      label: 'Actual Order',
      total: rows.reduce((sum, row) => sum + row.planLoadDo, 0),
      pending: rows.reduce((sum, row) => sum + row.pendingDo, 0),
      completed: rows.reduce((sum, row) => sum + row.completedDo, 0),
    },
    {
      label: "Receive",
      total: rows.reduce((sum, row) => sum + row.pendingMu + row.completedMu, 0),
      pending: rows.reduce((sum, row) => sum + row.pendingMu, 0),
      completed: rows.reduce((sum, row) => sum + row.completedMu, 0),
    },
  ];
  const fallbackOutboundPlanRows: {
    site: string;
    planLoad: string;
    planLoadDo: number;
    pendingDo: number;
    pendingMu: number;
    completedDo: number;
    completedMu: number;
  }[] = [];
  const fallbackOutboundPage = {
    key: 'hle',
    title: 'HLE',
    plan_rows: fallbackOutboundPlanRows,
    summary: buildOutboundSummary(fallbackOutboundPlanRows),
  };
  const outboundPages = data?.outbound.pages?.length ? data.outbound.pages : [fallbackOutboundPage];
  const outboundCurrentPage = outboundPages[outboundPageIndex % outboundPages.length] || fallbackOutboundPage;
  const outboundPlanRows = outboundCurrentPage.plan_rows?.length ? outboundCurrentPage.plan_rows : fallbackOutboundPlanRows;
  const outboundPlanSummary = outboundCurrentPage.summary?.length ? outboundCurrentPage.summary : buildOutboundSummary(outboundPlanRows);
  const outboundSlideProgress = outboundPages.length > 1
    ? ((SLIDE_INTERVAL_SECONDS - outboundSlideCountdown) / SLIDE_INTERVAL_SECONDS) * 100
    : 0;
  const outboundSummaryChartOptions = {
    chart: {
      type: 'bar',
      stacked: false,
      toolbar: { show: false },
      background: 'transparent',
      sparkline: { enabled: true },
      animations: CHART_ANIMATION,
    },
    plotOptions: {
      bar: {
        horizontal: true,
        barHeight: '78%',
        borderRadius: 2,
        borderRadiusApplication: 'end',
        distributed: false,
      },
    },
    dataLabels: {
      enabled: true,
      textAnchor: 'middle',
      formatter: (val) => `${Number(val).toFixed(1)}%`,
      style: {
        fontSize: '13px',
        fontWeight: 900,
        colors: ['#ffffff'],
      },
      dropShadow: {
        enabled: true,
        top: 1,
        left: 1,
        blur: 2,
        color: '#000000',
        opacity: 0.35,
      },
    },
    colors: ['#0ea5e9', '#10b981', '#f59e0b'],
    stroke: {
      width: 0,
      colors: [isDarkMode ? '#1e293b' : '#ffffff'],
    },
    xaxis: {
      categories: outboundPlanSummary.map((item) => item.label),
      min: 0,
      max: 100,
      labels: { show: false },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: { show: false },
    grid: { show: false },
    fill: { opacity: 1 },
    legend: { show: false },
    tooltip: {
      theme: isDarkMode ? 'dark' : 'light',
      y: {
        formatter: (val) => `${Number(val).toFixed(2)}%`,
      },
    },
  };
  const getOutboundPercent = (value: number, total: number) => total > 0 ? (value / total) * 100 : 0;
  const outboundSummaryChartSeries = [
    { name: 'Plan', data: outboundPlanSummary.map((item) => getOutboundPercent(item.total, item.total)) },
    { name: 'Completed', data: outboundPlanSummary.map((item) => getOutboundPercent(item.completed, item.total)) },
    { name: 'Pending', data: outboundPlanSummary.map((item) => getOutboundPercent(item.pending, item.total)) },
  ];
  return (
    <div className={isDarkMode ? 'dark' : ''}>
      <div className="min-h-screen bg-background-light dark:bg-slate-900 relative transition-colors duration-300">
        
        {/* Watermark Overlay */}
        <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center overflow-hidden">
          <div className="flex flex-col items-center justify-center opacity-[0.05] dark:opacity-[0.02] -rotate-[30deg] select-none">
            <span className="text-[120px] font-black tracking-tighter leading-none text-slate-900 dark:text-white">
              In Development
            </span>
            <span className="text-[80px] font-black tracking-tight leading-none text-slate-900 dark:text-white mt-4">
              อยู่ในช่วงพัฒนา
            </span>
          </div>
        </div>

        <main className="flex flex-col min-h-screen min-w-0">
          {/* Header */}
          <header className="h-20 flex items-center justify-between px-8 bg-background-light dark:bg-slate-900 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 shadow-sm relative shrink-0 transition-colors duration-300">
            <div className="flex flex-col">
              <h1 className="text-2xl font-black text-sidebar dark:text-white tracking-tight leading-none transition-colors">Real-time Dashboard</h1>
              <p className="text-slate-500 dark:text-slate-400 font-bold mt-1 text-[10px] uppercase tracking-wider transition-colors">Progress Report • HDC Warehouse</p>
            </div>

            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-4 pt-2">
              <span className="text-[64px] font-black text-ci-blue tracking-tighter leading-none flex items-center" style={{ textShadow: '0 2px 10px rgba(18, 112, 219, 0.1)' }}>
                {hours}<span className="animate-blink relative bottom-[4px] mx-1">:</span>{minutes}
              </span>
              <div className="flex flex-col border-l-2 border-slate-200 dark:border-slate-700 pl-4 py-1 justify-center transition-colors">
                <span className="text-[14px] font-black text-slate-500 dark:text-slate-300 tracking-wide leading-tight transition-colors">{day} {weekday}</span>
                <span className="text-[12px] font-bold text-slate-400 dark:text-slate-500 tracking-widest leading-tight mt-0.5 transition-colors">{month} {year}</span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg shadow-sm transition-colors duration-300">
                <Clock size={12} className="text-ci-blue" />
                <span>REFRESH: {lastUpdate}</span>
                <span className={`max-w-[190px] truncate border-l border-slate-200 dark:border-slate-700 pl-2 uppercase tracking-wide ${syncStatusClassName}`} title={syncStatus.message}>
                  {syncStatus.message}
                </span>
              </div>
              <button 
                onClick={handleManualSync} 
                disabled={loading} 
                className={`flex min-w-[150px] items-center justify-center gap-2 text-white px-5 py-2 rounded-xl font-bold text-xs transition-all shadow-lg shadow-blue-500/20 active:scale-95 disabled:opacity-70 ${isAutoSyncing ? 'bg-ci-blue-dark scale-95' : 'bg-ci-blue hover:bg-ci-blue-dark'}`}
              >
                <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />
                <span>SYNC IN {formatTime(countdown)}</span>
              </button>
              
              {/* Settings Dropdown */}
              <div className="relative" ref={settingsRef}>
                <button 
                  onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                  className="p-2 text-slate-400 dark:text-slate-500 hover:bg-white dark:hover:bg-slate-800 hover:text-sidebar dark:hover:text-white rounded-lg transition-all border border-transparent hover:border-slate-200 dark:border-slate-700"
                >
                  <Settings size={18} />
                </button>

                {isSettingsOpen && (
                  <div className="absolute right-0 mt-2 w-[520px] bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-2 z-50">
                    <div className="px-4 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700/50">Sync Interval</div>
                    {[
                      { label: '15 Minutes', value: 900 },
                      { label: '30 Minutes', value: 1800 },
                      { label: '1 Hour', value: 3600 },
                      { label: '2 Hours', value: 7200 },
                      { label: '3 Hours', value: 10800 },
                    ].map(opt => (
                      <button 
                        key={opt.value} 
                        onClick={() => handleIntervalChange(opt.value)}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${syncInterval === opt.value ? 'text-ci-blue font-bold' : 'text-slate-600 dark:text-slate-300'}`}
                      >
                        {opt.label}
                      </button>
                    ))}

                    <div className="border-t border-slate-100 dark:border-slate-700/50 mt-2"></div>
                    <div className="px-4 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700/50 mt-2">Client Upload</div>
                    <div className="px-4 py-3 space-y-3">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Client / Location ID</span>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={uploadClientId}
                            onChange={(event) => setUploadClientId(event.target.value)}
                            onClick={(event) => event.stopPropagation()}
                            placeholder="hdc-main"
                            className="min-w-0 flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-sidebar dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition-colors focus:border-ci-blue focus:bg-white dark:focus:bg-slate-950"
                          />
                          <button
                            type="button"
                            onClick={() => handleSelectUploadClient(uploadClientId)}
                            className="rounded-lg bg-slate-700 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white transition-all hover:bg-slate-900 dark:bg-slate-600 dark:hover:bg-slate-500"
                          >
                            Use
                          </button>
                        </div>
                      </label>

                      {uploadClients.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {uploadClients.map((client) => (
                            <button
                              key={client.client_id}
                              type="button"
                              onClick={() => handleSelectUploadClient(client.client_id)}
                              className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide transition-colors ${
                                uploadClientId === client.client_id
                                  ? 'border-ci-blue bg-blue-50 text-ci-blue dark:bg-blue-500/10 dark:text-blue-300'
                                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                              }`}
                            >
                              {client.client_id}
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-2">
                        {DATA_SOURCE_ITEMS.map((source) => {
                          const currentClient = uploadClients.find((client) => client.client_id === uploadClientId);
                          const fileInfo = currentClient?.files?.[source.key];
                          return (
                            <div key={`upload-${source.key}`} className="grid grid-cols-[1fr_auto] gap-2 rounded-md bg-white dark:bg-slate-800 px-2 py-2">
                              <div className="min-w-0">
                                <div className="text-[11px] font-black uppercase tracking-wide text-sidebar dark:text-slate-100">{source.label}</div>
                                <div className="mt-0.5 truncate text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                                  {fileInfo?.exists ? `${source.fileName} • ${fileInfo.modified_at}` : `Waiting for ${source.fileName}`}
                                </div>
                              </div>
                              <label className={`cursor-pointer rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white transition-colors ${
                                uploadingSource === source.key ? 'bg-slate-400' : 'bg-ci-blue hover:bg-ci-blue-dark'
                              }`}>
                                {uploadingSource === source.key ? 'Uploading' : 'Upload'}
                                <input
                                  type="file"
                                  accept=".xlsx"
                                  className="hidden"
                                  disabled={uploadingSource !== null || isResettingUploadClient}
                                  onChange={(event) => {
                                    handleUploadFile(source.key, event.target.files?.[0] || null);
                                    event.target.value = '';
                                  }}
                                />
                              </label>
                            </div>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        onClick={handleResetUploadClient}
                        disabled={isResettingUploadClient || uploadingSource !== null}
                        className="w-full rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-900/50 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                      >
                        {isResettingUploadClient ? 'Resetting...' : 'Reset Uploaded Files'}
                      </button>

                      <div className={`text-[10px] font-black uppercase tracking-wide ${uploadStatusClassName}`}>
                        {uploadStatus.message}
                      </div>
                    </div>

                    <div className="border-t border-slate-100 dark:border-slate-700/50 mt-2"></div>
                    <div className="px-4 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700/50 mt-2">Theme</div>
                    <button 
                      onClick={() => { setIsDarkMode(!isDarkMode); setIsSettingsOpen(false); }}
                      className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300 flex justify-between items-center"
                    >
                      <span>Dark Mode</span>
                      <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${isDarkMode ? 'bg-ci-blue' : 'bg-slate-300 dark:bg-slate-600'}`}>
                        <div className={`w-3 h-3 bg-white rounded-full transition-transform ${isDarkMode ? 'translate-x-4' : ''}`}></div>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Content Body */}
          <div className="px-6 pt-6 pb-4 flex-1 flex flex-col gap-4 overflow-hidden">

            {/* Tri-Section Layout: Inbound | Pick | Outbound */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
              
              {/* 1. INBOUND DETAILED VIEW (Left Column) */}
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <InboundProgress isDarkMode={isDarkMode} inboundData={data?.inbound} />
              </div>

              {/* 2. PICK SECTION (Middle Column) */}
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden min-h-0 transition-colors duration-300">
                <div className="p-4 border-b border-slate-100 dark:border-slate-700/50 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-md"><TrendingUp size={16} /></div>
                    <h3 className="font-extrabold text-sidebar dark:text-white text-sm uppercase tracking-wide">2. Pick</h3>
                  </div>
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 px-2 py-1 rounded-full">Picking</span>
                </div>
                
                {/* 100% Stacked Bar Chart Area (Single Bar) */}
                <div className="mx-3 mt-3 h-[112px] shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 px-3 py-1.5 flex flex-col justify-center">
                  {data && (
                    <div className="flex h-full flex-col justify-center gap-2">
                      <div className="flex h-11 w-full overflow-hidden rounded-lg bg-slate-200 dark:bg-slate-700 ring-1 ring-slate-200 dark:ring-slate-600">
                        {pickChartSegments.map((segment) => {
                          const percent = getPickChartPercent(segment.value);
                          return (
                            <div
                              key={`pick-chart-${segment.name}`}
                              className={`flex h-full min-w-0 items-center justify-center overflow-hidden transition-[width] duration-[1500ms] ease-in-out ${segment.radius}`}
                              style={{ width: `${percent}%`, backgroundColor: segment.color }}
                              title={`${segment.name}: ${segment.value.toLocaleString()} MU (${percent.toFixed(1)}%)`}
                            >
                              {percent >= 9 && (
                                <span
                                  className="truncate px-1 text-[20px] font-black drop-shadow"
                                  style={{ color: pickProgressTheme.dataLabel }}
                                >
                                  {percent.toFixed(0)}%
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center justify-center gap-4 text-[12px] font-black text-slate-600 dark:text-slate-300">
                        {pickChartSegments.map((segment) => (
                          <div key={`pick-legend-${segment.name}`} className="flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: segment.color }}></span>
                            <span>{segment.name}: {segment.value.toLocaleString()} MU</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Table Area - Updated Headers */}
                <div className="mx-3 mt-3 mb-3 flex-1 min-h-0 overflow-y-auto flex flex-col rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-2">
                  <div className="shrink-0 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
                    <table className="w-full text-left border-collapse table-fixed">
                      <thead className="bg-[#1F4E79] text-white sticky top-0">
                        <tr className="text-[10px] uppercase font-extrabold tracking-wider border-b border-blue-200/30">
                          <th className="py-3 px-3 w-[15%] border-r border-blue-200/30">Group</th>
                          <th className="py-3 px-3 w-[25%] border-r border-blue-200/30">Loading Date</th>
                          <th className="py-3 px-3 w-[25%] border-r border-blue-200/30">Group HDC</th>
                          <th className="py-3 px-3 w-[15%] text-center border-r border-blue-200/30">Status</th>
                          <th className="py-3 px-3 w-[20%] text-right leading-tight">Sum of<br/>Total MU</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data?.pick.table.slice(0, 5).map((row, idx, rows) => {
                          const previousRow = rows[idx - 1];
                          const isFirstGroupRow = !previousRow || previousRow.group !== row.group;
                          const isFirstLoadingDateRow = isFirstGroupRow || previousRow.loading_date !== row.loading_date;

                          return (
                            <tr key={idx} className={`border-b border-slate-200 dark:border-slate-700/50 last:border-0 text-[12px] font-bold text-sidebar dark:text-slate-200 hover:brightness-95 transition-colors ${row.status === 'Completed' ? 'bg-[#E6F2FF] dark:bg-blue-900/20' : 'bg-[#FCE4D6] dark:bg-orange-900/20'}`}>
                              <td className="py-3 px-3 font-mono text-ci-blue dark:text-blue-300 border-r border-slate-200/60 dark:border-slate-700/50">{isFirstGroupRow ? row.group : ''}</td>
                              <td className="py-3 px-3 border-r border-slate-200/60 dark:border-slate-700/50">{isFirstLoadingDateRow ? row.loading_date : ''}</td>
                              <td className="py-3 px-3 truncate border-r border-slate-200/60 dark:border-slate-700/50">{row.group_hdc}</td>
                              <td className="py-3 px-3 text-center border-r border-slate-200/60 dark:border-slate-700/50">
                                <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase ${
                                  row.status === 'Completed' 
                                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                                    : 'bg-yellow-100 dark:bg-yellow-900/30 text-amber-700 dark:text-amber-400'
                                }`}>
                                  {row.status}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-right font-mono text-blue-700 dark:text-blue-300">{row.sum_total_mu.toLocaleString()}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-2 shrink-0 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
                    <table className="w-full border-collapse table-fixed text-[12px] font-bold text-sidebar dark:text-slate-100">
                      <thead>
                        <tr className="bg-blue-50 dark:bg-slate-700 text-sidebar dark:text-white">
                          <th className="border border-blue-200 dark:border-slate-600 px-2 py-1.5 text-center" colSpan={4}>Product size HLE</th>
                        </tr>
                        <tr className="bg-[#1F4E79] text-white">
                          <th className="w-[20%] border border-blue-200/30 px-2 py-1.5 text-left">
                            <span className="flex items-center justify-between gap-1">
                              Size
                            </span>
                          </th>
                          <th className="w-[24%] border border-blue-200/30 px-2 py-1.5 text-left">
                            <span className="flex items-center justify-between gap-1">
                              Pick
                            </span>
                          </th>
                          <th className="w-[28%] border border-blue-200/30 px-2 py-1.5 text-right">Sum of Total MU</th>
                          <th className="w-[28%] border border-blue-200/30 px-2 py-1.5 text-right">Percentage %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pickSecondTableRowsBySize.map(({ size, rows }) => (
                          <Fragment key={size}>
                            {rows.length > 0 ? (
                              rows.map((row, idx) => (
                                <tr key={`${row.size}-${row.picked}-${idx}`} className={`${row.picked === 'Completed' ? 'bg-white dark:bg-slate-800' : 'bg-[#FCE4D6] dark:bg-orange-900/20'}`}>
                                  <td className="border border-blue-200 dark:border-slate-600 px-2 py-1.5 text-left font-black">{idx === 0 ? size : ''}</td>
                                  <td className="border border-blue-200 dark:border-slate-600 px-2 py-1.5 text-left text-green-700 dark:text-green-300">{row.picked}</td>
                                  <td className="border border-blue-200 dark:border-slate-600 px-2 py-1.5 text-right font-mono">{row.totalMu.toLocaleString()}</td>
                                  <td className="border border-blue-200 dark:border-slate-600 px-2 py-1.5">
                                    <div className="flex items-center gap-2">
                                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                                        <div
                                          className={`h-full rounded-full transition-[width] duration-[1300ms] ease-in-out ${row.picked === 'Completed' ? 'bg-green-500' : 'bg-amber-500'}`}
                                          style={{ width: `${getPickSecondPercentValue(row.totalMu)}%` }}
                                        ></div>
                                      </div>
                                      <span className="w-12 text-right font-mono text-[11px]">{formatPickSecondPercent(row.totalMu)}</span>
                                    </div>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr className="bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500">
                                <td className="border border-blue-200 dark:border-slate-600 px-2 py-1.5 text-left font-black">{size}</td>
                                <td className="border border-blue-200 dark:border-slate-600 px-2 py-1.5 text-left">No data</td>
                                <td className="border border-blue-200 dark:border-slate-600 px-2 py-1.5 text-right font-mono">0</td>
                                <td className="border border-blue-200 dark:border-slate-600 px-2 py-1.5">
                                  <div className="flex items-center gap-2">
                                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700"></div>
                                    <span className="w-12 text-right font-mono text-[11px]">0.00%</span>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                        <tr className="bg-yellow-300 dark:bg-yellow-500 text-sidebar font-black">
                          <td className="border border-blue-200 dark:border-slate-600 px-2 py-1.5 text-left" colSpan={2}>Grand Total</td>
                          <td className="border border-blue-200 dark:border-slate-600 px-2 py-1.5 text-right font-mono">{pickSecondTableTotal.toLocaleString()}</td>
                          <td className="border border-blue-200 dark:border-slate-600 px-2 py-1.5">
                            <div className="flex items-center gap-2">
                              <div className="h-2 flex-1 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-900/40">
                                <div className="h-full rounded-full bg-blue-600 dark:bg-blue-400 transition-[width] duration-[1300ms] ease-in-out" style={{ width: `${getPickSecondPercentValue(pickSecondTableTotal)}%` }}></div>
                              </div>
                              <span className="w-12 text-right font-mono text-[11px]">{formatPickSecondPercent(pickSecondTableTotal)}</span>
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* 3. OUTBOUND SECTION (Right Column) */}
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden min-h-0 transition-colors duration-300">
                <div className="relative p-4 border-b border-slate-100 dark:border-slate-700/50 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
                  {outboundPages.length > 1 && (
                    <div className="absolute left-0 right-0 top-0 h-1 bg-slate-200/70 dark:bg-slate-700/70">
                      <div
                        className="h-full bg-emerald-500 transition-[width] duration-1000 ease-linear"
                        style={{ width: `${outboundSlideProgress}%` }}
                      ></div>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-md"><ArrowUpFromLine size={16} /></div>
                    <h3 className="font-extrabold text-sidebar dark:text-white text-sm uppercase tracking-wide">3. Outbound</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1">
                      {outboundPages.map((page, idx) => (
                        <span
                          key={`${page.key}-dot`}
                          className={`h-1.5 rounded-full transition-all duration-500 ${idx === outboundPageIndex % outboundPages.length ? 'w-5 bg-emerald-500' : 'w-1.5 bg-slate-300 dark:bg-slate-600'}`}
                        ></span>
                      ))}
                    </div>
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 rounded-full">Dispatch • {outboundCurrentPage.title}</span>
                  </div>
                </div>
                <div key={outboundCurrentPage.key} className="flex-1 overflow-y-auto flex flex-col gap-3 p-3 border-t border-slate-100 dark:border-slate-700/50 animate-outbound-page">
                  <div className="h-[154px] shrink-0 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 px-3 py-3">
                    <div className="grid h-[108px] grid-cols-[112px_minmax(0,1fr)] gap-2 items-center">
                      <div className="grid h-[96px] grid-rows-2 gap-2 text-[11px] font-black text-sidebar dark:text-slate-100">
                        {outboundPlanSummary.map((item) => (
                          <div key={`${item.label}-chart-label`} className="flex items-center justify-start text-left leading-tight">
                            {item.label}
                          </div>
                        ))}
                      </div>
                      <Chart
                        options={outboundSummaryChartOptions}
                        series={outboundSummaryChartSeries}
                        type="bar"
                        height="104"
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-center gap-5 text-[10px] font-black text-slate-600 dark:text-slate-300">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm bg-sky-500"></span>
                        <span>Plan</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500"></span>
                        <span>Completed</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm bg-amber-500"></span>
                        <span>Pending</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-1 shrink-0 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
                    <table className="w-full border-collapse table-fixed text-[12px] font-black text-sidebar dark:text-slate-100">
                      <tbody>
                        <tr>
                          {outboundPlanSummary.map((item) => (
                            <Fragment key={`${item.label}-total`}>
                              <th className="w-[25%] border border-blue-200 dark:border-slate-600 bg-[#1F4E79] px-2 py-2 text-left text-white">{item.label}</th>
                              <td className="w-[25%] border border-blue-100 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-2 text-center font-mono">{item.total.toLocaleString()}</td>
                            </Fragment>
                          ))}
                        </tr>
                        <tr>
                          {outboundPlanSummary.map((item) => (
                            <Fragment key={`${item.label}-pending`}>
                              <th className="border border-amber-200 dark:border-slate-600 bg-amber-50 dark:bg-amber-900/30 px-2 py-2 text-left text-red-600 dark:text-amber-300">Pending</th>
                              <td className="border border-amber-100 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-2 text-center font-mono text-red-600 dark:text-amber-300">{item.pending.toLocaleString()}</td>
                            </Fragment>
                          ))}
                        </tr>
                        <tr>
                          {outboundPlanSummary.map((item) => (
                            <Fragment key={`${item.label}-completed`}>
                              <th className="border border-green-200 dark:border-slate-600 bg-green-50 dark:bg-green-900/30 px-2 py-2 text-left text-green-700 dark:text-green-300">Completed</th>
                              <td className="border border-green-100 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-2 text-center font-mono dark:text-green-300">{item.completed.toLocaleString()}</td>
                            </Fragment>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="flex-1 min-h-[260px] overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
                    <table className="h-full w-full border-collapse table-fixed text-[11px] font-black text-sidebar dark:text-slate-100">
                      <thead>
                        <tr className="bg-[#1F4E79] text-white">
                          <th className="w-[16%] border border-blue-200/30 dark:border-slate-600 px-2 py-2 text-center" rowSpan={2}>Site</th>
                          <th className="w-[24%] border border-blue-200/30 dark:border-slate-600 px-2 py-2 text-center" rowSpan={2}>Plan Load</th>
                          <th className="w-[16%] border border-blue-200/30 dark:border-slate-600 px-2 py-2 text-center" rowSpan={2}>Plan Load DO</th>
                          <th className="w-[22%] border border-blue-200/30 dark:border-slate-600 px-2 py-1.5 text-center" colSpan={2}>Pending</th>
                          <th className="w-[22%] border border-blue-200/30 dark:border-slate-600 px-2 py-1.5 text-center" colSpan={2}>Completed</th>
                        </tr>
                        <tr className="bg-slate-50 dark:bg-slate-800 text-sidebar dark:text-white">
                          <th className="border border-slate-200 dark:border-slate-600 px-2 py-2 text-center">DO</th>
                          <th className="border border-slate-200 dark:border-slate-600 px-2 py-2 text-center">QTY MU</th>
                          <th className="border border-slate-200 dark:border-slate-600 px-2 py-2 text-center">DO</th>
                          <th className="border border-slate-200 dark:border-slate-600 px-2 py-2 text-center">QTY MU</th>
                        </tr>
                      </thead>
                      <tbody>
                        {outboundPlanRows.map((row, idx) => (
                          <tr key={row.planLoad}>
                            {idx === 0 && (
                              <td className="border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-1 py-2 text-center text-[30px] font-black tracking-wide text-[#5B9BD5] dark:text-blue-300" rowSpan={outboundPlanRows.length}>{row.site || 'HDC'}</td>
                            )}
                            <td className="border border-blue-100 dark:border-slate-600 bg-blue-50 dark:bg-blue-900/30 px-2 py-1.5 text-left">{row.planLoad}</td>
                            <td className="border border-blue-100 dark:border-slate-600 bg-blue-50 dark:bg-blue-900/30 px-2 py-1.5 text-center font-mono">{row.planLoadDo.toLocaleString()}</td>
                            <td className="border border-amber-100 dark:border-slate-600 bg-amber-50 dark:bg-yellow-900/30 px-2 py-1.5 text-center font-mono text-red-600 dark:text-red-400">{row.pendingDo.toLocaleString()}</td>
                            <td className="border border-amber-100 dark:border-slate-600 bg-amber-50 dark:bg-yellow-900/30 px-2 py-1.5 text-center font-mono text-red-600 dark:text-red-400">{row.pendingMu.toLocaleString()}</td>
                            <td className="border border-green-100 dark:border-slate-600 bg-green-50 dark:bg-green-900/30 px-2 py-1.5 text-center font-mono text-green-900 dark:text-green-300">{row.completedDo.toLocaleString()}</td>
                            <td className="border border-green-100 dark:border-slate-600 bg-green-50 dark:bg-green-900/30 px-2 py-1.5 text-center font-mono text-green-900 dark:text-green-300">{row.completedMu.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

            </div>

            <footer className="text-center mt-[-4px] shrink-0">
              <p className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-bold transition-colors">
                © 2026 copyright reserved , CJ Logistics , IT HDC.
              </p>
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
