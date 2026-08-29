package android.llama.cpp

import android.util.Log
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.withContext
import java.util.concurrent.Executors
import kotlin.concurrent.thread

/**
 * LlamaAndroid - Kotlin wrapper for llama.cpp native library
 */
class LlamaAndroid private constructor() {
    private val tag: String? = this::class.simpleName

    private val threadLocalState: ThreadLocal<State> = ThreadLocal.withInitial { State.Idle }

    // Dedicated thread for native code execution
    private val runLoop: CoroutineDispatcher = Executors.newSingleThreadExecutor {
        thread(start = false, name = "Llama-RunLoop") {
            Log.d(tag, "Dedicated thread for native code: ${Thread.currentThread().name}")

            System.loadLibrary("llama-android")

            log_to_android()

            // Register accelerator backends BEFORE backend_init(): the Hexagon
            // backend opens its FastRPC session at registration time and needs
            // ADSP_LIBRARY_PATH (staged skels) already set.
            if (!backendsLoaded && pendingNativeLibDir != null && pendingAdsplibDir != null) {
                try {
                    Log.i(tag, "Loading ggml backends (opencl/hexagon)...")
                    load_backends(pendingAdsplibDir!!, pendingNativeLibDir!!)
                } catch (e: Throwable) {
                    Log.w(tag, "Backend loading failed (CPU-only runtime?)", e)
                }
                backendsLoaded = true
            }

            backend_init()

            Log.d(tag, system_info())

            it.run()
        }.apply {
            uncaughtExceptionHandler = Thread.UncaughtExceptionHandler { _, exception: Throwable ->
                Log.e(tag, "Unhandled exception", exception)
            }
        }
    }.asCoroutineDispatcher()

    private var maxTokens: Int = 2048

    // Last requested compute unit ("cpu" | "gpu" | "npu" | "auto") and the
    // backend registry reported by native code after loading
    @Volatile
    var requestedDevice: String = "cpu"
        private set

    @Volatile
    private var backendsLoaded: Boolean = false

    /** Registered ggml backends/devices, e.g. "cpu|CPU,opencl|Adreno..." */
    fun backendsInfo(): String {
        return try {
            get_backends_info()
        } catch (e: Throwable) {
            "unavailable"
        }
    }

    // Native method declarations
    private external fun log_to_android()
    private external fun load_model(filename: String, n_gpu_layers: Int): Long
    private external fun load_backends(adsplib_dir: String, native_lib_dir: String)
    private external fun get_backends_info(): String
    private external fun free_model(model: Long)
    private external fun is_model_multimodal(model: Long): Boolean
    private external fun new_context(model: Long, nCtx: Int): Long
    private external fun free_context(context: Long)
    private external fun backend_init()
    private external fun backend_free()
    private external fun new_batch(nTokens: Int, embd: Int, nSeqMax: Int): Long
    private external fun free_batch(batch: Long)
    private external fun new_sampler(temperature: Float, topK: Int, topP: Float, context: Long): Long
    private external fun free_sampler(sampler: Long)
    private external fun kv_cache_clear(context: Long)
    private external fun system_info(): String
    private external fun completion_init(context: Long, batch: Long, text: String, nLen: Int): Int
    private external fun completion_init_with_images(
        context: Long, 
        batch: Long, 
        imageBytesArray: Array<ByteArray>?,
        text: String, 
        nLen: Int
    ): Int
    private external fun completion_loop(
        context: Long,
        batch: Long,
        sampler: Long,
        nLen: Int,
        ncur: IntVar
    ): String?
    private external fun get_model_desc(model: Long): String
    private external fun get_model_size(model: Long): Long
    private external fun get_model_n_params(model: Long): Long
    private external fun get_chat_template(model: Long): String?
    
    // Multimodal native methods
    private external fun init_multimodal(mmprojPath: String, model: Long): Boolean
    private external fun free_multimodal()
    private external fun is_multimodal_enabled(): Boolean
    private external fun get_image_marker(): String
    private external fun abort_generation()

