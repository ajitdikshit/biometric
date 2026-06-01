import NetInfo from '@react-native-community/netinfo';
import { getPendingCount, getAllPendingLogs, clearSyncedLogs } from './localDB';
import { Alert } from 'react-native';

// =========================================================================
// 🚨 HACKATHON BYPASS: HARDCODED KEYS 🚨
// =========================================================================
const CLOUD_TARGET = "SUPABASE"; 

const INTEGRATION_ROUTING_TABLE = {
  SUPABASE: {
    // PASTE YOUR REAL SUPABASE URL HERE (Keep the quotes!)
    url: 'https://eujsnmdlkiigvsunexar.supabase.co/rest/v1/attendance_logs', 
    headers: {
      'Content-Type': 'application/json',
      // PASTE YOUR REAL SUPABASE ANON KEY HERE (Keep the quotes!)
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1anNubWRsa2lpZ3ZzdW5leGFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTg4NDIsImV4cCI6MjA5NTg5NDg0Mn0.DX9lPYLgnqOBwwHLH9yiZdTMo9N5YS5QwNcgRhqMAy8',
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1anNubWRsa2lpZ3ZzdW5leGFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTg4NDIsImV4cCI6MjA5NTg5NDg0Mn0.DX9lPYLgnqOBwwHLH9yiZdTMo9N5YS5QwNcgRhqMAy8'
    }
  }
};
export const syncAndPurgeLogs = async (updateCountStateCallback) => {
  const count = getPendingCount();
  if (count === 0) return;

  try {
    const logsToUpload = getAllPendingLogs();
    const activeRoute = INTEGRATION_ROUTING_TABLE[CLOUD_TARGET];

    const requestBody = CLOUD_TARGET === "SUPABASE"
      ? logsToUpload.map(log => ({
          logger_name: log.logger_name,
          log_date: log.log_date,
          log_time: log.log_time,
          terminal_id: "DATALAKE_NODE_24BCE10834"
        }))
      : { terminal_id: "DATALAKE_NODE_24BCE10834", logs: logsToUpload };

    const response = await fetch(activeRoute.url, {
      method: 'POST',
      headers: activeRoute.headers,
      body: JSON.stringify(requestBody),
    });

    if (response.ok) {
      clearSyncedLogs();
      updateCountStateCallback(0); 
      Alert.alert('SYNCHRONIZATION VERIFIED', `Synced ${count} logs to Supabase.`);
    } else {
      // 🚨 THIS WILL CATCH SUPABASE SECRETS/ERRORS 🚨
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}\nDetails: ${errorText}`);
    }
  } catch (error) {
    // 🚨 THIS WILL POP UP ON YOUR PHONE SCREEN 🚨
    Alert.alert(`⚠️ SYNC FAILED`, error.message);
  }
};
// Background engine monitoring connectivity states dynamically
export const registerNetworkSyncMonitor = (updateCountStateCallback, updateOnlineStateCallback) => {
  const deactivateListener = NetInfo.addEventListener(state => {
    const isGloballyConnected = !!(state.isConnected && state.isInternetReachable);
    updateOnlineStateCallback(isGloballyConnected);
    
    if (isGloballyConnected) {
      syncAndPurgeLogs(updateCountStateCallback);
    }
  });

  return deactivateListener;
};