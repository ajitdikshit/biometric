package com.datalakebiometrics

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import com.facebook.react.bridge.*
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face // IMPORTED THE FACE CLASS
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import org.tensorflow.lite.Interpreter
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.channels.FileChannel

class BiometricAuthModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private var tflite: Interpreter? = null

    init {
        try {
            val fd = reactContext.assets.openFd("mobilefacenet.tflite")
            val inputStream = FileInputStream(fd.fileDescriptor)
            val buffer = inputStream.channel.map(FileChannel.MapMode.READ_ONLY, fd.startOffset, fd.declaredLength)
            tflite = Interpreter(buffer)
        } catch (e: Exception) {
            println("DATALAKE AI ERROR: ${e.message}")
        }
    }

    override fun getName(): String = "BiometricAuthModule"

    private fun getUprightBitmap(uri: Uri): Bitmap? {
        val contentResolver = reactApplicationContext.contentResolver
        var inputStream = contentResolver.openInputStream(uri)
        val originalBitmap = BitmapFactory.decodeStream(inputStream)
        inputStream?.close()

        if (originalBitmap == null) return null

        inputStream = contentResolver.openInputStream(uri)
        val exif = ExifInterface(inputStream!!)
        val orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        inputStream.close()

        val matrix = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
        }

        return Bitmap.createBitmap(originalBitmap, 0, 0, originalBitmap.width, originalBitmap.height, matrix, true)
    }

    // UPDATED SIGNATURE: Now it returns BOTH the Bitmap and the ML Kit Face object
    private fun detectFaceAndExecute(imageUriString: String, promise: Promise, onSuccess: (Bitmap, Face) -> Unit) {
        try {
            val uri = Uri.parse(imageUriString)
            
            val uprightBitmap = getUprightBitmap(uri)
            if (uprightBitmap == null) {
                promise.reject("IMAGE_ERROR", "Could not read the photo.")
                return
            }

            val options = FaceDetectorOptions.Builder()
                .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_ACCURATE)
                .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
                .build()
            
            val image = InputImage.fromBitmap(uprightBitmap, 0)
            val detector = FaceDetection.getClient(options)

            detector.process(image)
                .addOnSuccessListener { faces ->
                    if (faces.isEmpty()) {
                        promise.reject("NO_FACE", "No face detected. Please try again.")
                        return@addOnSuccessListener
                    }
                    if (faces.size > 1) {
                        promise.reject("MULTIPLE_FACES", "Multiple faces detected. Only one person allowed.")
                        return@addOnSuccessListener
                    }

                    val face = faces[0]
                    val bounds = face.boundingBox
                    val centerX = bounds.centerX()
                    val centerY = bounds.centerY()

                    var squareSize = Math.max(bounds.width(), bounds.height())
                    squareSize = (squareSize * 1.2).toInt()

                    val maxPossibleSize = Math.min(uprightBitmap.width, uprightBitmap.height)
                    if (squareSize > maxPossibleSize) squareSize = maxPossibleSize

                    var x = centerX - (squareSize / 2)
                    var y = centerY - (squareSize / 2)

                    if (x < 0) x = 0
                    if (y < 0) y = 0
                    if (x + squareSize > uprightBitmap.width) x = uprightBitmap.width - squareSize
                    if (y + squareSize > uprightBitmap.height) y = uprightBitmap.height - squareSize

                    val croppedFaceBitmap = Bitmap.createBitmap(uprightBitmap, x, y, squareSize, squareSize)
                    
                    // PASSING BOTH BACK TO THE CALLER
                    onSuccess(croppedFaceBitmap, face)
                }
                .addOnFailureListener { e ->
                    promise.reject("DETECTION_FAILED", "Failed to scan for faces: ${e.message}")
                }
        } catch (e: Exception) {
            promise.reject("SYSTEM_ERROR", e.message)
        }
    }

    private fun extractFaceVector(croppedFace: Bitmap): FloatArray {
        val scaledBitmap = Bitmap.createScaledBitmap(croppedFace, 112, 112, true)
        val byteBuffer = ByteBuffer.allocateDirect(1 * 112 * 112 * 3 * 4)
        byteBuffer.order(ByteOrder.nativeOrder())
        
        val intValues = IntArray(112 * 112)
        scaledBitmap.getPixels(intValues, 0, 112, 0, 0, 112, 112)

        for (pixelValue in intValues) {
            val r = ((pixelValue shr 16 and 0xFF) - 127.5f) / 128.0f
            val g = ((pixelValue shr 8 and 0xFF) - 127.5f) / 128.0f
            val b = ((pixelValue and 0xFF) - 127.5f) / 128.0f
            byteBuffer.putFloat(r)
            byteBuffer.putFloat(g)
            byteBuffer.putFloat(b)
        }

        val embeddings = Array(1) { FloatArray(192) }
        tflite?.run(byteBuffer, embeddings)
        return embeddings[0]
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
        return (dotProduct / (Math.sqrt(normA.toDouble()) * Math.sqrt(normB.toDouble()))).toFloat()
    }

    @ReactMethod
    fun registerMasterFace(imageUriString: String, promise: Promise) {
        if (tflite == null) {
            promise.reject("AI_OFFLINE", "AI Engine is offline.")
            return
        }

        // We use the '_' to tell Kotlin "we know there is a Face object here, but we don't need it for registration"
        detectFaceAndExecute(imageUriString, promise) { croppedFace, _ ->
            val vector = extractFaceVector(croppedFace)
            val prefs = reactApplicationContext.getSharedPreferences("DatalakeBiometrics", Context.MODE_PRIVATE)
            val vectorString = vector.joinToString(",")
            prefs.edit().putString("master_face", vectorString).apply()
            
            promise.resolve("Face registered and mathematically locked.")
        }
    }

    @ReactMethod
    fun verifyOffline(imageUriString: String, challengeCommand: String, promise: Promise) {
        if (tflite == null) {
            promise.reject("AI_OFFLINE", "AI Engine is offline.")
            return
        }

        val prefs = reactApplicationContext.getSharedPreferences("DatalakeBiometrics", Context.MODE_PRIVATE)
        val masterFaceString = prefs.getString("master_face", null)

        if (masterFaceString == null) {
            promise.reject("NO_MASTER_FACE", "No registered face found. Please register first.")
            return
        }

        detectFaceAndExecute(imageUriString, promise) { liveFaceCropped, rawFaceData ->
            
            // --- THE 3D LIVENESS GATEKEEPER ---
            val yawY = rawFaceData.headEulerAngleY
            val rollZ = rawFaceData.headEulerAngleZ

            val livenessPassed = when (challengeCommand) {
                "LOOK_LEFT" -> yawY < -10.0f
                "LOOK_RIGHT" -> yawY > 10.0f
                "TILT_LEFT" -> rollZ < -10.0f
                "TILT_RIGHT" -> rollZ > 10.0f
                else -> true
            }

            if (!livenessPassed) {
                promise.reject("SPOOF_DETECTED", "Liveness failed! You did not $challengeCommand.")
                return@detectFaceAndExecute
            }
            // ----------------------------------

            val masterFace = masterFaceString.split(",").map { it.toFloat() }.toFloatArray()
            val liveFaceVector = extractFaceVector(liveFaceCropped)
            
            val similarity = calculateCosineSimilarity(masterFace, liveFaceVector)
            
            if (similarity >= 0.80f) {
                val formattedScore = String.format("%.2f", similarity * 100)
                promise.resolve("MATCH CONFIRMED: $formattedScore% Accuracy")
            } else {
                promise.reject("INTRUDER_ALERT", "Access Denied. Face did not match.")
            }
        }
    }
}