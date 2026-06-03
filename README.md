Datalake Biometrics is an offline-first, edge facial recognition terminal. Built with React Native and a custom Kotlin ML bridge, it processes identities locally via TFLite and SQLite for zero-latency authentication. It seamlessly background-syncs encrypted attendance logs with a Supabase PostgreSQL cloud when connectivity returns.
# 👁️ Datalake Biometrics: Edge-First Identity Vault

[![React Native](https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactnative.dev/)
[![Kotlin](https://img.shields.io/badge/kotlin-%237F52FF.svg?style=for-the-badge&logo=kotlin&logoColor=white)](https://kotlinlang.org/)
[![SQLite](https://img.shields.io/badge/sqlite-%2307405e.svg?style=for-the-badge&logo=sqlite&logoColor=white)](https://sqlite.org/index.html)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)

Traditional cloud-dependent biometric systems suffer from latency, privacy risks, and complete failure in low-connectivity environments like remote field sites or factory floors. 

**Datalake Biometrics** is an offline-first, edge-computing facial recognition terminal built to solve this. It processes identities entirely on-device, ensuring zero-latency authentication, operational resilience, and maximum data privacy.

---

## 🚀 Quick Start: Try the App

Due to platform submission limits (25MB), the `node_modules` and heavy Android build artifacts have been omitted from this repository source code. 

**To test the application immediately without compiling from source, please download the pre-built Release APK:**

👉 **[DOWNLOAD RELEASE APK HERE](https://drive.google.com/file/d/1hL63qOWkgG1id701HBO3W6rLCQcCCygs/view?usp=drive_link)**

*Note: Ensure "Install from Unknown Sources" is enabled on your Android device to test the APK.*

---

## ✨ Key Features

* **⚡ Zero-Latency Verification:** Authenticates identities in milliseconds against a local SQLite vault. Requires **zero** active internet connection to function.
* **🧠 Custom Kotlin ML Bridge:** A high-performance bridge between Android's CameraX and React Native prevents frame drops and UI thread blocking during active ML inference.
* **🔄 Offline-First Sync Engine:** Automatically pushes encrypted attendance logs and fetches new master identities whenever a network is detected in the background.
* **💻 Enterprise Telemetry UI:** A floating terminal interface providing real-time liveness detection, network state, and system logs.
* **⚙️ Hardware Kiosk Ready:** Includes bilingual support (English/Hindi) and an SQLite-persisted Dark/Light theme tailored for dedicated hardware deployments.

---

## 🛠️ Technical Architecture

Instead of transmitting raw images to a vulnerable cloud server, our custom Kotlin native module leverages a lightweight (4MB) **MobileFaceNet TFLite** model to generate encrypted mathematical face vectors. 

These vectors are securely persisted in a local **SQLite** database. When network connectivity is restored, a background worker seamlessly syncs attendance logs and roster updates with a **Supabase PostgreSQL** backend without interrupting the active camera feed.

* **Frontend:** React Native (TypeScript/JavaScript)
* **Native ML Layer:** Kotlin, Android CameraX, TensorFlow Lite
* **Edge Storage:** `react-native-quick-sqlite`
* **Cloud Infrastructure:** Supabase (PostgreSQL)

---

## 💻 Local Development & Installation

If you wish to build the project from the source code, follow these steps:

### 1. Prerequisites
* **Node.js** (v18 or newer)
* **Android Studio** & Android SDK (Ensure NDK and CMake are installed for the native Kotlin bridge)
* **React Native CLI**
* A physical Android device connected via USB (with USB Debugging enabled) or an Emulator with camera support.

### 2. Clone & Install Dependencies
```bash
git clone [https://github.com/ajitdikshit/biometric.git](https://github.com/ajitdikshit/biometric.git)
cd biometric
npm install
