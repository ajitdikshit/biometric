DATALAKE BIOMETRICS: Edge-to-Cloud Identity Verification System
Project Overview
Datalake Biometrics is a high-performance, secure biometric authentication terminal designed for decentralized environments. It bridges the gap between local edge computing and cloud-based identity synchronization. By utilizing on-device machine learning for real-time face recognition and blink detection, the system ensures that user identities are verified locally without latency, while maintaining a robust cloud-syncing mechanism for centralized attendance logs and profile management.
Architecture
1. Edge Layer (Client-Side)
The edge layer acts as the primary authentication terminal, operating entirely offline to ensure availability in remote or low-connectivity zones.
•	Camera Processing: Managed via Android CameraX, optimized for low-latency frame analysis.
•	Biometric Engine: Implements Google ML Kit for facial landmark extraction and blink detection to prevent spoofing.
•	Inference Engine: TensorFlow Lite (MobileFaceNet) runs directly on the device, converting facial features into a 192-dimensional vector.
•	Local Storage: SQLite (powered by react-native-quick-sqlite) stores verified user profiles and pending attendance logs locally to maintain the "offline-first" promise.
2. Synchronization Layer
The system employs a dual-sync strategy to ensure data consistency between the edge terminal and the cloud.
•	Attendance Uplink: Pushes batched logs to the cloud when connectivity is detected, ensuring data integrity without continuous internet dependency.
•	Identity Roster Bridge: A custom Kotlin-to-React Native bridge that injects cloud-synced user rosters directly into the camera module at runtime, allowing the local terminal to recognize new users registered on other devices.
3. Cloud Layer (Backend)
•	Primary Backend: Supabase (PostgreSQL) acts as the source of truth for all registered identity vectors and attendance records.
•	API/Service: Secure RESTful endpoints handle biometric vector persistence and attendance logging.
•	Fallback: An integrated Node.js local server serves as an in-memory disaster recovery mechanism, ensuring the system remains operational even if primary cloud services are inaccessible.
Technology Stack
Domain	Technology
Mobile Framework	React Native
Native Layer	Kotlin (CameraX, TFLite, JNI)
Machine Learning	TensorFlow Lite, Google ML Kit
Database (Edge)	SQLite (react-native-quick-sqlite)
Database (Cloud)	Supabase (PostgreSQL)
Server/API	Node.js, Express
Connectivity	NetInfo (Dynamic sync monitoring)
Key Features
Robust Liveness Detection
Unlike standard facial recognition systems that can be bypassed by printed photos, Datalake incorporates an intelligent Blink Detection Engine. By monitoring the spatial delta between eyelid closure and head orientation (Pitch, Yaw, Roll), the system rejects any input that fails to demonstrate natural human 3D movement.
Offline-First Attendance
The application queue system ensures that attendance logs are preserved locally during connectivity drops. Once the system detects an internet connection, it utilizes a background sync process to purge logs and update the cloud database without interrupting the user.
Dynamic Profile Injection
The system supports cross-terminal recognition. Users can register on one terminal and have their identity propagated to all other nodes in the network via the Cloud-to-Edge synchronization bridge, making it ideal for distributed workforce environments.
Deployment Instructions
Prerequisites
•	Node.js (LTS version)
•	Android SDK / Gradle 8.x
•	React Native CLI
Setup
1.	Clone the repository:
Bash
git clone [repository-url]
2.	Configure Environment:
Create a .env file in the root directory:
Code snippet
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
3.	Install Dependencies:
Bash
npm install
4.	Build Native Modules:
Bash
cd android
./gradlew assembleRelease
Security Considerations
•	Vector Normalization: All biometric vectors are normalized using L2-norm to ensure consistent matching regardless of lighting or angle variations.
•	Data Minimization: Biometric data is stored as mathematical embeddings (vectors) rather than raw images, significantly reducing the impact of a potential data breach.
•	Encapsulation: The identity roster bridge is restricted to authenticated sessions, preventing unauthorized tampering with the biometric database.
Future Roadmap
•	Multi-Modal Authentication: Integration of voice print verification to enhance the security layer.
•	Real-time Analytics Dashboard: Development of a web-based portal to visualize attendance trends and terminal health in real-time.
•	Advanced Encryption: Moving towards end-to-end encryption for all vector data transmitted between edge terminals and the cloud.

