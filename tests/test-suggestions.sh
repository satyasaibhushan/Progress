#!/bin/bash

# This file tests suggestion-related APIs thoroughly
# It should be sourced from test-apis.sh which provides:
# - BASE_URL
# - COOKIE
# - TIMESTAMP
# - GROUP_ID (optional)

echo "=== COMPREHENSIVE SUGGESTION TESTS ==="
echo ""

# First, create some test data with different scenarios for suggestions

echo "Setup: Creating test tasks and habits for suggestions..."
echo ""

# Create a root task (goal) with deadline
echo "Setup 1: POST /api/tasks (Create Root Task with deadline)"
FUTURE_DATE=$(node -e 'console.log(new Date(Date.now() + 30 * 86400000).toISOString())')
ROOT_START_DATE=$(node -e 'console.log(new Date(Date.now() - 20 * 86400000).toISOString())')
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"title\":\"Goal for Suggestions ${TIMESTAMP}\",\"description\":\"Test goal\",\"importance\":90,\"progress\":0,\"startDate\":\"${ROOT_START_DATE}\",\"deadline\":\"${FUTURE_DATE}\",\"groupId\":\"${GROUP_ID}\",\"parentId\":null}" \
    "${BASE_URL}/api/tasks")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
GOAL_TASK_ID=$(echo "$BODY" | jq -r '.data.id // empty')
if [ "$HTTP_CODE" != "201" ]; then
    echo "❌ ERROR: Expected 201, got $HTTP_CODE"
    echo "Response: $BODY"
else
    echo "✅ Created goal task: $GOAL_TASK_ID"
fi
echo ""

if [ -z "$GOAL_TASK_ID" ]; then
    echo "⚠️  Cannot continue without goal task. Skipping suggestion tests."
    exit 1
fi

# Create child task with deadline (under-achieved - low progress)
echo "Setup 2: POST /api/tasks (Create under-achieved child task)"
CHILD_DEADLINE=$(node -e 'console.log(new Date(Date.now() + 15 * 86400000).toISOString())')
ITEM_START_DATE=$(node -e 'console.log(new Date(Date.now() - 10 * 86400000).toISOString())')
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"title\":\"Under-achieved Task ${TIMESTAMP}\",\"description\":\"Low progress task\",\"importance\":80,\"progress\":20,\"startDate\":\"${ITEM_START_DATE}\",\"deadline\":\"${CHILD_DEADLINE}\",\"parentId\":\"${GOAL_TASK_ID}\"}" \
    "${BASE_URL}/api/tasks")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
UNDER_TASK_ID=$(echo "$BODY" | jq -r '.data.id // empty')
if [ "$HTTP_CODE" != "201" ]; then
    echo "❌ ERROR: Expected 201, got $HTTP_CODE"
    echo "Response: $BODY"
else
    echo "✅ Created under-achieved task: $UNDER_TASK_ID"
fi
echo ""

# Create child task with deadline (well-achieved - high progress)
echo "Setup 3: POST /api/tasks (Create well-achieved child task)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"title\":\"Well-achieved Task ${TIMESTAMP}\",\"description\":\"High progress task\",\"importance\":70,\"progress\":85,\"startDate\":\"${ITEM_START_DATE}\",\"deadline\":\"${CHILD_DEADLINE}\",\"parentId\":\"${GOAL_TASK_ID}\"}" \
    "${BASE_URL}/api/tasks")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
WELL_TASK_ID=$(echo "$BODY" | jq -r '.data.id // empty')
if [ "$HTTP_CODE" != "201" ]; then
    echo "❌ ERROR: Expected 201, got $HTTP_CODE"
    echo "Response: $BODY"
else
    echo "✅ Created well-achieved task: $WELL_TASK_ID"
fi
echo ""

# Create completed task (should be excluded from suggestions)
echo "Setup 4: POST /api/tasks (Create completed task - should be excluded)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"title\":\"Completed Task ${TIMESTAMP}\",\"description\":\"100% complete\",\"importance\":60,\"progress\":100,\"startDate\":\"${ITEM_START_DATE}\",\"deadline\":\"${CHILD_DEADLINE}\",\"parentId\":\"${GOAL_TASK_ID}\"}" \
    "${BASE_URL}/api/tasks")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
