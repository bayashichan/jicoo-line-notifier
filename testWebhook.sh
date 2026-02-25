#!/bin/bash

# Jicoo webhook local testing script
# ローカルサーバー (http://localhost:3000) が起動していることを確認してから実行してください。

echo "Sending mock Jicoo webhook to local API endpoint..."

curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event": "booking.created",
    "data": {
      "guest": {
        "name": "山田 太郎",
        "email": "yamada@example.com"
      },
      "start_at": "2026-03-01T10:00:00+09:00",
      "end_at": "2026-03-01T11:00:00+09:00",
      "message": "よろしくお願いいたします。"
    }
  }'

echo -e "\n\nRequest completed."
