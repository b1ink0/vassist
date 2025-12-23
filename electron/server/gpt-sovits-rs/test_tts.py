#!/usr/bin/env python3
import base64
import requests
import json

# Test configurations
tests = [
    {
        "name": "Japanese to Japanese",
        "ref_audio": r"f:\AI\GPT-SoVITS-beta\GPT-SoVITS-beta0706\VO_JA_Furina_Hello-[AudioTrimmer.com].wav",
        "ref_text": "何をボーっと突っ立っているんだい？嬉しさのあまり、言葉も出なくなったのかな？そう、",
        "ref_lang": "ja",
        "text": "これは、Rust GPT-SoVITSサーバーのテストです。完璧に動作しているようですね。本当に素晴らしいです！",
        "text_lang": "ja",
        "output": "output_jp_to_jp.wav"
    },
    {
        "name": "Japanese to English",
        "ref_audio": r"f:\AI\GPT-SoVITS-beta\GPT-SoVITS-beta0706\VO_JA_Furina_Hello-[AudioTrimmer.com].wav",
        "ref_text": "何をボーっと突っ立っているんだい？嬉しさのあまり、言葉も出なくなったのかな？そう、",
        "ref_lang": "ja",
        "text": "Hello, this is a test of the Rust GPT-SoVITS server. It seems to be working perfectly!",
        "text_lang": "en",
        "output": "output_jp_to_en.wav"
    },
    {
        "name": "English to English",
        "ref_audio": r"f:\AI\GPT-SoVITS-beta\GPT-SoVITS-beta0706\VO_Furina_Hello-[AudioTrimmer.com].wav",
        "ref_text": "Why are you just standing there with your mouth gaping? Ah, you must be stunned and at a loss for words",
        "ref_lang": "en",
        "text": "Hello, this is a test of the Rust GPT-SoVITS server. It seems to be working perfectly!",
        "text_lang": "en",
        "output": "output_en_to_en.wav"
    }
]

print("=" * 60)
print("Running GPT-SoVITS Rust Server Tests")
print("=" * 60)

for i, test in enumerate(tests, 1):
    print(f"\n[Test {i}/{len(tests)}] {test['name']}")
    print("-" * 60)
    
    # Read and encode the reference audio
    with open(test["ref_audio"], "rb") as f:
        audio_data = f.read()
        audio_base64 = base64.b64encode(audio_data).decode('utf-8')

    # Create the request
    request_data = {
        "text": test["text"],
        "reference_audio": audio_base64,
        "reference_text": test["ref_text"],
        "reference_language": test["ref_lang"],
        "text_language": test["text_lang"]
    }

    print(f"Reference: {test['ref_text'][:50]}...")
    print(f"Text to synthesize: {test['text'][:50]}...")
    print(f"Reference audio: {len(audio_data)} bytes")
    
    # Send request
    try:
        response = requests.post(
            "http://localhost:9881/tts",
            json=request_data,
            timeout=60
        )
        
        if response.status_code == 200:
            # Save the output audio
            with open(test["output"], "wb") as f:
                f.write(response.content)
            print(f"✓ Success! Audio saved to: {test['output']}")
            print(f"  Audio size: {len(response.content)} bytes")
        else:
            print(f"✗ Error: HTTP {response.status_code}")
            print(f"  Response: {response.text}")
            
    except requests.exceptions.ConnectionError:
        print("✗ Connection failed. Is the server running?")
        print("  Start it with: .\\target\\release\\gpt-sovits-server.exe")
        break
    except Exception as e:
        print(f"✗ Error: {e}")
        break

print("\n" + "=" * 60)
print("All tests completed!")
print("=" * 60)