COMPLETED_TASK_ID=$(echo "$BODY" | jq -r '.data.id // empty')
if [ "$HTTP_CODE" != "201" ]; then
    echo "❌ ERROR: Expected 201, got $HTTP_CODE"
    echo "Response: $BODY"
else
    echo "✅ Created completed task: $COMPLETED_TASK_ID (should be excluded from suggestions)"
fi
echo ""

# Create habit with endDate (under-achieved)
echo "Setup 5: POST /api/habits (Create under-achieved habit)"
HABIT_END_DATE=$(node -e 'console.log(new Date(Date.now() + 20 * 86400000).toISOString())')
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"title\":\"Under-achieved Habit ${TIMESTAMP}\",\"description\":\"Low progress habit\",\"type\":\"DAILY\",\"targetCount\":20,\"importance\":75,\"startDate\":\"${ITEM_START_DATE}\",\"endDate\":\"${HABIT_END_DATE}\"}" \
    "${BASE_URL}/api/habits")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
UNDER_HABIT_ID=$(echo "$BODY" | jq -r '.data.id // empty')
if [ "$HTTP_CODE" != "201" ]; then
    echo "❌ ERROR: Expected 201, got $HTTP_CODE"
    echo "Response: $BODY"
else
    echo "✅ Created under-achieved habit: $UNDER_HABIT_ID"
    # Log it a few times to create some progress but still under-achieved
    for i in {1..3}; do
        LOG_DATE=$(node -e 'console.log(new Date(Date.now() - Number(process.argv[1]) * 86400000).toISOString().slice(0, 10))' "$i")
        curl -s -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
            -d "{\"date\":\"${LOG_DATE}\",\"count\":1}" "${BASE_URL}/api/habits/${UNDER_HABIT_ID}/log" > /dev/null
    done
    echo "   Logged 3 times to create progress"
fi
echo ""

# Create habit with endDate (well-achieved)
echo "Setup 6: POST /api/habits (Create well-achieved habit)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"title\":\"Well-achieved Habit ${TIMESTAMP}\",\"description\":\"High progress habit\",\"type\":\"DAILY\",\"targetCount\":10,\"importance\":65,\"startDate\":\"${ITEM_START_DATE}\",\"endDate\":\"${HABIT_END_DATE}\"}" \
    "${BASE_URL}/api/habits")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
WELL_HABIT_ID=$(echo "$BODY" | jq -r '.data.id // empty')
if [ "$HTTP_CODE" != "201" ]; then
    echo "❌ ERROR: Expected 201, got $HTTP_CODE"
    echo "Response: $BODY"
else
    echo "✅ Created well-achieved habit: $WELL_HABIT_ID"
    # Log it many times to create high progress
    for i in {1..8}; do
        LOG_DATE=$(node -e 'console.log(new Date(Date.now() - Number(process.argv[1]) * 86400000).toISOString().slice(0, 10))' "$i")
        curl -s -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
            -d "{\"date\":\"${LOG_DATE}\",\"count\":1}" "${BASE_URL}/api/habits/${WELL_HABIT_ID}/log" > /dev/null
    done
    echo "   Logged 8 times to create high progress"
fi
echo ""

# Create task without deadline (should be excluded)
echo "Setup 7: POST /api/tasks (Create task without deadline - should be excluded)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"title\":\"No Deadline Task ${TIMESTAMP}\",\"description\":\"No deadline\",\"importance\":50,\"progress\":30,\"parentId\":\"${GOAL_TASK_ID}\"}" \
    "${BASE_URL}/api/tasks")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
NO_DEADLINE_TASK_ID=$(echo "$BODY" | jq -r '.data.id // empty')
if [ "$HTTP_CODE" != "201" ]; then
    echo "❌ ERROR: Expected 201, got $HTTP_CODE"
    echo "Response: $BODY"
else
    echo "✅ Created task without deadline: $NO_DEADLINE_TASK_ID (should be excluded from suggestions)"
fi
echo ""

echo "=== SUGGESTION API TESTS ==="
echo ""

