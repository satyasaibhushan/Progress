#!/bin/bash

# This file tests habit-related APIs thoroughly
# It should be sourced from test-apis.sh which provides:
# - BASE_URL
# - COOKIE
# - TIMESTAMP
# - GROUP_ID (optional)

echo "=== COMPREHENSIVE HABIT TESTS ==="
echo ""

# Test 1: Create DAILY habit with targetCount
echo "Test 1: POST /api/habits (Create DAILY habit with targetCount)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"title\":\"Daily Meditation ${TIMESTAMP}\",\"description\":\"10 minutes daily\",\"type\":\"DAILY\",\"targetCount\":30,\"importance\":70,\"groupId\":\"${GROUP_ID}\"}" \
    "${BASE_URL}/api/habits")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
echo "Status: $HTTP_CODE"
DAILY_HABIT_ID=$(echo "$BODY" | jq -r '.data.id // empty')
if [ "$HTTP_CODE" != "201" ]; then
    echo "❌ ERROR: Expected 201, got $HTTP_CODE"
    echo "Response: $BODY"
else
    echo "✅ Created DAILY habit: $DAILY_HABIT_ID"
    echo "Response: $BODY" | jq '.'
fi
echo ""

# Test 1b: Create DAILY habit with maxCountPerDay (N per day)
echo "Test 1b: POST /api/habits (Create DAILY habit with maxCountPerDay=5)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"title\":\"Daily Push-ups ${TIMESTAMP}\",\"description\":\"5 push-ups per day\",\"type\":\"DAILY\",\"targetCount\":50,\"maxCountPerDay\":5,\"importance\":75}" \
    "${BASE_URL}/api/habits")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
echo "Status: $HTTP_CODE"
N_PER_DAY_HABIT_ID=$(echo "$BODY" | jq -r '.data.id // empty')
N_PER_DAY_TARGET=$(echo "$BODY" | jq -r '.data.targetCount // empty')
N_PER_DAY_MCPD=$(echo "$BODY" | jq -r '.data.maxCountPerDay // empty')
if [ "$HTTP_CODE" != "201" ]; then
    echo "❌ ERROR: Expected 201, got $HTTP_CODE"
    echo "Response: $BODY"
else
    echo "✅ Created DAILY habit with maxCountPerDay=5: $N_PER_DAY_HABIT_ID"
    echo "   maxCountPerDay: $N_PER_DAY_MCPD, targetCount: $N_PER_DAY_TARGET"
    echo "Response: $BODY" | jq '.'
fi
echo ""

# Test 2: targetCount is required (auto-calc removed)
echo "Test 2: POST /api/habits (Missing targetCount should fail)"
END_DATE=$(date -u -v+30d +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "+30 days" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "2024-12-31T23:59:59Z")
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"title\":\"Daily Reading ${TIMESTAMP}\",\"description\":\"Read 30 minutes daily\",\"type\":\"DAILY\",\"endDate\":\"${END_DATE}\",\"importance\":60}" \
    "${BASE_URL}/api/habits")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
echo "Status: $HTTP_CODE"
if [ "$HTTP_CODE" == "400" ]; then
    echo "✅ Correctly rejected create without targetCount"
else
    echo "❌ ERROR: Expected 400, got $HTTP_CODE"
    echo "Response: $BODY"
fi
echo ""

# Test 3: Create WEEKLY habit with countPerPeriod
echo "Test 3: POST /api/habits (Create WEEKLY habit with activeDays)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"title\":\"Gym Workout ${TIMESTAMP}\",\"description\":\"3 times per week\",\"type\":\"WEEKLY\",\"targetCount\":12,\"countPerPeriod\":3,\"activeDays\":[1,3,5],\"importance\":80,\"groupId\":\"${GROUP_ID}\"}" \
    "${BASE_URL}/api/habits")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
echo "Status: $HTTP_CODE"
WEEKLY_HABIT_ID=$(echo "$BODY" | jq -r '.data.id // empty')
if [ "$HTTP_CODE" != "201" ]; then
    echo "❌ ERROR: Expected 201, got $HTTP_CODE"
    echo "Response: $BODY"
else
    echo "✅ Created WEEKLY habit: $WEEKLY_HABIT_ID"
    echo "Active days: $(echo "$BODY" | jq -r '.data.activeDays // []')"
    echo "Response: $BODY" | jq '.'
fi
echo ""

