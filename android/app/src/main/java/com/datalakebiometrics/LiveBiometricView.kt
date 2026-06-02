package com.datalakebiometrics

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.Matrix
import android.graphics.Rect
import android.graphics.YuvImage
import android.util.Log
import android.widget.FrameLayout
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import org.tensorflow.lite.Interpreter
import java.io.ByteArrayOutputStream
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.channels.FileChannel
import java.util.HashSet

@SuppressLint("ViewConstructor")
class LiveBiometricView(private val reactContext: ReactContext) : FrameLayout(reactContext) {
    private val previewView: PreviewView = PreviewView(reactContext)
    private var tflite: Interpreter? = null
    
    private var preBlinkYaw = 0f
    private var preBlinkPitch = 0f
    private var preBlinkRoll = 0f
    private var isEyesClosed = false
    private var blinkCompleted = false
    private var isProcessing = false
    private var currentMode = "VERIFY"
    private var registerName = "Unknown User"

    init {
        previewView.implementationMode = PreviewView.ImplementationMode.COMPATIBLE
        previewView.layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        addView(previewView)
        setupLayoutHack()
        loadAIModel()
        startCamera()
    }

    // --- SUPABASE CLOUD RESTORE BRIDGE ---
    fun syncCloudRoster(rosterStr: String) {
        val prefs = reactContext.getSharedPreferences("DatalakeBiometrics", Context.MODE_PRIVATE)
        val updatedFacesSet = HashSet<String>()
        if (rosterStr.isNotEmpty()) {
            val profiles = rosterStr.split("|")
            for (profile in profiles) {
                if (profile.contains(":")) updatedFacesSet.add(profile)
            }
        }
        prefs.edit().putStringSet("registered_vectors", updatedFacesSet).apply()
        Log.d("DATALAKE_SYNC", "Native Vault Updated with ${updatedFacesSet.size} Cloud Profiles")
    }

    fun setMode(mode: String) { this.currentMode = mode }

    fun setRegisterName(name: String) {
        val sanitized = name.replace(":", "").trim()
        this.registerName = if (sanitized.isEmpty()) "Unknown User" else sanitized
    }

    // --- AI MODEL & CAMERA SETUP ---
    private fun loadAIModel() {
        try {
            val fd = reactContext.assets.openFd("mobilefacenet.tflite")
            val inputStream = FileInputStream(fd.fileDescriptor)
            val buffer = inputStream.channel.map(FileChannel.MapMode.READ_ONLY, fd.startOffset, fd.declaredLength)
            tflite = Interpreter(buffer)
        } catch (e: Exception) {
            Log.e("DATALAKE_TRACKER", "Model load failed: ${e.message}")
        }
    }

