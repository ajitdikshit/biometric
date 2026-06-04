import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, View, Text, PermissionsAndroid, 
  requireNativeComponent, TouchableOpacity, TextInput, 
  ViewProps, Keyboard, TouchableWithoutFeedback, Modal, FlatList,
  StatusBar, Dimensions, Alert, Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { 
  initDatabase, saveOfflineLog, getPendingCount, restoreUserFromCloud, 
  saveMasterName, getAllMasterUsers, saveLanguageSetting, getLanguageSetting,
  saveThemeSetting, getThemeSetting, clearSyncedLogs
} from './localDB';

import { registerNetworkSyncMonitor, syncAndPurgeLogs, backupIdentityToCloud, restoreIdentitiesFromCloud, fetchAllCloudLogs } from './sync';

interface LiveBiometricViewProps extends ViewProps {
  mode: string;
  registerName: string;
  nativeRoster?: string;
  onVerified: (event: any) => void;
}
const LiveBiometricView = requireNativeComponent<LiveBiometricViewProps>('LiveBiometricView');

const { height } = Dimensions.get('window');

const NHAI_LOGO_URI = require('./assets/nhai-logo-hd.png');

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

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

  const [showLogsModal, setShowLogsModal] = useState(false);
  const [localLogs, setLocalLogs] = useState<any[]>([]);
  const [isFetchingLogs, setIsFetchingLogs] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date());

  const [attendanceLog, setAttendanceLog] = useState('');
  const [registrationLog, setRegistrationLog] = useState('');
  const [systemLog, setSystemLog] = useState('');
  
  const [currentTime, setCurrentTime] = useState('');

  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [lang, setLang] = useState('en');

  const t = {
    brand: lang === 'en' ? 'NHAI BIOMETRICS' : 'एनएचएआई बायोमेट्रिक्स',
    online: lang === 'en' ? 'ONLINE' : 'ऑनलाइन',
    offline: lang === 'en' ? 'OFFLINE' : 'ऑफ़लाइन',
    faceScan: lang === 'en' ? 'IDENTITY VERIFICATION SCANNER' : 'पहचान सत्यापन स्कैनर',
    standby: lang === 'en' ? 'SYSTEM STANDBY' : 'सिस्टम स्टैंडबाय',
    helper: lang === 'en' ? 'POSITION FACE WITHIN BOUNDARY' : 'चेहरे को सीमा के भीतर रखें',
    telemetry: lang === 'en' ? 'SYSTEM TELEMETRY LOGS' : 'सिस्टम टेलीमेट्री लॉग',
    attendance: lang === 'en' ? 'ATTENDANCE' : 'उपस्थिति',
    enrollment: lang === 'en' ? 'ENROLLMENT' : 'पंजीकरण',
    system: lang === 'en' ? 'NETWORK' : 'नेटवर्क',
    liveness: lang === 'en' ? 'LIVENESS' : 'सजीवता',
    regBtn: lang === 'en' ? 'REGISTER NEW USER' : 'नया उपयोगकर्ता बनाएं',
    logBtn: lang === 'en' ? 'VERIFY IDENTITY' : 'पहचान सत्यापित करें',
    viewBtn: lang === 'en' ? 'VIEW LOCAL ROSTER' : 'स्थानीय रोस्टर देखें',
    syncBtn: lang === 'en' ? 'FETCH CLOUD DB' : 'क्लाउड डेटाबेस सिंक',
    viewLogsBtn: lang === 'en' ? 'VIEW ATTENDANCE REGISTRY' : 'उपस्थिति रजिस्टर देखें',
    clearLogsBtn: lang === 'en' ? 'PURGE LOCAL LOGS' : 'स्थानीय लॉग मिटाएं',
    showAll: lang === 'en' ? 'VIEW ALL DATES' : 'सभी तिथियां देखें',
  };

  const monthNamesEn = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
  const monthNamesHi = ["जनवरी", "फरवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"];
  const weekDaysEn = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const weekDaysHi = ["रवि", "सोम", "मंगल", "बुध", "गुरु", "शुक्र", "शनि"];

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
    const splashTimer = setTimeout(() => {
      setShowSplash(false);
    }, 2500);

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
      clearTimeout(splashTimer);
      unsubscribeNetwork();
      clearInterval(timer);
    };
  }, []);

  const requestCameraPermission = async () => {
    try {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        setSystemLog('PERMISSION DENIED: CAMERA');
      }
    } catch (err) {
      setSystemLog('CAMERA ERROR: MODULE UNAVAILABLE');
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
      setRegistrationLog('ERROR: IDENTITY REQUIRED');
      return;
    }
    Keyboard.dismiss();
    setActiveRegisterName(nameInput.trim());
    setIsPromptingName(false);
    setCameraActive(true);
    setRegistrationLog(`AWAITING SCAN: ${nameInput.trim()}`);
  };

  const startVerificationProcess = () => {
    setIsPromptingName(false);
    setCurrentMode('VERIFY');
    setCameraActive(true);
    setAttendanceLog('AWAITING BIOMETRIC INPUT...');
  };

  const handleOpenRoster = () => {
    const users = getAllMasterUsers();
    setLocalUsers(users);
    setShowRosterModal(true);
  };

  const handleOpenLogs = async () => {
    setIsMenuVisible(false);
    setShowLogsModal(true);
    setIsFetchingLogs(true); 
    setSelectedDate(null);
    setCurrentMonthDate(new Date());

    if (!isOnline) {
      setSystemLog('NETWORK ERROR: CLOUD UNREACHABLE.');
      setIsFetchingLogs(false);
      setLocalLogs([]);
      return;
    }

    const cloudLogs = await fetchAllCloudLogs(setSystemLog);
    setLocalLogs(cloudLogs);
    setIsFetchingLogs(false); 
  };

  const handleClearLogs = () => {
    Alert.alert(
      lang === 'en' ? 'AUTHORIZATION REQUIRED' : 'प्राधिकरण आवश्यक है',
      lang === 'en' ? 'Confirm permanent deletion of local system logs?' : 'क्या आप सिस्टम लॉग को स्थायी रूप से हटाने की पुष्टि करते हैं?',
      [
        { text: lang === 'en' ? 'CANCEL' : 'रद्द करें', style: 'cancel' },
        {
          text: lang === 'en' ? 'CONFIRM PURGE' : 'मिटाएं',
          style: 'destructive',
          onPress: () => {
            clearSyncedLogs();
            setPendingLogs(getPendingCount());
            setSystemLog(lang === 'en' ? 'LOCAL LOGS PURGED.' : 'स्थानीय लॉग हटा दिए गए।');
            setIsMenuVisible(false);
          }
        }
      ]
    );
  };

  const changeMonth = (direction: number) => {
    const nextMonth = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + direction, 1);
    setCurrentMonthDate(nextMonth);
  };

  const generateCalendarDays = () => {
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const startDay = new Date(year, month, 1).getDay();
    
    const days = [];
    for (let i = 0; i < startDay; i++) {
      days.push({ id: `empty-${i}`, day: null, fullDate: null });
    }
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ id: `day-${d}`, day: d, fullDate: dateStr });
    }
    return days;
  };

  const executeCloudToEdgeSync = async () => {
    setSystemLog("FETCHING CLOUD ROSTER...");
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
        setAttendanceLog(`VERIFIED: ${matchedName}`);
        
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
          setRegistrationLog(`ENROLLMENT SUCCESS: ${matchedName}`);
          saveMasterName(matchedName, finalVector);
          syncLocalRosterToEdge();
          
          if (isOnline) {
            backupIdentityToCloud(matchedName, finalVector, setSystemLog);
          }
        } else {
          setSystemLog(`VAULT ERROR: INVALID VECTOR DATA`);
        }
      }
    } else {
      setSystemLog(`${message.toUpperCase()}`);
    }
  };

  const filteredLogs = selectedDate 
    ? localLogs.filter(log => log.log_date === selectedDate)
    : localLogs;

  if (showSplash) {
    return (
      <SafeAreaView style={styles.splashRoot}>
        <StatusBar hidden={false} backgroundColor="#E8F1F8" barStyle="dark-content" />
        <View style={styles.splashContainer}>
          <Image 
  source={require('./assets/nhai-logo-hd.png')} 
  style={styles.splashLogo} 
  resizeMode="contain" 
/>
          <Text style={styles.splashTitle}>NATIONAL HIGHWAYS AUTHORITY OF INDIA</Text>
          <Text style={styles.splashSubtitle}>BIOMETRIC ATTENDANCE PORTAL</Text>
          <Text style={styles.splashFooter}>GOVERNMENT OF INDIA</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={[styles.root, isDark && styles.rootDark]}>
        
        <StatusBar 
          hidden={false} 
          backgroundColor={isDark ? '#121212' : '#1A5F9A'} 
          barStyle="light-content" 
        />
        
        {/* TOP NAV BAR */}
        <View style={styles.topbar}>
          <View style={styles.brandContainer}>
            <TouchableOpacity onPress={() => setIsMenuVisible(true)} style={styles.menuIconBox}>
              <Text style={styles.menuIcon}>☰</Text>
            </TouchableOpacity>
            <Image 
  source={require('./assets/nhai-logo-hd.png')} 
  style={styles.navLogo} 
  resizeMode="contain" 
/>
            <Text style={styles.brand}>{t.brand}</Text>
          </View>
          <View style={[styles.statusBox, isOnline ? styles.statusBoxOnline : styles.statusBoxOffline]}>
            <Text style={styles.statusText}>{isOnline ? t.online : t.offline}</Text>
          </View>
        </View>

        {/* SETTINGS DRAWER */}
        <Modal 
          visible={isMenuVisible} 
          transparent={true} 
          animationType="fade" 
          statusBarTranslucent={true}
          onRequestClose={() => setIsMenuVisible(false)}
        >
          <View style={styles.drawerOverlay}>
            <TouchableOpacity style={styles.drawerBackground} activeOpacity={1} onPress={() => setIsMenuVisible(false)} />
            
            <View style={[styles.drawerPanel, isDark && styles.surfaceDark]}>
              <Text style={[styles.drawerHeader, isDark && styles.textDark]}>SYSTEM CONFIGURATION</Text>

              <View style={styles.drawerSection}>
                <Text style={[styles.drawerSectionTitle, isDark && styles.textDark]}>INTERFACE THEME</Text>
                <View style={styles.radioGroup}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={[styles.radioBtn, !isDark ? styles.radioBtnActive : styles.radioBtnInactive]}
                    onPress={() => { setIsDark(false); saveThemeSetting(false); }}
                  >
                    <Text style={[styles.radioText, !isDark ? styles.radioTextActive : styles.radioTextInactive]}>LIGHT</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={[styles.radioBtn, isDark ? styles.radioBtnActive : styles.radioBtnInactive]}
                    onPress={() => { setIsDark(true); saveThemeSetting(true); }}
                  >
                    <Text style={[styles.radioText, isDark ? styles.radioTextActive : styles.radioTextInactive]}>DARK</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.drawerSection}>
                <Text style={[styles.drawerSectionTitle, isDark && styles.textDark]}>SYSTEM LANGUAGE</Text>
                <View style={styles.radioGroup}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={[styles.radioBtn, lang === 'en' ? styles.radioBtnActive : styles.radioBtnInactive]}
                    onPress={() => { setLang('en'); saveLanguageSetting('en'); }}
                  >
                    <Text style={[styles.radioText, lang === 'en' ? styles.radioTextActive : styles.radioTextInactive]}>ENGLISH</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={[styles.radioBtn, lang === 'hi' ? styles.radioBtnActive : styles.radioBtnInactive]}
                    onPress={() => { setLang('hi'); saveLanguageSetting('hi'); }}
                  >
                    <Text style={[styles.radioText, lang === 'hi' ? styles.radioTextActive : styles.radioTextInactive]}>हिंदी</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.drawerSection}>
                <Text style={[styles.drawerSectionTitle, isDark && styles.textDark]}>DATABASE CONTROLS</Text>
                <TouchableOpacity style={styles.actionBtn} onPress={handleOpenLogs}>
                  <Text style={styles.actionBtnText}>{t.viewLogsBtn}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={handleClearLogs}>
                  <Text style={[styles.actionBtnText, {color: '#FFFFFF'}]}>{t.clearLogsBtn}</Text>
                </TouchableOpacity>
              </View>

            </View>
          </View>
        </Modal>

        {/* CAMERA VIEWPORT */}
        <View style={[styles.panel, isDark && styles.panelDark]}>
          <Text style={[styles.panelTitle, isDark && styles.textDark]}>{t.faceScan}</Text>
          <View style={styles.camContainer}>
            <View style={[styles.camFrame, isDark && styles.camFrameDark]}>
              
              {isPromptingName ? (
                <View style={styles.promptBox}>
                  <Text style={styles.promptTitle}>ENTER OFFICIAL ID / NAME</Text>
                  <TextInput 
                    style={[styles.inputBox, isDark && styles.inputDark]}
                    placeholder="e.g. Ajit Dikshit"
                    placeholderTextColor="#7A93AA"
                    value={nameInput}
                    onChangeText={setNameInput}
                    autoFocus={true}
                    maxLength={30}
                  />
                  <TouchableOpacity style={styles.confirmBtn} onPress={confirmRegistrationIntent}>
                    <Text style={styles.confirmBtnText}>INITIATE SCAN</Text>
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
          </View>
          <View style={styles.helperRow}>
            <Text style={[styles.helperText, isDark && styles.textDark]}>{t.helper}</Text>
          </View>
        </View>

        {/* TELEMETRY DATA GRID */}
        <View style={[styles.panel, isDark && styles.panelDark, {marginTop: 12}]}>
          <View style={styles.teleHeader}>
            <Text style={[styles.panelTitle, isDark && styles.textDark, {marginBottom: 0, borderBottomWidth: 0}]}>{t.telemetry}</Text>
            <Text style={[styles.teleTime, isDark && styles.textDark]}>{currentTime}</Text>
          </View>
          <View style={styles.dataGrid}>
            
            <View style={[styles.dataCell, isDark && styles.dataCellDark]}>
              <Text style={[styles.dataLabel, isDark && styles.textDark]}>{t.attendance}</Text>
              <Text style={styles.dataValue} numberOfLines={1}>{attendanceLog || 'WAITING...'}</Text>
            </View>

            <View style={[styles.dataCell, isDark && styles.dataCellDark]}>
              <Text style={[styles.dataLabel, isDark && styles.textDark]}>{t.enrollment}</Text>
              <Text style={styles.dataValue} numberOfLines={1}>{registrationLog || 'IDLE'}</Text>
            </View>

            <View style={[styles.dataCell, isDark && styles.dataCellDark]}>
              <Text style={[styles.dataLabel, isDark && styles.textDark]}>{t.system}</Text>
              <Text style={styles.dataValue} numberOfLines={1}>{isOnline ? 'CONNECTED' : 'DISCONNECTED'}</Text>
            </View>

            <View style={[styles.dataCell, isDark && styles.dataCellDark]}>
              <Text style={[styles.dataLabel, isDark && styles.textDark]}>{t.liveness}</Text>
              <Text style={styles.dataValue} numberOfLines={1}>{systemLog || 'INITIALIZING...'}</Text>
            </View>

          </View>
        </View>

        {/* COMMAND BUTTONS */}
        <View style={styles.commandGrid}>
          <TouchableOpacity style={styles.cmdBtnSolid} onPress={handleRegisterPress}>
            <Text style={styles.cmdBtnText}>{t.regBtn}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cmdBtnSolid} onPress={startVerificationProcess}>
            <Text style={styles.cmdBtnText}>{t.logBtn}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.cmdBtnOutline, isDark && styles.cmdBtnOutlineDark]} onPress={handleOpenRoster}>
            <Text style={[styles.cmdBtnTextOutline, isDark && styles.textDark]}>{t.viewBtn}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.cmdBtnOutline, isDark && styles.cmdBtnOutlineDark]} onPress={executeCloudToEdgeSync}>
            <Text style={[styles.cmdBtnTextOutline, isDark && styles.textDark]}>{t.syncBtn}</Text>
          </TouchableOpacity>
        </View>

        {/* ROSTER MODAL */}
        <Modal 
          visible={showRosterModal} 
          animationType="fade" 
          transparent={true} 
          statusBarTranslucent={true}
          onRequestClose={() => setShowRosterModal(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalBox, isDark && styles.modalBoxDark]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalHeaderText}>LOCAL IDENTITY ROSTER</Text>
              </View>
              <View style={[styles.tableRowHeader, isDark && styles.tableRowDark]}>
                <Text style={[styles.thText, {flex: 0.3}]}>ID NO.</Text>
                <Text style={[styles.thText, {flex: 0.7}]}>FULL NAME</Text>
              </View>
              {localUsers.length === 0 ? (
                <Text style={[styles.emptyStateText, isDark && styles.textDark]}>NO RECORDS FOUND</Text>
              ) : (
                <FlatList 
                  data={localUsers}
                  keyExtractor={(item) => item.id.toString()}
                  renderItem={({item}) => (
                    <View style={[styles.tableRow, isDark && styles.tableRowDark]}>
                      <Text style={[styles.tdText, isDark && styles.textDark, {flex: 0.3}]}>{item.id}</Text>
                      <Text style={[styles.tdText, isDark && styles.textDark, {flex: 0.7}]}>{item.name.toUpperCase()}</Text>
                    </View>
                  )}
                />
              )}
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowRosterModal(false)}>
                <Text style={styles.modalCloseText}>CLOSE WINDOW</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ATTENDANCE LOGS MODAL */}
        <Modal 
          visible={showLogsModal} 
          animationType="fade" 
          transparent={true} 
          statusBarTranslucent={true}
          onRequestClose={() => setShowLogsModal(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalBox, isDark && styles.modalBoxDark, { width: '95%', height: '85%' }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalHeaderText}>OFFICIAL REGISTRY LOGS</Text>
              </View>
              
              <View style={[styles.calWrapper, isDark && styles.calWrapperDark]}>
                <View style={styles.calTopRow}>
                  <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.calNavBtn}>
                    <Text style={styles.calNavText}>{"<"}</Text>
                  </TouchableOpacity>
                  <Text style={[styles.calMonthText, isDark && styles.textDark]}>
                    {lang === 'en' ? monthNamesEn[currentMonthDate.getMonth()] : monthNamesHi[currentMonthDate.getMonth()]} {currentMonthDate.getFullYear()}
                  </Text>
                  <TouchableOpacity onPress={() => changeMonth(1)} style={styles.calNavBtn}>
                    <Text style={styles.calNavText}>{">"}</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.calWeekRow}>
                  {(lang === 'en' ? weekDaysEn : weekDaysHi).map((day, idx) => (
                    <Text key={idx} style={[styles.calWeekText, isDark && styles.textDark]}>{day}</Text>
                  ))}
                </View>

                <View style={styles.calGrid}>
                  {generateCalendarDays().map((item, idx) => {
                    const isSelected = item.fullDate === selectedDate;
                    return (
                      <TouchableOpacity
                        key={idx}
                        disabled={!item.day}
                        style={[
                          styles.calCell,
                          isSelected && styles.calCellActive,
                          !item.day && { backgroundColor: 'transparent', borderWidth: 0 }
                        ]}
                        onPress={() => item.fullDate && setSelectedDate(item.fullDate)}
                      >
                        <Text style={[
                          styles.calCellText,
                          isDark && styles.textDark,
                          !item.day && { opacity: 0 },
                          isSelected && styles.calCellTextActive
                        ]}>
                          {item.day}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TouchableOpacity 
                  style={[styles.resetFilterBtn, !selectedDate && styles.resetFilterBtnActive]} 
                  onPress={() => setSelectedDate(null)}
                >
                  <Text style={[styles.resetFilterText, !selectedDate && styles.resetFilterTextActive]}>
                    {t.showAll} {selectedDate ? `[${selectedDate}]` : ''}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.tableRowHeader, isDark && styles.tableRowDark, {marginTop: 10, borderTopLeftRadius: 6, borderTopRightRadius: 6}]}>
                <Text style={[styles.thText, {flex: 0.35}]}>IDENTITY</Text>
                <Text style={[styles.thText, {flex: 0.25}]}>DATE</Text>
                <Text style={[styles.thText, {flex: 0.2}]}>TIME</Text>
                <Text style={[styles.thText, {flex: 0.2}]}>STATUS</Text>
              </View>
              
              {isFetchingLogs ? (
                 <Text style={[styles.emptyStateText, isDark && styles.textDark]}>FETCHING SECURE DATA...</Text>
              ) : filteredLogs.length === 0 ? (
                <Text style={[styles.emptyStateText, isDark && styles.textDark]}>NO DATA FOUND FOR QUERY.</Text>
              ) : (
                <FlatList 
                  data={filteredLogs}
                  keyExtractor={(item, index) => item.id ? item.id.toString() : index.toString()}
                  renderItem={({item}) => (
                    <View style={[styles.tableRow, isDark && styles.tableRowDark]}>
                      <Text style={[styles.tdText, isDark && styles.textDark, {flex: 0.35}]} numberOfLines={1}>{item.logger_name.toUpperCase()}</Text>
                      <Text style={[styles.tdText, isDark && styles.textDark, {flex: 0.25}]}>{item.log_date}</Text>
                      <Text style={[styles.tdText, isDark && styles.textDark, {flex: 0.2}]}>{item.log_time}</Text>
                      <Text style={[styles.tdText, {flex: 0.2, fontWeight: 'bold', color: (item.status || 'SYNCED') === 'PENDING' ? '#E53935' : '#43A047'}]}>
                        {item.status || 'SYNCED'}
                      </Text>
                    </View>
                  )}
                />
              )}
              
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowLogsModal(false)}>
                <Text style={styles.modalCloseText}>CLOSE WINDOW</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#E8F1F8' }, 
  rootDark: { backgroundColor: '#121212' },
  textDark: { color: '#FFFFFF' },

  // SPLASH SCREEN
  splashRoot: { flex: 1, backgroundColor: '#E8F1F8', justifyContent: 'center', alignItems: 'center' },
  splashContainer: { alignItems: 'center', padding: 20 },
  splashLogo: { width: 140, height: 140, marginBottom: 30 },
  splashTitle: { fontSize: 18, fontWeight: '900', color: '#1A5F9A', textAlign: 'center', letterSpacing: 1, marginBottom: 5 },
  splashSubtitle: { fontSize: 14, fontWeight: '700', color: '#4A6582', textAlign: 'center', letterSpacing: 0.5 },
  splashFooter: { position: 'absolute', bottom: -150, fontSize: 12, fontWeight: '700', color: '#7A93AA', letterSpacing: 2 },

  // TOP NAVIGATION
  topbar: { backgroundColor: '#1A5F9A', paddingVertical: 12, paddingHorizontal: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 4, borderBottomColor: '#FF9933' }, 
  brandContainer: { flexDirection: 'row', alignItems: 'center' },
  menuIconBox: { marginRight: 15, padding: 5, borderRadius: 6 },
  menuIcon: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
  navLogo: { width: 28, height: 28, marginRight: 10, backgroundColor: '#FFFFFF', borderRadius: 14 },
  brand: { color: '#FFFFFF', fontWeight: '900', fontSize: 14, letterSpacing: 1.2 },
  statusBox: { borderWidth: 1, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 },
  statusBoxOnline: { backgroundColor: '#43A047', borderColor: '#2E7D32' },
  statusBoxOffline: { backgroundColor: '#E53935', borderColor: '#C62828' },
  statusText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', letterSpacing: 1 },

  // DRAWER SETTINGS
  drawerOverlay: { flex: 1, flexDirection: 'row' },
  drawerBackground: { flex: 1, backgroundColor: 'rgba(9, 20, 36, 0.6)' },
  drawerPanel: { width: '80%', backgroundColor: '#FFFFFF', height: height, paddingTop: 40, paddingHorizontal: 20 },
  surfaceDark: { backgroundColor: '#1E1E1E' },
  drawerHeader: { fontSize: 16, fontWeight: '900', color: '#1A5F9A', letterSpacing: 1, marginBottom: 30, borderBottomWidth: 2, borderBottomColor: '#D0E0F0', paddingBottom: 10 },
  drawerSection: { marginBottom: 30 },
  drawerSectionTitle: { fontSize: 11, fontWeight: '800', color: '#4A6582', letterSpacing: 1, marginBottom: 10 },
  radioGroup: { flexDirection: 'row', borderWidth: 1.5, borderColor: '#1A5F9A', borderRadius: 8, overflow: 'hidden' },
  radioBtn: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  radioBtnActive: { backgroundColor: '#1A5F9A' },
  radioBtnInactive: { backgroundColor: '#F4F8FB' },
  radioText: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  radioTextActive: { color: '#FFFFFF' },
  radioTextInactive: { color: '#1A5F9A' },
  
  actionBtn: { backgroundColor: '#1A5F9A', paddingVertical: 12, alignItems: 'center', borderRadius: 8, marginBottom: 10 },
  actionBtnDanger: { backgroundColor: '#E53935' },
  actionBtnText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF', letterSpacing: 1 },

  // GENERIC PANELS
  panel: { backgroundColor: '#FFFFFF', marginHorizontal: 15, marginTop: 15, borderRadius: 8, padding: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  panelDark: { backgroundColor: '#1E1E1E' },
  panelTitle: { fontSize: 12, color: '#1A5F9A', fontWeight: '900', letterSpacing: 1.2, marginBottom: 10, borderBottomWidth: 1, borderBottomColor: '#D0E0F0', paddingBottom: 6 },
  
  // CAMERA VIEWPORT
  camContainer: { alignItems: 'center', marginBottom: 12 },
  camFrame: { width: 210, height: 210, backgroundColor: '#F4F8FB', borderWidth: 2, borderColor: '#1A5F9A', borderRadius: 8, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  camFrameDark: { backgroundColor: '#000000', borderColor: '#334455' },
  standbyText: { color: '#1A5F9A', fontWeight: '900', letterSpacing: 1, opacity: 0.6 },
  helperRow: { alignItems: 'center', backgroundColor: '#E8F1F8', paddingVertical: 6, borderRadius: 6 },
  helperText: { fontSize: 10, color: '#1A5F9A', fontWeight: '800', letterSpacing: 1 },

  // PROMPT INPUT
  promptBox: { width: '100%', padding: 10, alignItems: 'center', backgroundColor: '#FFFFFF' },
  promptTitle: { color: '#1A5F9A', fontWeight: '900', fontSize: 11, marginBottom: 10, letterSpacing: 1 },
  inputBox: { width: '90%', height: 40, backgroundColor: '#FFFFFF', color: '#000000', paddingHorizontal: 10, fontSize: 14, borderWidth: 1.5, borderColor: '#1A5F9A', borderRadius: 6, marginBottom: 10, textAlign: 'center' },
  inputDark: { backgroundColor: '#333333', color: '#FFFFFF', borderColor: '#555555' },
  confirmBtn: { backgroundColor: '#1A5F9A', paddingVertical: 8, paddingHorizontal: 20, borderRadius: 6 },
  confirmBtnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 11, letterSpacing: 1 },

  // TELEMETRY
  teleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10, borderBottomWidth: 1, borderBottomColor: '#D0E0F0', paddingBottom: 6 },
  teleTime: { fontSize: 10, fontWeight: 'bold', color: '#7A93AA' },
  dataGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  dataCell: { width: '48%', backgroundColor: '#F8FBFF', borderWidth: 1, borderColor: '#D0E0F0', padding: 10, marginBottom: 8, borderRadius: 6 },
  dataCellDark: { backgroundColor: '#121212', borderColor: '#333333' },
  dataLabel: { fontSize: 9, color: '#4A6582', fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  dataValue: { fontSize: 11, fontWeight: '900', color: '#1A5F9A' },

  // BUTTONS
  commandGrid: { marginHorizontal: 15, marginTop: 15, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  cmdBtnSolid: { width: '48%', backgroundColor: '#1A5F9A', paddingVertical: 14, alignItems: 'center', marginBottom: 10, borderRadius: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  cmdBtnOutline: { width: '48%', backgroundColor: '#F4F8FB', paddingVertical: 14, alignItems: 'center', marginBottom: 10, borderWidth: 1.5, borderColor: '#1A5F9A', borderRadius: 8 },
  cmdBtnOutlineDark: { backgroundColor: '#1E1E1E', borderColor: '#555555' },
  cmdBtnText: { fontSize: 11, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.5 },
  cmdBtnTextOutline: { fontSize: 11, fontWeight: '900', color: '#1A5F9A', letterSpacing: 0.5 },

  // MODALS & TABLES
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(9, 20, 36, 0.7)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { width: '90%', height: '70%', backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, elevation: 10 },
  modalBoxDark: { backgroundColor: '#1E1E1E' },
  modalHeader: { backgroundColor: '#1A5F9A', paddingVertical: 12, marginBottom: 10, alignItems: 'center', borderRadius: 6 },
  modalHeaderText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900', letterSpacing: 1.5 },
  
  tableRowHeader: { flexDirection: 'row', backgroundColor: '#E8F1F8', paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 2, borderBottomColor: '#1A5F9A' },
  tableRow: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#D0E0F0' },
  tableRowDark: { backgroundColor: '#1E1E1E', borderBottomColor: '#333333' },
  thText: { fontSize: 10, fontWeight: '900', color: '#1A5F9A', letterSpacing: 0.5 },
  tdText: { fontSize: 11, fontWeight: '700', color: '#333333' },
  emptyStateText: { textAlign: 'center', marginTop: 40, fontSize: 12, fontWeight: '800', color: '#7A93AA', letterSpacing: 1 },
  
  modalCloseBtn: { backgroundColor: '#F4F8FB', padding: 14, marginTop: 'auto', alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: '#D0E0F0' },
  modalCloseText: { color: '#1A5F9A', fontWeight: '900', letterSpacing: 1.2, fontSize: 11 },

  // CALENDAR GRID
  calWrapper: { borderWidth: 1, borderColor: '#D0E0F0', padding: 8, backgroundColor: '#F8FBFF', borderRadius: 8 },
  calWrapperDark: { borderColor: '#333333', backgroundColor: '#121212' },
  calTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1A5F9A', paddingVertical: 8, marginBottom: 8, borderRadius: 6 },
  calNavBtn: { paddingHorizontal: 20 },
  calNavText: { color: '#FFFFFF', fontWeight: '900', fontSize: 16 },
  calMonthText: { color: '#FFFFFF', fontWeight: '900', fontSize: 12, letterSpacing: 1 },
  calWeekRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#D0E0F0', paddingBottom: 4, marginBottom: 4 },
  calWeekText: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 9, fontWeight: '900', color: '#4A6582' },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: `${100 / 7}%`, aspectRatio: 1.5, justifyContent: 'center', alignItems: 'center', borderRadius: 4, marginVertical: 1 },
  calCellActive: { backgroundColor: '#1A5F9A' },
  calCellText: { fontSize: 11, fontWeight: '800', color: '#4A6582' },
  calCellTextActive: { color: '#FFFFFF' },
  resetFilterBtn: { marginTop: 8, paddingVertical: 10, alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D0E0F0', borderRadius: 6 },
  resetFilterBtnActive: { backgroundColor: '#1A5F9A', borderColor: '#1A5F9A' },
  resetFilterText: { fontSize: 10, fontWeight: '900', color: '#1A5F9A', letterSpacing: 1 },
  resetFilterTextActive: { color: '#FFFFFF' }
});