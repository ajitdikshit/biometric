import NetInfo from '@react-native-community/netinfo';
import { getPendingCount, getAllPendingLogs, clearSyncedLogs, markLogsAsSynced } from './localDB';
import { SUPABASE_URL, SUPABASE_KEY } from '@env';

const INTEGRATION_HEADERS = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`
};

export const syncAndPurgeLogs = async (updateCountStateCallback, systemLogCallback) => {
  // 🚨 REMOVED markLogsAsSynced() from here!
  
  const count = getPendingCount();
  if (count === 0) return;

  try {
    const logsToUpload = getAllPendingLogs();

    const requestBody = logsToUpload.map(log => ({
      logger_name: log.logger_name,
      log_date: log.log_date,
      log_time: log.log_time,
      terminal_id: "DATALAKE_NODE_24BCE10834"
    }));

    const response = await fetch(`${SUPABASE_URL}/rest/v1/attendance_logs`, {
      method: 'POST',
      headers: INTEGRATION_HEADERS,
      body: JSON.stringify(requestBody),
    });

    if (response.ok) {
      
      markLogsAsSynced(); 
      updateCountStateCallback(0); 
      if (systemLogCallback) systemLogCallback(`✅ Sync with Supabase completed`);
    } else {
      const errorText = await response.text();
      if (systemLogCallback) systemLogCallback(`❌ Sync Failed: ${response.status}`);
    }
  } catch (error) {
    if (systemLogCallback) systemLogCallback(`⚠️ Sync Error: Connection failed`);
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
    const response = await fetch(`${SUPABASE_URL}/rest/v1/registered_faces`, {
      method: 'POST',
      headers: { 
        ...INTEGRATION_HEADERS,
        'Prefer': 'resolution=ignore-duplicates' 
      },
      body: JSON.stringify({ 
        face_name: faceName, 
        face_vector: JSON.stringify(faceVectorArray), 
        terminal_id: "DATALAKE_NODE_24BCE10834" 
      }),
    });

    if (!response.ok) {
        if (systemLogCallback) systemLogCallback(`⚠️ Cloud backup failed for ${faceName}.`);
    } else {
        if (systemLogCallback) systemLogCallback(`☁️ Identity ${faceName} secured in Supabase.`);
    }
  } catch (error) {
    if (systemLogCallback) systemLogCallback(`⚠️ Cloud backup network error.`);
  }
};

export const restoreIdentitiesFromCloud = async (restoreCallback, systemLogCallback) => {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/registered_faces?select=face_name,face_vector`, {
      method: 'GET',
      headers: INTEGRATION_HEADERS
    });

    if (response.ok) {
      const cloudRoster = await response.json();
      cloudRoster.forEach(user => {
        restoreCallback(user.face_name, user.face_vector);
      });
      if (systemLogCallback) systemLogCallback(`✅ Restore from Supabase completed`);
      return cloudRoster; 
    } else {
      if (systemLogCallback) systemLogCallback(`❌ Restore Failed: Database Error`);
      return [];
    }
  } catch (error) {
    if (systemLogCallback) systemLogCallback(`⚠️ Restore Failed: Supabase Unreachable.`);
    return [];
  }
};

export const fetchAllCloudLogs = async (setSystemLog) => {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/attendance_logs?select=*&order=id.desc`, {
      method: 'GET',
      headers: INTEGRATION_HEADERS
    });

    if (response.ok) {
      const data = await response.json();
      return data || [];
    } else {
      if (setSystemLog) setSystemLog('❌ Cloud fetch failed.');
      return [];
    }
  } catch (error) {
    if (setSystemLog) setSystemLog('⚠️ Cloud fetch error.');
    return [];
  }
};