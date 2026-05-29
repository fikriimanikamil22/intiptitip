import { useState, useEffect, FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileSpreadsheet,
  Plus,
  Minus,
  CheckCircle,
  AlertCircle,
  LogOut,
  User as UserIcon,
  ChevronsUpDown,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  CreditCard,
  ShoppingBag,
  Clock,
  RefreshCw,
  Search
} from 'lucide-react';
import { JastipFormData, FormErrors, SpreadsheetInfo, SpreadsheetRow } from './types';
import {
  googleSignIn,
  initAuth,
  logout,
  fetchSpreadsheetInfo,
  appendRowToSpreadsheet,
  fetchRecentRows,
  ensureSpreadsheetHeaders
} from './googleSheetsService';
import { User } from 'firebase/auth';

const SPREADSHEET_ID = '1BbPyIs7iEHJEnoNs0Qx832jsPqm9fGoh0BKkJe-ZnRM';
const DEFAULT_BRAND_TAGS = [
  'Zara', 'Uniqlo', 'Gentle Woman', 'Chanel', 'Nike', 'Adidas', 
  'Marhen.J', 'Starbucks', 'Pop Mart', 'Sephora', 'Dior', 'Charles & Keith'
];
const PAYMENT_METHODS = [
  { id: 'Transfer Bank', label: 'Transfer Bank', icon: '🏦' },
  { id: 'E-Wallet (Gopay/OVO)', label: 'E-Wallet', icon: '📱' },
  { id: 'Cash (COD)', label: 'Tunai / Cash', icon: '💵' },
  { id: 'Credit Card', label: 'Kartu Kredit', icon: '💳' }
];