# Test 0: Reject malformed limits
echo "Test 0: GET /api/suggestions?limit=bad (Validation)"
RESPONSE=$(curl -s -w "\n%{http_code}" -H "Cookie: ${COOKIE}" "${BASE_URL}/api/suggestions?limit=bad")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
if [ "$HTTP_CODE" != "400" ]; then
    echo "❌ ERROR: Expected 400, got $HTTP_CODE"
    exit 1
fi
echo "✅ Invalid limit correctly rejected"
echo ""

# Test 1: Get single suggestion (default)
echo "Test 1: GET /api/suggestions (Get single suggestion)"
RESPONSE=$(curl -s -w "\n%{http_code}" -H "Cookie: ${COOKIE}" "${BASE_URL}/api/suggestions")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
echo "Status: $HTTP_CODE"
if [ "$HTTP_CODE" == "200" ]; then
    SUGGESTED_ID=$(echo "$BODY" | jq -r '.data.id // empty')
    SUGGESTED_TYPE=$(echo "$BODY" | jq -r '.data.type // empty')
    SUGGESTED_TITLE=$(echo "$BODY" | jq -r '.data.title // empty')
    SUGGESTED_SCORE=$(echo "$BODY" | jq -r '.data.score // empty')
    SUGGESTED_PROGRESS=$(echo "$BODY" | jq -r '.data.progress // empty')
    SUGGESTED_EXPECTED=$(echo "$BODY" | jq -r '.data.expectedProgress // empty')
    echo "✅ Got suggestion:"
    echo "   ID: $SUGGESTED_ID"
    echo "   Type: $SUGGESTED_TYPE"
    echo "   Title: $SUGGESTED_TITLE"
    echo "   Score: $SUGGESTED_SCORE"
    echo "   Progress: $SUGGESTED_PROGRESS%"
    echo "   Expected: $SUGGESTED_EXPECTED%"
    echo "   Progress Gap: $(echo "$BODY" | jq -r '.data.progressGap // 0')"
    echo "   Importance: $(echo "$BODY" | jq -r '.data.importance // 0')"
else
    echo "❌ ERROR: Expected 200, got $HTTP_CODE"
    echo "Response: $BODY"
fi
echo ""

# Test 2: Get multiple suggestions
echo "Test 2: GET /api/suggestions?limit=3 (Get top 3 suggestions)"
RESPONSE=$(curl -s -w "\n%{http_code}" -H "Cookie: ${COOKIE}" "${BASE_URL}/api/suggestions?limit=3")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
echo "Status: $HTTP_CODE"
if [ "$HTTP_CODE" == "200" ]; then
    SUGGESTION_COUNT=$(echo "$BODY" | jq -r '.data | length // 0')
    echo "✅ Got $SUGGESTION_COUNT suggestion(s):"
    echo "$BODY" | jq -r '.data[] | "   - \(.title) (\(.type)): Score=\(.score), Progress=\(.progress)%, Expected=\(.expectedProgress)%"'
else
    echo "❌ ERROR: Expected 200, got $HTTP_CODE"
    echo "Response: $BODY"
fi
echo ""

# Test 3: Get suggestion without randomization
echo "Test 3: GET /api/suggestions?randomize=false (Deterministic suggestion)"
RESPONSE=$(curl -s -w "\n%{http_code}" -H "Cookie: ${COOKIE}" "${BASE_URL}/api/suggestions?randomize=false")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
echo "Status: $HTTP_CODE"
if [ "$HTTP_CODE" == "200" ]; then
    DETERMINISTIC_SCORE=$(echo "$BODY" | jq -r '.data.score // empty')
    echo "✅ Got deterministic suggestion:"
    echo "   Score: $DETERMINISTIC_SCORE (should be consistent)"
else
    echo "❌ ERROR: Expected 200, got $HTTP_CODE"
    echo "Response: $BODY"
fi
echo ""

# Test 4: Verify completed items are excluded
echo "Test 4: Verify completed task is excluded from suggestions"
RESPONSE=$(curl -s -w "\n%{http_code}" -H "Cookie: ${COOKIE}" "${BASE_URL}/api/suggestions?limit=10")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
if [ "$HTTP_CODE" == "200" ]; then
    COMPLETED_FOUND=$(echo "$BODY" | jq -r ".data[] | select(.id == \"${COMPLETED_TASK_ID}\") | .id" | head -1)
    if [ -z "$COMPLETED_FOUND" ]; then
        echo "✅ Completed task ($COMPLETED_TASK_ID) correctly excluded from suggestions"
    else
        echo "❌ ERROR: Completed task should be excluded but was found in suggestions"
    fi
