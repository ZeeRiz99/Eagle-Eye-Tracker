#!/usr/bin/env bash
# Creates the CI demo family through the API: a parent, an invite code, a student who joins with it.
set -euo pipefail
API=http://localhost:4000/api/v1
PASS=DemoPass2026

post() { curl -sf -X POST "$API$1" -H "Content-Type: application/json" ${3:+-H "Authorization: Bearer $3"} -d "$2"; }

parent=$(post /auth/register '{"name":"Ayesha (parent)","email":"parent.demo@example.com","password":"'$PASS'","role":"parent"}')
parent_token=$(echo "$parent" | jq -r .accessToken)
code=$(post /family/invite '{"name":"Demo Family"}' "$parent_token" | jq -r .invite_code)
student=$(post /auth/register '{"name":"Ali (student)","email":"student.demo@example.com","password":"'$PASS'","role":"student"}')
student_token=$(echo "$student" | jq -r .accessToken)
post /family/join '{"inviteCode":"'"$code"'"}' "$student_token" > /dev/null
echo "demo family ready (invite code used: ${#code} chars)"
