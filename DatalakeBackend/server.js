const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// In-Memory Cloud Database (Perfect for a fast hackathon demo)
const cloudDatabase = [];

app.post('/api/sync', (req, res) => {
    const { terminal_id, logs } = req.body;

    if (!logs || logs.length === 0) {
        return res.status(400).json({ error: "No logs detected in payload." });
    }

    console.log(`\n=================================================`);
    console.log(`📡 [DATALAKE UPLINK] Connection established`);
    console.log(`🖥️  TERMINAL: ${terminal_id}`);
    console.log(`📦 PAYLOAD: ${logs.length} offline biometric records`);
    console.log(`=================================================`);

    // Process and store each log mapping out the updated columnar attributes
    logs.forEach(log => {
        cloudDatabase.push({
            terminal_id,
            logger_name: log.logger_name,
            log_date: log.log_date,
            log_time: log.log_time,
            server_sync_time: new Date().toISOString()
        });
        console.log(` [SECURED] Identity: ${log.logger_name} | Date: ${log.log_date} | Time: ${log.log_time}`);
    });

    console.log(`=================================================\n`);

    // Respond with 200 OK. 
    // This exact response triggers the phone to PURGE its local SQLite memory.
    res.status(200).json({ 
        status: "SUCCESS", 
        message: "Payload securely integrated into the Datalake." 
    });
});

// ADDED DEV ROUTE: Allows evaluation panels to audit the cloud database live via a browser tab
app.get('/api/database', (req, res) => {
    res.json(cloudDatabase);
});

const PORT = 3000;
// Listening on '0.0.0.0' allows your physical phone to connect via WiFi or Mobile Hotspot
app.listen(PORT, '0.0.0.0', () => {
    console.log(`☁️  DATALAKE CLOUD SERVER IS ONLINE`);
    console.log(`Listening for biometric terminals on Port ${PORT}...`);
});