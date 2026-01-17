#!/bin/bash

BASE_URL="http://localhost:3000"
SESSION_TOKEN="2653f9b0-85a0-443e-8aaf-605f79abc9b9"
COOKIE="authjs.session-token=${SESSION_TOKEN}"

echo "========================================="
echo "Cleaning Test Data"
echo "========================================="
echo ""

# Get all tasks and delete them
echo "Deleting all tasks..."
TASKS=$(curl -s -H "Cookie: ${COOKIE}" "${BASE_URL}/api/tasks" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
for TASK_ID in $TASKS; do
    echo "  Deleting task: $TASK_ID"
    curl -s -X DELETE -H "Cookie: ${COOKIE}" "${BASE_URL}/api/tasks/${TASK_ID}" > /dev/null
done
echo ""

# Get all habits and delete them
echo "Deleting all habits..."
HABITS=$(curl -s -H "Cookie: ${COOKIE}" "${BASE_URL}/api/habits" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
for HABIT_ID in $HABITS; do
    echo "  Deleting habit: $HABIT_ID"
    curl -s -X DELETE -H "Cookie: ${COOKIE}" "${BASE_URL}/api/habits/${HABIT_ID}" > /dev/null
done
echo ""

# Get all labels and delete them
echo "Deleting all labels..."
LABELS=$(curl -s -H "Cookie: ${COOKIE}" "${BASE_URL}/api/labels" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
for LABEL_ID in $LABELS; do
    echo "  Deleting label: $LABEL_ID"
    curl -s -X DELETE -H "Cookie: ${COOKIE}" "${BASE_URL}/api/labels/${LABEL_ID}" > /dev/null
done
echo ""

# Get all groups and delete them
echo "Deleting all groups..."
GROUPS=$(curl -s -H "Cookie: ${COOKIE}" "${BASE_URL}/api/groups" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
for GROUP_ID in $GROUPS; do
    echo "  Deleting group: $GROUP_ID"
    curl -s -X DELETE -H "Cookie: ${COOKIE}" "${BASE_URL}/api/groups/${GROUP_ID}" > /dev/null
done
echo ""

echo "========================================="
echo "Cleanup Complete"
echo "========================================="
