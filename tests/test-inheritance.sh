#!/bin/bash

# This file tests label and group inheritance rules
# It should be sourced from test-apis.sh which provides:
# - BASE_URL
# - COOKIE
# - TIMESTAMP
# - GROUP_ID (optional)

echo "=== LABEL AND GROUP INHERITANCE TESTS ==="
echo ""

# Test 1: Create a parent task with a label and group
echo "Test 1: Create parent task with label and group"
LABEL_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"name\":\"Inheritance Test Label ${TIMESTAMP}\",\"color\":\"#ff0000\"}" \
    "${BASE_URL}/api/labels")
LABEL_HTTP=$(echo "$LABEL_RESPONSE" | tail -n1)
LABEL_BODY=$(echo "$LABEL_RESPONSE" | sed '$d')
LABEL_ID=$(echo "$LABEL_BODY" | jq -r '.data.id // empty')

if [ "$LABEL_HTTP" != "201" ]; then
    echo "❌ ERROR: Failed to create label"
    echo "Response: $LABEL_BODY"
    exit 1
fi
echo "✅ Created label: $LABEL_ID"

GROUP_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"name\":\"Inheritance Test Group ${TIMESTAMP}\",\"color\":\"#00ff00\"}" \
    "${BASE_URL}/api/groups")
GROUP_HTTP=$(echo "$GROUP_RESPONSE" | tail -n1)
GROUP_BODY=$(echo "$GROUP_RESPONSE" | sed '$d')
INHERITANCE_GROUP_ID=$(echo "$GROUP_BODY" | jq -r '.data.id // empty')

if [ "$GROUP_HTTP" != "201" ]; then
    echo "❌ ERROR: Failed to create group"
    echo "Response: $GROUP_BODY"
    exit 1
fi
echo "✅ Created group: $INHERITANCE_GROUP_ID"

PARENT_TASK_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"title\":\"Parent Task ${TIMESTAMP}\",\"importance\":50,\"groupId\":\"${INHERITANCE_GROUP_ID}\"}" \
    "${BASE_URL}/api/tasks")
PARENT_HTTP=$(echo "$PARENT_TASK_RESPONSE" | tail -n1)
PARENT_BODY=$(echo "$PARENT_TASK_RESPONSE" | sed '$d')
PARENT_TASK_ID=$(echo "$PARENT_BODY" | jq -r '.data.id // empty')

if [ "$PARENT_HTTP" != "201" ]; then
    echo "❌ ERROR: Failed to create parent task"
    echo "Response: $PARENT_BODY"
    exit 1
fi
echo "✅ Created parent task: $PARENT_TASK_ID"

# Add label to parent task
LABEL_ADD_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"labelId\":\"${LABEL_ID}\"}" \
    "${BASE_URL}/api/tasks/${PARENT_TASK_ID}/labels")
LABEL_ADD_HTTP=$(echo "$LABEL_ADD_RESPONSE" | tail -n1)
if [ "$LABEL_ADD_HTTP" != "200" ]; then
    echo "❌ ERROR: Failed to add label to parent task"
    exit 1
fi
echo "✅ Added label to parent task"
echo ""

# Test 2: Create a child task - should inherit label and group
echo "Test 2: Create child task - should inherit label and group"
CHILD_TASK_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"title\":\"Child Task ${TIMESTAMP}\",\"importance\":30,\"parentId\":\"${PARENT_TASK_ID}\"}" \
    "${BASE_URL}/api/tasks")
CHILD_HTTP=$(echo "$CHILD_TASK_RESPONSE" | tail -n1)
CHILD_BODY=$(echo "$CHILD_TASK_RESPONSE" | sed '$d')
CHILD_TASK_ID=$(echo "$CHILD_BODY" | jq -r '.data.id // empty')

if [ "$CHILD_HTTP" != "201" ]; then
    echo "❌ ERROR: Failed to create child task"
    echo "Response: $CHILD_BODY"
    exit 1
fi

