import { open } from 'react-native-quick-sqlite';

const db = open({ name: 'datalake_logs.sqlite' });

export const initDatabase = () => {
  db.execute('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);');
  
  db.execute(
    `CREATE TABLE IF NOT EXISTS attendance_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      logger_name TEXT NOT NULL,
      log_date TEXT NOT NULL,
      log_time TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING'
    );`
  );
  
  db.execute(
    `CREATE TABLE IF NOT EXISTS master_user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      face_vector TEXT NOT NULL
    );`
  );
};

export function saveLanguageSetting(lang) {
  db.execute('INSERT OR REPLACE INTO settings (key, value) VALUES ("app_lang", ?);', [lang]);
}

export function getLanguageSetting() {
  const result = db.execute('SELECT value FROM settings WHERE key = "app_lang";');
  if (result.rows && result.rows.length > 0) {
    return result.rows.item(0).value;
  }
  return 'en';
}

export const saveMasterName = (name, vector) => {
  try {
    const check = db.execute("SELECT count(*) as count FROM master_user WHERE name = ?;", [name]);
    const existingCount = check.rows?.item ? check.rows.item(0).count : (check.rows[0]?.count || 0);

    if (existingCount === 0) {
      const vectorString = vector ? JSON.stringify(vector) : "[]";
      db.execute("INSERT INTO master_user (name, face_vector) VALUES (?, ?);", [name, vectorString]);
    }
  } catch (error) {
    console.error("Local DB Save Error:", error);
  }
};

export const restoreUserFromCloud = (name, vectorString) => {
  try {
    const check = db.execute("SELECT count(*) as count FROM master_user WHERE name = ?;", [name]);
    const existingCount = check.rows?.item ? check.rows.item(0).count : (check.rows[0]?.count || 0);

    if (existingCount === 0) {
      const safeVector = vectorString ? vectorString : "[]";
      db.execute("INSERT INTO master_user (name, face_vector) VALUES (?, ?);", [name, safeVector]);
    }
  } catch (error) {
    console.error("Cloud Restore DB Error:", error);
  }
};

export const getAllMasterUsers = () => {
  try {
    const result = db.execute("SELECT id, name, face_vector FROM master_user;");
    let users = [];
    if (result.rows) {
      const len = result.rows.length || 0;
      for (let i = 0; i < len; i++) {
        const user = result.rows.item ? result.rows.item(i) : result.rows[i];
        users.push(user);
      }
    }
    return users;
  } catch (error) {
    return [{ id: 'ERR', name: 'Database Error Occurred', face_vector: '[]' }];
  }
};

export const saveOfflineLog = (loggerName) => {
  const now = new Date();
  const logDate = now.toISOString().split('T')[0];  
  const logTime = now.toTimeString().split(' ')[0]; 
  db.execute('INSERT INTO attendance_logs (logger_name, log_date, log_time) VALUES (?, ?, ?);', [loggerName, logDate, logTime]);
};

export const getPendingCount = () => {
  const result = db.execute("SELECT COUNT(*) as count FROM attendance_logs WHERE status = 'PENDING';");
  return result.rows?.item ? result.rows.item(0).count : (result.rows[0]?.count || 0);
};

export const getAllPendingLogs = () => {
  const result = db.execute("SELECT * FROM attendance_logs WHERE status = 'PENDING';");
  let logs = [];
  if (result.rows) {
    const len = result.rows.length || 0;
    for (let i = 0; i < len; i++) {
      logs.push(result.rows.item ? result.rows.item(i) : result.rows[i]);
    }
  }
  return logs;
};

export const clearSyncedLogs = () => {
  db.execute("DELETE FROM attendance_logs;");
};

export function saveThemeSetting(isDark) {
  db.execute('INSERT OR REPLACE INTO settings (key, value) VALUES ("app_theme", ?);', [isDark ? 'true' : 'false']);
}

export function getThemeSetting() {
  const result = db.execute('SELECT value FROM settings WHERE key = "app_theme";');
  if (result.rows && result.rows.length > 0) {
    return result.rows.item(0).value === 'true';
  }
  return false;
}