import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, View, Text, PermissionsAndroid, 
  requireNativeComponent, TouchableOpacity, TextInput, 
  ViewProps, Keyboard, TouchableWithoutFeedback, Modal, FlatList 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { initDatabase, saveOfflineLog, getPendingCount, restoreUserFromCloud, saveMasterName, getAllMasterUsers } from './localDB';
import { registerNetworkSyncMonitor, syncAndPurgeLogs, backupIdentityToCloud, restoreIdentitiesFromCloud } from './sync';

interface LiveBiometricViewProps extends ViewProps {
  mode: string;
  registerName: string;
  nativeRoster?: string;
  onVerified: (event: any) => void;
}
const LiveBiometricView = requireNativeComponent<LiveBiometricViewProps>('LiveBiometricView');

export default function App() {
  const [pendingLogs, setPendingLogs] = useState(0);
  const [isOnline, setIsOnline] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [currentMode, setCurrentMode] = useState('VERIFY');
  const [nameInput, setNameInput] = useState('');
  const [activeRegisterName, setActiveRegisterName] = useState('');
  const [isPromptingName, setIsPromptingName] = useState(false);
  
  const [nativeCloudPayload, setNativeCloudPayload] = useState('');
  const [showRosterModal, setShowRosterModal] = useState(false);
  const [localUsers, setLocalUsers] = useState<any[]>([]);

  const [attendanceLog, setAttendanceLog] = useState('');
  const [registrationLog, setRegistrationLog] = useState('');
  const [systemLog, setSystemLog] = useState('');

  // 🚨 AUTOMATIC STARTUP INJECTION
  const syncLocalRosterToEdge = () => {
    const users = getAllMasterUsers();
    if (users && users.length > 0) {
      const formattedKotlinString = users.map((u: any) => {
        let arr: number[] = [];
        try {
          const parsed = typeof u.face_vector === 'string' ? JSON.parse(u.face_vector) : u.face_vector;
          if (Array.isArray(parsed)) arr = parsed;
        } catch(e) {}
        // Local DB uses 'name', Supabase uses 'face_name'
        return `${u.name}:${(arr || []).join(',')}`; 
      }).join('|');
      
      setNativeCloudPayload(formattedKotlinString);
      setSystemLog(`📱 Injected ${users.length} local profiles to native vault.`);
    } else {
      setSystemLog(`📱 No local profiles found on startup.`);
    }
  };

  useEffect(() => {
    initDatabase();
    setPendingLogs(getPendingCount());
    requestCameraPermission();

    // 🚨 FIRE THE INJECTION ON APP START
    syncLocalRosterToEdge();

    const unsubscribeNetwork = registerNetworkSyncMonitor(setPendingLogs, setIsOnline, setSystemLog);
    return () => unsubscribeNetwork();
  }, []);

  const requestCameraPermission = async () => {
    try {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        setSystemLog('⚠️ CAMERA REQUIRED: Please grant permissions.');
      }
    } catch (err) {
      setSystemLog('⚠️ CAMERA ERROR: Activity not ready.');
    }
  };

  const handleRegisterPress = () => {
    setCameraActive(false); 
    setCurrentMode('REGISTER');
    setNameInput('');
    setIsPromptingName(true);
  };

  const confirmRegistrationIntent = () => {
    if (nameInput.trim().length === 0) {
      setRegistrationLog('⚠️ REQUIRED FIELD: Please enter a name.');
      return;
    }
    Keyboard.dismiss();
    setActiveRegisterName(nameInput.trim());
    setIsPromptingName(false);
    setCameraActive(true);
    setRegistrationLog(`Awaiting face scan for ${nameInput.trim()}...`);
  };

  const startVerificationProcess = () => {
    setIsPromptingName(false);
    setCurrentMode('VERIFY');
    setCameraActive(true);
    setAttendanceLog('Awaiting face scan...');
  };

  const handleOpenRoster = () => {
    const users = getAllMasterUsers();
    setLocalUsers(users);
    setShowRosterModal(true);
  };

  const executeCloudToEdgeSync = async () => {
    setSystemLog("☁️ Fetching identities from Supabase...");
    const roster = await restoreIdentitiesFromCloud(restoreUserFromCloud, setSystemLog);
    
    if (roster && roster.length > 0) {
      const formattedKotlinString = roster.map((u: any) => {
        let arr: number[] = [];
        try {
          const parsed = typeof u.face_vector === 'string' ? JSON.parse(u.face_vector) : u.face_vector;
          if (Array.isArray(parsed)) arr = parsed;
        } catch(e) {}
        return `${u.face_name}:${(arr || []).join(',')}`;
      }).join('|');
      
      setNativeCloudPayload(formattedKotlinString);
    }
  };

  const handleVerificationEvent = (event: any) => {
    const payload = event.nativeEvent;
    const { status, message, matchedName } = payload;
    setCameraActive(false);

    if (status === 'SUCCESS') {
      if (currentMode === 'VERIFY') {
        saveOfflineLog(matchedName || 'Unknown_User');
        setPendingLogs(getPendingCount());
        
        setAttendanceLog(`✅ Welcome ${matchedName}`);
        
        if (isOnline) {
          syncAndPurgeLogs(setPendingLogs, setSystemLog);
        }
      } else {
        let rawVector = payload.faceVector || payload.embedding || payload.descriptor || payload.features || payload.template;
        let finalVector = null;
        if (rawVector) {
          finalVector = typeof rawVector === 'string' ? JSON.parse(rawVector) : rawVector;
        }

        if (finalVector && finalVector.length > 0) {
          setRegistrationLog(`🔵 Registration for ${matchedName} successful`);
          saveMasterName(matchedName, finalVector);
          
          if (isOnline) {
            backupIdentityToCloud(matchedName, finalVector, setSystemLog);
          }
        } else {
          setSystemLog(`⚠️ KOTLIN LOCKED: Native vault refused math array.`);
        }
      }
    } else {
      setSystemLog(`❌ SECURITY: ${message}`);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={styles.container}>
        
        <View style={styles.header}>
          <Text style={styles.headerText}>DATALAKE BIOMETRICS</Text>
          <Text style={[styles.subText, { color: isOnline ? '#00ffcc' : '#ff4444' }]}>
            {isOnline ? 'CLOUD SYNC ACTIVE' : 'OFFLINE TERMINAL ACTIVE'}
          </Text>
        </View>
        
        <View style={styles.queueContainer}>
          <Text style={styles.queueText}>OFFLINE LOGS PENDING: {pendingLogs}</Text>
        </View>

        <View style={styles.cameraBox}>
           {isPromptingName ? (
              <View style={styles.promptContainer}>
                 <Text style={styles.promptTitle}>ENTER IDENTITY NAME</Text>
                 <TextInput 
                    style={styles.inputField}
                    placeholder="e.g. Ajit Dikshit"
                    placeholderTextColor="#555"
                    value={nameInput}
                    onChangeText={setNameInput}
                    autoFocus={true}
                    maxLength={25}
                 />
                 <TouchableOpacity style={styles.promptConfirmBtn} onPress={confirmRegistrationIntent}>
                    <Text style={styles.promptConfirmBtnText}>PROCEED TO SCAN</Text>
                 </TouchableOpacity>
              </View>
           ) : cameraActive ? (
              <>
                <Text style={styles.challengeText}>
                    BLINK TO {currentMode}
                </Text>
                <LiveBiometricView 
                  mode={currentMode}
                  registerName={activeRegisterName}
                  nativeRoster={nativeCloudPayload} 
                  style={StyleSheet.absoluteFill} 
                  onVerified={handleVerificationEvent} 
                />
              </>
           ) : (
              <Text style={styles.cameraText}>SYSTEM STANDBY</Text>
           )}
        </View>

        <View style={styles.terminalBox}>
          <Text style={styles.terminalTitle}>LIVE TELEMETRY</Text>
          <Text style={styles.logText}>
            <Text style={{color: '#00ffcc'}}>ATTENDANCE: </Text> 
            {attendanceLog || 'Awaiting scan...'}
          </Text>
          <Text style={styles.logText}>
            <Text style={{color: '#00aaff'}}>ENROLLMENT: </Text> 
            {registrationLog || 'Awaiting registration...'}
          </Text>
          <Text style={styles.logText}>
            <Text style={{color: '#ffaa00'}}>SYSTEM:     </Text> 
            {systemLog || 'All systems operational.'}
          </Text>
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={[styles.button, styles.registerButton]} onPress={handleRegisterPress}>
            <Text style={styles.buttonText}>REGISTER FACE</Text>
          </TouchableOpacity>
          
          <View style={styles.iconGroup}>
            <TouchableOpacity style={styles.iconButton} onPress={executeCloudToEdgeSync}>
              <Text style={styles.iconText}>☁️</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.iconButton} onPress={handleOpenRoster}>
              <Text style={styles.iconText}>📋</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[styles.button, styles.verifyButton]} onPress={startVerificationProcess}>
            <Text style={[styles.buttonText, { color: '#000' }]} >LOGIN</Text>
          </TouchableOpacity>
        </View>

        <Modal visible={showRosterModal} animationType="slide" transparent={true} onRequestClose={() => setShowRosterModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>LOCAL IDENTITY ROSTER</Text>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, {flex: 0.3}]}>ID</Text>
                <Text style={[styles.tableHeaderText, {flex: 0.7}]}>REGISTERED NAME</Text>
              </View>
              {localUsers.length === 0 ? (
                <Text style={styles.emptyText}>No identities found in local edge node.</Text>
              ) : (
                <FlatList 
                  data={localUsers}
                  keyExtractor={(item) => item.id.toString()}
                  renderItem={({item}) => (
                    <View style={styles.tableRow}>
                      <Text style={[styles.tableCellText, {flex: 0.3}]}>{item.id}</Text>
                      <Text style={[styles.tableCellText, {flex: 0.7}]}>{item.name}</Text>
                    </View>
                  )}
                />
              )}
              <TouchableOpacity style={styles.closeModalBtn} onPress={() => setShowRosterModal(false)}>
                <Text style={styles.closeModalBtnText}>CLOSE CONSOLE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' },
  header: { position: 'absolute', top: 40, alignItems: 'center' },
  headerText: { color: '#00ffcc', fontSize: 22, fontWeight: '900', letterSpacing: 2 },
  subText: { fontSize: 12, marginTop: 5, letterSpacing: 1, fontWeight: 'bold' },
  queueContainer: { backgroundColor: '#111', padding: 10, borderRadius: 8, marginBottom: 15, marginTop: 70 },
  queueText: { color: '#fff', fontWeight: 'bold', fontSize: 14, letterSpacing: 1 },
  
  cameraBox: { width: 320, height: 350, borderWidth: 2, borderColor: '#333', borderRadius: 15, backgroundColor: '#111', overflow: 'hidden', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  challengeText: { color: '#00ffcc', fontWeight: '900', fontSize: 16, textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.7)', width: '100%', padding: 15, position: 'absolute', top: 0, zIndex: 10 },
  cameraText: { color: '#555', fontWeight: 'bold', letterSpacing: 2, fontSize: 16 },

  terminalBox: { width: 320, backgroundColor: '#111', borderWidth: 1, borderColor: '#333', borderRadius: 10, padding: 15, marginBottom: 25 },
  terminalTitle: { color: '#555', fontSize: 10, fontWeight: 'bold', marginBottom: 10, letterSpacing: 2 },
  logText: { color: '#ccc', fontSize: 11, marginBottom: 5, fontFamily: 'monospace' },
  
  buttonRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  button: { paddingVertical: 18, paddingHorizontal: 20, borderRadius: 30, elevation: 5 },
  registerButton: { backgroundColor: '#333', borderWidth: 1, borderColor: '#555' },
  verifyButton: { backgroundColor: '#00ffcc' },
  buttonText: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 1 },
  
  iconGroup: { flexDirection: 'row', gap: 5 },
  iconButton: { backgroundColor: '#222', padding: 12, borderRadius: 50, borderWidth: 1, borderColor: '#444', width: 50, height: 50, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 18 },

  promptContainer: { width: '100%', padding: 20, alignItems: 'center' },
  promptTitle: { color: '#00ffcc', fontWeight: 'bold', fontSize: 14, marginBottom: 15, letterSpacing: 1 },
  inputField: { width: '100%', height: 50, backgroundColor: '#222', borderRadius: 10, color: '#fff', paddingHorizontal: 15, fontSize: 16, borderWidth: 1, borderColor: '#444', marginBottom: 20 },
  promptConfirmBtn: { backgroundColor: '#00ffcc', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 20 },
  promptConfirmBtnText: { color: '#000', fontWeight: '900', fontSize: 12, letterSpacing: 1 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', height: '60%', backgroundColor: '#111', borderWidth: 2, borderColor: '#333', borderRadius: 15, padding: 20 },
  modalTitle: { color: '#00ffcc', fontSize: 18, fontWeight: '900', letterSpacing: 1, textAlign: 'center', marginBottom: 20 },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#444', paddingBottom: 10, marginBottom: 10 },
  tableHeaderText: { color: '#888', fontWeight: 'bold', fontSize: 12, letterSpacing: 1 },
  tableRow: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#222' },
  tableCellText: { color: '#fff', fontSize: 14 },
  emptyText: { color: '#555', textAlign: 'center', marginTop: 40, fontStyle: 'italic' },
  closeModalBtn: { backgroundColor: '#333', padding: 15, borderRadius: 10, marginTop: 'auto', alignItems: 'center', borderWidth: 1, borderColor: '#555' },
  closeModalBtnText: { color: '#fff', fontWeight: 'bold', letterSpacing: 1 }
});