# Check if child has inherited label
CHILD_LABELS=$(echo "$CHILD_BODY" | jq -r '.data.labels[]?.id // empty')
HAS_INHERITED_LABEL=false
for label in $CHILD_LABELS; do
    if [ "$label" = "$LABEL_ID" ]; then
        HAS_INHERITED_LABEL=true
        break
    fi
done

if [ "$HAS_INHERITED_LABEL" = "true" ]; then
    echo "✅ Child task inherited label"
else
    echo "❌ ERROR: Child task did not inherit label"
    echo "Expected label: $LABEL_ID"
    echo "Child labels: $CHILD_LABELS"
    exit 1
fi

# Check if child has inherited group
CHILD_GROUP_ID=$(echo "$CHILD_BODY" | jq -r '.data.groupId // empty')
if [ "$CHILD_GROUP_ID" = "$INHERITANCE_GROUP_ID" ]; then
    echo "✅ Child task inherited group"
else
    echo "❌ ERROR: Child task did not inherit group"
    echo "Expected group: $INHERITANCE_GROUP_ID"
    echo "Child group: $CHILD_GROUP_ID"
    exit 1
fi
echo ""

# Test 3: Create a linked habit - should inherit label and group
echo "Test 3: Create linked habit - should inherit label and group"
HABIT_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"title\":\"Linked Habit ${TIMESTAMP}\",\"type\":\"DAILY\",\"targetCount\":30,\"importance\":40,\"parentTaskId\":\"${PARENT_TASK_ID}\"}" \
    "${BASE_URL}/api/habits")
HABIT_HTTP=$(echo "$HABIT_RESPONSE" | tail -n1)
HABIT_BODY=$(echo "$HABIT_RESPONSE" | sed '$d')
HABIT_ID=$(echo "$HABIT_BODY" | jq -r '.data.id // empty')

if [ "$HABIT_HTTP" != "201" ]; then
    echo "❌ ERROR: Failed to create linked habit"
    echo "Response: $HABIT_BODY"
    exit 1
fi

# Check if habit has inherited label
HABIT_LABELS=$(echo "$HABIT_BODY" | jq -r '.data.habitLabels[]?.label.id // empty')
HAS_INHERITED_LABEL_HABIT=false
for label in $HABIT_LABELS; do
    if [ "$label" = "$LABEL_ID" ]; then
        HAS_INHERITED_LABEL_HABIT=true
        break
    fi
done

if [ "$HAS_INHERITED_LABEL_HABIT" = "true" ]; then
    echo "✅ Linked habit inherited label"
else
    echo "❌ ERROR: Linked habit did not inherit label"
    echo "Expected label: $LABEL_ID"
    echo "Habit labels: $HABIT_LABELS"
    exit 1
fi

# Check if habit has inherited group
HABIT_GROUP_ID=$(echo "$HABIT_BODY" | jq -r '.data.groupId // empty')
if [ "$HABIT_GROUP_ID" = "$INHERITANCE_GROUP_ID" ]; then
    echo "✅ Linked habit inherited group"
else
    echo "❌ ERROR: Linked habit did not inherit group"
    echo "Expected group: $INHERITANCE_GROUP_ID"
    echo "Habit group: $HABIT_GROUP_ID"
    exit 1
fi
echo ""

# Test 4: Try to remove inherited label from child task - should fail
echo "Test 4: Try to remove inherited label from child task - should fail"
REMOVE_LABEL_RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"labelId\":\"${LABEL_ID}\"}" \
    "${BASE_URL}/api/tasks/${CHILD_TASK_ID}/labels")
REMOVE_LABEL_HTTP=$(echo "$REMOVE_LABEL_RESPONSE" | tail -n1)
REMOVE_LABEL_BODY=$(echo "$REMOVE_LABEL_RESPONSE" | sed '$d')

if [ "$REMOVE_LABEL_HTTP" = "400" ]; then
    echo "✅ Correctly prevented removal of inherited label"
else
    echo "❌ ERROR: Should have prevented removal of inherited label"
    echo "Status: $REMOVE_LABEL_HTTP"
    echo "Response: $REMOVE_LABEL_BODY"
    exit 1
fi
echo ""

