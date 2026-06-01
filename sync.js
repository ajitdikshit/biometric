import NetInfo from '@react-native-community/netinfo';
import { getPendingCount, getAllPendingLogs, clearSyncedLogs } from './localDB';
import { Alert } from 'react-native';

// Import your hidden secrets securely
import { 
  ACTIVE_CLOUD_TARGET, 
  SUPABASE_URL, 
  SUPABASE_ANON_KEY, 
  AWS_API_URL, 
  AWS_API_KEY 
} from '@env';

// =========================================================================
// STRATEGIC ROUTING TOGGLE
// =========================================================================
const CLOUD_TARGET = ACTIVE_CLOUD_TARGET || "SUPABASE"; 

const INTEGRATION_ROUTING_TABLE = {
  SUPABASE: {
    url: SUPABASE_URL,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    }
  },
  AWS: {
    url: AWS_API_URL,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AWS_API_KEY}`
    }
  }
};

export const syncAndPurgeLogs = async (updateCountStateCallback) => {
  const count = getPendingCount();
  if (count === 0) return;

  try {
    console.log(`📡 [CLOUD GATEWAY] Packaging ${count} unsynchronized records for upload...`);
    const logsToUpload = getAllPendingLogs();
    const activeRoute = INTEGRATION_ROUTING_TABLE[CLOUD_TARGET];

    // Format structural payloads symmetrically depending on provider schema constraints
    const requestBody = CLOUD_TARGET === "SUPABASE"
      ? logsToUpload.map(log => ({
          logger_name: log.logger_name,
          log_date: log.log_date,
          log_time: log.log_time,
          terminal_id: "DATALAKE_NODE_24BCE10834"
        }))
      : { 
          terminal_id: "DATALAKE_NODE_24BCE10834", 
          logs: logsToUpload 
        };

    const response = await fetch(activeRoute.url, {
      method: 'POST',
      headers: activeRoute.headers,
      body: JSON.stringify(requestBody),
    });

    if (response.ok) {
      // Execute the storage sweep protocol upon receiving confirmation of delivery (HTTP 200/201)
      clearSyncedLogs();
      updateCountStateCallback(0); 
      
      Alert.alert(
        'SYNCHRONIZATION VERIFIED', 
        `All localized database transactions have been synced to the cloud (${CLOUD_TARGET}). Edge cache securely purged.`
      );
    } else {
      throw new Error(`Cloud node rejected transaction stream: ${response.status}`);
    }
  } catch (error) {
    console.error(`⚠️ [CLOUD GATEWAY] Connection failed. Logs safely locked inside the local SQLite volume.`, error);
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