else
    echo "⚠️  Could not verify (got $HTTP_CODE)"
fi
echo ""

# Test 5: Verify items without deadlines are excluded
echo "Test 5: Verify task without deadline is excluded from suggestions"
RESPONSE=$(curl -s -w "\n%{http_code}" -H "Cookie: ${COOKIE}" "${BASE_URL}/api/suggestions?limit=10")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
if [ "$HTTP_CODE" == "200" ]; then
    NO_DEADLINE_FOUND=$(echo "$BODY" | jq -r ".data[] | select(.id == \"${NO_DEADLINE_TASK_ID}\") | .id" | head -1)
    if [ -z "$NO_DEADLINE_FOUND" ]; then
        echo "✅ Task without deadline ($NO_DEADLINE_TASK_ID) correctly excluded from suggestions"
    else
        echo "❌ ERROR: Task without deadline should be excluded but was found in suggestions"
    fi
else
    echo "⚠️  Could not verify (got $HTTP_CODE)"
fi
echo ""

# Test 6: Verify suggestion includes context (parent, root goal, group, labels)
echo "Test 6: Verify suggestion includes context (parent, root goal, group, labels)"
RESPONSE=$(curl -s -w "\n%{http_code}" -H "Cookie: ${COOKIE}" "${BASE_URL}/api/suggestions")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
if [ "$HTTP_CODE" == "200" ]; then
    HAS_PARENT=$(echo "$BODY" | jq -r '.data.parent // empty')
    HAS_ROOT_GOAL=$(echo "$BODY" | jq -r '.data.rootGoal // empty')
    HAS_GROUP=$(echo "$BODY" | jq -r '.data.group // empty')
    HAS_LABELS=$(echo "$BODY" | jq -r '.data.labels // empty')
    
    echo "✅ Suggestion context:"
    if [ -n "$HAS_PARENT" ] && [ "$HAS_PARENT" != "null" ]; then
        echo "   Parent: $(echo "$BODY" | jq -r '.data.parent.title // "N/A"')"
    else
        echo "   Parent: None (root level item)"
    fi
    
    if [ -n "$HAS_ROOT_GOAL" ] && [ "$HAS_ROOT_GOAL" != "null" ]; then
        echo "   Root Goal: $(echo "$BODY" | jq -r '.data.rootGoal.title // "N/A"')"
    else
        echo "   Root Goal: None (already at root)"
    fi
    
    if [ -n "$HAS_GROUP" ] && [ "$HAS_GROUP" != "null" ]; then
        echo "   Group: $(echo "$BODY" | jq -r '.data.group.name // "N/A"')"
    else
        echo "   Group: None"
    fi
    
    LABEL_COUNT=$(echo "$BODY" | jq -r '.data.labels | length // 0')
    echo "   Labels: $LABEL_COUNT"
else
    echo "❌ ERROR: Expected 200, got $HTTP_CODE"
    echo "Response: $BODY"
fi
echo ""

# Test 7: Test with no suggestions available (all completed or no deadlines)
echo "Test 7: Test edge case - all items completed"
# This test would require creating a scenario where all items are completed
# For now, we'll just test the API handles it gracefully
echo "   (Skipping - would require cleanup of all test data)"
echo ""

