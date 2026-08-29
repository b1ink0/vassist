package com.vassist.app.ai

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.util.Log

/**
 * Converts any Android-decodable audio attachment (mp3/opus/aac/m4a/wav...)
 * into 16 kHz mono 16-bit PCM WAV - the input format Gemma 3n-style audio
 * encoders expect. Uses only framework APIs (MediaExtractor + MediaCodec),
 * so there are no added dependencies.
 */
object AudioConverter {
    private const val TAG = "AudioConverter"
    private const val TARGET_SAMPLE_RATE = 16000
    private const val TIMEOUT_US = 10_000L

    /**
     * Decode arbitrary audio bytes to a 16 kHz mono WAV. Returns null when
     * decoding fails (caller may then fall back to attaching the original
     * bytes unchanged).
     */
    fun decodeToWav16kMono(input: ByteArray, cacheDir: java.io.File): ByteArray? {
        try {
            // Fast path: already a 16 kHz mono WAV
            if (isWav16kMono(input)) return input

            val tmpFile = java.io.File.createTempFile("audio_in", ".bin", cacheDir)
            tmpFile.writeBytes(input)
            try {
                val extractor = MediaExtractor()
                extractor.setDataSource(tmpFile.absolutePath)

                var trackIndex = -1
                var format: MediaFormat? = null
                for (i in 0 until extractor.trackCount) {
                    val f = extractor.getTrackFormat(i)
                    if (f.getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true) {
                        trackIndex = i
                        format = f
                        break
                    }
                }
                if (trackIndex < 0 || format == null) {
                    Log.w(TAG, "no audio track found")
                    extractor.release()
                    return null
                }

                extractor.selectTrack(trackIndex)
                val mime = format.getString(MediaFormat.KEY_MIME)!!
                val srcSampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                val srcChannels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)

                val codec = MediaCodec.createDecoderByType(mime)
                codec.configure(format, null, null, 0)
                codec.start()

                val pcmChunks = ArrayList<ShortArray>()
                var totalPcmSamples = 0
                val info = MediaCodec.BufferInfo()
                var inputDone = false
                var outputDone = false

                while (!outputDone) {
                    if (!inputDone) {
                        val inIdx = codec.dequeueInputBuffer(TIMEOUT_US)
                        if (inIdx >= 0) {
                            val buf = codec.getInputBuffer(inIdx)!!
                            val size = extractor.readSampleData(buf, 0)
                            if (size < 0) {
                                codec.queueInputBuffer(
                                    inIdx, 0, 0, 0,
                                    MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                                inputDone = true
                            } else {
                                codec.queueInputBuffer(
                                    inIdx, 0, size, extractor.sampleTime, 0)
                                extractor.advance()
                            }
                        }
                    }

                    val outIdx = codec.dequeueOutputBuffer(info, TIMEOUT_US)
                    when {
                        outIdx >= 0 -> {
                            val outBuf = codec.getOutputBuffer(outIdx)!!
                            val shorts = ShortArray(info.size / 2)
                            outBuf.order(java.nio.ByteOrder.LITTLE_ENDIAN)
                                .asShortBuffer().get(shorts)
                            pcmChunks.add(shorts)
                            totalPcmSamples += shorts.size
                            codec.releaseOutputBuffer(outIdx, false)
                            if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                                outputDone = true
                            }
                        }
                        outIdx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> { /* ignore */ }
                        else -> { /* TRY_AGAIN - keep polling */ }
                    }
                }

                codec.stop()
                codec.release()
                extractor.release()

                if (totalPcmSamples == 0) {
                    Log.w(TAG, "decoder produced no PCM")
                    return null
                }

                // Interleave into one array
                val interleaved = ShortArray(totalPcmSamples)
                var off = 0
                for (chunk in pcmChunks) { chunk.copyInto(interleaved, off); off += chunk.size }

                // Down-mix to mono
                val frames = totalPcmSamples / srcChannels
                val mono = ShortArray(frames)
                var p = 0
                for (fIdx in 0 until frames) {
                    var acc = 0
                    for (c in 0 until srcChannels) acc += interleaved[p + fIdx * srcChannels + c]
                    mono[fIdx] = (acc / srcChannels).toShort()
                }

                // Resample to 16 kHz (linear interpolation - fine for speech)
                val resampled = if (srcSampleRate != TARGET_SAMPLE_RATE) {
                    resampleLinear(mono, srcSampleRate, TARGET_SAMPLE_RATE)
                } else mono

                val wav = encodeWav(resampled, TARGET_SAMPLE_RATE)
                Log.i(TAG,
                    "[LLM-backend] audio converted: ${input.size}B in -> ${wav.size}B " +
                        "16kHz mono WAV (${resampled.size} samples)")
                return wav
            } finally {
                tmpFile.delete()
            }
        } catch (e: Exception) {
            Log.w(TAG, "audio decode failed: ${e.message}")
            return null
        }
    }

    private fun isWav16kMono(b: ByteArray): Boolean =
        b.size > 44 &&
            b[0] == 'R'.code.toByte() && b[1] == 'I'.code.toByte() &&
            b[2] == 'F'.code.toByte() && b[3] == 'F'.code.toByte() &&
            b[24] == 0x00.toByte() && b[25] == 0x3E.toByte() && // 16000 LE
            b[22] == 0x01.toByte() && b[23] == 0x00.toByte()    // mono

    private fun resampleLinear(input: ShortArray, fromHz: Int, toHz: Int): ShortArray {
        val ratio = fromHz.toDouble() / toHz.toDouble()
        val outLen = (input.size / ratio).toInt().coerceAtLeast(1)
        val out = ShortArray(outLen)
        for (i in out.indices) {
            val srcPos = i * ratio
            val i0 = srcPos.toInt().coerceIn(0, input.size - 1)
            val i1 = (i0 + 1).coerceAtMost(input.size - 1)
            val frac = srcPos - i0
            out[i] = (input[i0] + frac * (input[i1] - input[i0])).toInt().toShort()
        }
        return out
    }

    /** Minimal canonical 16-bit PCM WAV writer. */
    private fun encodeWav(pcm: ShortArray, sampleRate: Int): ByteArray {
        val dataSize = pcm.size * 2
        val buf = java.nio.ByteBuffer.allocate(44 + dataSize)
            .order(java.nio.ByteOrder.LITTLE_ENDIAN)
        buf.put("RIFF".toByteArray())
        buf.putInt(36 + dataSize)
        buf.put("WAVE".toByteArray())
        buf.put("fmt ".toByteArray())
        buf.putInt(16)
        buf.putShort(1)              // PCM
        buf.putShort(1)              // mono
        buf.putInt(sampleRate)
        buf.putInt(sampleRate * 2)   // byte rate
        buf.putShort(2)              // block align
        buf.putShort(16)             // bits/sample
        buf.put("data".toByteArray())
        buf.putInt(dataSize)
        for (s in pcm) buf.putShort(s)
        return buf.array()
    }
}
