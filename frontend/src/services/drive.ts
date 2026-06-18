// Google Drive Integration & Simulator Storage

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  createdTime: string;
  size?: number;
  webViewLink?: string;
}

// In-memory access token cache
let googleAccessToken: string | null = null;
let googleUser: { name: string; email: string; picture?: string } | null = null;

// Simulated storage on local storage to preserve mock files
const SIMULATED_DRIVE_KEY = "meli_analytics_simulated_drive";

function getSimulatedFiles(): DriveFile[] {
  const stored = localStorage.getItem(SIMULATED_DRIVE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // Use defaults
    }
  }
  
  const defaults: DriveFile[] = [
    {
      id: "drive-mock-file-1",
      name: "meli_sku_costs_import.csv",
      mimeType: "text/csv",
      createdTime: new Date(Date.now() - 3600000 * 24).toISOString(), // 1 day ago
      size: 4256,
      webViewLink: "https://drive.google.com/open?id=drive-mock-file-1"
    },
    {
      id: "drive-mock-file-2",
      name: "backups_venda_junho_completo.json",
      mimeType: "application/json",
      createdTime: new Date(Date.now() - 3600000 * 4).toISOString(), // 4h ago
      size: 15320,
      webViewLink: "https://drive.google.com/open?id=drive-mock-file-2"
    },
    {
      id: "drive-mock-file-3",
      name: "Planilha_Precos_Simulados_BRL.xlsx",
      mimeType: "application/vnd.google-apps.spreadsheet",
      createdTime: new Date(Date.now() - 3600000 * 72).toISOString(), // 3 days ago
      size: 12500,
      webViewLink: "https://drive.google.com/open?id=drive-mock-file-3"
    }
  ];
  localStorage.setItem(SIMULATED_DRIVE_KEY, JSON.stringify(defaults));
  return defaults;
}

function saveSimulatedFiles(files: DriveFile[]) {
  localStorage.setItem(SIMULATED_DRIVE_KEY, JSON.stringify(files));
}

export function isGoogleConnected(): boolean {
  return googleAccessToken !== null || localStorage.getItem("google_drive_simulated_connected") === "true";
}

export function getConnectedUser() {
  if (googleUser) return googleUser;
  if (localStorage.getItem("google_drive_simulated_connected") === "true") {
    return {
      name: "Elias Robert (Simulado)",
      email: "eliasrobert45@gmail.com",
      picture: "https://api.dicebear.com/7.x/bottts/svg?seed=elias"
    };
  }
  return null;
}

// Perform simple client-side implicit OAuth flow
export function connectGoogleDriveReal(clientId: string) {
  const redirectUri = window.location.origin + "/";
  const scopes = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive.readonly"
  ].join(" ");

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${encodeURIComponent(scopes)}&state=google_auth`;
  
  // Store state to identify callback
  localStorage.setItem("google_auth_pending", "true");
  window.location.href = authUrl;
}

export function connectGoogleDriveSimulated() {
  localStorage.setItem("google_drive_simulated_connected", "true");
  googleUser = {
    name: "Elias Robert (Simulado)",
    email: "eliasrobert45@gmail.com",
    picture: "https://api.dicebear.com/7.x/bottts/svg?seed=elias"
  };
  return googleUser;
}

export function disconnectGoogleDrive() {
  googleAccessToken = null;
  googleUser = null;
  localStorage.removeItem("google_drive_simulated_connected");
  localStorage.removeItem("google_auth_pending");
}

// Handshake callback extraction supporting Implicit OAuth redirect
export function handleGoogleAuthCallback(): boolean {
  const hash = window.location.hash;
  if (hash && hash.includes("access_token")) {
    const params = new URLSearchParams(hash.substring(1));
    const token = params.get("access_token");
    if (token) {
      googleAccessToken = token;
      localStorage.removeItem("google_auth_pending");
      
      // Fetch user profile info
      fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          googleUser = {
            name: data.name || "Google User",
            email: data.email || "",
            picture: data.picture
          };
        })
        .catch(() => {
          googleUser = {
            name: "Conectado",
            email: "google-drive@gmail.com"
          };
        });
        
      // Clear hash from URL cleanly
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      return true;
    }
  }
  return false;
}

// List files from Real Google Drive or Simulating Drive content
export async function listDriveFiles(searchQuery: string = ""): Promise<DriveFile[]> {
  if (localStorage.getItem("google_drive_simulated_connected") === "true") {
    // Return simulated files (filtered)
    const files = getSimulatedFiles();
    if (!searchQuery) return files;
    return files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }

  if (!googleAccessToken) {
    throw new Error("Faça login no Google Drive primeiro.");
  }

  try {
    let url = "https://www.googleapis.com/drive/v3/files?fields=files(id,name,mimeType,createdTime,size,webViewLink)";
    const qParts = [];
    
    // Only search csv, json, spreadsheet sheets
    qParts.push("(mimeType = 'application/json' or mimeType = 'text/csv' or mimeType = 'application/vnd.google-apps.spreadsheet')");
    
    if (searchQuery) {
      qParts.push(`name contains '${searchQuery.replace(/'/g, "\\'")}'`);
    }
    
    url += `&q=${encodeURIComponent(qParts.join(" and "))}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${googleAccessToken}` }
    });

    if (!res.ok) {
      throw new Error(`Erro na API do Google Drive: ${res.statusText}`);
    }

    const data = await res.json();
    return data.files || [];
  } catch (error) {
    console.error("Error listing Drive files:", error);
    throw error;
  }
}

