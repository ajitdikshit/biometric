import { open } from 'react-native-quick-sqlite';

const db = open({ name: 'datalake_logs.sqlite' });

export const initDatabase = () => {
  // Existing logs table
  db.execute(
    `CREATE TABLE IF NOT EXISTS attendance_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING'
    );`
  );
  
  // Table to store the registered user's name (Optional fallback)
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

export const saveOfflineLog = (userName) => {
  const timestamp = new Date().toISOString();
  db.execute(
    'INSERT INTO attendance_logs (user_id, timestamp) VALUES (?, ?);',
    [userName, timestamp]
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