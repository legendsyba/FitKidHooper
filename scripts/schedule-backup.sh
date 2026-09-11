#!/usr/bin/env bash
# Run backup-fkh.sh on a schedule, via launchd.
#
#   ./scripts/schedule-backup.sh install   # every Sunday at 09:00
#   ./scripts/schedule-backup.sh status
#   ./scripts/schedule-backup.sh run        # fire it once, now
#   ./scripts/schedule-backup.sh uninstall
#
# launchd rather than a GitHub Action, deliberately. The dump holds children's
# names, parent email addresses and password hashes; workflow artifacts on a
# public repository can be downloaded by anyone who can read the repo, which is
# everyone. This data does not belong in CI.
#
# Caveats worth knowing: this only runs while the Mac is awake (launchd will
# catch up on a missed run once it wakes), and the snapshot lands on the same
# disk as everything else. Copy one offsite — encrypted — every so often, or it
# is a backup that shares a fate with the thing it is backing up.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.legendsyba.fkh.backup"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$ROOT/backups/schedule.log"

case "${1:-}" in
  install)
    mkdir -p "$HOME/Library/LaunchAgents" "$ROOT/backups"
    cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$ROOT/scripts/backup-fkh.sh</string>
  </array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Weekday</key><integer>0</integer>
    <key>Hour</key><integer>9</integer>
    <key>Minute</key><integer>0</integer>
  </dict>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
PLIST_EOF
    launchctl unload "$PLIST" 2>/dev/null || true
    launchctl load "$PLIST"
    echo "Installed: Sundays at 09:00."
    echo "  plist: $PLIST"
    echo "  log:   $LOG"
    ;;
  uninstall)
    launchctl unload "$PLIST" 2>/dev/null || true
    rm -f "$PLIST"
    echo "Removed $LABEL."
    ;;
  status)
    if launchctl list | grep -q "$LABEL"; then
      echo "Scheduled:"
      launchctl list | grep "$LABEL" | sed 's/^/  /'
    else
      echo "Not scheduled. Run: ./scripts/schedule-backup.sh install"
    fi
    echo
    echo "Snapshots on disk:"
    ls -1dt "$ROOT"/backups/*/ 2>/dev/null | head -8 | while read -r d; do
      echo "  $(basename "$d")  $(du -sh "$d" | cut -f1)"
    done || echo "  (none)"
    [[ -f "$LOG" ]] && { echo; echo "Last log lines:"; tail -5 "$LOG" | sed 's/^/  /'; }
    ;;
  run)
    launchctl start "$LABEL" 2>/dev/null && echo "Started. Watch: tail -f $LOG" \
      || "$ROOT/scripts/backup-fkh.sh"
    ;;
  *)
    sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