// Upload/Create new file: Backup file JSON or export CSV
export async function createDriveFile(name: string, content: string, mimeType: string): Promise<DriveFile> {
  const isSimulated = localStorage.getItem("google_drive_simulated_connected") === "true";
  
  if (isSimulated) {
    const files = getSimulatedFiles();
    const newFile: DriveFile = {
      id: "drive-mock-" + Date.now(),
      name,
      mimeType,
      createdTime: new Date().toISOString(),
      size: new Blob([content]).size,
      webViewLink: "https://drive.google.com/open?id=drive-mock-" + Date.now()
    };
    
    // Also save content in localStorage for mock download persistence
    localStorage.setItem(`mock_content_${newFile.id}`, content);
    
    files.unshift(newFile);
    saveSimulatedFiles(files);
    return newFile;
  }

  if (!googleAccessToken) {
    throw new Error("Faça login no Google Drive primeiro.");
  }

  try {
    const boundary = "314159265358979323846";
    const metadata = {
      name: name,
      mimeType: mimeType
    };

    const multipartRequestBody =
      `\r\n--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n` +
      `${content}\r\n` +
      `--${boundary}--`;

    const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,createdTime,size,webViewLink", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${googleAccessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`
      },
      body: multipartRequestBody
    });

    if (!res.ok) {
      throw new Error(`Erro no envio de arquivo: ${res.statusText}`);
    }

    return await res.json();
  } catch (error) {
    console.error("Error creating Google Drive file:", error);
    throw error;
  }
}

// Fetch file contents (download backup or CSV)
export async function getDriveFileContent(fileId: string): Promise<string> {
  const isSimulated = localStorage.getItem("google_drive_simulated_connected") === "true";
  
  if (isSimulated) {
    // Check if we produced it in this session
    const mockContent = localStorage.getItem(`mock_content_${fileId}`);
    if (mockContent) return mockContent;

    // Default sample cost file
    if (fileId === "drive-mock-file-1") {
      return `sku;custo_unitario\nMLB29481;45.90\nMLB92834;12.50\nMLB38102;89.90\nMLB44210;5.40`;
    }
    // Default sample JSON backup
    if (fileId === "drive-mock-file-2") {
      return JSON.stringify([
        { sku: "MLB29481", cost: 45.90, desc: "Caneca Meli Analytics" },
        { sku: "MLB92834", cost: 12.50, desc: "Chaveiro Aluminio Premium" }
      ], null, 2);
    }
    return `sku;custo_unitario\nSKU_EXEMPLO;10.00`;
  }

  if (!googleAccessToken) {
    throw new Error("Faça login no Google Drive primeiro.");
  }

  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${googleAccessToken}` }
    });

    if (!res.ok) {
      throw new Error(`Erro ao baixar conteúdo: ${res.statusText}`);
    }

    return await res.text();
  } catch (error) {
    console.error("Error reading Drive file content:", error);
    throw error;
  }
}
