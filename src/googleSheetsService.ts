import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut
} from 'firebase/auth';
import { SpreadsheetInfo, SpreadsheetRow } from './types';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/userinfo.email');
provider.addScope('https://www.googleapis.com/auth/userinfo.profile');

let isSigningIn = false;
let cachedAccessToken: string | null = null;

// Initialize auth state listener
export const initAuth = (
  onAuthSuccess: (user: User, token: string) => void,
  onAuthFailure: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        onAuthSuccess(user, cachedAccessToken);
      } else {
        // If there's a user but no cached token, they might have refreshed the page.
        // In firebase client-side auth, we can get a token with credential or redirect if we came from one, 
        // but if just restored, we can fetch a fresh credential/token if needed, or ask for login if the token can't be fetched automatically.
        // Usually, cachedAccessToken begins null after refresh, so they must click sign-in once to populate.
        // However, to keep it smooth, we show a button if there's no stored cachedAccessToken.
        onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      onAuthFailure();
    }
  });
};

// Sign in to retrieve auth session and Google API token
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to retrieve access token from Google sign in');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const logout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};

// Fetch Google Sheets structure and metadata
export const fetchSpreadsheetInfo = async (
  spreadsheetId: string,
  token: string
): Promise<SpreadsheetInfo> => {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties(title,sheetId)`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!res.ok) {
    const errorDetails = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(errorDetails.error?.message || 'Failed to fetch spreadsheet metadata');
  }

  const data = await res.json();
  const sheets = (data.sheets || []).map((s: any) => ({
    title: s.properties.title,
    sheetId: s.properties.sheetId
  }));

  return {
    title: data.properties.title,
    sheets
  };
};

// Append a row to the Google Sheet
export const appendRowToSpreadsheet = async (
  spreadsheetId: string,
  sheetName: string,
  rowData: (string | number)[],
  token: string
) => {
  const range = `${sheetName}!A:H`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;
  
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      values: [rowData]
    })
  });

  if (!res.ok) {
    const errorDetails = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(errorDetails.error?.message || 'Failed to submit data to spreadsheet');
  }

  return await res.json();
};

// Fetch recent rows from the Google Sheet
export const fetchRecentRows = async (
  spreadsheetId: string,
  sheetName: string,
  token: string
): Promise<{ headers: string[]; rows: SpreadsheetRow[] }> => {
  // Fetch columns A through H for upper rows
  const range = `${sheetName}!A1:I51`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!res.ok) {
    const errorDetails = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(errorDetails.error?.message || 'Failed to fetch spreadsheet rows');
  }

  const data = await res.json();
  const values = data.values || [];

  if (values.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = values[0];
  const items: SpreadsheetRow[] = [];

  // Parse remaining rows
  for (let i = 1; i < values.length; i++) {
    const val = values[i];
    items.push({
      nama: val[0] || '',
      brand: val[1] || '',
      item: val[2] || '',
      qty: val[3] || '',
      harga: val[4] || '',
      feeJastip: val[5] || '',
      total: val[6] || '',
      payment: val[7] || '',
      timestamp: val[8] || ''
    });
  }

  return {
    headers,
    rows: items
  };
};

// Ensure header exists if sheet is empty
export const ensureSpreadsheetHeaders = async (
  spreadsheetId: string,
  sheetName: string,
  headerRow: string[],
  token: string
) => {
  // Let's check first row (A1:H1)
  const range = `${sheetName}!A1:H1`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const checkRes = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (checkRes.ok) {
    const data = await checkRes.json();
    if (data.values && data.values.length > 0) {
      // Headers exist already
      return;
    }
  }

  // Write headers if they do not exist
  const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  await fetch(updateUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      values: [headerRow]
    })
  });
};
