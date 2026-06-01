import { open } from 'react-native-quick-sqlite';

const db = open({ name: 'datalake_logs.sqlite' });

export const initDatabase = () => {
  // Safe validation check to clear legacy monolithic table configurations
  // Uncomment the line below for the first run if you need to wipe out old column structures:
  db.execute(`DROP TABLE IF EXISTS attendance_logs;`);

  // Relational table configuration isolating tracking attributes
  db.execute(
    `CREATE TABLE IF NOT EXISTS attendance_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      logger_name TEXT NOT NULL,
      log_date TEXT NOT NULL,
      log_time TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING'
    );`
  );
  
  // Permanent baseline container for the local primary user identity
  db.execute(
    `CREATE TABLE IF NOT EXISTS master_user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    );`
  );
};

export const saveMasterName = (name) => {
  db.execute("DELETE FROM master_user;"); 
  db.execute("INSERT INTO master_user (name) VALUES (?);", [name]);
};

export const getMasterName = () => {
  const result = db.execute("SELECT name FROM master_user LIMIT 1;");
  if (result.rows && result.rows.length > 0) {
    return result.rows.item(0).name;
  }
  return "Unknown Agent"; 
};

export const saveOfflineLog = (loggerName) => {
  const now = new Date();
  
  // Split timestamps cleanly into standard relational database segments
  const logDate = now.toISOString().split('T')[0];  // Output: YYYY-MM-DD
  const logTime = now.toTimeString().split(' ')[0]; // Output: HH:MM:SS

  db.execute(
    'INSERT INTO attendance_logs (logger_name, log_date, log_time) VALUES (?, ?, ?);',
    [loggerName, logDate, logTime]
  );
};

export const getPendingCount = () => {
  const result = db.execute("SELECT COUNT(*) as count FROM attendance_logs WHERE status = 'PENDING';");
  return result.rows?.item(0)?.count || 0;
};

export const getAllPendingLogs = () => {
  const result = db.execute("SELECT * FROM attendance_logs WHERE status = 'PENDING';");
  
  let logs = [];
  if (result.rows) {
    for (let i = 0; i < result.rows.length; i++) {
      logs.push(result.rows.item(i));
    }
  }
  return logs;
};

export const clearSyncedLogs = () => {
  db.execute("DELETE FROM attendance_logs;");
};