# Test 5: Try to change group on child task - should fail
echo "Test 5: Try to change group on child task - should fail"
NEW_GROUP_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"name\":\"New Group ${TIMESTAMP}\",\"color\":\"#0000ff\"}" \
    "${BASE_URL}/api/groups")
NEW_GROUP_HTTP=$(echo "$NEW_GROUP_RESPONSE" | tail -n1)
NEW_GROUP_BODY=$(echo "$NEW_GROUP_RESPONSE" | sed '$d')
NEW_GROUP_ID=$(echo "$NEW_GROUP_BODY" | jq -r '.data.id // empty')

CHANGE_GROUP_RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"groupId\":\"${NEW_GROUP_ID}\"}" \
    "${BASE_URL}/api/tasks/${CHILD_TASK_ID}")
CHANGE_GROUP_HTTP=$(echo "$CHANGE_GROUP_RESPONSE" | tail -n1)
CHANGE_GROUP_BODY=$(echo "$CHANGE_GROUP_RESPONSE" | sed '$d')

if [ "$CHANGE_GROUP_HTTP" = "400" ]; then
    echo "✅ Correctly prevented changing inherited group"
else
    echo "❌ ERROR: Should have prevented changing inherited group"
    echo "Status: $CHANGE_GROUP_HTTP"
    echo "Response: $CHANGE_GROUP_BODY"
    exit 1
fi
echo ""

# Test 6: Add a new label to child task - should succeed
echo "Test 6: Add a new label to child task - should succeed"
NEW_LABEL_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"name\":\"Child Label ${TIMESTAMP}\",\"color\":\"#ffff00\"}" \
    "${BASE_URL}/api/labels")
NEW_LABEL_HTTP=$(echo "$NEW_LABEL_RESPONSE" | tail -n1)
NEW_LABEL_BODY=$(echo "$NEW_LABEL_RESPONSE" | sed '$d')
NEW_LABEL_ID=$(echo "$NEW_LABEL_BODY" | jq -r '.data.id // empty')

ADD_NEW_LABEL_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"labelId\":\"${NEW_LABEL_ID}\"}" \
    "${BASE_URL}/api/tasks/${CHILD_TASK_ID}/labels")
ADD_NEW_LABEL_HTTP=$(echo "$ADD_NEW_LABEL_RESPONSE" | tail -n1)

if [ "$ADD_NEW_LABEL_HTTP" = "200" ]; then
    echo "✅ Successfully added new label to child task"
else
    echo "❌ ERROR: Failed to add new label to child task"
    exit 1
fi
echo ""

# Test 7: Unlink child task from parent - should allow label/group changes
echo "Test 7: Unlink child task from parent - should allow label/group changes"
UNLINK_RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"parentId\":null}" \
    "${BASE_URL}/api/tasks/${CHILD_TASK_ID}")
UNLINK_HTTP=$(echo "$UNLINK_RESPONSE" | tail -n1)

if [ "$UNLINK_HTTP" = "200" ]; then
    echo "✅ Successfully unlinked child task from parent"
    
    # Now try to remove the previously inherited label
    REMOVE_AFTER_UNLINK_RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
        -d "{\"labelId\":\"${LABEL_ID}\"}" \
        "${BASE_URL}/api/tasks/${CHILD_TASK_ID}/labels")
    REMOVE_AFTER_UNLINK_HTTP=$(echo "$REMOVE_AFTER_UNLINK_RESPONSE" | tail -n1)
    
    if [ "$REMOVE_AFTER_UNLINK_HTTP" = "200" ]; then
        echo "✅ Successfully removed label after unlinking from parent"
    else
        echo "❌ ERROR: Should be able to remove label after unlinking"
    fi
    
    # Try to change group
    CHANGE_GROUP_AFTER_UNLINK_RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
        -d "{\"groupId\":\"${NEW_GROUP_ID}\"}" \
        "${BASE_URL}/api/tasks/${CHILD_TASK_ID}")
    CHANGE_GROUP_AFTER_UNLINK_HTTP=$(echo "$CHANGE_GROUP_AFTER_UNLINK_RESPONSE" | tail -n1)
    
    if [ "$CHANGE_GROUP_AFTER_UNLINK_HTTP" = "200" ]; then
        echo "✅ Successfully changed group after unlinking from parent"
    else
        echo "❌ ERROR: Should be able to change group after unlinking"
    fi
