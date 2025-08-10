#!/bin/bash
set -e -E

GEMINI_API_KEY="$GEMINI_API_KEY"
MODEL_ID="gemini-2.5-pro-preview-tts"
GENERATE_CONTENT_API="streamGenerateContent"

cat << EOF > request.json
{
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "তুমি যা লিখেছ তা হলো, \"কলা\""
          },
        ]
      },
    ],
    "generationConfig": {
      "responseModalities": ["audio", ],
      "temperature": 1,
      "speech_config": {
        "voice_config": {
          "prebuilt_voice_config": {
            "voice_name": "Zephyr",
          }
        }
      },
    },
}
EOF

curl \
-X POST \
-H "Content-Type: application/json" \
"https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:${GENERATE_CONTENT_API}?key=${GEMINI_API_KEY}" -d '@request.json'