    private fun startCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(reactContext)
        cameraProviderFuture.addListener({
            val cameraProvider = cameraProviderFuture.get()
            val preview = Preview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }

            val imageAnalyzer = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
                .also {
                    it.setAnalyzer(ContextCompat.getMainExecutor(reactContext)) { imageProxy ->
                        processFrame(imageProxy)
                    }
                }

            try {
                cameraProvider.unbindAll()
                val lifecycleOwner = reactContext.currentActivity as? LifecycleOwner 
                    ?: throw Exception("Activity Context is not a LifecycleOwner")
                cameraProvider.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_FRONT_CAMERA, preview, imageAnalyzer)
            } catch (e: Exception) {
                Log.e("DATALAKE_TRACKER", "Camera bind failed: ${e.message}")
            }
        }, ContextCompat.getMainExecutor(reactContext))
    }

    // --- CORE FACE & BLINK DETECTION (LOCKED) ---
    @SuppressLint("UnsafeOptInUsageError")
    private fun processFrame(imageProxy: ImageProxy) {
        if (isProcessing) {
            imageProxy.close()
            return
        }

        val mediaImage = imageProxy.image
        if (mediaImage != null) {
            val rotationDegrees = imageProxy.imageInfo.rotationDegrees
            val image = InputImage.fromMediaImage(mediaImage, rotationDegrees)
            
            val options = FaceDetectorOptions.Builder()
                .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
                .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
                .build()

            FaceDetection.getClient(options).process(image)
                .addOnSuccessListener { faces ->
                    if (faces.isNotEmpty()) {
                        val face = faces[0]
                        val leftEye = face.leftEyeOpenProbability ?: -1f
                        val rightEye = face.rightEyeOpenProbability ?: -1f

                        if (leftEye != -1f && rightEye != -1f) {
                            val currentYaw = face.headEulerAngleY
                            val currentPitch = face.headEulerAngleX
                            val currentRoll = face.headEulerAngleZ

                            // 1. BASELINE TRACKING (0.65f)
                            if (leftEye > 0.65f && rightEye > 0.65f && !isEyesClosed) {
                                preBlinkYaw = currentYaw
                                preBlinkPitch = currentPitch
                                preBlinkRoll = currentRoll
                            }

                            // 2. DETECT EYES CLOSING (0.45f)
                            if (leftEye < 0.45f && rightEye < 0.45f) {
                                isEyesClosed = true
                            } 
                            
                            // 3. BLINK COMPLETED
                            else if (leftEye > 0.65f && rightEye > 0.65f && isEyesClosed) {
                                isEyesClosed = false
                                if (!blinkCompleted) {
                                    blinkCompleted = true
                                    isProcessing = true
                                    
                                    // 4. LIVENESS / ANTI-SPOOF (20f)
                                    val yawDelta = Math.abs(currentYaw - preBlinkYaw)
                                    val pitchDelta = Math.abs(currentPitch - preBlinkPitch)
                                    val rollDelta = Math.abs(currentRoll - preBlinkRoll)

                                    if (pitchDelta > 20f || yawDelta > 20f || rollDelta > 20f) {
                                        val event = Arguments.createMap()
                                        event.putString("status", "FAILED")
                                        event.putString("message", "SPOOF DETECTED: Unnatural 3D spatial motion. Printed photograph suspected.")
                                        reactContext.getJSModule(RCTEventEmitter::class.java).receiveEvent(id, "onVerified", event)
                                        blinkCompleted = false
                                        isProcessing = false
                                    } else {
                                        val bitmap = imageProxy.toBitmap(rotationDegrees)
                                        executeMatrixMath(bitmap, face)
                                    }
                                }
                            }
                        }
                    }
                }
                .addOnCompleteListener { imageProxy.close() }
        } else {
            imageProxy.close()
        }
    }

    // --- MATHEMATICAL VECTOR EXTRACTION ---
    private fun executeMatrixMath(fullImage: Bitmap, face: Face) {
        try {
            val bounds = face.boundingBox
            var squareSize = Math.max(bounds.width(), bounds.height())
            squareSize = (squareSize * 1.2).toInt()
            val maxPossibleSize = Math.min(fullImage.width, fullImage.height)
            if (squareSize > maxPossibleSize) squareSize = maxPossibleSize

            var x = bounds.centerX() - (squareSize / 2)
            var y = bounds.centerY() - (squareSize / 2)
            if (x < 0) x = 0
            if (y < 0) y = 0
            if (x + squareSize > fullImage.width) x = fullImage.width - squareSize
            if (y + squareSize > fullImage.height) y = fullImage.height - squareSize

            val croppedFace = Bitmap.createBitmap(fullImage, x, y, squareSize, squareSize)
            val scaledBitmap = Bitmap.createScaledBitmap(croppedFace, 112, 112, true)
            
            val byteBuffer = ByteBuffer.allocateDirect(1 * 112 * 112 * 3 * 4).apply { order(ByteOrder.nativeOrder()) }
            val intValues = IntArray(112 * 112)
            scaledBitmap.getPixels(intValues, 0, 112, 0, 0, 112, 112)

            for (pixelValue in intValues) {
                byteBuffer.putFloat(((pixelValue shr 16 and 0xFF) - 127.5f) / 128.0f)
                byteBuffer.putFloat(((pixelValue shr 8 and 0xFF) - 127.5f) / 128.0f)
                byteBuffer.putFloat(((pixelValue and 0xFF) - 127.5f) / 128.0f)
            }

            val liveEmbeddings = Array(1) { FloatArray(192) }
            tflite?.run(byteBuffer, liveEmbeddings)
            val liveVector = liveEmbeddings[0]

            // L2 Normalization
            var sumSquares = 0.0f
            for (v in liveVector) sumSquares += v * v
            val l2Norm = Math.sqrt(sumSquares.toDouble()).toFloat()
            if (l2Norm > 0f) {
                for (i in 0 until 192) liveVector[i] /= l2Norm
            }

            val prefs = reactContext.getSharedPreferences("DatalakeBiometrics", Context.MODE_PRIVATE)
            val existingFacesSet = prefs.getStringSet("registered_vectors", HashSet<String>()) ?: HashSet<String>()
            val event = Arguments.createMap()

            // Threshold (Locked to 0.55f)
            val matchingThreshold = 0.55f 

            if (currentMode == "REGISTER") {
                var isDuplicate = false
                var maximumMatchScore = 0.0f
                var matchedExistingName = ""

                for (faceEntry in existingFacesSet) {
                    val parts = faceEntry.split(":", limit = 2)
                    if (parts.size < 2) continue
                    
                    val storedName = parts[0]
                    val existingVector = parts[1].split(",").map { it.toFloat() }.toFloatArray()
                    val similarity = calculateCosineSimilarity(existingVector, liveVector)
                    
                    if (similarity > maximumMatchScore) {
                        maximumMatchScore = similarity
                        matchedExistingName = storedName
                    }
                    if (similarity >= matchingThreshold) {
                        isDuplicate = true
                        break
                    }
                }

                if (isDuplicate) {
                    event.putString("status", "FAILED")
                    event.putString("message", "DUPLICATE IDENTITY: Face already assigned to profile '$matchedExistingName'.")
                } else {
                    val newVectorString = liveVector.joinToString(",")
                    val updatedFacesSet = HashSet<String>(existingFacesSet)
                    updatedFacesSet.add("$registerName:$newVectorString")
                    
                    prefs.edit().putStringSet("registered_vectors", updatedFacesSet).commit() 
                    
                    event.putString("status", "SUCCESS")
                    event.putString("message", "Unique profile securely registered offline.")
                    event.putString("matchedName", registerName)
                    
                    // SUPABASE SYNC BRIDGE: Injecting Face Vector for React Native
                    val vectorArray = Arguments.createArray()
                    for (v in liveVector) vectorArray.pushDouble(v.toDouble())
                    event.putArray("faceVector", vectorArray)
                }
            } else {
                if (existingFacesSet.isEmpty()) {
                    event.putString("status", "FAILED")
                    event.putString("message", "NO REGISTERED FACES: System database is empty.")
                } else {
                    var authorizedMatchFound = false
                    var bestMatchScore = 0.0f
                    var verifiedProfileName = "Unknown"

                    for (faceEntry in existingFacesSet) {
                        val parts = faceEntry.split(":", limit = 2)
                        if (parts.size < 2) continue
                        
                        val storedName = parts[0]
                        val masterFaceVector = parts[1].split(",").map { it.toFloat() }.toFloatArray()
                        val similarity = calculateCosineSimilarity(masterFaceVector, liveVector)
                        
                        if (similarity >= matchingThreshold) {
                            authorizedMatchFound = true
                            if (similarity > bestMatchScore) {
                                bestMatchScore = similarity
                                verifiedProfileName = storedName
                            }
                        }
                    }

                    if (authorizedMatchFound) {
                        event.putString("status", "SUCCESS")
                        event.putString("message", "${String.format("%.2f", bestMatchScore * 100)}% Match")
                        event.putString("matchedName", verifiedProfileName)
                    } else {
                        event.putString("status", "FAILED")
                        event.putString("message", "INTRUDER ALERT: Access Denied.")
                    }
                }
            }
            
            reactContext.getJSModule(RCTEventEmitter::class.java).receiveEvent(id, "onVerified", event)
        } catch (e: Exception) {
             Log.e("DATALAKE_TRACKER", "Math Engine Failed", e)
        }
        blinkCompleted = false
        isProcessing = false
    }

    private fun calculateCosineSimilarity(vectorA: FloatArray, vectorB: FloatArray): Float {
        var dotProduct = 0.0f
        var normA = 0.0f
        var normB = 0.0f
        for (i in 0 until 192) {
            dotProduct += vectorA[i] * vectorB[i]
            normA += vectorA[i] * vectorA[i]
            normB += vectorB[i] * vectorB[i]
        }
        if (normA == 0f || normB == 0f) return 0f
        return (dotProduct / (Math.sqrt(normA.toDouble()) * Math.sqrt(normB.toDouble()))).toFloat()
    }

    private fun ImageProxy.toBitmap(rotationDegrees: Int): Bitmap {
        val yBuffer = planes[0].buffer
        val uBuffer = planes[1].buffer
        val vBuffer = planes[2].buffer
        val ySize = yBuffer.remaining()
        val uSize = uBuffer.remaining()
        val vSize = vBuffer.remaining()
        val nv21 = ByteArray(ySize + uSize + vSize)
        yBuffer.get(nv21, 0, ySize)
        vBuffer.get(nv21, ySize, vSize)
        uBuffer.get(nv21, ySize + vSize, uSize)
        val yuvImage = YuvImage(nv21, ImageFormat.NV21, this.width, this.height, null)
        val out = ByteArrayOutputStream()
        yuvImage.compressToJpeg(Rect(0, 0, yuvImage.width, yuvImage.height), 100, out)
        val imageBytes = out.toByteArray()
        val rawBitmap = BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.size)
        
        if (rotationDegrees == 0) return rawBitmap
        val matrix = Matrix()
        matrix.postRotate(rotationDegrees.toFloat())
        return Bitmap.createBitmap(rawBitmap, 0, 0, rawBitmap.width, rawBitmap.height, matrix, true)
    }

    private fun setupLayoutHack() {
        android.view.Choreographer.getInstance().postFrameCallback(object : android.view.Choreographer.FrameCallback {
            override fun doFrame(frameTimeNanos: Long) {
                manuallyLayoutChildren()
                viewTreeObserver.dispatchOnGlobalLayout()
                android.view.Choreographer.getInstance().postFrameCallback(this)
            }
        })
    }

    private fun manuallyLayoutChildren() {
        for (i in 0 until childCount) {
            val child = getChildAt(i)
            child.measure(
                MeasureSpec.makeMeasureSpec(measuredWidth, MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec(measuredHeight, MeasureSpec.EXACTLY)
            )
            child.layout(0, 0, child.measuredWidth, child.measuredHeight)
        }
    }
}