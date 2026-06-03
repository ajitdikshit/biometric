import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, View, Text, PermissionsAndroid, 
  requireNativeComponent, TouchableOpacity, TextInput, 
  ViewProps, Keyboard, TouchableWithoutFeedback, Modal, FlatList,
  StatusBar, Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { 
  initDatabase, saveOfflineLog, getPendingCount, restoreUserFromCloud, 
  saveMasterName, getAllMasterUsers, saveLanguageSetting, getLanguageSetting,
  saveThemeSetting, getThemeSetting
} from './localDB';
import { registerNetworkSyncMonitor, syncAndPurgeLogs, backupIdentityToCloud, restoreIdentitiesFromCloud } from './sync';

interface LiveBiometricViewProps extends ViewProps {
  mode: string;
  registerName: string;
  nativeRoster?: string;
  onVerified: (event: any) => void;
}
const LiveBiometricView = requireNativeComponent<LiveBiometricViewProps>('LiveBiometricView');

const { height } = Dimensions.get('window');

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
  
  const [currentTime, setCurrentTime] = useState('');

  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [lang, setLang] = useState('en');

  const t = {
    brand: lang === 'en' ? 'DATALAKE BIOMETRICS' : 'डेटालेक बायोमेट्रिक्स',
    online: lang === 'en' ? 'ONLINE' : 'ऑनलाइन',
    offline: lang === 'en' ? 'OFFLINE' : 'ऑफ़लाइन',
    faceScan: lang === 'en' ? 'FACE SCAN' : 'चेहरा स्कैन',
    standby: lang === 'en' ? 'STANDBY' : 'स्टैंडबाय',
    helper: lang === 'en' ? 'Align face inside frame • Hold steady' : 'चेहरे को फ्रेम में रखें • स्थिर रहें',
    telemetry: lang === 'en' ? 'LIVE TELEMETRY' : 'लाइव टेलीमेट्री',
    attendance: lang === 'en' ? 'ATTENDANCE' : 'उपस्थिति',
    enrollment: lang === 'en' ? 'ENROLLMENT' : 'पंजीकरण',
    system: lang === 'en' ? 'SYSTEM' : 'सिस्टम',
    liveness: lang === 'en' ? 'LIVENESS' : 'सजीवता',
    regBtn: lang === 'en' ? 'Register User' : 'उपयोगकर्ता बनाएं',
    regSub: lang === 'en' ? 'Enroll new face' : 'नया चेहरा जोड़ें',
    logBtn: lang === 'en' ? 'Login' : 'लॉग इन',
    logSub: lang === 'en' ? 'Verify identity' : 'पहचान सत्यापित करें',
    viewBtn: lang === 'en' ? 'View Users' : 'सूची देखें',
    viewSub: lang === 'en' ? 'Manage roster' : 'उपयोगकर्ता प्रबंधित करें',
    syncBtn: lang === 'en' ? 'Fetch Database' : 'डेटाबेस सिंक',
    syncSub: lang === 'en' ? 'Sync records' : 'रिकॉर्ड अपडेट करें',
  };

  const syncLocalRosterToEdge = () => {
    const users = getAllMasterUsers();
    if (users && users.length > 0) {
      const formattedKotlinString = users.map((u: any) => {
        let arr: number[] = [];
        try {
          const parsed = typeof u.face_vector === 'string' ? JSON.parse(u.face_vector) : u.face_vector;
          if (Array.isArray(parsed)) arr = parsed;
        } catch(e) {}
        return `${u.name}:${(arr || []).join(',')}`; 
      }).join('|');
      
      setNativeCloudPayload(formattedKotlinString);
      setSystemLog(`Injected ${users.length} profiles to vault.`);
    } else {
      setSystemLog(`No local profiles found.`);
    }
  };

  useEffect(() => {
    initDatabase();
    
    const savedLang = getLanguageSetting();
    if (savedLang) {
      setLang(savedLang);
    }
    
    const savedTheme = getThemeSetting();
    setIsDark(savedTheme);

    setPendingLogs(getPendingCount());
    requestCameraPermission();
    syncLocalRosterToEdge();

    const unsubscribeNetwork = registerNetworkSyncMonitor(setPendingLogs, setIsOnline, setSystemLog);
    
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-IN', { hour12: false }));
    }, 1000);

    return () => {
      unsubscribeNetwork();
      clearInterval(timer);
    };
  }, []);

  const requestCameraPermission = async () => {
    try {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        setSystemLog('CAMERA REQUIRED: Please grant permissions.');
      }
    } catch (err) {
      setSystemLog('CAMERA ERROR: Activity not ready.');
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
      setRegistrationLog('REQUIRED: Enter a name.');
      return;
    }
    Keyboard.dismiss();
    setActiveRegisterName(nameInput.trim());
    setIsPromptingName(false);
    setCameraActive(true);
    setRegistrationLog(`Awaiting scan: ${nameInput.trim()}`);
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
    setSystemLog("Fetching identities from Supabase...");
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
        setAttendanceLog(`Welcome ${matchedName}`);
        
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
          setRegistrationLog(`Registered ${matchedName} successfully`);
          saveMasterName(matchedName, finalVector);
          syncLocalRosterToEdge();
          
          if (isOnline) {
            backupIdentityToCloud(matchedName, finalVector, setSystemLog);
          }
        } else {
          setSystemLog(`KOTLIN LOCKED: Vault refused array.`);
        }
      }
    } else {
      setSystemLog(`${message}`);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={[styles.root, isDark && styles.rootDark]} edges={['right', 'bottom', 'left']}>
        <StatusBar hidden={true} />
        
        <View style={styles.topbar}>
          <View style={styles.brandContainer}>
            <TouchableOpacity onPress={() => setIsMenuVisible(true)} style={styles.menuIconBox}>
              <Text style={styles.menuIcon}>☰</Text>
            </TouchableOpacity>
            <Text style={styles.brand}>{t.brand}</Text>
          </View>
          <View style={styles.statusPill}>
            <View style={[styles.dot, isOnline && styles.dotOnline]} />
            <Text style={styles.statusText}>{isOnline ? t.online : t.offline}</Text>
          </View>
        </View>

        <Modal 
          visible={isMenuVisible} 
          transparent={true} 
          animationType="fade" 
          statusBarTranslucent={true}
          onRequestClose={() => setIsMenuVisible(false)}
        >
          <View style={styles.premiumOverlay}>
            <TouchableOpacity style={styles.premiumOverlayBackground} activeOpacity={1} onPress={() => setIsMenuVisible(false)} />
            
            <View style={[styles.premiumDrawer, isDark && styles.surfaceDark]}>
              <Text style={[styles.premiumHeader, isDark && styles.textDark]}>SETTINGS</Text>

              <View style={styles.premiumSection}>
                <Text style={[styles.premiumSectionTitle, isDark && styles.textSubDark]}>APP THEME</Text>
                <View style={[styles.segmentContainer, isDark && styles.segmentContainerDark]}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={[styles.segmentButton, !isDark ? styles.segmentActive : styles.segmentInactive]}
                    onPress={() => {
                      setIsDark(false);
                      saveThemeSetting(false);
                    }}
                  >
                    <Text style={[styles.segmentText, !isDark ? styles.segmentTextActive : (isDark ? styles.textSubDark : styles.segmentTextInactive)]}>Light</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={[styles.segmentButton, isDark ? styles.segmentActiveDark : styles.segmentInactive]}
                    onPress={() => {
                      setIsDark(true);
                      saveThemeSetting(true);
                    }}
                  >
                    <Text style={[styles.segmentText, isDark ? styles.segmentTextActive : styles.segmentTextInactive]}>Dark</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.premiumSection}>
                <Text style={[styles.premiumSectionTitle, isDark && styles.textSubDark]}>LANGUAGE</Text>
                <View style={[styles.segmentContainer, isDark && styles.segmentContainerDark]}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={[styles.segmentButton, lang === 'en' ? (isDark ? styles.segmentActiveDark : styles.segmentActive) : styles.segmentInactive]}
                    onPress={() => {
                      setLang('en');
                      saveLanguageSetting('en'); 
                    }}
                  >
                    <Text style={[styles.segmentText, lang === 'en' ? styles.segmentTextActive : (isDark ? styles.textSubDark : styles.segmentTextInactive)]}>English</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={[styles.segmentButton, lang === 'hi' ? (isDark ? styles.segmentActiveDark : styles.segmentActive) : styles.segmentInactive]}
                    onPress={() => {
                      setLang('hi');
                      saveLanguageSetting('hi'); 
                    }}
                  >
                    <Text style={[styles.segmentText, lang === 'hi' ? styles.segmentTextActive : (isDark ? styles.textSubDark : styles.segmentTextInactive)]}>हिंदी</Text>
                  </TouchableOpacity>
                </View>
              </View>

            </View>
          </View>
        </Modal>

        <View style={[styles.camZone, isDark && styles.surfaceDark]}>
          <Text style={[styles.camLabel, isDark && styles.textSubDark]}>{t.faceScan}</Text>
          <View style={styles.camFrameOuter}>
            <View style={[styles.camFrame, isDark && styles.camFrameDark]}>
              
              {isPromptingName ? (
                <View style={styles.promptContainer}>
                  <Text style={styles.promptTitle}>ENTER IDENTITY</Text>
                  <TextInput 
                    style={[styles.inputField, isDark && styles.inputDark]}
                    placeholder="e.g. Ajit Dikshit"
                    placeholderTextColor="#94a3b8"
                    value={nameInput}
                    onChangeText={setNameInput}
                    autoFocus={true}
                    maxLength={25}
                  />
                  <TouchableOpacity style={styles.promptConfirmBtn} onPress={confirmRegistrationIntent}>
                    <Text style={styles.promptConfirmBtnText}>SCAN</Text>
                  </TouchableOpacity>
                </View>
              ) : cameraActive ? (
                <LiveBiometricView 
                  mode={currentMode}
                  registerName={activeRegisterName}
                  nativeRoster={nativeCloudPayload} 
                  style={StyleSheet.absoluteFill} 
                  onVerified={handleVerificationEvent} 
                />
              ) : (
                <Text style={styles.standbyText}>{t.standby}</Text>
              )}

            </View>
            <View style={[styles.corner, styles.tl]} />
            <View style={[styles.corner, styles.tr]} />
            <View style={[styles.corner, styles.bl]} />
            <View style={[styles.corner, styles.br]} />
          </View>
          <View style={styles.helperRow}>
            <View style={styles.helperDot} />
            <Text style={[styles.helperText, isDark && styles.textSubDark]}>{t.helper}</Text>
          </View>
        </View>

        <View style={[styles.telemetry, isDark && styles.surfaceDark]}>
          <View style={styles.teleHeader}>
            <Text style={[styles.teleTitle, isDark && styles.textSubDark]}>{t.telemetry}</Text>
            <Text style={styles.teleTimestamp}>{currentTime}</Text>
          </View>
          <View style={styles.teleGrid}>
            
            <View style={[styles.teleCard, isDark && styles.cardDark]}>
              <Text style={[styles.teleCardLabel, isDark && styles.textSubDark]}>{t.attendance}</Text>
              <Text style={[styles.teleCardValue, styles.valBlue]} numberOfLines={1}>{attendanceLog || 'Awaiting Scan'}</Text>
              <Text style={[styles.teleCardSub, isDark && styles.textSubDark]}>Scans logged locally</Text>
            </View>

            <View style={[styles.teleCard, isDark && styles.cardDark]}>
              <Text style={[styles.teleCardLabel, isDark && styles.textSubDark]}>{t.enrollment}</Text>
              <Text style={[styles.teleCardValue, styles.valTeal]} numberOfLines={1}>{registrationLog || 'Idle'}</Text>
              <Text style={[styles.teleCardSub, isDark && styles.textSubDark]}>Ready for capture</Text>
            </View>

            <View style={[styles.teleCard, isDark && styles.cardDark]}>
              <Text style={[styles.teleCardLabel, isDark && styles.textSubDark]}>{t.system}</Text>
              <Text style={[styles.teleCardValue, styles.valGreen]} numberOfLines={1}>{isOnline ? 'Stable' : 'Sync Pending'}</Text>
              <Text style={[styles.teleCardSub, isDark && styles.textSubDark]}>{isOnline ? 'All checks pass' : `Pending Logs: ${pendingLogs}`}</Text>
            </View>

            <View style={[styles.teleCard, isDark && styles.cardDark]}>
              <Text style={[styles.teleCardLabel, isDark && styles.textSubDark]}>{t.liveness}</Text>
              <Text style={[styles.teleCardValue, styles.valAmber]} numberOfLines={1}>{systemLog || 'Checking...'}</Text>
              <Text style={[styles.teleCardSub, isDark && styles.textSubDark]}>Anti-spoof active</Text>
            </View>

          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.btnBlue]} onPress={handleRegisterPress}>
            <View style={[styles.btnIcon, { backgroundColor: 'rgba(255, 255, 255, 0.2)' }]}><Text style={{fontSize: 16}}>👤</Text></View>
            <Text style={[styles.btnLabel, { color: '#fff' }]}>{t.regBtn}</Text>
            <Text style={[styles.btnSub, { color: '#fff' }]}>{t.regSub}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.btn, styles.btnTeal]} onPress={startVerificationProcess}>
            <View style={[styles.btnIcon, { backgroundColor: 'rgba(255, 255, 255, 0.3)' }]}><Text style={{fontSize: 16}}>🔓</Text></View>
            <Text style={[styles.btnLabel, { color: '#003d45' }]}>{t.logBtn}</Text>
            <Text style={[styles.btnSub, { color: '#003d45' }]}>{t.logSub}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.btn, styles.btnOutline, isDark && styles.btnOutlineDark]} onPress={handleOpenRoster}>
            <View style={[styles.btnIcon, { backgroundColor: isDark ? '#1a73e8' : '#eaf2ff' }]}><Text style={{fontSize: 16}}>👥</Text></View>
            <Text style={[styles.btnLabel, { color: isDark ? '#fff' : '#1a73e8' }]}>{t.viewBtn}</Text>
            <Text style={[styles.btnSub, { color: isDark ? '#fff' : '#1a73e8' }]}>{t.viewSub}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.btn, styles.btnDark]} onPress={executeCloudToEdgeSync}>
            <View style={[styles.btnIcon, { backgroundColor: 'rgba(255, 255, 255, 0.12)' }]}><Text style={{fontSize: 16}}>🗄️</Text></View>
            <Text style={[styles.btnLabel, { color: '#fff' }]}>{t.syncBtn}</Text>
            <Text style={[styles.btnSub, { color: '#fff' }]}>{t.syncSub}</Text>
          </TouchableOpacity>
        </View>

        <Modal 
          visible={showRosterModal} 
          animationType="slide" 
          transparent={true} 
          statusBarTranslucent={true}
          onRequestClose={() => setShowRosterModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, isDark && styles.surfaceDark]}>
              <Text style={styles.modalTitle}>LOCAL ROSTER</Text>
              <View style={[styles.tableHeader, isDark && {borderBottomColor: '#334155'}]}>
                <Text style={[styles.tableHeaderText, {flex: 0.3}]}>ID</Text>
                <Text style={[styles.tableHeaderText, {flex: 0.7}]}>NAME</Text>
              </View>
              {localUsers.length === 0 ? (
                <Text style={styles.emptyText}>No identities found.</Text>
              ) : (
                <FlatList 
                  data={localUsers}
                  keyExtractor={(item) => item.id.toString()}
                  renderItem={({item}) => (
                    <View style={[styles.tableRow, isDark && {borderBottomColor: '#1e293b'}]}>
                      <Text style={[styles.tableCellText, isDark && styles.textDark, {flex: 0.3}]}>{item.id}</Text>
                      <Text style={[styles.tableCellText, isDark && styles.textDark, {flex: 0.7}]}>{item.name}</Text>
                    </View>
                  )}
                />
              )}
              <TouchableOpacity style={[styles.closeModalBtn, isDark && {backgroundColor: '#1e293b', borderColor: '#334155'}]} onPress={() => setShowRosterModal(false)}>
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
  root: { flex: 1, backgroundColor: '#eaf2ff' },
  
  rootDark: { backgroundColor: '#0f172a' },
  surfaceDark: { backgroundColor: '#1e293b', borderColor: '#334155' },
  cardDark: { backgroundColor: '#0f172a', borderColor: '#334155' },
  textDark: { color: '#f8fafc' },
  textSubDark: { color: '#94a3b8' },
  camFrameDark: { backgroundColor: '#0f172a' },
  inputDark: { backgroundColor: '#334155', color: '#f8fafc', borderColor: '#475569' },
  btnOutlineDark: { backgroundColor: '#1e293b', borderColor: '#334155' },

  topbar: { backgroundColor: '#1a73e8', paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brandContainer: { flexDirection: 'row', alignItems: 'center' },
  menuIconBox: { marginRight: 12, padding: 4 },
  menuIcon: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  brand: { color: '#fff', fontWeight: '900', fontSize: 13, letterSpacing: 1 },
  statusPill: { backgroundColor: 'rgba(255, 255, 255, 0.18)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.35)', borderRadius: 20, paddingVertical: 4, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#f87171', marginRight: 6 },
  dotOnline: { backgroundColor: '#4ade80' },
  statusText: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

  premiumOverlay: { flex: 1, flexDirection: 'row' },
  premiumOverlayBackground: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.6)' },
  premiumDrawer: { width: '75%', backgroundColor: '#FFFFFF', height: height, paddingTop: 60, paddingHorizontal: 24, shadowColor: '#000', shadowOffset: { width: -5, height: 0 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 15 },
  premiumHeader: { fontSize: 20, fontWeight: '800', color: '#1A73E8', letterSpacing: 1.2, marginBottom: 40 },
  premiumSection: { marginBottom: 35 },
  premiumSectionTitle: { fontSize: 12, fontWeight: '700', color: '#707A8A', letterSpacing: 1.5, marginBottom: 12 },
  segmentContainer: { flexDirection: 'row', backgroundColor: '#F1F3F4', borderRadius: 12, padding: 4 },
  segmentContainerDark: { backgroundColor: '#0f172a' },
  segmentButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: '#1A73E8', shadowColor: '#1A73E8', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 2 },
  segmentActiveDark: { backgroundColor: '#1A73E8', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 4, elevation: 2 },
  segmentInactive: { backgroundColor: 'transparent' },
  segmentText: { fontSize: 14, fontWeight: '700' },
  segmentTextActive: { color: '#FFFFFF' },
  segmentTextInactive: { color: '#5F6368' },

  camZone: { backgroundColor: '#fff', marginHorizontal: 14, marginTop: 12, borderRadius: 16, borderWidth: 1, borderColor: '#d0e4ff', padding: 16, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  camLabel: { fontSize: 10, color: '#5a6b8c', fontWeight: '700', letterSpacing: 1, alignSelf: 'flex-start', marginBottom: 10 },
  camFrameOuter: { position: 'relative', width: 220, height: 220, marginBottom: 12 },
  camFrame: { width: '100%', height: '100%', borderRadius: 14, backgroundColor: '#f0f7ff', borderWidth: 2.5, borderColor: '#1a73e8', overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  standbyText: { color: '#1a73e8', fontWeight: 'bold', letterSpacing: 2, opacity: 0.5 },
  corner: { position: 'absolute', width: 22, height: 22, borderColor: '#1a73e8' },
  tl: { top: -2, left: -2, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 4 },
  tr: { top: -2, right: -2, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 4 },
  bl: { bottom: -2, left: -2, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 4 },
  br: { bottom: -2, right: -2, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 4 },
  helperRow: { flexDirection: 'row', alignItems: 'center' },
  helperDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#00bcd4', marginRight: 6 },
  helperText: { fontSize: 11, color: '#5a6b8c' },

  promptContainer: { width: '90%', padding: 10, alignItems: 'center' },
  promptTitle: { color: '#1a73e8', fontWeight: 'bold', fontSize: 12, marginBottom: 10, letterSpacing: 1 },
  inputField: { width: '100%', height: 40, backgroundColor: '#fff', borderRadius: 8, color: '#0b1b3a', paddingHorizontal: 10, fontSize: 14, borderWidth: 1, borderColor: '#d0e4ff', marginBottom: 10 },
  promptConfirmBtn: { backgroundColor: '#1a73e8', paddingVertical: 8, paddingHorizontal: 20, borderRadius: 10 },
  promptConfirmBtnText: { color: '#fff', fontWeight: '900', fontSize: 12, letterSpacing: 1 },

  telemetry: { backgroundColor: '#fff', marginHorizontal: 14, marginTop: 10, borderRadius: 16, borderWidth: 1, borderColor: '#d0e4ff', padding: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  teleHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  teleTitle: { fontSize: 10, color: '#5a6b8c', fontWeight: '700', letterSpacing: 1 },
  teleTimestamp: { fontSize: 10, color: '#94a3b8' },
  teleGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  teleCard: { width: '48%', backgroundColor: '#f7fbff', borderRadius: 8, borderWidth: 1, borderColor: '#dbeafe', padding: 6, marginBottom: 5 },
  teleCardLabel: { fontSize: 8, color: '#5a6b8c', letterSpacing: 0.5, marginBottom: 1 },
  teleCardValue: { fontSize: 11, fontWeight: '700' },
  valBlue: { color: '#1a73e8' },
  valTeal: { color: '#00bcd4' },
  valGreen: { color: '#10b981' },
  valAmber: { color: '#f59e0b' },
  teleCardSub: { fontSize: 7, color: '#94a3b8', marginTop: 1 },

  actions: { marginHorizontal: 14, marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  btn: { width: '48%', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 8, flexDirection: 'column', alignItems: 'center', marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 3 },
  btnBlue: { backgroundColor: '#1a73e8' },
  btnTeal: { backgroundColor: '#00bcd4' },
  btnOutline: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#1a73e8', elevation: 0 },
  btnDark: { backgroundColor: '#0b1b3a' },
  btnIcon: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  btnLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
  btnSub: { fontSize: 9, opacity: 0.7 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(11, 27, 58, 0.8)', justifyContent: 'flex-start', alignItems: 'flex-start' },
  modalContent: { width: '85%', height: '60%', backgroundColor: '#fff', borderWidth: 1, borderColor: '#d0e4ff', borderRadius: 16, padding: 20, alignSelf: 'center', marginTop: '30%', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, elevation: 15 },
  modalTitle: { color: '#1a73e8', fontSize: 16, fontWeight: '900', letterSpacing: 1, textAlign: 'center', marginBottom: 20 },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#dbeafe', paddingBottom: 10, marginBottom: 10 },
  tableHeaderText: { color: '#5a6b8c', fontWeight: 'bold', fontSize: 11, letterSpacing: 1 },
  tableRow: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f7ff' },
  tableCellText: { color: '#0b1b3a', fontSize: 13 },
  emptyText: { color: '#94a3b8', textAlign: 'center', marginTop: 40, fontStyle: 'italic' },
  closeModalBtn: { backgroundColor: '#eaf2ff', padding: 15, borderRadius: 10, marginTop: 'auto', alignItems: 'center', borderWidth: 1, borderColor: '#d0e4ff' },
  closeModalBtnText: { color: '#1a73e8', fontWeight: 'bold', letterSpacing: 1 }
});