# Test 4: non-daily requires explicit targetCount
echo "Test 4: POST /api/habits (WEEKLY without targetCount should fail)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"title\":\"Weekly Yoga ${TIMESTAMP}\",\"description\":\"Yoga on Mon, Wed, Fri\",\"type\":\"WEEKLY\",\"countPerPeriod\":3,\"activeDays\":[1,3,5],\"importance\":65}" \
    "${BASE_URL}/api/habits")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
echo "Status: $HTTP_CODE"
if [ "$HTTP_CODE" == "400" ]; then
    echo "✅ Correctly rejected WEEKLY create without targetCount"
else
    echo "❌ ERROR: Expected 400, got $HTTP_CODE"
    echo "Response: $BODY"
fi
echo ""

# Test 4b: Create WEEKLY habit with countPerPeriod (N per week)
echo "Test 4b: POST /api/habits (Create WEEKLY habit with countPerPeriod=3 - 3 times per week)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"title\":\"Gym Sessions ${TIMESTAMP}\",\"description\":\"3 gym sessions per week\",\"type\":\"WEEKLY\",\"targetCount\":12,\"countPerPeriod\":3,\"importance\":80}" \
    "${BASE_URL}/api/habits")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
echo "Status: $HTTP_CODE"
N_PER_WEEK_HABIT_ID=$(echo "$BODY" | jq -r '.data.id // empty')
N_PER_WEEK_TARGET=$(echo "$BODY" | jq -r '.data.targetCount // empty')
N_PER_WEEK_CPP=$(echo "$BODY" | jq -r '.data.countPerPeriod // empty')
if [ "$HTTP_CODE" != "201" ]; then
    echo "❌ ERROR: Expected 201, got $HTTP_CODE"
    echo "Response: $BODY"
else
    echo "✅ Created WEEKLY habit with countPerPeriod=3: $N_PER_WEEK_HABIT_ID"
    echo "   countPerPeriod: $N_PER_WEEK_CPP, targetCount: $N_PER_WEEK_TARGET (should be ~12 for 4 weeks × 3)"
    echo "Response: $BODY" | jq '.'
fi
echo ""

# Test 5: Create MONTHLY habit
echo "Test 5: POST /api/habits (Create MONTHLY habit)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"title\":\"Monthly Review ${TIMESTAMP}\",\"description\":\"Monthly review meeting\",\"type\":\"MONTHLY\",\"targetCount\":6,\"countPerPeriod\":1,\"importance\":50}" \
    "${BASE_URL}/api/habits")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
echo "Status: $HTTP_CODE"
MONTHLY_HABIT_ID=$(echo "$BODY" | jq -r '.data.id // empty')
if [ "$HTTP_CODE" != "201" ]; then
    echo "❌ ERROR: Expected 201, got $HTTP_CODE"
    echo "Response: $BODY"
else
    echo "✅ Created MONTHLY habit: $MONTHLY_HABIT_ID"
    echo "Response: $BODY" | jq '.'
fi
echo ""

# Test 5b: Create MONTHLY habit with countPerPeriod (N per month)
echo "Test 5b: POST /api/habits (Create MONTHLY habit with countPerPeriod=2 - 2 times per month)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"title\":\"Doctor Visits ${TIMESTAMP}\",\"description\":\"2 doctor visits per month\",\"type\":\"MONTHLY\",\"targetCount\":8,\"countPerPeriod\":2,\"importance\":90}" \
    "${BASE_URL}/api/habits")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
echo "Status: $HTTP_CODE"
N_PER_MONTH_HABIT_ID=$(echo "$BODY" | jq -r '.data.id // empty')
N_PER_MONTH_TARGET=$(echo "$BODY" | jq -r '.data.targetCount // empty')
N_PER_MONTH_CPP=$(echo "$BODY" | jq -r '.data.countPerPeriod // empty')
if [ "$HTTP_CODE" != "201" ]; then
    echo "❌ ERROR: Expected 201, got $HTTP_CODE"
    echo "Response: $BODY"
else
    echo "✅ Created MONTHLY habit with countPerPeriod=2: $N_PER_MONTH_HABIT_ID"
    echo "   countPerPeriod: $N_PER_MONTH_CPP, targetCount: $N_PER_MONTH_TARGET (should be ~6-8 for 3-4 months × 2)"
    echo "Response: $BODY" | jq '.'
fi
echo ""

# Test 5c: Create YEARLY habit
echo "Test 5c: POST /api/habits (Create YEARLY habit)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"title\":\"Yearly Checkup ${TIMESTAMP}\",\"description\":\"Annual checkup\",\"type\":\"YEARLY\",\"targetCount\":1,\"countPerPeriod\":1,\"importance\":85}" \
    "${BASE_URL}/api/habits")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
