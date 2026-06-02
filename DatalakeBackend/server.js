const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// =========================================================================
// HACKATHON IN-MEMORY CLOUD (Fallback if Supabase / Wi-Fi drops)
// =========================================================================
const cloudDatabaseLogs = [];
const cloudDatabaseFaces = [];

// --- 1. ATTENDANCE LOGS SYNC ROUTE ---
app.post('/api/sync', (req, res) => {
    const { terminal_id, logs } = req.body;

    if (!logs || logs.length === 0) {
        return res.status(400).json({ error: "No logs detected in payload." });
    }

    console.log(`\n=================================================`);
    console.log(`📡 [DATALAKE UPLINK] Attendance Sync Triggered`);
    console.log(`🖥️  TERMINAL: ${terminal_id}`);
    console.log(`📦 PAYLOAD: ${logs.length} offline biometric records`);
    console.log(`=================================================`);

    logs.forEach(log => {
        cloudDatabaseLogs.push({
            terminal_id,
            logger_name: log.logger_name,
            log_date: log.log_date,
            log_time: log.log_time,
            server_sync_time: new Date().toISOString()
        });
        console.log(` ✅ [SECURED] Identity: ${log.logger_name} | Date: ${log.log_date} | Time: ${log.log_time}`);
    });

    console.log(`=================================================\n`);

    res.status(200).json({ 
        status: "SUCCESS", 
        message: "Payload securely integrated into the Datalake." 
    });
});

// --- 2. BIOMETRIC REGISTRATION ROUTE (Supabase Fallback) ---
app.post('/rest/v1/registered_faces', (req, res) => {
    const { face_name, face_vector, terminal_id } = req.body;
    
    console.log(`\n🧬 [BIOMETRIC BACKUP] New Identity Received: ${face_name}`);
    
    // Simple duplicate check
    const existing = cloudDatabaseFaces.find(f => f.face_name === face_name);
    if (!existing) {
        cloudDatabaseFaces.push({ face_name, face_vector, terminal_id });
        console.log(` ✅ Math Array Secured for ${face_name}\n`);
    } else {
        console.log(` ⚠️ Identity ${face_name} already exists. Ignored.\n`);
    }

    res.status(201).json({ status: "SUCCESS" });
});

// --- 3. BIOMETRIC FETCH ROUTE (Supabase Fallback) ---
app.get('/rest/v1/registered_faces', (req, res) => {
    console.log(`\n☁️  [DATALAKE RESTORE] Terminal requested biometric payload.`);
    console.log(`📦 Delivering ${cloudDatabaseFaces.length} profiles to edge node.\n`);
    res.status(200).json(cloudDatabaseFaces);
});

// --- 4. DEV AUDIT ROUTES (For Judges / Browsers) ---
app.get('/api/database/logs', (req, res) => {
    res.json(cloudDatabaseLogs);
});

app.get('/api/database/faces', (req, res) => {
    res.json(cloudDatabaseFaces);
});

// =========================================================================
// START SERVER
// =========================================================================
const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`☁️  DATALAKE CLOUD SERVER IS ONLINE`);
    console.log(`Listening for biometric terminals on Port ${PORT}...`);
    console.log(`-------------------------------------------------`);
    console.log(`Test Logs URL:  http://localhost:${PORT}/api/database/logs`);
    console.log(`Test Faces URL: http://localhost:${PORT}/api/database/faces`);
});