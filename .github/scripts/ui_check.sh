#!/usr/bin/env bash
# Drives Eagle Eye Tracker on an emulator like a person would and saves a screenshot after every step:
# student logs in (GPS set to Karachi) and sends an SOS, then the parent logs in and sees the family dashboard.
# Usage: ui_check.sh <app.apk> <out-dir>     (needs adb + python3; used by .github/workflows/android-ui-check.yml)
set -u
APK="$1"; OUT="$2"; PKG=com.zeeriz.eagleeye; PASS=DemoPass2026
mkdir -p "$OUT"

log() { echo "[ui-check] $*"; }
shot() { adb exec-out screencap -p > "$OUT/$1.png"; log "screenshot $1"; }
dump() { adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb shell cat /sdcard/ui.xml 2>/dev/null; }

fail() {
  log "FAILED: $*"
  shot zz-failed
  dump > "$OUT/zz-failed-ui.xml"
  adb logcat -d -s AndroidRuntime:E ReactNativeJS:* > "$OUT/zz-app-log.txt" 2>/dev/null
  exit 1
}

# centre of the best node for $1: exact label > labelled button > text containing it; "class:X#n" = n-th of a class
find_node() {
  dump | python3 -c '
import re, sys, xml.etree.ElementTree as ET
needle = sys.argv[1]
root = ET.fromstring(sys.stdin.read() or "<x/>")
nodes = list(root.iter("node"))
best = None
if needle.startswith("class:"):
    cls, _, nth = needle[6:].partition("#")
    hits = [n for n in nodes if n.attrib.get("class") == cls]
    k = int(nth or 1) - 1
    if len(hits) > k:
        best = (0, hits[k].attrib["bounds"])
else:
    low = needle.lower()
    for n in nodes:
        a = n.attrib
        text, desc = a.get("text", "").lower(), a.get("content-desc", "").lower()
        rank = 0 if low in (text, desc) else 1 if low in desc else 2 if low in text else None
        if rank is not None and (best is None or rank < best[0]):
            best = (rank, a["bounds"])
if best:
    x1, y1, x2, y2 = map(int, re.findall(r"\d+", best[1]))
    print((x1 + x2) // 2, (y1 + y2) // 2)
' "$1"
}

seen() { [ -n "$(find_node "$1")" ]; }

wait_for() {  # wait_for <text> <seconds>
  local end=$((SECONDS + $2))
  while [ $SECONDS -lt $end ]; do
    seen "$1" && return 0
    sleep 2
  done
  fail "did not see '$1' within $2 s"
}

tap() {
  local xy; xy=$(find_node "$1")
  [ -n "$xy" ] || fail "nothing to tap: '$1'"
  adb shell input tap $xy
  log "tapped '$1'"
}

# Back closes an open keyboard without leaving the screen (ESC does nothing in React Native). Only pressed while the
# keyboard is up, so it never navigates back by accident.
keyboard_up() { adb shell dumpsys input_method 2>/dev/null | grep -q "mInputShown=true"; }
hide_keyboard() {
  sleep 1
  local n=0
  while keyboard_up && [ $n -lt 3 ]; do adb shell input keyevent 4; sleep 1; n=$((n + 1)); done
}

type_into() {  # type_into <class:...#n> <text>
  tap "$1"
  adb shell input text "$(printf '%s' "$2" | sed 's/ /%s/g')"
  hide_keyboard
}

login() {
  type_into "class:android.widget.EditText#1" "$1"
  type_into "class:android.widget.EditText#2" "$PASS"
  tap "Log In"
}

logout() {
  tap "Log out"
  sleep 3
  if ! seen "Log In"; then            # a confirmation dialog, if the app shows one
    seen "Log out" && tap "Log out"
    seen "OK" && tap "OK"
    seen "Yes" && tap "Yes"
  fi
  wait_for "Log In" 30
}

log "installing $APK"
adb install -r "$APK" || fail "install"
for p in ACCESS_FINE_LOCATION ACCESS_COARSE_LOCATION POST_NOTIFICATIONS RECORD_AUDIO; do
  adb shell pm grant "$PKG" "android.permission.$p" >/dev/null 2>&1
done
adb emu geo fix 67.0011 24.8607 >/dev/null 2>&1          # Karachi (longitude latitude)
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || fail "launch"

wait_for "Log In" 180
sleep 2
shot 01-login

# --- student
login "student.demo@example.com"
wait_for "SOS" 90
adb emu geo fix 67.0011 24.8607 >/dev/null 2>&1
sleep 6
shot 02-student-home

tap "SOS"
wait_for "Sending SOS alert" 15
shot 03-sos-countdown
wait_for "SOS Sent" 60
shot 04-sos-sent
tap "OK"
sleep 2
logout

# --- parent
login "parent.demo@example.com"
wait_for "Family Dashboard" 90
sleep 6
shot 05-parent-dashboard

tap "Alert History"
wait_for "Back" 30
sleep 4
shot 06-alert-history
tap "← Back"
sleep 2

tap "Safe Zones"
wait_for "Existing zones" 30
sleep 3
shot 07-safe-zones

log "all steps passed"
