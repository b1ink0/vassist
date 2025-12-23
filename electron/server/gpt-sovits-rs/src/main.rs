use axum::{
    extract::State,
    http::{header, StatusCode},
    response::Response,
    routing::{get, post},
    Json, Router,
};
use base64::{engine::general_purpose, Engine as _};
use gpt_sovits_rs::tch;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::{error, info};

#[derive(Clone)]
struct AppState {
    g2p: Arc<gpt_sovits_rs::text::G2p>,
    ssl: Arc<gpt_sovits_rs::gsv::SSL>,
    t2s: Arc<gpt_sovits_rs::gsv::T2S>,
    vits: Arc<gpt_sovits_rs::gsv::Vits>,
    device: tch::Device,
}

#[derive(Deserialize)]
struct TTSRequest {
    text: String,
    reference_audio: String,  // base64 encoded WAV
    reference_text: String,
    #[serde(default = "default_language")]
    reference_language: String,
    #[serde(default = "default_language")]
    text_language: String,
}

#[derive(Deserialize)]
struct OpenAITTSRequest {
    _input: String,
    _voice: String,
}

fn default_language() -> String {
    "en".to_string()
}

#[derive(Serialize)]
struct HealthResponse {
    status: String,
    service: String,
    device: String,
}

#[derive(Serialize)]
struct StatusResponse {
    status: String,
    models_loaded: bool,
    version: String,
    device: String,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();
    
    info!("Starting GPT-SoVITS Rust Server");
    
    let models_dir = std::env::current_dir()?.join("models");
    info!("Models directory: {:?}", models_dir);
    
    let device = tch::Device::cuda_if_available();
    if device.is_cuda() {
        info!("Using GPU");
    } else {
        info!("Using CPU");
    }

    // Initialize g2p with Japanese support
    let g2p_config = gpt_sovits_rs::text::G2PConfig::new(
        models_dir.join("mini-bart-g2p.pt").to_string_lossy().to_string(),
    )
    .with_chinese(
        models_dir.join("g2pw.pt").to_string_lossy().to_string(),
        models_dir.join("resource").join("bert_model.pt").to_string_lossy().to_string(),
    )
    .with_jp(true);

    let g2p = Arc::new(g2p_config.build(device)?);

    // Initialize models
    let ssl_path = models_dir.join("resource").join("ssl_model.pt");
    let ssl = Arc::new(gpt_sovits_rs::gsv::SSL::new(&ssl_path.to_string_lossy(), device)?);

    // Initialize T2S model
    let t2s_path = models_dir.join("v2pro").join("t2s.pt");
    let t2s = Arc::new(gpt_sovits_rs::gsv::T2S::new(&t2s_path.to_string_lossy(), device)?);

    // Initialize Vits model
    let vits_path = models_dir.join("v2pro").join("vits.pt");
    let vits = Arc::new(gpt_sovits_rs::gsv::Vits::new(&vits_path.to_string_lossy(), device)?);

    let state = AppState { g2p, ssl, t2s, vits, device };
    
    info!("GPT-SoVITS models loaded successfully");
    
    let app = Router::new()
        .route("/", get(root_handler))
        .route("/health", get(health_handler))
        .route("/status", get(status_handler))
        .route("/tts", post(tts_handler))
        .route("/v1/audio/speech", post(openai_tts_handler))
        .with_state(state);
    
    // Read port from command-line arguments, default to 9881
    let port = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "9881".to_string());
    let addr = format!("0.0.0.0:{}", port);
    
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    info!("Server ready on http://{}", addr);
    axum::serve(listener, app).await?;
    
    Ok(())
}

async fn root_handler(State(_state): State<AppState>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "message": "GPT-SoVITS Rust TTS Server",
        "version": "0.1.0",
        "status": "ready"
    }))
}

async fn health_handler(State(_state): State<AppState>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "healthy".to_string(),
        service: "gpt-sovits-rust".to_string(),
        device: if tch::Device::cuda_if_available().is_cuda() {
            "GPU".to_string()
        } else {
            "CPU".to_string()
        },
    })
}

async fn status_handler(State(state): State<AppState>) -> Json<StatusResponse> {
    Json(StatusResponse {
        status: "ready".to_string(),
        models_loaded: true,
        version: "0.1.0".to_string(),
        device: if state.device.is_cuda() {
            "GPU".to_string()
        } else {
            "CPU".to_string()
        },
    })
}

