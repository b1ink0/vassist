#!/usr/bin/env python3
"""
apply-vassist-patches.py - Ports the 4 VAssist llama.cpp workarounds from
android/llama/src/main/cpp/CMakeLists.txt (string-REPLACE patches applied at
FetchContent time for the CPU-only gradle build) onto a standalone llama.cpp
source tree used by the Snapdragon (OpenCL + Hexagon) Docker build.

Idempotent: each patch is skipped when its "already patched" or "target
missing" condition holds. Run after every fresh clone/checkout of the pin:

    python3 android/llama/snapdragon/apply-vassist-patches.py <llama-src-dir>
"""
import pathlib
import sys

PATCHED_MARKER = "// [vassist-patch]"


def sub_once(text: str, old: str, new: str, label: str) -> tuple[str, bool]:
    if new in text:
        print(f"  skip (already applied): {label}")
        return text, False
    if old not in text:
        print(f"  WARN target missing: {label}")
        return text, False
    count = text.count(old)
    print(f"  applied ({count}x): {label}")
    return text.replace(old, new), True


def patch_loader(src: pathlib.Path) -> None:
    f = src / "src" / "llama-model-loader.cpp"
    t = f.read_text(encoding="utf-8")
    # WORKAROUND 1: accept GGUFs with 3-element rope sections (Ollama exports)
    t, _ = sub_once(
        t,
        "if (n != arr_info.length) {",
        "if (n < arr_info.length) { // [vassist-patch]",
        "rope sections n < length",
    )
    f.write_text(t, encoding="utf-8")


def patch_qwen35(src: pathlib.Path) -> None:
    f = src / "src" / "models" / "qwen35.cpp"
    t = f.read_text(encoding="utf-8")
    # WORKAROUND 2a: ssm_dt.bias is optional (Ollama qwen3.5:0.8b lacks tensor)
    t, _ = sub_once(
        t,
        'tn(LLM_TENSOR_SSM_DT,         "bias",   il), { hparams.ssm_dt_rank }, flags',
        'tn(LLM_TENSOR_SSM_DT,         "bias",   il), { hparams.ssm_dt_rank }, TENSOR_NOT_REQUIRED',
        "ssm_dt.bias optional",
    )
    # WORKAROUND 2b: null-guard the missing bias in the graph
    t, _ = sub_once(
        t,
        "ggml_tensor * alpha_biased   = ggml_add(ctx0, alpha, model.layers[il].ssm_dt);",
        "ggml_tensor * alpha_biased   = model.layers[il].ssm_dt ? ggml_add(ctx0, alpha, model.layers[il].ssm_dt) : alpha;",
        "ssm_dt null guard",
    )
    # WORKAROUND 3: hybrid qwen3.5 has per-layer k/v dims - use the il overloads
    t, _ = sub_once(
        t,
        "n_embd_k_gqa, n_embd_v_gqa",
        "hparams.n_embd_k_gqa(il), hparams.n_embd_v_gqa(il)",
        "per-layer n_embd_k/v_gqa",
    )
    t, _ = sub_once(
        t,
        ", n_head_kv, n_tokens)",
        ", hparams.n_head_kv(il), n_tokens)",
        "per-layer n_head_kv",
    )
    f.write_text(t, encoding="utf-8")


VLM_DETECT = """// [vassist-patch] dynamic partial load for VLM backbones
    bool is_vlm = false;
    for (int i = 0; i < gguf_get_n_kv(ml.metadata); i++) {
        const char * key = gguf_get_key(ml.metadata, i);
        std::string s_key(key);
        if (s_key.find("clip.vision.") == 0 || s_key.find("vision.") == 0 ||
            s_key.find("qwen35.vision.") == 0 || s_key.find("qwen3vl.vision.") == 0 ||
            s_key == "clip.has_vision_encoder") {
            is_vlm = true;
            break;
        }
    }
    ml.done_getting_tensors(is_vlm);"""