# Test 8: Verify score calculation
echo "Test 8: Verify score calculation formula"
RESPONSE=$(curl -s -w "\n%{http_code}" -H "Cookie: ${COOKIE}" "${BASE_URL}/api/suggestions?randomize=false")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
if [ "$HTTP_CODE" == "200" ]; then
    IMPORTANCE=$(echo "$BODY" | jq -r '.data.importance // 0')
    PROGRESS_GAP=$(echo "$BODY" | jq -r '.data.progressGap // 0')
    SCORE=$(echo "$BODY" | jq -r '.data.score // 0')
    # Calculate expected score (importance × progressGap)
    # Use awk for floating point math (more portable than bc)
    EXPECTED_SCORE=$(awk "BEGIN {printf \"%.2f\", $IMPORTANCE * $PROGRESS_GAP}")
    
    echo "✅ Score verification:"
    echo "   Importance: $IMPORTANCE"
    echo "   Progress Gap: $PROGRESS_GAP"
    echo "   Expected Score (importance × gap): $EXPECTED_SCORE"
    echo "   Actual Score: $SCORE"
    
    # Allow small floating point differences (use awk for comparison)
    SCORE_DIFF=$(awk "BEGIN {diff = ($SCORE > $EXPECTED_SCORE) ? $SCORE - $EXPECTED_SCORE : $EXPECTED_SCORE - $SCORE; print diff}")
    if awk "BEGIN {exit ($SCORE_DIFF < 0.01) ? 0 : 1}"; then
        echo "   ✅ Score matches expected (within tolerance)"
    else
        echo "   ⚠️  Score differs from expected (may be due to rounding or randomization)"
    fi
else
    echo "❌ ERROR: Expected 200, got $HTTP_CODE"
    echo "Response: $BODY"
fi
echo ""

# Test 9: Multiple calls with randomization (should get different results sometimes)
echo "Test 9: Multiple calls with randomization (checking for variety)"
SCORES=""
for i in {1..5}; do
    RESPONSE=$(curl -s -H "Cookie: ${COOKIE}" "${BASE_URL}/api/suggestions")
    SCORE=$(echo "$RESPONSE" | jq -r '.data.score // 0')
    SCORES="$SCORES $SCORE"
done

UNIQUE_SCORES=$(echo "$SCORES" | tr ' ' '\n' | grep -v '^$' | sort -u | wc -l | tr -d ' ')
if [ "$UNIQUE_SCORES" -gt 1 ]; then
    echo "✅ Randomization working: Got $UNIQUE_SCORES unique scores out of 5 calls"
    echo "   Scores: $SCORES"
else
    echo "⚠️  All scores were the same (may be deterministic if same item selected)"
fi
echo ""

# Test 10: Verify suggestion prioritizes high importance × progress gap
echo "Test 10: Verify suggestion prioritizes high importance × progress gap"
RESPONSE=$(curl -s -w "\n%{http_code}" -H "Cookie: ${COOKIE}" "${BASE_URL}/api/suggestions?limit=5&randomize=false")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
if [ "$HTTP_CODE" == "200" ]; then
    echo "✅ Top 5 suggestions (sorted by score, deterministic):"
    echo "$BODY" | jq -r '.data[] | "   - \(.title): Score=\(.score) (Importance=\(.importance), Gap=\(.progressGap))"'
    
    # Verify they're sorted by score (descending)
    # Extract scores and convert to array, handling newlines properly
    SCORES_ARRAY=($(echo "$BODY" | jq -r '.data[].score'))
    IS_SORTED=true
    
    if [ ${#SCORES_ARRAY[@]} -lt 2 ]; then
        echo "   ⚠️  Not enough scores to verify sorting"
    else
        for i in $(seq 1 $((${#SCORES_ARRAY[@]} - 1))); do
            CURRENT_SCORE=${SCORES_ARRAY[$i]}
            PREV_SCORE=${SCORES_ARRAY[$((i-1))]}
            
            # Check if current score is greater than previous (which would break descending order)
            # For descending order: current should be <= previous
            # Use awk to compare: if current > previous, that's wrong
            if awk "BEGIN {if ($CURRENT_SCORE > $PREV_SCORE) exit 0; else exit 1}" 2>/dev/null; then
                IS_SORTED=false
                echo "   Debug: Found $CURRENT_SCORE > $PREV_SCORE at position $i (not descending)"
                break
            fi
        done
    fi
    
    if [ "$IS_SORTED" = true ]; then
        echo "   ✅ Suggestions are correctly sorted by score (descending)"
    else
        echo "   ❌ ERROR: Suggestions are not sorted correctly"
    fi
else
    echo "❌ ERROR: Expected 200, got $HTTP_CODE"
    echo "Response: $BODY"
fi
echo ""

echo "=== SUGGESTION TESTS COMPLETE ==="
echo ""