    /**
     * Load a GGUF model from file
     *
     * @param pathToModel Absolute path to the GGUF model file
     * @param contextSize Context window size (default: 2048)
     * @param temperature Sampling temperature (default: 0.7)
     * @param topK Top-K sampling parameter (default: 40)
     * @param topP Top-P (nucleus) sampling parameter (default: 0.9)
     * @param device Compute unit: "cpu" | "gpu" (Adreno OpenCL) | "npu"
     *               (Hexagon HTP) | "auto" (any accelerator, CPU fallback)
     * @param nativeLibDir applicationInfo.nativeLibraryDir (for backend dlopen)
     * @param adsplibDir real-files dir with staged libggml-htp-v*.so skels
     */
    suspend fun load(
        pathToModel: String,
        contextSize: Int = 2048,
        temperature: Float = 0.7f,
        topK: Int = 40,
        topP: Float = 0.9f,
        device: String = "cpu",
        nativeLibDir: String? = null,
        adsplibDir: String? = null
    ) {
        withContext(runLoop) {
            when (threadLocalState.get()) {
                is State.Idle -> {
                    requestedDevice = device

                    // One-time Snapdragon backend registration (OpenCL/Hexagon).
                    // No-op on builds without the extra .so files present.
                    if (!backendsLoaded && nativeLibDir != null && adsplibDir != null) {
                        try {
                            Log.i(tag, "Loading ggml backends (opencl/hexagon)...")
                            load_backends(adsplibDir, nativeLibDir)
                        } catch (e: Throwable) {
                            Log.w(tag, "Backend loading failed (CPU-only runtime?)", e)
                        }
                        backendsLoaded = true
                    }

                    // Hexagon/OpenCL behave like GPU devices for offload
                    // semantics; 0 layers = pure CPU, 99 = offload everything.
                    val nGpuLayers = if (device == "cpu") 0 else 99
                    val model = load_model(pathToModel, nGpuLayers)
                    if (model == 0L) throw IllegalStateException("load_model() failed")

                    val context = new_context(model, contextSize)
                    if (context == 0L) {
                        free_model(model)
                        throw IllegalStateException("new_context() failed")
                    }

                    // Batch size should match context size to handle full prompts
                    val batch = new_batch(contextSize, 0, 1)
                    if (batch == 0L) {
                        free_context(context)
                        free_model(model)
                        throw IllegalStateException("new_batch() failed")
                    }

                    // Pass context to sampler so it can ban <think> token
                    val sampler = new_sampler(temperature, topK, topP, context)
                    if (sampler == 0L) {
                        free_batch(batch)
                        free_context(context)
                        free_model(model)
                        throw IllegalStateException("new_sampler() failed")
                    }

                    Log.i(tag, "Loaded model: $pathToModel")
                    
                    // Auto-detect and load mmproj file if it exists
                    // Format: mmproj-{modelname}.gguf (prefix, not suffix)
                    val modelFile = java.io.File(pathToModel)
                    val modelFilename = modelFile.name
                    val mmprojFilename = "mmproj-$modelFilename"
                    val mmprojFile = java.io.File(modelFile.parentFile, mmprojFilename)
                    
                    val isVLM = is_model_multimodal(model)
                    Log.i(tag, "Model dynamic multimodal detection: $isVLM")

                    var loadedMmprojPath: String? = null
                    if (mmprojFile.exists()) {
                        Log.i(tag, "Found mmproj file: ${mmprojFile.absolutePath}")
                        if (init_multimodal(mmprojFile.absolutePath, model)) {
                            Log.i(tag, "Multimodal enabled successfully from mmproj")
                            loadedMmprojPath = mmprojFile.absolutePath
                        } else {
                            Log.w(tag, "Failed to load mmproj file")
                        }
                    } else if (isVLM) {
                        Log.d(tag, "No mmproj file found, but model has vision capabilities. Attempting to load vision from main model...")
                        if (init_multimodal(pathToModel, model)) {
                            Log.i(tag, "Multimodal enabled successfully from main model")
                            loadedMmprojPath = pathToModel
                        } else {
                            Log.w(tag, "Failed to load vision from main model")
                        }
                    } else {
                        Log.d(tag, "Model is not a known VLM and no mmproj file found. Skipping multimodal init.")
                    }
                    
                    threadLocalState.set(State.Loaded(model, context, batch, sampler, loadedMmprojPath))
                }
                else -> throw IllegalStateException("Model already loaded")
            }
        }
    }
    