export default function App() {
  // Auth States
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [authChecking, setAuthChecking] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Sheet States
  const [sheetInfo, setSheetInfo] = useState<SpreadsheetInfo | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [recentEntries, setRecentEntries] = useState<SpreadsheetRow[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);

  // Form States
  const [formData, setFormData] = useState<JastipFormData>({
    nama: '',
    brand: '',
    item: '',
    qty: 1,
    harga: 0,
    feeJastip: 0,
    total: 0,
    payment: 'Transfer Bank'
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // UI state
  const [showRecentTable, setShowRecentTable] = useState(true);
  const [brandSearch, setBrandSearch] = useState('');

  // Automatically calculate TOTAL on input changes
  useEffect(() => {
    const calculatedTotal = (formData.qty * formData.harga) + formData.feeJastip;
    setFormData((prev) => ({ ...prev, total: calculatedTotal }));
  }, [formData.qty, formData.harga, formData.feeJastip]);

  // Auth State listener on mount
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, accessToken) => {
        setUser(currentUser);
        setToken(accessToken);
        setNeedsAuth(false);
        setAuthChecking(false);
        setAuthError(null);
        loadSheetMetadata(accessToken);
      },
      () => {
        setNeedsAuth(true);
        setAuthChecking(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Fetch sheet metadata and structures once authenticated
  const loadSheetMetadata = async (accessToken: string) => {
    try {
      const info = await fetchSpreadsheetInfo(SPREADSHEET_ID, accessToken);
      setSheetInfo(info);
      
      // Auto-select the first sheet
      if (info.sheets.length > 0) {
        const firstSheetName = info.sheets[0].title;
        setSelectedSheet(firstSheetName);
        loadRecentRows(firstSheetName, accessToken);
      }
    } catch (err: any) {
      console.error('Error loading spreadsheet:', err);
      setAuthError(`Gagal membaca spreadsheet: ${err.message || err}. Pastikan Anda memiliki izin akses Spreadsheet.`);
    }
  };

  const loadRecentRows = async (sheetName: string, accessToken: string) => {
    setIsLoadingRecent(true);
    try {
      const data = await fetchRecentRows(SPREADSHEET_ID, sheetName, accessToken);
      setRecentEntries(data.rows.reverse()); // Show newest first
    } catch (err) {
      console.error('Error fetching rows:', err);
    } finally {
      setIsLoadingRecent(false);
    }
  };

  const handleSignIn = async () => {
    setAuthChecking(true);
    setAuthError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setToken(result.accessToken);
        setNeedsAuth(false);
        await loadSheetMetadata(result.accessToken);
      }
    } catch (err: any) {
      console.error('Login failed:', err);
      setAuthError(`Autentikasi Gagal: ${err.message || 'Izin Google API dibatalkan atau tidak diberikan.'}`);
    } finally {
      setAuthChecking(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    setUser(null);
    setToken(null);
    setSheetInfo(null);
    setRecentEntries([]);
    setNeedsAuth(true);
  };

  // Rupiah Currency Formatter Helper
  const rp = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(num);
  };

  // Custom live inputs validation
  const validateForm = (): boolean => {
    const tempErrors: FormErrors = {};
    if (!formData.nama.trim()) tempErrors.nama = 'Nama pembeli harus diisi';
    if (!formData.brand.trim()) tempErrors.brand = 'Brand harus diisi';
    if (!formData.item.trim()) tempErrors.item = 'Nama item barang harus diisi';
    if (formData.qty < 1) tempErrors.qty = 'Jumlah qty minimal harus 1';
    if (formData.harga < 0) tempErrors.harga = 'Harga barang tidak boleh negatif';
    if (formData.feeJastip < 0) tempErrors.feeJastip = 'Fee jastip tidak boleh negatif';

    setErrors(tempErrors);
    return Object.keys(tempErrors).length === 0;
  };

  // Handle Form Submission values mapping into Spreadsheet
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!token) {
      setErrorMessage('Token autentikasi tidak ditemukan. Harap login kembali.');
      return;
    }

    if (!selectedSheet) {
      setErrorMessage('Tidak ada lembar (sheet) yang dipilih untuk pengisian.');
      return;
    }

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Ensure columns header exist in sheet first to avoid blank sheets messiness
      const headers = ['Nama', 'BRAND', 'Item', 'Qty', 'HARGA', 'FEE JASTIP', 'TOTAL', 'PAYMENT', 'WAKTU INPUT'];
      await ensureSpreadsheetHeaders(SPREADSHEET_ID, selectedSheet, headers, token);

      // 2. Prepare row values
      const nowString = new Date().toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        dateStyle: 'medium',
        timeStyle: 'short'
      });

      // Insert clean row with proper numeric formats
      const row = [
        formData.nama,
        formData.brand,
        formData.item,
        formData.qty,
        formData.harga,
        formData.feeJastip,
        formData.total,
        formData.payment,
        nowString
      ];

      // 3. Make the API request
      await appendRowToSpreadsheet(SPREADSHEET_ID, selectedSheet, row, token);

      // Trigger success notification or actions
      setSubmitSuccess(true);
      
      // Reset form but preserve buyer name/payment options if they have multiple receipts
      setFormData((prev) => ({
        ...prev,
        brand: '',
        item: '',
        qty: 1,
        harga: 0,
        feeJastip: 0,
        total: 0
      }));

      // Reload recent rows
      loadRecentRows(selectedSheet, token);

      // Dismiss success screen after 3 seconds
      setTimeout(() => {
        setSubmitSuccess(false);
      }, 3500);

    } catch (err: any) {
      console.error('Error submitting form:', err);
      setErrorMessage(err.message || 'Terjadi kesalahan saat menyinkronkan data ke google sheets.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredBrandTags = DEFAULT_BRAND_TAGS.filter(tag => 
    tag.toLowerCase().includes(brandSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased pb-20 selection:bg-rose-100 selection:text-rose-900">
      
      {/* 1. TOP NAV BAR */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div id="top-nav" className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="p-2.5 bg-rose-50 text-rose-500 rounded-xl">
              <ShoppingBag className="w-5 h-5 stroke-[2.5]" />
            </span>
            <div>
              <h1 className="font-semibold text-rose-600 tracking-tight leading-none text-base md:text-lg">Jastip Intiptitip</h1>
              <span className="text-slate-400 text-xs font-medium tracking-wide">FORM INPUT DATA SPREADSHEET</span>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <a 
              href={`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100/70 border border-emerald-100 text-xs font-semibold rounded-lg transition-all"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span className="hidden md:inline">Lihat Spreadsheet</span>
              <ExternalLink className="w-3 h-3" />
            </a>

            {!needsAuth && user && (
              <div className="flex items-center gap-2 border-l border-slate-150 pl-2 md:pl-4">
                <div className="hidden lg:flex flex-col items-end">
                  <span className="text-slate-700 text-xs font-semibold leading-tight">{user.displayName}</span>
                  <span className="text-slate-400 text-[10px] scale-95 origin-right">{user.email}</span>
                </div>
                {user.photoURL ? (
                  <img 
                    src={user.photoURL} 
                    alt={user.displayName || 'user'} 
                    className="w-8 h-8 rounded-full border border-slate-200"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-xs select-none">
                    {user.displayName?.charAt(0) || <UserIcon className="w-4 h-4" />}
                  </div>
                )}
                <button 
                  onClick={handleSignOut}
                  title="Logout Akun"
                  className="p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500 rounded-lg transition-colors cursor-pointer"
                >
                  <LogOut className="w-4.5 h-4.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-6">
        
        {/* CHECKING AUTHENTICATION SCREEN */}
        {authChecking ? (
          <div className="flex md:my-20 my-10 flex-col items-center justify-center p-12">
            <div className="relative flex items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900"></div>
              <ShoppingBag className="w-5 h-5 text-rose-400 absolute animate-pulse" />
            </div>
            <p className="text-slate-500 text-xs mt-4 font-mono">Memeriksa autentikasi Google...</p>
          </div>
        ) : needsAuth ? (
          
          /* 2. AUTHENTICATION LANDING SCREEN */
          <div id="auth-panel" className="max-w-md mx-auto my-12 bg-white rounded-3xl shadow-sm border border-slate-200/60 p-8 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-rose-400"></div>
            
            <div className="flex justify-center mb-6">
              <div className="p-4 bg-rose-50 text-rose-500 rounded-2xl relative">
                <FileSpreadsheet className="w-10 h-10 stroke-[1.5]" />
                <Plus className="w-5 h-5 absolute -bottom-1 -right-1 p-0.5 bg-rose-500 text-white rounded-full border-2 border-white" />
              </div>
            </div>

            <h2 className="text-2xl font-bold text-slate-900 tracking-tight mb-2">Hubungkan Jastip Intiptitip</h2>
            <p className="text-sm text-slate-500 leading-relaxed mb-8">
              Guna menyinkronkan pengisian data jastip ke dalam Google Spreadsheet terkait secara otomatis, silakan hubungkan dengan akun Google Anda terlebih dahulu.
            </p>

            {authError && (
              <div className="mb-6 p-4 bg-rose-50 text-rose-700 rounded-2xl text-xs text-left flex items-start gap-2.5 border border-rose-100">
                <AlertCircle className="w-5 h-5 shrink-0 text-rose-500 mt-0.5" />
                <span className="leading-relaxed">{authError}</span>
              </div>
            )}

            <button
              onClick={handleSignIn}
              id="btn-google-signin"
              className="w-full flex items-center justify-center gap-3 bg-slate-950 text-white hover:bg-slate-900 active:scale-98 py-3.5 px-6 rounded-2xl font-semibold shadow-md shadow-slate-950/10 cursor-pointer transition-all text-sm group"
            >
              <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5 shrink-0">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                <path fill="none" d="M0 0h48v48H0z"></path>
              </svg>
              <span>Hubungkan Akun Google</span>
              <ChevronRight className="w-4 h-4 ml-auto text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </button>

            <div className="mt-8 border-t border-slate-100 pt-6 flex flex-col items-center gap-1">
              <span className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">TARGET WORKBOOK</span>
              <a 
                href={`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-rose-500 hover:text-rose-600 font-medium underline inline-flex items-center gap-1"
              >
                1BbPyIs7iEHJEnoNs0Q... <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>
        ) : (
          
          /* 3. CORE APPLICATION LAYOUT */
          <div>
            
            {/* SPREADSHEET SETTINGS BANNER BAR */}
            <div className="bg-white rounded-2xl shadow-xs border border-slate-200/60 p-4 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 text-xs sm:text-sm">
                    {sheetInfo?.title || 'Memuat Spreadsheet...'}
                  </h3>
                  <p className="text-slate-400 text-2xs md:text-xs">
                    Workbook ID: <span className="font-mono text-slate-500">{SPREADSHEET_ID.substring(0, 16)}...</span>
                  </p>
                </div>
              </div>

              {sheetInfo && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">PILIH SHEET:</span>
                  <div className="relative">
                    <select
                      value={selectedSheet}
                      onChange={(e) => {
                        setSelectedSheet(e.target.value);
                        loadRecentRows(e.target.value, token || '');
                      }}
                      className="appearance-none bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold py-1.5 pl-3 pr-8 rounded-lg outline-none focus:border-rose-400 focus:bg-white transition-all cursor-pointer"
                    >
                      {sheetInfo.sheets.map((s) => (
                        <option key={s.sheetId} value={s.title}>
                          {s.title}
                        </option>
                      ))}
                    </select>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                  <button
                    onClick={() => loadRecentRows(selectedSheet, token || '')}
                    disabled={isLoadingRecent}
                    title="Refresh data sheet"
                    className="p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-705 rounded-lg transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoadingRecent ? 'animate-spin text-rose-500' : ''}`} />
                  </button>
                </div>
              )}
            </div>

            {/* CENTERED LAYOUT FOR A CLEAN SIMPLE FORM */}
            <div className="max-w-2xl mx-auto">
              <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-sm border border-slate-200/60 p-6 md:p-8 relative">
                  
                  <div className="mb-6">
                    <h2 className="text-lg font-bold text-slate-900 tracking-tight">Formulir Manual Input Jastip</h2>
                    <p className="text-xs text-slate-400">Pastikan informasi pelanggan dan nominal diisi secara benar.</p>
                  </div>

                  {errorMessage && (
                    <div className="mb-6 p-4 bg-rose-50 text-rose-700 rounded-2xl text-xs flex items-start gap-2.5 border border-rose-100">
                      <AlertCircle className="w-5 h-5 shrink-0 text-rose-500 mt-0.5" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  <div className="space-y-4">
                    
                    {/* INPUT 1: NAMA */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500 tracking-wide uppercase">Nama Pelanggan / Pembeli *</label>
                      <input 
                        type="text"
                        placeholder="Contoh: Amanda Olivia"
                        value={formData.nama}
                        onChange={(e) => {
                          setFormData({ ...formData, nama: e.target.value });
                          if (errors.nama) setErrors({ ...errors, nama: undefined });
                        }}
                        className={`w-full bg-slate-50/50 hover:bg-slate-50/100 focus:bg-white text-slate-800 placeholder-slate-400 text-sm font-medium px-4 py-3 rounded-xl border ${errors.nama ? 'border-rose-400 ring-1 ring-rose-100' : 'border-slate-200 focus:border-rose-400'} outline-none transition-all`}
                      />
                      {errors.nama && (
                        <p className="text-2xs text-rose-500 flex items-center gap-1 font-medium select-none">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {errors.nama}
                        </p>
                      )}
                    </div>

                    {/* INPUT 2: BRAND SEARCH + FREE FORM */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500 tracking-wide uppercase">Brand Jastip *</label>
                      <input 
                        type="text"
                        placeholder="Ketik Brand, misal: Uniqlo, Marhen.J"
                        value={formData.brand}
                        onChange={(e) => {
                          setFormData({ ...formData, brand: e.target.value });
                          setBrandSearch(e.target.value);
                          if (errors.brand) setErrors({ ...errors, brand: undefined });
                        }}
                        className={`w-full bg-slate-50/50 hover:bg-slate-50/100 focus:bg-white text-slate-800 placeholder-slate-400 text-sm font-medium px-4 py-3 rounded-xl border ${errors.brand ? 'border-rose-400 ring-1 ring-rose-100' : 'border-slate-200 focus:border-rose-400'} outline-none transition-all`}
                      />
                      {errors.brand && (
                        <p className="text-2xs text-rose-500 flex items-center gap-1 font-medium select-none">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {errors.brand}
                        </p>
                      )}

                      {/* BRAND QUICK SUGGESTIONS */}
                      <div className="pt-1.5">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-2">Pilih brand populer:</span>
                        <div className="flex flex-wrap gap-1.5 max-h-[100px] overflow-y-auto pr-1">
                          {filteredBrandTags.slice(0, 12).map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => {
                                setFormData({ ...formData, brand: tag });
                                setBrandSearch(tag);
                                if (errors.brand) setErrors({ ...errors, brand: undefined });
                              }}
                              className={`px-2.5 py-1 text-xs rounded-full border border-slate-200/60 font-medium transition-all cursor-pointer ${formData.brand === tag ? 'bg-rose-50 text-rose-600 border-rose-200 font-semibold' : 'bg-white hover:bg-slate-50 text-slate-600'}`}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* INPUT 3: DETIL ITEM */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500 tracking-wide uppercase">Nama Item / Barang *</label>
                      <input 
                        type="text"
                        placeholder="Contoh: Air Force 1 Retro White"
                        value={formData.item}
                        onChange={(e) => {
                          setFormData({ ...formData, item: e.target.value });
                          if (errors.item) setErrors({ ...errors, item: undefined });
                        }}
                        className={`w-full bg-slate-50/50 hover:bg-slate-50/100 focus:bg-white text-slate-800 placeholder-slate-400 text-sm font-medium px-4 py-3 rounded-xl border ${errors.item ? 'border-rose-400 ring-1 ring-rose-100' : 'border-slate-200 focus:border-rose-400'} outline-none transition-all`}
                      />
                      {errors.item && (
                        <p className="text-2xs text-rose-500 flex items-center gap-1 font-medium select-none">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {errors.item}
                        </p>
                      )}
                    </div>

                    {/* INPUTS ROW: QTY | HARGA | FEE */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                      
                      {/* QTY */}
                      <div className="space-y-1.5 md:col-span-3">
                        <label className="text-xs font-bold text-slate-500 tracking-wide uppercase">Qty *</label>
                        <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50 h-[46px]">
                          <button
                            type="button"
                            onClick={() => {
                              if (formData.qty > 1) {
                                setFormData({ ...formData, qty: formData.qty - 1 });
                              }
                            }}
                            className="w-12 h-full flex items-center justify-center hover:bg-slate-150 text-slate-600 transition-colors cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <input 
                            type="number"
                            min="1"
                            value={formData.qty}
                            onChange={(e) => {
                              const v = Math.max(1, parseInt(e.target.value) || 1);
                              setFormData({ ...formData, qty: v });
                            }}
                            className="w-full text-center bg-transparent text-slate-800 text-sm font-bold border-none outline-none focus:ring-0 p-0"
                          />
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, qty: formData.qty + 1 })}
                            className="w-12 h-full flex items-center justify-center hover:bg-slate-150 text-slate-600 transition-colors cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* HARGA */}
                      <div className="space-y-1.5 md:col-span-4">
                        <label className="text-xs font-bold text-slate-500 tracking-wide uppercase">Harga (Rp) *</label>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">Rp</span>
                          <input 
                            type="number"
                            min="0"
                            placeholder="0"
                            value={formData.harga || ''}
                            onChange={(e) => {
                              const val = Math.max(0, parseFloat(e.target.value) || 0);
                              setFormData({ ...formData, harga: val });
                              if (errors.harga) setErrors({ ...errors, harga: undefined });
                            }}
                            className="w-full bg-slate-50/50 hover:bg-slate-50/100 focus:bg-white text-slate-800 placeholder-slate-400 text-sm font-bold pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-rose-400 outline-none transition-all h-[46px]"
                          />
                        </div>
                        {formData.harga > 0 && (
                          <span className="text-2xs font-bold text-slate-400 tracking-wide block truncate pl-1">
                            {rp(formData.harga)}
                          </span>
                        )}
                      </div>

                      {/* FEE JASTIP */}
                      <div className="space-y-1.5 md:col-span-5">
                        <label className="text-xs font-bold text-slate-500 tracking-wide uppercase">Fee Jastip (Rp) *</label>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">Rp</span>
                          <input 
                            type="number"
                            min="0"
                            placeholder="0"
                            value={formData.feeJastip || ''}
                            onChange={(e) => {
                              const val = Math.max(0, parseFloat(e.target.value) || 0);
                              setFormData({ ...formData, feeJastip: val });
                              if (errors.feeJastip) setErrors({ ...errors, feeJastip: undefined });
                            }}
                            className="w-full bg-slate-50/50 hover:bg-slate-50/100 focus:bg-white text-slate-800 placeholder-slate-400 text-sm font-bold pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-rose-400 outline-none transition-all h-[46px]"
                          />
                        </div>
                        {formData.feeJastip > 0 && (
                          <span className="text-2xs font-bold text-slate-400 tracking-wide block truncate pl-1">
                            {rp(formData.feeJastip)}
                          </span>
                        )}
                      </div>

                    </div>

                    {/* INPUT 4: PAYMENT OPTIONS CARD CLUSTERS */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500 tracking-wide uppercase block mb-1">Metode Pembayaran</label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {PAYMENT_METHODS.map((pm) => (
                          <button
                            key={ pm.id}
                            type="button"
                            onClick={() => setFormData({ ...formData, payment: pm.id })}
                            className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${formData.payment === pm.id ? 'border-rose-400 bg-rose-50/40 text-rose-950 font-semibold ring-1 ring-rose-300/45 shadow-xs' : 'border-slate-200 bg-white hover:bg-slate-50/50 text-slate-700'}`}
                          >
                            <span className="text-lg">{pm.icon}</span>
                            <span className="text-[11px] leading-tight block uppercase tracking-wide font-bold">{pm.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                  </div>

                  {/* FORM SUBMIT TRIGGER */}
                  <div className="mt-8">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full relative flex items-center justify-center bg-rose-500 hover:bg-rose-600 disabled:bg-rose-300 text-white font-bold py-4 px-6 rounded-2xl cursor-pointer select-none active:scale-99 shadow-md shadow-rose-200 transition-all outline-none"
                    >
                      {isSubmitting ? (
                        <span className="flex items-center gap-2">
                          <RefreshCw className="w-5 h-5 animate-spin" />
                          <span>Mengirim Jastip ke Sheet...</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-base font-bold">
                          Kirim & Simpan Data Jastip
                        </span>
                      )}
                    </button>
                  </div>

                  {/* SUCCESS MODAL WRAPPER ANIMATION */}
                  <AnimatePresence>
                    {submitSuccess && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-white/95 rounded-3xl flex flex-col items-center justify-center p-8 text-center z-10"
                      >
                        <motion.div
                          initial={{ scale: 0.5, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.5, opacity: 0 }}
                          transition={{ type: 'spring', damping: 15 }}
                          className="w-16 h-16 bg-emerald-50 text-emerald-500 border border-emerald-100 rounded-full flex items-center justify-center mb-4 shadow"
                        >
                          <CheckCircle className="w-9 h-9 stroke-[2]" />
                        </motion.div>
                        <h3 className="text-xl font-bold text-slate-900 mb-1">Pengiriman Berhasil!</h3>
                        <p className="text-sm text-slate-500 max-w-sm mb-6 lead-relaxed">
                          Catatan transaksi jastip berhasil tersimpan & disinkronkan ke Google Sheet otomatis.
                        </p>
                        <div className="bg-slate-50 border border-slate-200/50 p-3 rounded-xl text-left scale-95 w-full max-w-xs font-mono text-[10px] space-y-1">
                          <div className="flex justify-between"><span className="text-slate-400">PELANGGAN:</span> <span className="font-semibold text-slate-700">{formData.nama || '-'}</span></div>
                          <div className="flex justify-between"><span className="text-slate-400">DATA ITEM:</span> <span className="font-semibold text-slate-700">{formData.brand} ({formData.item})</span></div>
                          <div className="flex justify-between"><span className="text-slate-400">TOTAL HARGA:</span> <span className="font-semibold text-slate-900">{rp(formData.total)}</span></div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                </form>
              </div>

            {/* 4. SPREADSHEET LOG TABLE */}
            <div className="bg-white rounded-3xl mt-8 shadow-xs border border-slate-200/60 overflow-hidden">
              <div 
                onClick={() => setShowRecentTable(!showRecentTable)}
                className="p-5 flex items-center justify-between border-b border-slate-100 cursor-pointer hover:bg-slate-50/50 select-none transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-rose-50 text-rose-500 rounded-lg">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-xs sm:text-sm">Riwayat Submission Terakhir (Maks 50 data terbaru)</h3>
                    <p className="text-[11px] text-slate-400">Data live dari Google Spreadsheet yang tersinkron.</p>
                  </div>
                </div>
                <button className="text-xs text-rose-500 font-semibold uppercase hover:text-rose-600 transition-colors">
                  {showRecentTable ? 'Sembunyikan' : 'Tampilkan'}
                </button>
              </div>

              {showRecentTable && (
                <div className="p-1 sm:p-4 overflow-x-auto">
                  {isLoadingRecent ? (
                    <div className="py-8 text-center flex flex-col items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500 mb-2"></div>
                      <span className="text-slate-400 text-xs">Memasang sinkronisasi sheet...</span>
                    </div>
                  ) : recentEntries.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-xs p-4 leading-relaxed">
                      Belum ada data jastip terisi di sheet <strong>{selectedSheet}</strong>.<br />
                      Silakan input data perdana Anda lewat formulir jastip di atas!
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs min-w-[700px]">
                      <thead>
                        <tr className="bg-slate-50 text-slate-550 border-b border-slate-150 font-bold uppercase tracking-wider">
                          <th className="py-3 px-4 rounded-l-lg">Pembeli / Nama</th>
                          <th className="py-3 px-4">Brand</th>
                          <th className="py-3 px-4">Item</th>
                          <th className="py-3 px-4 text-center">Qty</th>
                          <th className="py-3 px-4 text-right">Harga Satuan</th>
                          <th className="py-3 px-4 text-right">Fee Jastip</th>
                          <th className="py-3 px-4 text-right">Total</th>
                          <th className="py-3 px-4">Payment</th>
                          <th className="py-3 px-4 rounded-r-lg">Tanggal Input</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                        {recentEntries.map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-3.5 px-4 font-bold text-slate-900">{row.nama}</td>
                            <td className="py-3.5 px-4">
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-bold text-[10px] tracking-wide">
                                {row.brand}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 truncate max-w-[150px]">{row.item}</td>
                            <td className="py-3.5 px-4 text-center font-bold text-slate-900">{row.qty}</td>
                            <td className="py-3.5 px-4 text-right">{isNaN(Number(row.harga)) ? row.harga : rp(Number(row.harga))}</td>
                            <td className="py-3.5 px-4 text-right">{isNaN(Number(row.feeJastip)) ? row.feeJastip : rp(Number(row.feeJastip))}</td>
                            <td className="py-3.5 px-4 text-right font-bold text-rose-500">{isNaN(Number(row.total)) ? row.total : rp(Number(row.total))}</td>
                            <td className="py-3.5 px-4">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                row.payment.includes('Transfer') ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' :
                                row.payment.includes('Wallet') ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                                row.payment.includes('Cash') ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                                'bg-slate-50 text-slate-600 border border-slate-150'
                              }`}>
                                {row.payment}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-slate-400 text-3xs font-mono">{row.timestamp || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
