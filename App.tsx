import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, PermissionsAndroid, Alert, requireNativeComponent, TouchableOpacity, TextInput, ViewProps, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { initDatabase, saveOfflineLog, getPendingCount } from './localDB';
import { registerNetworkSyncMonitor } from './sync';

interface LiveBiometricViewProps extends ViewProps {
  mode: string;
  registerName: string;
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

  useEffect(() => {
    initDatabase();
    setPendingLogs(getPendingCount());
    requestCameraPermission();

    // Initialize background network triggers via our sync engine script
    const unsubscribeNetwork = registerNetworkSyncMonitor(setPendingLogs, setIsOnline);

    return () => {
      unsubscribeNetwork();
    };
  }, []);

  const requestCameraPermission = async () => {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
  };

  const handleRegisterPress = () => {
    setCameraActive(false); 
    setCurrentMode('REGISTER');
    setNameInput('');
    setIsPromptingName(true);
  };

  const confirmRegistrationIntent = () => {
    if (nameInput.trim().length === 0) {
      Alert.alert('REQUIRED FIELD', 'Please enter an identification name to proceed.');
      return;
    }
    Keyboard.dismiss();
    setActiveRegisterName(nameInput.trim());
    setIsPromptingName(false);
    setCameraActive(true);
  };

  const startVerificationProcess = () => {
    setIsPromptingName(false);
    setCurrentMode('VERIFY');
    setCameraActive(true);
  };

  const handleVerificationEvent = (event: any) => {
    const { status, message, matchedName } = event.nativeEvent;
    setCameraActive(false);

    if (status === 'SUCCESS') {
      if (currentMode === 'VERIFY') {
        saveOfflineLog(matchedName || 'Unknown_User');
        setPendingLogs(getPendingCount());
        Alert.alert('ACCESS GRANTED', `Welcome back, ${matchedName}\n\n${message}`);
      } else {
        Alert.alert('REGISTRATION SUCCESSFUL', `Identity profile for '${matchedName}' has been secured inside the database.`);
      }
    } else {
      Alert.alert('SECURITY CLEARANCE ERROR', message);
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
                  style={StyleSheet.absoluteFillObject} 
                  onVerified={handleVerificationEvent} 
                />
              </>
           ) : (
              <Text style={styles.cameraText}>SYSTEM STANDBY</Text>
           )}
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={[styles.button, styles.registerButton]} onPress={handleRegisterPress}>
            <Text style={styles.buttonText}>REGISTER FACE</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.button, styles.verifyButton]} onPress={startVerificationProcess}>
            <Text style={[styles.buttonText, { color: '#000' }]}>LOGIN</Text>
          </TouchableOpacity>
        </View>

      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' },
  header: { position: 'absolute', top: 50, alignItems: 'center' },
  headerText: { color: '#00ffcc', fontSize: 22, fontWeight: '900', letterSpacing: 2 },
  subText: { fontSize: 12, marginTop: 5, letterSpacing: 1, fontWeight: 'bold' },
  queueContainer: { backgroundColor: '#111', padding: 10, borderRadius: 8, marginBottom: 20 },
  queueText: { color: '#fff', fontWeight: 'bold', fontSize: 14, letterSpacing: 1 },
  cameraBox: { 
    width: 320, 
    height: 420, 
    borderWidth: 2, 
    borderColor: '#333', 
    borderRadius: 15, 
    backgroundColor: '#111', 
    overflow: 'hidden',
    justifyContent: 'center', 
    alignItems: 'center',
    marginBottom: 30
  },
  challengeText: { color: '#00ffcc', fontWeight: '900', fontSize: 16, textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.7)', width: '100%', padding: 15, position: 'absolute', top: 0, zIndex: 10 },
  cameraText: { color: '#555', fontWeight: 'bold', letterSpacing: 2, fontSize: 16 },
  buttonRow: { flexDirection: 'row', gap: 15 },
  button: { paddingVertical: 18, paddingHorizontal: 25, borderRadius: 30, elevation: 5 },
  registerButton: { backgroundColor: '#333', borderWidth: 1, borderColor: '#555' },
  verifyButton: { backgroundColor: '#00ffcc' },
  buttonText: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 1 },
  promptContainer: { width: '100%', padding: 20, alignItems: 'center' },
  promptTitle: { color: '#00ffcc', fontWeight: 'bold', fontSize: 14, marginBottom: 15, letterSpacing: 1 },
  inputField: { width: '100%', height: 50, backgroundColor: '#222', borderRadius: 10, color: '#fff', paddingHorizontal: 15, fontSize: 16, borderWidth: 1, borderColor: '#444', marginBottom: 20 },
  promptConfirmBtn: { backgroundColor: '#00ffcc', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 20 },
  promptConfirmBtnText: { color: '#000', fontWeight: '900', fontSize: 12, letterSpacing: 1 }
});