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

    // Native method declarations
    private external fun log_to_android()
    private external fun load_model(filename: String): Long
    private external fun free_model(model: Long)
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

    /**
     * Load a GGUF model from file
     * 
     * @param pathToModel Absolute path to the GGUF model file
     * @param contextSize Context window size (default: 2048)
     * @param temperature Sampling temperature (default: 0.7)
     * @param topK Top-K sampling parameter (default: 40)
     * @param topP Top-P (nucleus) sampling parameter (default: 0.9)
     */
    suspend fun load(
        pathToModel: String,
        contextSize: Int = 2048,
        temperature: Float = 0.7f,
        topK: Int = 40,
        topP: Float = 0.9f
    ) {
        withContext(runLoop) {
            when (threadLocalState.get()) {
                is State.Idle -> {
                    val model = load_model(pathToModel)
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
                    threadLocalState.set(State.Loaded(model, context, batch, sampler))
                }
                else -> throw IllegalStateException("Model already loaded")
            }
        }
    }

    /**
     * Generate text completion (streaming)
     * 
     * @param prompt The input prompt
     * @param maxNewTokens Maximum number of tokens to generate
     * @return Flow of generated text tokens
     */
    fun complete(prompt: String, maxNewTokens: Int = maxTokens): Flow<String> = flow {
        when (val state = threadLocalState.get()) {
            is State.Loaded -> {
                kv_cache_clear(state.context)
                
                val ncur = IntVar(completion_init(state.context, state.batch, prompt, maxNewTokens))
                
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
     * @return Complete generated text
     */
    suspend fun generate(prompt: String, maxNewTokens: Int = maxTokens): String {
        val builder = StringBuilder()
        complete(prompt, maxNewTokens).collect { token ->
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
            val sampler: Long
        ) : State
    }

    companion object {
        // Singleton instance
        private val _instance: LlamaAndroid = LlamaAndroid()

        fun instance(): LlamaAndroid = _instance
    }
}