echo "Status: $HTTP_CODE"
YEARLY_HABIT_ID=$(echo "$BODY" | jq -r '.data.id // empty')
if [ "$HTTP_CODE" != "201" ]; then
    echo "❌ ERROR: Expected 201, got $HTTP_CODE"
    echo "Response: $BODY"
else
    echo "✅ Created YEARLY habit: $YEARLY_HABIT_ID"
fi
echo ""

# Test 6: WEEKLY habit without activeDays should still pass
echo "Test 6: POST /api/habits (WEEKLY habit without activeDays - should pass)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"title\":\"Weekly No Days ${TIMESTAMP}\",\"type\":\"WEEKLY\",\"targetCount\":10,\"countPerPeriod\":2}" \
    "${BASE_URL}/api/habits")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
echo "Status: $HTTP_CODE"
if [ "$HTTP_CODE" == "201" ]; then
    echo "✅ Correctly created WEEKLY habit without activeDays"
else
    echo "❌ ERROR: Expected 201, got $HTTP_CODE"
    echo "Response: $BODY"
fi
echo ""

# Test 7: Error - Habit without targetCount
echo "Test 7: POST /api/habits (Habit without targetCount - should fail)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"title\":\"Invalid Habit ${TIMESTAMP}\",\"type\":\"DAILY\"}" \
    "${BASE_URL}/api/habits")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
echo "Status: $HTTP_CODE"
if [ "$HTTP_CODE" == "400" ]; then
    echo "✅ Correctly rejected habit without targetCount"
else
    echo "❌ ERROR: Expected 400, got $HTTP_CODE"
    echo "Response: $BODY"
fi
echo ""

# Test 8: Log DAILY habit multiple times
if [ -n "$DAILY_HABIT_ID" ]; then
    echo "Test 8: POST /api/habits/${DAILY_HABIT_ID}/log (Log DAILY habit - first log)"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
        -d '{"count":1}' \
        "${BASE_URL}/api/habits/${DAILY_HABIT_ID}/log")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    echo "Status: $HTTP_CODE"
    if [ "$HTTP_CODE" == "201" ]; then
        echo "✅ Logged DAILY habit (count: 1)"
    else
        echo "❌ ERROR: Expected 201, got $HTTP_CODE"
        echo "Response: $BODY"
    fi
    echo ""

    DATE_ONLY_LOG=$(date -u -v-1d +"%Y-%m-%d" 2>/dev/null || date -u -d "-1 day" +"%Y-%m-%d" 2>/dev/null || echo "2026-02-10")
    echo "Test 8a: POST /api/habits/${DAILY_HABIT_ID}/log (Date-only YYYY-MM-DD)"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
        -d "{\"date\":\"${DATE_ONLY_LOG}\",\"count\":1}" \
        "${BASE_URL}/api/habits/${DAILY_HABIT_ID}/log")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    echo "Status: $HTTP_CODE"
    if [ "$HTTP_CODE" == "201" ] || [ "$HTTP_CODE" == "200" ]; then
        echo "✅ Date-only habit log accepted"
    else
        echo "❌ ERROR: Expected 200/201, got $HTTP_CODE"
        echo "Response: $BODY"
    fi
    echo ""

    FIRST_DAILY_LOG_ID=$(echo "$BODY" | jq -r '.data.id // empty')

    echo "Test 9: POST /api/habits/${DAILY_HABIT_ID}/log (Second log should fail at max/day=1)"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
        -d '{"count":1}' \
        "${BASE_URL}/api/habits/${DAILY_HABIT_ID}/log")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    echo "Status: $HTTP_CODE"
    if [ "$HTTP_CODE" == "400" ]; then
        echo "✅ Max/day enforcement works for POST"
    else
        echo "❌ ERROR: Expected 400, got $HTTP_CODE"
        echo "Response: $BODY"
    fi
    echo ""

    echo "Test 9b: PATCH /api/habits/${DAILY_HABIT_ID}/log (Set count > max/day should fail)"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X PATCH -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
        -d "{\"logId\":\"${FIRST_DAILY_LOG_ID}\",\"count\":2}" \
        "${BASE_URL}/api/habits/${DAILY_HABIT_ID}/log")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    echo "Status: $HTTP_CODE"
    if [ "$HTTP_CODE" == "400" ]; then
        echo "✅ Max/day enforcement works for PATCH"
    else
        echo "❌ ERROR: Expected 400, got $HTTP_CODE"
        echo "Response: $BODY"
    fi
    echo ""

    echo "Test 10: GET /api/habits/${DAILY_HABIT_ID} (Check progress calculation)"
    RESPONSE=$(curl -s -w "\n%{http_code}" -H "Cookie: ${COOKIE}" "${BASE_URL}/api/habits/${DAILY_HABIT_ID}")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    echo "Status: $HTTP_CODE"
    if [ "$HTTP_CODE" == "200" ]; then
        TARGET_COUNT=$(echo "$BODY" | jq -r '.data.targetCount // empty')
        echo "✅ Retrieved habit: targetCount=$TARGET_COUNT"
        echo "Note: Progress is calculated on-demand via calculateHabitCompletion()"
        echo "Expected progress: (1 / $TARGET_COUNT) × 100"
    else
        echo "❌ ERROR: Expected 200, got $HTTP_CODE"
        echo "Response: $BODY"
    fi
    echo ""