else
    echo "❌ ERROR: Failed to unlink child task from parent"
    exit 1
fi
echo ""

# Test 8: Add label to parent - should propagate to all children
echo "Test 8: Add label to parent - should propagate to all children"
# Create a grandchild task first
GRANDCHILD_TASK_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"title\":\"Grandchild Task ${TIMESTAMP}\",\"importance\":20,\"parentId\":\"${PARENT_TASK_ID}\"}" \
    "${BASE_URL}/api/tasks")
GRANDCHILD_HTTP=$(echo "$GRANDCHILD_TASK_RESPONSE" | tail -n1)
GRANDCHILD_BODY=$(echo "$GRANDCHILD_TASK_RESPONSE" | sed '$d')
GRANDCHILD_TASK_ID=$(echo "$GRANDCHILD_BODY" | jq -r '.data.id // empty')

# Create a new label
PROPAGATE_LABEL_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"name\":\"Propagate Label ${TIMESTAMP}\",\"color\":\"#ff00ff\"}" \
    "${BASE_URL}/api/labels")
PROPAGATE_LABEL_HTTP=$(echo "$PROPAGATE_LABEL_RESPONSE" | tail -n1)
PROPAGATE_LABEL_BODY=$(echo "$PROPAGATE_LABEL_RESPONSE" | sed '$d')
PROPAGATE_LABEL_ID=$(echo "$PROPAGATE_LABEL_BODY" | jq -r '.data.id // empty')

# Add label to parent
ADD_TO_PARENT_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Cookie: ${COOKIE}" -H "Content-Type: application/json" \
    -d "{\"labelId\":\"${PROPAGATE_LABEL_ID}\"}" \
    "${BASE_URL}/api/tasks/${PARENT_TASK_ID}/labels")
ADD_TO_PARENT_HTTP=$(echo "$ADD_TO_PARENT_RESPONSE" | tail -n1)

if [ "$ADD_TO_PARENT_HTTP" = "200" ]; then
    echo "✅ Added label to parent task"
    
    # Check if grandchild has the label
    sleep 1  # Give it a moment
    GRANDCHILD_CHECK_RESPONSE=$(curl -s -H "Cookie: ${COOKIE}" "${BASE_URL}/api/tasks/${GRANDCHILD_TASK_ID}")
    GRANDCHILD_LABELS=$(echo "$GRANDCHILD_CHECK_RESPONSE" | jq -r '.data.labels[]?.id // empty')
    HAS_PROPAGATED_LABEL=false
    for label in $GRANDCHILD_LABELS; do
        if [ "$label" = "$PROPAGATE_LABEL_ID" ]; then
            HAS_PROPAGATED_LABEL=true
            break
        fi
    done
    
    if [ "$HAS_PROPAGATED_LABEL" = "true" ]; then
        echo "✅ Label propagated to grandchild task"
    else
        echo "❌ ERROR: Label did not propagate to grandchild task"
    fi
    
    # Check if habit has the label
    HABIT_CHECK_RESPONSE=$(curl -s -H "Cookie: ${COOKIE}" "${BASE_URL}/api/habits/${HABIT_ID}")
    HABIT_LABELS_CHECK=$(echo "$HABIT_CHECK_RESPONSE" | jq -r '.data.habitLabels[]?.label.id // empty')
    HAS_PROPAGATED_LABEL_HABIT=false
    for label in $HABIT_LABELS_CHECK; do
        if [ "$label" = "$PROPAGATE_LABEL_ID" ]; then
            HAS_PROPAGATED_LABEL_HABIT=true
            break
        fi
    done
    
    if [ "$HAS_PROPAGATED_LABEL_HABIT" = "true" ]; then
        echo "✅ Label propagated to linked habit"
    else
        echo "❌ ERROR: Label did not propagate to linked habit"
    fi
else
    echo "❌ ERROR: Failed to add label to parent task"
fi
echo ""

echo "=== ALL INHERITANCE TESTS COMPLETED ==="
