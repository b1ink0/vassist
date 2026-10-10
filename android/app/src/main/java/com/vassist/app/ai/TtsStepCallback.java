package com.vassist.app.ai;

import kotlin.jvm.functions.Function1;

/**
 * Streaming progress callback for sherpa-onnx OfflineTts.generateWithCallback.
 *
 * Hand-written in Java so the compiled method signature is exactly
 * {@code invoke([F)Ljava/lang/Integer;} — the signature the native JNI code
 * looks up reflectively. Kotlin lambdas desugared by newer Kotlin/D8 no longer
 * expose this boxed primitive-array signature, causing NoSuchMethodError
 * (and a runtime abort) when sherpa-onnx calls back into them.
 */
public final class TtsStepCallback implements Function1<float[], Integer> {
    private final StepHandler handler;

    /** Returns 1 to continue generation, 0 to cancel. */
    public interface StepHandler {
        int onStep(float[] samples);
    }

    public TtsStepCallback(StepHandler handler) {
        this.handler = handler;
    }

    @Override
    public Integer invoke(float[] samples) {
        return handler.onStep(samples);
    }
}