fi

# Test 11: Log WEEKLY habit on different days
if [ -n "$WEEKLY_HABIT_ID" ]; then
    echo "Test 11: POST /api/habits/${WEEKLY_HABIT_ID}/log (Log WEEKLY habit - Monday)"
    MONDAY_DATE=$(date -u +"%Y-%m-%dT00:00:00Z")
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
        -d "{\"count\":1,\"date\":\"${MONDAY_DATE}\"}" \
        "${BASE_URL}/api/habits/${WEEKLY_HABIT_ID}/log")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    echo "Status: $HTTP_CODE"
    if [ "$HTTP_CODE" == "201" ]; then
        echo "✅ Logged WEEKLY habit on Monday"
    else
        echo "❌ ERROR: Expected 201, got $HTTP_CODE"
        echo "Response: $BODY"
    fi
    echo ""

    echo "Test 12: POST /api/habits/${WEEKLY_HABIT_ID}/log (Log WEEKLY habit - Wednesday)"
    WEDNESDAY_DATE=$(date -u -v+2d +"%Y-%m-%dT00:00:00Z" 2>/dev/null || date -u -d "+2 days" +"%Y-%m-%dT00:00:00Z" 2>/dev/null || echo "$MONDAY_DATE")
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
        -d "{\"count\":1,\"date\":\"${WEDNESDAY_DATE}\"}" \
        "${BASE_URL}/api/habits/${WEEKLY_HABIT_ID}/log")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    echo "Status: $HTTP_CODE"
    if [ "$HTTP_CODE" == "201" ]; then
        echo "✅ Logged WEEKLY habit on Wednesday"
    else
        echo "❌ ERROR: Expected 201, got $HTTP_CODE"
        echo "Response: $BODY"
    fi
    echo ""

    echo "Test 13: GET /api/habits/${WEEKLY_HABIT_ID}/log (Get all logs)"
    RESPONSE=$(curl -s -w "\n%{http_code}" -H "Cookie: ${COOKIE}" "${BASE_URL}/api/habits/${WEEKLY_HABIT_ID}/log")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    LOG_COUNT=$(echo "$BODY" | jq -r '.data | length // 0')
    echo "Status: $HTTP_CODE"
    if [ "$HTTP_CODE" == "200" ]; then
        echo "✅ Retrieved logs: $LOG_COUNT log(s) found"
        echo "Logs: $BODY" | jq '.data'
    else
        echo "❌ ERROR: Expected 200, got $HTTP_CODE"
        echo "Response: $BODY"
    fi
    echo ""
fi

# Test 14: Log MONTHLY habit
if [ -n "$MONTHLY_HABIT_ID" ]; then
    echo "Test 14: POST /api/habits/${MONTHLY_HABIT_ID}/log (Log MONTHLY habit)"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
        -d '{"count":1}' \
        "${BASE_URL}/api/habits/${MONTHLY_HABIT_ID}/log")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    echo "Status: $HTTP_CODE"
    if [ "$HTTP_CODE" == "201" ]; then
        echo "✅ Logged MONTHLY habit"
    else
        echo "❌ ERROR: Expected 201, got $HTTP_CODE"
        echo "Response: $BODY"
    fi
    echo ""
fi

