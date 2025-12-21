package com.vassist.app

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Bundle
import android.util.Log
import android.view.View
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.vassist.app.ai.LlamaService
import com.vassist.app.ai.LLMModelManager
import com.vassist.app.ai.VitsService
import com.vassist.app.ai.WhisperService
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.collect
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Test Activity for native AI services (VITS TTS and Whisper STT)
 */
class AITestActivity : ComponentActivity() {
    
    companion object {
        private const val TAG = "AITestActivity"
        private const val SAMPLE_RATE = 16000
    }
    
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    
    private var vitsService: VitsService? = null
    private var whisperService: WhisperService? = null
    private var llamaService: LlamaService? = null
    private var modelManager: LLMModelManager? = null
    
    private var isRecording = false
    private var audioRecord: AudioRecord? = null
    private val audioBuffer = mutableListOf<Short>()
    
    // State
    private val _status = mutableStateOf("Ready")
    private val _vitsStatus = mutableStateOf("Not initialized")
    private val _whisperStatus = mutableStateOf("Not initialized")
    private val _llamaStatus = mutableStateOf("Not initialized")
    private val _ttsResult = mutableStateOf("")
    private val _sttResult = mutableStateOf("")
    private val _llmResult = mutableStateOf("")
    private val _isLoading = mutableStateOf(false)
    private val _availableModels = mutableStateOf<List<String>>(emptyList())
    private val _selectedModel = mutableStateOf<String?>(null)
    
    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            _status.value = "Microphone permission granted"
        } else {
            _status.value = "Microphone permission denied"
        }
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        
        // Force software rendering to avoid HWUI/Vulkan conflicts with ONNX runtime
        window.decorView.setLayerType(View.LAYER_TYPE_SOFTWARE, null)
        
        // Check microphone permission
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) 
            != PackageManager.PERMISSION_GRANTED) {
            requestPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }
        
        // Initialize model manager and load available models
        modelManager = LLMModelManager(this)
        loadAvailableModels()
        
        setContent {
            VAssistTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    AITestScreen(
                        status = _status.value,
                        vitsStatus = _vitsStatus.value,
                        whisperStatus = _whisperStatus.value,
                        llamaStatus = _llamaStatus.value,
                        ttsResult = _ttsResult.value,
                        sttResult = _sttResult.value,
                        llmResult = _llmResult.value,
                        isLoading = _isLoading.value,
                        availableModels = _availableModels.value,
                        selectedModel = _selectedModel.value,
                        onModelSelected = { model -> 
                            _selectedModel.value = model
                            llamaService?.let {
                                scope.launch { it.release() }
                                llamaService = null
                                _llamaStatus.value = "Not initialized"
                            }
                        },
                        onInitVits = { initVits() },
                        onInitWhisper = { initWhisper() },
                        onInitLlama = { initLlama() },
                        onTestTTS = { text -> testTTS(text) },
                        onTestLLM = { prompt -> testLLM(prompt) },
                        onStartRecording = { startRecording() },
                        onStopRecording = { stopRecording() },
                        isRecording = isRecording
                    )
                }
            }
        }
    }
    
    private fun initVits() {
        _isLoading.value = true
        _vitsStatus.value = "Initializing..."
        
        val service = VitsService(this@AITestActivity)
        vitsService = service
        
        service.initializeAsync(
            onProgress = { progress ->
                runOnUiThread {
                    _vitsStatus.value = "Loading: ${(progress * 100).toInt()}%"
                }
            },
            onComplete = { success, errorMessage ->
                runOnUiThread {
                    if (success) {
                        _vitsStatus.value = "Ready ✓"
                        _status.value = "VITS TTS initialized successfully!"
                    } else {
                        _vitsStatus.value = errorMessage ?: "Unknown error"
                        _status.value = "VITS init failed: $errorMessage"
                    }
                    _isLoading.value = false
                }
            }
        )
    }
    
    private fun initWhisper() {
        _isLoading.value = true
        _whisperStatus.value = "Initializing..."
        
        scope.launch(Dispatchers.IO) {
            try {
                val service = WhisperService(this@AITestActivity)
                service.initialize { progress ->
                    scope.launch(Dispatchers.Main) {
                        _whisperStatus.value = "Loading: ${(progress * 100).toInt()}%"
                    }
                }
                
                whisperService = service
                
                withContext(Dispatchers.Main) {
                    if (service.isInitialized) {
                        _whisperStatus.value = "Ready ✓"
                        _status.value = "Whisper STT initialized successfully!"
                    } else {
                        _whisperStatus.value = "Model not found"
                        _status.value = "Whisper model files not found. Please download them."
                    }
                    _isLoading.value = false
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to initialize Whisper", e)
                withContext(Dispatchers.Main) {
                    _whisperStatus.value = "Error: ${e.message}"
                    _status.value = "Whisper init failed: ${e.message}"
                    _isLoading.value = false
                }
            }
        }
    }
    
    private fun loadAvailableModels() {
        scope.launch(Dispatchers.IO) {
            try {
                val models = modelManager?.listModels() ?: emptyList()
                val modelNames = models.mapNotNull { it["name"] as? String }
                
                withContext(Dispatchers.Main) {
                    _availableModels.value = modelNames
                    if (modelNames.isNotEmpty() && _selectedModel.value == null) {
                        _selectedModel.value = modelNames[0]
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to load models", e)
            }
        }
    }
    
    private fun initLlama() {
        val selectedModel = _selectedModel.value
        if (selectedModel == null) {
            _status.value = "Please select a model first"
            return
        }
        
        _isLoading.value = true
        _llamaStatus.value = "Initializing..."
        
        scope.launch(Dispatchers.IO) {
            try {
                val service = LlamaService(this@AITestActivity)
                
                withContext(Dispatchers.Main) {
                    _llamaStatus.value = "Loading model..."
                }
                
                service.initialize(modelPath = selectedModel)
                llamaService = service
                
                withContext(Dispatchers.Main) {
                    if (service.isInitialized) {
                        _llamaStatus.value = "Ready ✓ (${service.modelName})"
                        _status.value = "Llama LLM initialized successfully!"
                    } else {
                        _llamaStatus.value = "Model not found"
                        _status.value = "LLM model not found. Please place a .gguf file in assets/models/llm/"
                    }
                    _isLoading.value = false
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to initialize Llama", e)
                withContext(Dispatchers.Main) {
                    _llamaStatus.value = "Error: ${e.message?.take(50)}"
                    _status.value = "Llama init failed: ${e.message}"
                    _isLoading.value = false
                }
            }
        }
    }
    
    private fun testLLM(prompt: String) {
        val service = llamaService
        if (service == null || !service.isInitialized) {
            _status.value = "Please initialize Llama first"
            return
        }
        
        _isLoading.value = true
        _status.value = "Generating response..."
        _llmResult.value = ""
        
        scope.launch(Dispatchers.IO) {
            try {
                val messages = listOf(
                    LlamaService.ChatMessage("system", "You are a helpful AI assistant. Be concise."),
                    LlamaService.ChatMessage("user", prompt)
                )
                
                // Use streaming for real-time output
                service.chatCompletion(messages, maxTokens = 256).collect { token ->
                    withContext(Dispatchers.Main) {
                        _llmResult.value += token
                    }
                }
                
                withContext(Dispatchers.Main) {
                    _status.value = "LLM generation completed!"
                    _isLoading.value = false
                }
            } catch (e: Exception) {
                Log.e(TAG, "LLM generation failed", e)
                withContext(Dispatchers.Main) {
                    _llmResult.value = "Error: ${e.message}"
                    _status.value = "LLM failed: ${e.message}"
                    _isLoading.value = false
                }
            }
        }
    }
    
    private fun testTTS(text: String) {
        val service = vitsService
        if (service == null || !service.isInitialized) {
            _status.value = "Please initialize VITS first"
            return
        }
        
        _isLoading.value = true
        _status.value = "Generating speech..."
        _ttsResult.value = ""
        
        // Use the async API
        service.synthesizeAsync(text) { audioData, errorMessage ->
            if (audioData != null) {
                // Save to file
                val outputFile = File(cacheDir, "tts_output.wav")
                try {
                    FileOutputStream(outputFile).use { it.write(audioData) }
                    
                    runOnUiThread {
                        _ttsResult.value = "Generated ${audioData.size} bytes\nSaved to: ${outputFile.absolutePath}"
                        _status.value = "TTS completed! Playing audio..."
                        _isLoading.value = false
                    }
                    
                    // Play audio
                    playAudio(outputFile)
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to save/play audio", e)
                    runOnUiThread {
                        _ttsResult.value = "Error saving audio: ${e.message}"
                        _status.value = "Failed to save audio"
                        _isLoading.value = false
                    }
                }
            } else {
                runOnUiThread {
                    _ttsResult.value = "Error: $errorMessage"
                    _status.value = "TTS failed: $errorMessage"
                    _isLoading.value = false
                }
            }
        }
    }
    
    private fun playAudio(file: File) {
        try {
            val mediaPlayer = android.media.MediaPlayer().apply {
                setDataSource(file.absolutePath)
                prepare()
                start()
            }
            mediaPlayer.setOnCompletionListener {
                it.release()
                scope.launch(Dispatchers.Main) {
                    _status.value = "Playback completed"
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to play audio", e)
            scope.launch(Dispatchers.Main) {
                _status.value = "Playback failed: ${e.message}"
            }
        }
    }
    
    private fun startRecording() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) 
            != PackageManager.PERMISSION_GRANTED) {
            _status.value = "Microphone permission required"
            return
        }
        
        val service = whisperService
        if (service == null || !service.isInitialized) {
            _status.value = "Please initialize Whisper first"
            return
        }
        
        isRecording = true
        audioBuffer.clear()
        _status.value = "Recording... Speak now!"
        _sttResult.value = ""
        
        val bufferSize = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        
        audioRecord = AudioRecord(
            MediaRecorder.AudioSource.MIC,
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            bufferSize
        )
        
        audioRecord?.startRecording()
        
        scope.launch(Dispatchers.IO) {
            val buffer = ShortArray(bufferSize / 2)
            while (isRecording) {
                val read = audioRecord?.read(buffer, 0, buffer.size) ?: 0
                if (read > 0) {
                    synchronized(audioBuffer) {
                        audioBuffer.addAll(buffer.take(read))
                    }
                }
            }
        }
    }
    
    private fun stopRecording() {
        isRecording = false
        audioRecord?.stop()
        audioRecord?.release()
        audioRecord = null
        
        _status.value = "Processing audio..."
        _isLoading.value = true
        
        scope.launch(Dispatchers.IO) {
            try {
                // Convert to WAV
                val wavData = createWavFromSamples(audioBuffer.toShortArray())
                
                withContext(Dispatchers.Main) {
                    _status.value = "Transcribing ${audioBuffer.size} samples..."
                }
                
                // Transcribe
                val service = whisperService
                if (service != null && service.isInitialized) {
                    val text = service.transcribe(wavData)
                    
                    withContext(Dispatchers.Main) {
                        _sttResult.value = text
                        _status.value = "Transcription completed!"
                        _isLoading.value = false
                    }
                } else {
                    withContext(Dispatchers.Main) {
                        _sttResult.value = "Error: Whisper not initialized"
                        _status.value = "Whisper not ready"
                        _isLoading.value = false
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "STT failed", e)
                withContext(Dispatchers.Main) {
                    _sttResult.value = "Error: ${e.message}"
                    _status.value = "STT failed: ${e.message}"
                    _isLoading.value = false
                }
            }
        }
    }
    
    private fun createWavFromSamples(samples: ShortArray): ByteArray {
        val bytesPerSample = 2
        val dataSize = samples.size * bytesPerSample
        val fileSize = 44 + dataSize
        
        val buffer = ByteBuffer.allocate(fileSize).order(ByteOrder.LITTLE_ENDIAN)
        
        // RIFF header
        buffer.put("RIFF".toByteArray())
        buffer.putInt(fileSize - 8)
        buffer.put("WAVE".toByteArray())
        
        // fmt chunk
        buffer.put("fmt ".toByteArray())
        buffer.putInt(16) // Chunk size
        buffer.putShort(1) // Audio format (PCM)
        buffer.putShort(1) // Num channels (mono)
        buffer.putInt(SAMPLE_RATE) // Sample rate
        buffer.putInt(SAMPLE_RATE * bytesPerSample) // Byte rate
        buffer.putShort(bytesPerSample.toShort()) // Block align
        buffer.putShort((bytesPerSample * 8).toShort()) // Bits per sample
        
        // data chunk
        buffer.put("data".toByteArray())
        buffer.putInt(dataSize)
        
        // Audio data
        for (sample in samples) {
            buffer.putShort(sample)
        }
        
        return buffer.array()
    }
    
    override fun onDestroy() {
        scope.cancel()
        vitsService?.releaseAsync()
        whisperService?.release()
        scope.launch { llamaService?.release() }
        audioRecord?.release()
        super.onDestroy()
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AITestScreen(
    status: String,
    vitsStatus: String,
    whisperStatus: String,
    llamaStatus: String,
    ttsResult: String,
    sttResult: String,
    llmResult: String,
    isLoading: Boolean,
    availableModels: List<String>,
    selectedModel: String?,
    onModelSelected: (String) -> Unit,
    onInitVits: () -> Unit,
    onInitWhisper: () -> Unit,
    onInitLlama: () -> Unit,
    onTestTTS: (String) -> Unit,
    onTestLLM: (String) -> Unit,
    onStartRecording: () -> Unit,
    onStopRecording: () -> Unit,
    isRecording: Boolean
) {
    var ttsText by remember { mutableStateOf("Hello, I am your AI assistant. How can I help you today?") }
    var llmPrompt by remember { mutableStateOf("What is the capital of France?") }
    val scrollState = rememberScrollState()
    
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
            .verticalScroll(scrollState),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "AI Test (Native)",
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.primary
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        // Status
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant
            )
        ) {
            Text(
                text = status,
                modifier = Modifier.padding(12.dp),
                style = MaterialTheme.typography.bodyMedium
            )
        }
        
        if (isLoading) {
            Spacer(modifier = Modifier.height(8.dp))
            LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
        }
        
        Spacer(modifier = Modifier.height(24.dp))
        
        // VITS TTS Section
        Text(
            text = "VITS TTS (LJSpeech)",
            style = MaterialTheme.typography.titleLarge
        )
        
        Text(
            text = "Status: $vitsStatus",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        Button(
            onClick = onInitVits,
            enabled = !isLoading,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Initialize VITS")
        }
        
        Spacer(modifier = Modifier.height(8.dp))
        
        OutlinedTextField(
            value = ttsText,
            onValueChange = { ttsText = it },
            label = { Text("Text to speak") },
            modifier = Modifier.fillMaxWidth(),
            maxLines = 3
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        Button(
            onClick = { onTestTTS(ttsText) },
            enabled = !isLoading && vitsStatus.contains("Ready"),
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Generate Speech")
        }
        
        if (ttsResult.isNotEmpty()) {
            Spacer(modifier = Modifier.height(8.dp))
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.secondaryContainer
                )
            ) {
                Text(
                    text = ttsResult,
                    modifier = Modifier.padding(12.dp),
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }
        
        Spacer(modifier = Modifier.height(32.dp))
        
        // Whisper STT Section
        Text(
            text = "Whisper STT",
            style = MaterialTheme.typography.titleLarge
        )
        
        Text(
            text = "Status: $whisperStatus",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        Button(
            onClick = onInitWhisper,
            enabled = !isLoading,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Initialize Whisper")
        }
        
        Spacer(modifier = Modifier.height(8.dp))
        
        Button(
            onClick = { if (isRecording) onStopRecording() else onStartRecording() },
            enabled = !isLoading && whisperStatus.contains("Ready"),
            modifier = Modifier.fillMaxWidth(),
            colors = if (isRecording) {
                ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
            } else {
                ButtonDefaults.buttonColors()
            }
        ) {
            Text(if (isRecording) "Stop Recording" else "Start Recording")
        }
        
        if (sttResult.isNotEmpty()) {
            Spacer(modifier = Modifier.height(8.dp))
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.tertiaryContainer
                )
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text(
                        text = "Transcription:",
                        style = MaterialTheme.typography.labelMedium
                    )
                    Text(
                        text = sttResult,
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }
        }
        
        Spacer(modifier = Modifier.height(32.dp))
        
        // Llama LLM Section
        Text(
            text = "Llama LLM",
            style = MaterialTheme.typography.titleLarge
        )
        
        Text(
            text = "Status: $llamaStatus",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        // Model Selector
        var expanded by remember { mutableStateOf(false) }
        
        ExposedDropdownMenuBox(
            expanded = expanded,
            onExpandedChange = { expanded = !expanded && !isLoading }
        ) {
            OutlinedTextField(
                value = selectedModel ?: "No models available",
                onValueChange = {},
                readOnly = true,
                label = { Text("Select Model") },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                modifier = Modifier.fillMaxWidth().menuAnchor(),
                enabled = availableModels.isNotEmpty() && !isLoading,
                colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors()
            )
            
            ExposedDropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false }
            ) {
                availableModels.forEach { model ->
                    DropdownMenuItem(
                        text = { Text(model) },
                        onClick = {
                            onModelSelected(model)
                            expanded = false
                        }
                    )
                }
            }
        }
        
        Spacer(modifier = Modifier.height(8.dp))
        
        Button(
            onClick = onInitLlama,
            enabled = !isLoading && selectedModel != null,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Initialize Llama")
        }
        
        Spacer(modifier = Modifier.height(8.dp))
        
        OutlinedTextField(
            value = llmPrompt,
            onValueChange = { llmPrompt = it },
            label = { Text("Prompt") },
            modifier = Modifier.fillMaxWidth(),
            maxLines = 3
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        Button(
            onClick = { onTestLLM(llmPrompt) },
            enabled = !isLoading && llamaStatus.contains("Ready"),
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Generate Response")
        }
        
        if (llmResult.isNotEmpty()) {
            Spacer(modifier = Modifier.height(8.dp))
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer
                )
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text(
                        text = "Response:",
                        style = MaterialTheme.typography.labelMedium
                    )
                    Text(
                        text = llmResult,
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }
        }
        
        Spacer(modifier = Modifier.height(32.dp))
    }
}