    /**
     * Initialize multimodal (vision) support by loading mmproj file
     *
     * @param mmprojPath Absolute path to the mmproj GGUF file
     * @return True if successful, false otherwise
     */
    suspend fun initMultimodal(mmprojPath: String): Boolean {
        return withContext(runLoop) {
            when (val state = threadLocalState.get()) {
                is State.Loaded -> {
                    val success = init_multimodal(mmprojPath, state.model)
                    if (success) {
                        threadLocalState.set(
                            State.Loaded(
                                state.model,
                                state.context,
                                state.batch,
                                state.sampler,
                                mmprojPath
                            )
                        )
                        Log.i(tag, "Multimodal enabled: $mmprojPath")
                    } else {
                        Log.e(tag, "Failed to enable multimodal: $mmprojPath")
                    }
                    success
                }
                else -> {
                    Log.e(tag, "Cannot init multimodal: no model loaded")
                    false
                }
            }
        }
    }
    
    /**
     * Free multimodal resources
     */
    suspend fun freeMultimodal() {
        withContext(runLoop) {
            free_multimodal()
            when (val state = threadLocalState.get()) {
                is State.Loaded -> {
                    threadLocalState.set(
                        State.Loaded(
                            state.model,
                            state.context,
                            state.batch,
                            state.sampler,
                            null
                        )
                    )
                }
                else -> {}
            }
            Log.i(tag, "Multimodal disabled")
        }
    }
    
    /**
     * Check if multimodal support is enabled
     */
    suspend fun isMultimodalEnabled(): Boolean {
        return withContext(runLoop) {
            is_multimodal_enabled()
        }
    }
    
    /**
     * Get the marker string used to represent images in prompts.
     * This marker should be used in the prompt text where the image should appear.
     * For example: "What is in this image? {image_marker}"
     * 
     * @return The image marker string (e.g., "<image>")
     */
    suspend fun getImageMarker(): String {
        return withContext(runLoop) {
            if (!is_multimodal_enabled()) {
                Log.e(tag, "Cannot get image marker: multimodal not enabled")
                return@withContext "<image>"
            }
            get_image_marker()
        }
    }

    /**
     * Generate text completion (streaming)
     * 
     * @param prompt The input prompt
     * @param maxNewTokens Maximum number of tokens to generate
     * @param images Optional list of image byte arrays for multimodal inference
     * @return Flow of generated text tokens
     */
    fun complete(
        prompt: String, 
        maxNewTokens: Int = maxTokens,
        images: List<ByteArray>? = null
    ): Flow<String> = flow {
        when (val state = threadLocalState.get()) {
            is State.Loaded -> {
                kv_cache_clear(state.context)
                
                // Initialize completion with images if provided
                val ncur = if (!images.isNullOrEmpty() && is_multimodal_enabled()) {
                    Log.i(tag, "Initializing completion with ${images.size} images")
                    IntVar(completion_init_with_images(
                        state.context, 
                        state.batch, 
                        images.toTypedArray(),
                        prompt, 
                        maxNewTokens
                    ))
                } else {
                    if (!images.isNullOrEmpty()) {
                        Log.w(tag, "Images provided but multimodal not enabled - ignoring images")
                    }
                    val safePrompt = prompt.replace("<__image__>", "[image]")
                    IntVar(completion_init(state.context, state.batch, safePrompt, maxNewTokens))
                }
                
                while (ncur.value <= maxNewTokens) {
                    val token = completion_loop(
                        state.context,
                        state.batch,
                        state.sampler,
                        maxNewTokens,
                        ncur
                    )
                    
                    if (token == null) {
                        break
                    }
                    
                    if (token.isNotEmpty()) {
                        emit(token)
                    }
                }
            }
            else -> throw IllegalStateException("No model loaded")
        }
    }.flowOn(runLoop)