def patch_model(src: pathlib.Path) -> None:
    f = src / "src" / "llama-model.cpp"
    t = f.read_text(encoding="utf-8")
    # WORKAROUND 4: allow partial tensor loading for VLM-hybrid GGUFs only
    t, _ = sub_once(t, "ml.done_getting_tensors();", VLM_DETECT, "vlm partial load")
    f.write_text(t, encoding="utf-8")


def patch_clip_debug(src: pathlib.Path) -> None:
    """[vassist-patch] Debug instrumentation for the mmproj weight-load
    SIGSEGV on Adreno (writes buffer/tensor pointers to logcat 'clip-dbg')
    so the exact failing tensor can be identified from a tombstone/log."""
    f = src / "tools" / "mtmd" / "clip.cpp"
    t = f.read_text(encoding="utf-8")

    anchor = """            // alloc memory and offload data
            ggml_backend_buffer_type_t buft = ggml_backend_get_default_buffer_type(ctx_clip.backend);
            ctx_clip.buf.reset(ggml_backend_alloc_ctx_tensors_from_buft(ctx_clip.ctx_data.get(), buft));
            ggml_backend_buffer_set_usage(ctx_clip.buf.get(), GGML_BACKEND_BUFFER_USAGE_WEIGHTS);"""
    replacement = anchor + """
            // [vassist-patch] debug: dump buffer info before weight load
            {
                void* dbg_base = ctx_clip.buf.get() ? ggml_backend_buffer_get_base(ctx_clip.buf.get()) : nullptr;
                size_t dbg_size = ctx_clip.buf.get() ? ggml_backend_buffer_get_size(ctx_clip.buf.get()) : 0;
                LOG_INF("%s: [vassist-dbg] buft=%p buf=%p base=%p bufsize=%zu n_tensors=%zu total_data=%zu model_size=%zu",
                    __func__, (void*)buft, (void*)ctx_clip.buf.get(), dbg_base, dbg_size,
                    tensors_to_load.size(), total_data_size, this->model_size);
                if (total_data_size > this->model_size) {
                    LOG_INF("%s: [vassist-dbg] WARNING total tensor data (%zu) exceeds file size (%zu) - mmproj file is truncated or corrupt",
                        __func__, total_data_size, this->model_size);
                }
            }"""
    t, _ = sub_once(t, anchor, replacement, "clip debug: buffer dump")

    loop_anchor = """                for (auto & t : tensors_to_load) {
                    ggml_tensor * cur = ggml_get_tensor(ctx_clip.ctx_data.get(), t->name);
                    GGML_ASSERT(cur && "tensor not found in ctx_data");
                    auto it_off = tensor_offset.find(t->name);
                    GGML_ASSERT(it_off != tensor_offset.end() && "no offset for tensor");
                    const size_t offset = it_off->second;
                    fin.seekg(offset, std::ios::beg);"""
    loop_replacement = """                for (auto & t : tensors_to_load) {
                    ggml_tensor * cur = ggml_get_tensor(ctx_clip.ctx_data.get(), t->name);
                    GGML_ASSERT(cur && "tensor not found in ctx_data");
                    // [vassist-patch] debug: per-tensor dump before read
                    LOG_INF("%s: [vassist-dbg] tensor '%s' nbytes=%zu data=%p",
                        __func__, t->name, ggml_nbytes(cur), (void*)cur->data);
                    auto it_off = tensor_offset.find(t->name);
                    GGML_ASSERT(it_off != tensor_offset.end() && "no offset for tensor");
                    const size_t offset = it_off->second;
                    fin.seekg(offset, std::ios::beg);"""
    t, _ = sub_once(t, loop_anchor, loop_replacement, "clip debug: tensor dump")

    f.write_text(t, encoding="utf-8")


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("usage: apply-vassist-patches.py <llama-src-dir>")
    src = pathlib.Path(sys.argv[1]).resolve()
    if not (src / "src" / "llama-model.cpp").exists():
        sys.exit(f"not a llama.cpp tree: {src}")

    print(f"[vassist-patches] applying to {src}")
    patch_loader(src)
    patch_qwen35(src)
    patch_model(src)
    patch_clip_debug(src)
    print("[vassist-patches] done")


if __name__ == "__main__":
    main()
