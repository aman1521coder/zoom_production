#!/bin/bash

# Cleanup Stuck Recordings Helper Script
# Usage: ./cleanup-stuck-recordings.sh [check|cleanup|dry-run|stats]

BASE_URL="${BACKEND_URL:-https://aizoomai.com}"
ADMIN_SECRET="${ADMIN_SECRET:-admin123}"

if [ -z "$1" ]; then
    echo "Usage: $0 [check|cleanup|dry-run|stats|force-complete]"
    echo ""
    echo "Commands:"
    echo "  check       - Show stuck recordings report"
    echo "  cleanup     - Clean up stuck recordings (permanent)"
    echo "  dry-run     - Show what would be cleaned (safe)"
    echo "  stats       - Show database statistics"
    echo "  force-complete <meetingId> - Force complete specific meeting"
    echo ""
    echo "Environment variables:"
    echo "  BACKEND_URL   - Backend URL (default: https://aizoomai.com)"
    echo "  ADMIN_SECRET  - Admin secret (default: admin123)"
    exit 1
fi

COMMAND=$1

case $COMMAND in
    "check")
        echo "🔍 Checking for stuck recordings..."
        curl -s -H "x-admin-secret: $ADMIN_SECRET" \
            "$BASE_URL/api/maintenance/stuck-recordings" | \
            jq '.'
        ;;
    
    "dry-run")
        echo "🧪 Dry run - showing what would be cleaned..."
        curl -s -X POST \
            -H "Content-Type: application/json" \
            -H "x-admin-secret: $ADMIN_SECRET" \
            -d '{"dryRun": true}' \
            "$BASE_URL/api/maintenance/cleanup-stuck-recordings" | \
            jq '.'
        ;;
    
    "cleanup")
        echo "🧹 Cleaning up stuck recordings..."
        echo "⚠️  This will permanently mark stuck recordings as failed!"
        read -p "Are you sure? (y/N): " confirm
        if [[ $confirm == [yY] ]]; then
            curl -s -X POST \
                -H "Content-Type: application/json" \
                -H "x-admin-secret: $ADMIN_SECRET" \
                -d '{"dryRun": false}' \
                "$BASE_URL/api/maintenance/cleanup-stuck-recordings" | \
                jq '.'
        else
            echo "Cancelled."
        fi
        ;;
    
    "stats")
        echo "📊 Database statistics..."
        curl -s -H "x-admin-secret: $ADMIN_SECRET" \
            "$BASE_URL/api/maintenance/database-stats" | \
            jq '.'
        ;;
    
    "force-complete")
        if [ -z "$2" ]; then
            echo "Usage: $0 force-complete <meetingId>"
            exit 1
        fi
        MEETING_ID=$2
        echo "🔧 Force completing meeting $MEETING_ID..."
        curl -s -X POST \
            -H "Content-Type: application/json" \
            -H "x-admin-secret: $ADMIN_SECRET" \
            -d "{\"meetingIds\": [\"$MEETING_ID\"]}" \
            "$BASE_URL/api/maintenance/force-complete-meetings" | \
            jq '.'
        ;;
    
    *)
        echo "Unknown command: $COMMAND"
        echo "Use: check, cleanup, dry-run, stats, or force-complete"
        exit 1
        ;;
esac 