async fn tts_handler(
    State(state): State<AppState>,
    Json(req): Json<TTSRequest>,
) -> Result<Response, (StatusCode, &'static str)> {
    let start_time = std::time::Instant::now();
    info!("Received TTS request for text: {}", req.text);
    
    // Decode base64 reference audio (don't parse yet, just like Python)
    let decode_start = std::time::Instant::now();
    let audio_data = match general_purpose::STANDARD.decode(&req.reference_audio) {
        Ok(data) => {
            info!("Successfully decoded base64, audio data size: {} bytes (took {:?})", data.len(), decode_start.elapsed());
            data
        },
        Err(e) => {
            error!("Failed to decode base64 audio: {}", e);
            return Err((StatusCode::BAD_REQUEST, "Invalid base64 audio data"));
        }
    };
    
    // Save to temporary WAV file (assume it's already WAV format, like Python does)
    let io_start = std::time::Instant::now();
    use std::io::Write;
    let temp_path = std::env::temp_dir().join(format!("ref_{}.wav", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis()));
    
    if let Err(e) = std::fs::File::create(&temp_path).and_then(|mut f| f.write_all(&audio_data)) {
        error!("Failed to write temp audio file: {}", e);
        return Err((StatusCode::INTERNAL_SERVER_ERROR, "Failed to save reference audio"));
    }
    info!("Saved temp file (took {:?})", io_start.elapsed());

    // Now load the WAV file for processing
    let parse_start = std::time::Instant::now();
    let reader = match hound::WavReader::open(&temp_path) {
        Ok(r) => r,
        Err(e) => {
            error!("Failed to parse WAV file: {}", e);
            let _ = std::fs::remove_file(&temp_path);
            return Err((StatusCode::BAD_REQUEST, "Invalid WAV file format"));
        }
    };

    let spec = reader.spec();
    let sample_rate = spec.sample_rate;
    let samples: Vec<f32> = reader
        .into_samples::<i16>()
        .map(|s| s.unwrap() as f32 / 32768.0)
        .collect();
    info!("Parsed WAV file (took {:?})", parse_start.elapsed());

    // Resample to 32kHz if needed
    let resample_start = std::time::Instant::now();
    let ref_audio_samples = if sample_rate != 32000 {
        info!("Resampling from {} to 32000 Hz", sample_rate);
        wav_io::resample::linear(samples, 1, sample_rate, 32000)
    } else {
        samples
    };
    info!("Resampling done (took {:?})", resample_start.elapsed());

    // Convert to tensor
    let tensor_start = std::time::Instant::now();
    let ref_audio_32k = tch::Tensor::from_slice(&ref_audio_samples)
        .internal_cast_half(false)
        .to_device(state.device)
        .unsqueeze(0);
    info!("Created reference audio tensor (took {:?})", tensor_start.elapsed());

    // Process reference text
    let ref_text_start = std::time::Instant::now();
    let (ref_seq, ref_bert) = match gpt_sovits_rs::text::get_phone_and_bert(&state.g2p, &req.reference_text) {
        Ok((s, b)) => (s, b.internal_cast_half(false)),
        Err(e) => {
            error!("Failed to process reference text: {}", e);
            return Err((StatusCode::INTERNAL_SERVER_ERROR, "Failed to process reference text"));
        }
    };
    info!("Processed reference text (took {:?})", ref_text_start.elapsed());

    // Process target text
    let target_text_start = std::time::Instant::now();
    let (text_seq, text_bert) = match gpt_sovits_rs::text::get_phone_and_bert(&state.g2p, &req.text) {
        Ok((s, b)) => (s, b.internal_cast_half(false)),
        Err(e) => {
            error!("Failed to process target text: {}", e);
            return Err((StatusCode::INTERNAL_SERVER_ERROR, "Failed to process target text"));
        }
    };
    info!("Processed target text (took {:?})", target_text_start.elapsed());

    // Create speaker
    let speaker_start = std::time::Instant::now();
    let speaker = gpt_sovits_rs::gsv::SpeakerV2Pro::new(
        "temp_speaker",
        Arc::clone(&state.t2s),
        Arc::clone(&state.vits),
        Arc::clone(&state.ssl),
    );
    info!("Created speaker (took {:?})", speaker_start.elapsed());

    // Pre-handle reference audio (SSL model - THIS IS LIKELY THE BOTTLENECK)
    let prehandle_start = std::time::Instant::now();
    let (prompts, refer, sv_emb) = match speaker.pre_handle_ref(ref_audio_32k) {
        Ok(result) => result,
        Err(e) => {
            error!("Failed to pre-handle reference: {}", e);
            return Err((StatusCode::INTERNAL_SERVER_ERROR, "Failed to process reference audio"));
        }
    };
    info!("Pre-handled reference audio (SSL model) (took {:?})", prehandle_start.elapsed());

    // Perform inference
    let inference_start = std::time::Instant::now();
    let _guard = tch::no_grad_guard();
    let audio = match speaker.infer(
        (prompts, refer, sv_emb),
        ref_seq,
        text_seq,
        ref_bert,
        text_bert,
        15, // top_k
    ) {
        Ok(a) => a,
        Err(e) => {
            error!("Inference failed: {}", e);
            return Err((StatusCode::INTERNAL_SERVER_ERROR, "TTS inference failed"));
        }
    };
    info!("Inference completed (took {:?})", inference_start.elapsed());

    // Convert tensor to samples
    let convert_start = std::time::Instant::now();
    let audio_size = audio.size1().unwrap() as usize;
    let mut samples = vec![0f32; audio_size];
    if let Err(e) = audio.f_copy_data(&mut samples, audio_size) {
        error!("Failed to copy audio data: {}", e);
        return Err((StatusCode::INTERNAL_SERVER_ERROR, "Failed to copy audio data"));
    }

    // Encode as WAV
    let mut wav_buffer = Vec::new();
    {
        let mut cursor = std::io::Cursor::new(&mut wav_buffer);
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: 32000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        
        let mut writer = hound::WavWriter::new(&mut cursor, spec).unwrap();
        for sample in samples {
            let sample_i16 = (sample * 32767.0).clamp(-32768.0, 32767.0) as i16;
            writer.write_sample(sample_i16).unwrap();
        }
        writer.finalize().unwrap();
    }
    info!("WAV encoding (took {:?})", convert_start.elapsed());

    info!("===== TOTAL REQUEST TIME: {:?} =====", start_time.elapsed());
    
    // Cleanup temp file
    let _ = std::fs::remove_file(&temp_path);

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "audio/wav")
        .body(wav_buffer.into())
        .unwrap())
}

async fn openai_tts_handler(
    State(_state): State<AppState>,
    Json(_req): Json<OpenAITTSRequest>,
) -> Result<Response, (StatusCode, &'static str)> {
    Err((StatusCode::NOT_IMPLEMENTED, "OpenAI TTS endpoint not yet implemented"))
}