# Test 14b: Log YEARLY habit
if [ -n "$YEARLY_HABIT_ID" ]; then
    echo "Test 14b: POST /api/habits/${YEARLY_HABIT_ID}/log (Log YEARLY habit)"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
        -d '{"count":1}' \
        "${BASE_URL}/api/habits/${YEARLY_HABIT_ID}/log")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    echo "Status: $HTTP_CODE"
    if [ "$HTTP_CODE" == "201" ]; then
        echo "✅ Logged YEARLY habit"
    else
        echo "❌ ERROR: Expected 201, got $HTTP_CODE"
        echo "Response: $BODY"
    fi
    echo ""
fi

# Test 15: Update habit (change targetCount)
if [ -n "$DAILY_HABIT_ID" ]; then
    echo "Test 15: PUT /api/habits/${DAILY_HABIT_ID} (Update targetCount)"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
        -d '{"targetCount":60}' \
        "${BASE_URL}/api/habits/${DAILY_HABIT_ID}")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    NEW_TARGET=$(echo "$BODY" | jq -r '.data.targetCount // empty')
    echo "Status: $HTTP_CODE"
    if [ "$HTTP_CODE" == "200" ] && [ "$NEW_TARGET" == "60" ]; then
        echo "✅ Updated targetCount to: $NEW_TARGET"
    else
        echo "❌ ERROR: Expected 200 with targetCount=60, got $HTTP_CODE, targetCount=$NEW_TARGET"
        echo "Response: $BODY"
    fi
    echo ""
fi

# Test 16: Update WEEKLY habit (activeDays should be ignored/cleared)
if [ -n "$WEEKLY_HABIT_ID" ]; then
    echo "Test 16: PUT /api/habits/${WEEKLY_HABIT_ID} (Update activeDays on WEEKLY)"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
        -d '{"activeDays":[0,2,4,6]}' \
        "${BASE_URL}/api/habits/${WEEKLY_HABIT_ID}")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    NEW_ACTIVE_DAYS=$(echo "$BODY" | jq -r '.data.activeDays // []')
    echo "Status: $HTTP_CODE"
    if [ "$HTTP_CODE" == "200" ] && [ "$NEW_ACTIVE_DAYS" == "[]" ]; then
        echo "✅ WEEKLY activeDays ignored/cleared as expected: $NEW_ACTIVE_DAYS"
    else
        echo "❌ ERROR: Expected 200 with activeDays=[], got $HTTP_CODE (activeDays=$NEW_ACTIVE_DAYS)"
        echo "Response: $BODY"
    fi
    echo ""
fi

# Test 17: Update maxCountPerDay on DAILY habit
if [ -n "$N_PER_DAY_HABIT_ID" ]; then
    echo "Test 17: PUT /api/habits/${N_PER_DAY_HABIT_ID} (Update maxCountPerDay from 5 to 10)"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
        -d '{"maxCountPerDay":10}' \
        "${BASE_URL}/api/habits/${N_PER_DAY_HABIT_ID}")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    NEW_MCPD=$(echo "$BODY" | jq -r '.data.maxCountPerDay // empty')
    NEW_CPP=$(echo "$BODY" | jq -r '.data.countPerPeriod // empty')
    echo "Status: $HTTP_CODE"
    if [ "$HTTP_CODE" == "200" ] && [ "$NEW_MCPD" == "10" ] && [ "$NEW_CPP" == "1" ]; then
        echo "✅ Updated maxCountPerDay to: $NEW_MCPD (countPerPeriod stayed normalized at $NEW_CPP)"
    else
        echo "❌ ERROR: Expected 200 with maxCountPerDay=10 and countPerPeriod=1, got $HTTP_CODE"
        echo "Response: $BODY"
    fi
    echo ""
fi

# Test 18: Get all habits and verify types
echo "Test 18: GET /api/habits (Get all habits)"
RESPONSE=$(curl -s -w "\n%{http_code}" -H "Cookie: ${COOKIE}" "${BASE_URL}/api/habits")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
HABIT_COUNT=$(echo "$BODY" | jq -r '.data | length // 0')
echo "Status: $HTTP_CODE"
if [ "$HTTP_CODE" == "200" ]; then
    echo "✅ Retrieved $HABIT_COUNT habit(s)"
    echo "Habit types breakdown:"
    echo "$BODY" | jq -r '.data[] | "  - \(.title): \(.type) (targetCount: \(.targetCount), countPerPeriod: \(.countPerPeriod // 1), activeDays: \(.activeDays // []))"'
else
    echo "❌ ERROR: Expected 200, got $HTTP_CODE"
    echo "Response: $BODY"
fi
echo ""

echo "=== HABIT TESTS COMPLETE ==="
echo ""
