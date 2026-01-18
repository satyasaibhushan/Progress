#!/bin/bash

BASE_URL="http://localhost:3000"
SESSION_TOKEN="2653f9b0-85a0-443e-8aaf-605f79abc9b9"
COOKIE="authjs.session-token=${SESSION_TOKEN}"

echo "========================================="
echo "Testing Progress App APIs"
echo "========================================="
echo ""

# Test Groups APIs
echo "=== GROUPS ==="
echo "1. GET /api/groups"
RESPONSE=$(curl -s -w "\n%{http_code}" -H "Cookie: ${COOKIE}" "${BASE_URL}/api/groups")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
echo "Status: $HTTP_CODE"
if [ "$HTTP_CODE" != "200" ]; then
    echo "❌ ERROR: Expected 200, got $HTTP_CODE"
    echo "Response: $BODY"
fi
echo ""

echo "2. POST /api/groups (Create)"
TIMESTAMP=$(date +%s)
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"name\":\"Work ${TIMESTAMP}\",\"description\":\"Work related tasks\",\"color\":\"#3b82f6\"}" \
    "${BASE_URL}/api/groups")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
echo "Status: $HTTP_CODE"
GROUP_ID=$(echo "$BODY" | jq -r '.data.id // empty')
if [ "$HTTP_CODE" != "201" ]; then
    echo "❌ ERROR: Expected 201, got $HTTP_CODE"
    echo "Response: $BODY"
else
    echo "✅ Created group: $GROUP_ID"
fi
echo ""

# Test Tasks APIs
echo "=== TASKS ==="
echo "3. GET /api/tasks"
RESPONSE=$(curl -s -w "\n%{http_code}" -H "Cookie: ${COOKIE}" "${BASE_URL}/api/tasks")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
echo "Status: $HTTP_CODE"
if [ "$HTTP_CODE" != "200" ]; then
    echo "❌ ERROR: Expected 200, got $HTTP_CODE"
    echo "Response: $BODY"
fi
echo ""

echo "4. GET /api/tasks?parentId=null"
RESPONSE=$(curl -s -w "\n%{http_code}" -H "Cookie: ${COOKIE}" "${BASE_URL}/api/tasks?parentId=null")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
echo "Status: $HTTP_CODE"
if [ "$HTTP_CODE" != "200" ]; then
    echo "❌ ERROR: Expected 200, got $HTTP_CODE"
    echo "Response: $BODY"
fi
echo ""

echo "5. POST /api/tasks (Create Root Task)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"title\":\"Test Goal ${TIMESTAMP}\",\"description\":\"Test goal description\",\"importance\":90,\"progress\":0,\"deadline\":\"2024-06-30T23:59:59Z\",\"groupId\":\"${GROUP_ID}\",\"parentId\":null}" \
    "${BASE_URL}/api/tasks")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
echo "Status: $HTTP_CODE"
TASK_ID=$(echo "$BODY" | jq -r '.data.id // empty')
if [ "$HTTP_CODE" != "201" ]; then
    echo "❌ ERROR: Expected 201, got $HTTP_CODE"
    echo "Response: $BODY"
else
    echo "✅ Created task: $TASK_ID"
fi
echo ""

if [ -n "$TASK_ID" ]; then
    echo "6. GET /api/tasks/${TASK_ID}"
    RESPONSE=$(curl -s -w "\n%{http_code}" -H "Cookie: ${COOKIE}" "${BASE_URL}/api/tasks/${TASK_ID}")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    echo "Status: $HTTP_CODE"
    if [ "$HTTP_CODE" != "200" ]; then
        echo "❌ ERROR: Expected 200, got $HTTP_CODE"
        echo "Response: $BODY"
    fi
    echo ""

    echo "7. POST /api/tasks (Create Child Task)"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
        -d "{\"title\":\"Child Task ${TIMESTAMP}\",\"description\":\"Child task description\",\"importance\":75,\"progress\":30,\"parentId\":\"${TASK_ID}\"}" \
        "${BASE_URL}/api/tasks")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    echo "Status: $HTTP_CODE"
    CHILD_TASK_ID=$(echo "$BODY" | jq -r '.data.id // empty')
    if [ "$HTTP_CODE" != "201" ]; then
        echo "❌ ERROR: Expected 201, got $HTTP_CODE"
        echo "Response: $BODY"
    else
        echo "✅ Created child task: $CHILD_TASK_ID"
    fi
    echo ""

    if [ -n "$CHILD_TASK_ID" ]; then
        echo "8. PUT /api/tasks/${CHILD_TASK_ID} (Update)"
        RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
            -d '{"title":"Child Task Updated","progress":50,"importance":80}' \
            "${BASE_URL}/api/tasks/${CHILD_TASK_ID}")
        HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
        BODY=$(echo "$RESPONSE" | sed '$d')
        echo "Status: $HTTP_CODE"
        if [ "$HTTP_CODE" != "200" ]; then
            echo "❌ ERROR: Expected 200, got $HTTP_CODE"
            echo "Response: $BODY"
        fi
        echo ""
    fi