    /**
     * Generate complete response (non-streaming)
     * 
     * @param prompt The input prompt
     * @param maxNewTokens Maximum number of tokens to generate
     * @param images Optional list of image byte arrays for multimodal inference
     * @return Complete generated text
     */
    suspend fun generate(
        prompt: String, 
        maxNewTokens: Int = maxTokens,
        images: List<ByteArray>? = null
    ): String {
        val builder = StringBuilder()
        complete(prompt, maxNewTokens, images).collect { token ->
            builder.append(token)
        }
        return builder.toString()
    }

    /**
     * Get model description
     */
    suspend fun getModelInfo(): ModelInfo? {
        return withContext(runLoop) {
            when (val state = threadLocalState.get()) {
                is State.Loaded -> {
                    ModelInfo(
                        description = get_model_desc(state.model),
                        sizeBytes = get_model_size(state.model),
                        nParams = get_model_n_params(state.model),
                        chatTemplate = get_chat_template(state.model)
                    )
                }
                else -> null
            }
        }
    }

    /**
     * Unload the model and free resources
     */
    suspend fun unload() {
        withContext(runLoop) {
            when (val state = threadLocalState.get()) {
                is State.Loaded -> {
                    // Free multimodal if loaded
                    if (state.mmprojPath != null) {
                        free_multimodal()
                    }
                    free_sampler(state.sampler)
                    free_batch(state.batch)
                    free_context(state.context)
                    free_model(state.model)
                    threadLocalState.set(State.Idle)
                    Log.i(tag, "Model unloaded")
                }
                else -> {}
            }
        }
    }

    /**
     * Check if a model is loaded
     */
    suspend fun isLoaded(): Boolean {
        return withContext(runLoop) {
            threadLocalState.get() is State.Loaded
        }
    }

    /**
     * Abort the current generation immediately.
     * This sets a native flag that causes completion_loop to return null on the next call,
     * stopping generation without waiting for an EOG token.
     */
    suspend fun stopGeneration() {
        withContext(runLoop) {
            abort_generation()
        }
    }

    /**
     * Clean up backend resources
     */
    suspend fun shutdown() {
        withContext(runLoop) {
            unload()
            backend_free()
        }
    }

    /**
     * Model information data class
     */
    data class ModelInfo(
        val description: String,
        val sizeBytes: Long,
        val nParams: Long,
        val chatTemplate: String?
    ) {
        val sizeMB: Double get() = sizeBytes / (1024.0 * 1024.0)
        val sizeGB: Double get() = sizeBytes / (1024.0 * 1024.0 * 1024.0)
        val paramsB: Double get() = nParams / 1_000_000_000.0
    }

    // Internal helper class for tracking token position
    private class IntVar(value: Int) {
        @Volatile
        var value: Int = value
            private set

        fun inc() {
            synchronized(this) {
                value += 1
            }
        }
    }

    // State machine for model lifecycle
    private sealed interface State {
        data object Idle : State
        data class Loaded(
            val model: Long,
            val context: Long,
            val batch: Long,
            val sampler: Long,
            val mmprojPath: String? = null  // Track loaded mmproj file
        ) : State
    }

    /**
     * Check if the currently loaded model natively supports vision/multimodal capabilities
     * based on its architecture and GGUF metadata.
     */
    fun supportsVision(): Boolean {
        return when (val state = threadLocalState.get()) {
            is State.Loaded -> is_model_multimodal(state.model)
            else -> false
        }
    }
    
    /**
     * Check if the vision backend was successfully initialized and is available for inference.
     */
    fun isVisionBackendAvailable(): Boolean {
        return is_multimodal_enabled()
    }

    companion object {
        // Backend paths captured before the native thread starts (the Hexagon
        // backend needs ADSP_LIBRARY_PATH set before backend_init registers it)
        @Volatile
        private var pendingNativeLibDir: String? = null

        @Volatile
        private var pendingAdsplibDir: String? = null

        /**
         * Provide the directories needed to register accelerator backends.
         * MUST be called before the first [instance] access (i.e. before the
         * runLoop thread spins up and runs backend_init).
         */
        fun setBackendPaths(nativeLibDir: String, adsplibDir: String) {
            pendingNativeLibDir = nativeLibDir
            pendingAdsplibDir = adsplibDir
        }

        // Singleton instance
        private val _instance: LlamaAndroid = LlamaAndroid()

        fun instance(): LlamaAndroid = _instance
    }
}
