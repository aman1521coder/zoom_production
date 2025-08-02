#!/bin/bash

# Stop Bot Helper Script
# Usage: ./stop-bot.sh <meetingId> [reason]

if [ -z "$1" ]; then
    echo "Usage: $0 <meetingId> [reason]"
    echo ""
    echo "Examples:"
    echo "  $0 84082289283"
    echo "  $0 84082289283 \"User requested stop\""
    echo ""
    echo "Environment variables:"
    echo "  WORKER_URL     - Worker URL (default: http://147.93.119.85:3000)"
    echo "  WORKER_SECRET  - Worker API secret (default: 1234)"
    exit 1
fi

MEETING_ID=$1
REASON="${2:-Manual stop via script}"
WORKER_URL="${WORKER_URL:-http://147.93.119.85:3000}"
WORKER_SECRET="${WORKER_SECRET:-1234}"

echo "🛑 Stopping bot for meeting: $MEETING_ID"
echo "📝 Reason: $REASON"
echo "🔗 Worker URL: $WORKER_URL"
echo ""

# Stop the bot
echo "⏹️  Sending stop signal..."
RESPONSE=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -H "x-api-secret: $WORKER_SECRET" \
    -d "{\"reason\": \"$REASON\"}" \
    "$WORKER_URL/stop-bot/$MEETING_ID")

# Check if curl succeeded
if [ $? -eq 0 ]; then
    echo "✅ Response received:"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
    
    # Check if the response indicates success
    if echo "$RESPONSE" | grep -q '"success": *true'; then
        echo ""
        echo "🎉 Bot stop signal sent successfully!"
        echo "⏳ The bot will stop synthetic audio immediately and cleanup within 1 second."
    else
        echo ""
        echo "⚠️  Warning: Response doesn't indicate success"
    fi
else
    echo "❌ Failed to connect to worker"
    echo "Please check:"
    echo "  - Worker URL: $WORKER_URL"
    echo "  - Worker API secret: $WORKER_SECRET"
    echo "  - Network connectivity"
fi 