fi

# Source comprehensive habit tests
# This will run all habit-related tests including progress calculation for each type
if [ -f "$(dirname "$0")/test-habits.sh" ]; then
    source "$(dirname "$0")/test-habits.sh"
    # Set HABIT_ID for label tests (use first created habit)
    if [ -z "$HABIT_ID" ] && [ -n "$DAILY_HABIT_ID" ]; then
        HABIT_ID="$DAILY_HABIT_ID"
    fi
else
    echo "⚠️  Warning: test-habits.sh not found, skipping comprehensive habit tests"
    echo ""
    
    # Fallback: Basic habit test
    echo "=== HABITS (Basic) ==="
    echo "9. GET /api/habits"
    RESPONSE=$(curl -s -w "\n%{http_code}" -H "Cookie: ${COOKIE}" "${BASE_URL}/api/habits")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    echo "Status: $HTTP_CODE"
    if [ "$HTTP_CODE" != "200" ]; then
        echo "❌ ERROR: Expected 200, got $HTTP_CODE"
        echo "Response: $BODY"
    fi
    echo ""
fi

# Test Labels APIs
echo "=== LABELS ==="
echo "15. GET /api/labels"
RESPONSE=$(curl -s -w "\n%{http_code}" -H "Cookie: ${COOKIE}" "${BASE_URL}/api/labels")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
echo "Status: $HTTP_CODE"
if [ "$HTTP_CODE" != "200" ]; then
    echo "❌ ERROR: Expected 200, got $HTTP_CODE"
    echo "Response: $BODY"
fi
echo ""

echo "16. POST /api/labels (Create Label)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"name\":\"urgent ${TIMESTAMP}\",\"color\":\"#ef4444\"}" \
    "${BASE_URL}/api/labels")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
echo "Status: $HTTP_CODE"
LABEL_ID=$(echo "$BODY" | jq -r '.data.id // empty')
if [ "$HTTP_CODE" != "201" ]; then
    echo "❌ ERROR: Expected 201, got $HTTP_CODE"
    echo "Response: $BODY"
else
    echo "✅ Created label: $LABEL_ID"
fi
echo ""

if [ -n "$TASK_ID" ] && [ -n "$LABEL_ID" ]; then
    echo "17. POST /api/tasks/${TASK_ID}/labels (Add Label to Task)"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
        -d "{\"labelId\":\"${LABEL_ID}\"}" \
        "${BASE_URL}/api/tasks/${TASK_ID}/labels")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    echo "Status: $HTTP_CODE"
    if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "201" ]; then
        echo "❌ ERROR: Expected 200/201, got $HTTP_CODE"
        echo "Response: $BODY"
    fi
    echo ""
fi

if [ -n "$HABIT_ID" ] && [ -n "$LABEL_ID" ]; then
    echo "18. POST /api/habits/${HABIT_ID}/labels (Add Label to Habit)"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
        -d "{\"labelId\":\"${LABEL_ID}\"}" \
        "${BASE_URL}/api/habits/${HABIT_ID}/labels")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    echo "Status: $HTTP_CODE"
    if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "201" ]; then
        echo "❌ ERROR: Expected 200/201, got $HTTP_CODE"
        echo "Response: $BODY"
    fi
    echo ""
fi

if [ -n "$LABEL_ID" ]; then
    echo "19. GET /api/labels/${LABEL_ID}/items"
    RESPONSE=$(curl -s -w "\n%{http_code}" -H "Cookie: ${COOKIE}" "${BASE_URL}/api/labels/${LABEL_ID}/items")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    echo "Status: $HTTP_CODE"
    if [ "$HTTP_CODE" != "200" ]; then
        echo "❌ ERROR: Expected 200, got $HTTP_CODE"
        echo "Response: $BODY"
    fi
    echo ""
fi

# Source comprehensive suggestion tests
# This will run all suggestion-related tests including algorithm verification
if [ -f "$(dirname "$0")/test-suggestions.sh" ]; then
    source "$(dirname "$0")/test-suggestions.sh"
else
    echo "⚠️  Warning: test-suggestions.sh not found, skipping comprehensive suggestion tests"
    echo ""
fi

# Source comprehensive inheritance tests
# This will run all inheritance-related tests including label and group propagation
if [ -f "$(dirname "$0")/test-inheritance.sh" ]; then
    source "$(dirname "$0")/test-inheritance.sh"
else
    echo "⚠️  Warning: test-inheritance.sh not found, skipping comprehensive inheritance tests"
    echo ""
fi

echo "========================================="
echo "Testing Complete"
echo "========================================="
