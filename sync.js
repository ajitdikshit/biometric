import NetInfo from '@react-native-community/netinfo';
import { getPendingCount, getAllPendingLogs, clearSyncedLogs } from './localDB';

// =========================================================================
// 🚨 HACKATHON BYPASS: HARDCODED KEYS 🚨
// =========================================================================
const CLOUD_TARGET = "SUPABASE"; 

const INTEGRATION_ROUTING_TABLE = {
  SUPABASE: {
    url: 'https://eujsnmdlkiigvsunexar.supabase.co/rest/v1/attendance_logs', 
    headers: {
      'Content-Type': 'application/json',
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1anNubWRsa2lpZ3ZzdW5leGFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTg4NDIsImV4cCI6MjA5NTg5NDg0Mn0.DX9lPYLgnqOBwwHLH9yiZdTMo9N5YS5QwNcgRhqMAy8',
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1anNubWRsa2lpZ3ZzdW5leGFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTg4NDIsImV4cCI6MjA5NTg5NDg0Mn0.DX9lPYLgnqOBwwHLH9yiZdTMo9N5YS5QwNcgRhqMAy8'
    }
  }
};

export const syncAndPurgeLogs = async (updateCountStateCallback, systemLogCallback) => {
  const count = getPendingCount();
  if (count === 0) return;

  try {
    const logsToUpload = getAllPendingLogs();
    const activeRoute = INTEGRATION_ROUTING_TABLE[CLOUD_TARGET];

    const requestBody = logsToUpload.map(log => ({
      logger_name: log.logger_name,
      log_date: log.log_date,
      log_time: log.log_time,
      terminal_id: "DATALAKE_NODE_24BCE10834"
    }));

    const response = await fetch(activeRoute.url, {
      method: 'POST',
      headers: activeRoute.headers,
      body: JSON.stringify(requestBody),
    });

    if (response.ok) {
      clearSyncedLogs();
      updateCountStateCallback(0); 
      if (systemLogCallback) systemLogCallback(`✅ Synced ${count} offline logs to Supabase.`);
    } else {
      const errorText = await response.text();
      if (systemLogCallback) systemLogCallback(`❌ Sync Failed: HTTP ${response.status}`);
    }
  } catch (error) {
    if (systemLogCallback) systemLogCallback(`⚠️ Sync Error: ${error.message}`);
  }
};

export const registerNetworkSyncMonitor = (updateCountStateCallback, updateOnlineStateCallback, systemLogCallback) => {
  const deactivateListener = NetInfo.addEventListener(state => {
    const isGloballyConnected = !!(state.isConnected && state.isInternetReachable);
    updateOnlineStateCallback(isGloballyConnected);
    
    if (isGloballyConnected) {
      syncAndPurgeLogs(updateCountStateCallback, systemLogCallback);
    }
  });
  return deactivateListener;
};

export const backupIdentityToCloud = async (faceName, faceVectorArray, systemLogCallback) => {
  try {
    const activeRoute = INTEGRATION_ROUTING_TABLE[CLOUD_TARGET];
    const response = await fetch('https://eujsnmdlkiigvsunexar.supabase.co/rest/v1/registered_faces', {
      method: 'POST',
      headers: { 
        ...activeRoute.headers,
        'Prefer': 'resolution=ignore-duplicates' 
      },
      body: JSON.stringify({ 
        face_name: faceName, 
        face_vector: JSON.stringify(faceVectorArray), 
        terminal_id: "DATALAKE_NODE_24BCE10834" 
      }),
    });

    if (!response.ok) {
        if (systemLogCallback) systemLogCallback(`⚠️ Cloud backup rejected for ${faceName}.`);
    } else {
        if (systemLogCallback) systemLogCallback(`☁️ Identity ${faceName} secured in Supabase.`);
    }
  } catch (error) {
    if (systemLogCallback) systemLogCallback(`⚠️ Cloud backup network error.`);
  }
};

export const restoreIdentitiesFromCloud = async (restoreCallback, systemLogCallback) => {
  try {
    const activeRoute = INTEGRATION_ROUTING_TABLE[CLOUD_TARGET];
    const response = await fetch('https://eujsnmdlkiigvsunexar.supabase.co/rest/v1/registered_faces?select=face_name,face_vector', {
      method: 'GET',
      headers: activeRoute.headers
    });

    if (response.ok) {
      const cloudRoster = await response.json();
      cloudRoster.forEach(user => {
        restoreCallback(user.face_name, user.face_vector);
      });
      if (systemLogCallback) systemLogCallback(`✅ Recovered ${cloudRoster.length} biometric profiles.`);
      return cloudRoster; 
    } else {
      if (systemLogCallback) systemLogCallback(`❌ Restore Failed: Database Error`);
      return [];
    }
  } catch (error) {
    if (systemLogCallback) systemLogCallback(`⚠️ Restore Failed: Could not reach Supabase.`);
    return [];
  }
};